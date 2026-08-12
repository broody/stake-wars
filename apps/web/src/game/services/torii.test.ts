import { describe, expect, it } from 'vitest';
import {
  POOL_MEMBER_REWARD_CLAIMED_SELECTOR,
  parseIndexedControlPoints,
  parseOperatorActivity,
  parseYieldClaimPage,
} from './torii';

function activityCursor(
  blockNumber: number,
  transactionHash: string,
  eventIndex: number
): string {
  const eventId = `0x${blockNumber.toString(16)}:${transactionHash}:0xworld:0x${eventIndex.toString(16)}`;
  return btoa(`cursor/${eventId}/${eventId}`);
}

describe('Torii Control Point parsing', () => {
  it('parses and sorts indexed Control Points', () => {
    expect(
      parseIndexedControlPoints({
        data: {
          stakewarsControlPointModels: {
            edges: [
              {
                node: {
                  id: 1275,
                  controller: '0xabc',
                  allocated_stake: '0x2386f26fc10000',
                  ownership_generation: '0x2',
                },
              },
              {
                node: {
                  id: '4',
                  controller: '0xdef',
                  allocated_stake: '0x1',
                  ownership_generation: '0x1',
                },
              },
            ],
          },
        },
      })
    ).toEqual([
      {
        id: 4,
        controller: '0xdef',
        allocatedStake: 1n,
        ownershipGeneration: 1n,
      },
      {
        id: 1275,
        controller: '0xabc',
        allocatedStake: 10_000_000_000_000_000n,
        ownershipGeneration: 2n,
      },
    ]);
  });

  it('surfaces GraphQL errors', () => {
    expect(() =>
      parseIndexedControlPoints({ errors: [{ message: 'model unavailable' }] })
    ).toThrow('model unavailable');
  });

  it('rejects out-of-range Control Point IDs', () => {
    expect(() =>
      parseIndexedControlPoints({
        data: {
          stakewarsControlPointModels: {
            edges: [
              {
                node: {
                  id: 2000,
                  controller: '0xabc',
                  allocated_stake: '0x1',
                  ownership_generation: '0x1',
                },
              },
            ],
          },
        },
      })
    ).toThrow('invalid Control Point ID');
  });
});

describe('Torii Operator activity parsing', () => {
  const emptyCollections = {
    captures: { edges: [] },
    losses: { edges: [] },
    reinforcements: { edges: [] },
    releases: { edges: [] },
    redeployments: { edges: [] },
    disqualifications: { edges: [] },
  };

  it('merges indexed event types in reverse chain order', () => {
    const activity = parseOperatorActivity({
      data: {
        ...emptyCollections,
        captures: {
          edges: [
            {
              cursor: activityCursor(10, '0xcapture', 1),
              node: {
                control_point_id: 42,
                controller: '0xabc',
                previous_controller: '0x0',
                previous_allocation: '0x0',
                allocation: '0x2386f26fc10000',
              },
            },
          ],
        },
        losses: {
          edges: [
            {
              cursor: activityCursor(12, '0xloss', 3),
              node: {
                control_point_id: 42,
                controller: '0xdef',
                previous_controller: '0xabc',
                previous_allocation: '0x2386f26fc10000',
                allocation: '0x27147114878000',
              },
            },
          ],
        },
        reinforcements: {
          edges: [
            {
              cursor: activityCursor(11, '0xreinforce', 2),
              node: {
                control_point_id: 42,
                previous_allocation: '100',
                allocation: '175',
              },
            },
          ],
        },
      },
    });

    expect(activity.map(({ type }) => type)).toEqual([
      'loss',
      'reinforcement',
      'capture',
    ]);
    expect(activity[0]).toMatchObject({
      blockNumber: 12,
      transactionHash: '0xloss',
      controlPointId: 42,
      amount: 10_000_000_000_000_000n,
      secondaryAmount: 11_000_000_000_000_000n,
      counterparty: '0xdef',
    });
    expect(activity[1]).toMatchObject({
      amount: 75n,
      secondaryAmount: 175n,
    });
  });

  it('prefers explicit displacement events over legacy capture inference', () => {
    const transactionHash = '0xshared';
    const activity = parseOperatorActivity(
      {
        data: {
          ...emptyCollections,
          losses: {
            edges: [
              {
                cursor: activityCursor(20, transactionHash, 2),
                node: {
                  control_point_id: 9,
                  controller: '0xdef',
                  previous_controller: '0xabc',
                  previous_allocation: '100',
                  allocation: '110',
                },
              },
            ],
          },
        },
      },
      {
        data: {
          displacements: {
            edges: [
              {
                cursor: activityCursor(20, transactionHash, 3),
                node: {
                  control_point_id: 9,
                  previous_controller: '0xabc',
                  new_controller: '0xdef',
                  released_allocation: '100',
                  new_allocation: '110',
                },
              },
            ],
          },
        },
      }
    );

    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      id: expect.stringContaining(':0x3'),
      type: 'loss',
      amount: 100n,
      secondaryAmount: 110n,
      counterparty: '0xdef',
    });
  });

  it('rejects malformed activity cursors', () => {
    expect(() =>
      parseOperatorActivity({
        data: {
          ...emptyCollections,
          captures: {
            edges: [
              {
                cursor: 'not-base64',
                node: {
                  control_point_id: 1,
                  controller: '0xabc',
                  previous_controller: '0x0',
                  previous_allocation: '0',
                  allocation: '1',
                },
              },
            ],
          },
        },
      })
    ).toThrow('invalid activity cursor');
  });
});

describe('Torii yield claim parsing', () => {
  const pool = '0x755e4';
  const operator = '0xabc';

  it('decodes a claim emitted by the configured staking pool', () => {
    const result = parseYieldClaimPage(
      {
        data: {
          events: {
            edges: [
              {
                cursor: 'unused',
                node: {
                  id: `0x10:0xfeed:${pool}:0x2`,
                  keys: [
                    POOL_MEMBER_REWARD_CLAIMED_SELECTOR,
                    operator,
                    '0xdef',
                  ],
                  data: ['0x2386f26fc10000'],
                  transactionHash: '0xfeed',
                  executedAt: '2026-08-11T12:00:00Z',
                },
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: 'next-page' },
          },
        },
      },
      pool,
      operator
    );

    expect(result).toEqual({
      claims: [
        {
          id: `0x10:0xfeed:${pool}:0x2`,
          blockNumber: 16,
          eventIndex: 2,
          transactionHash: '0xfeed',
          poolMember: operator,
          rewardAddress: '0xdef',
          amount: 10_000_000_000_000_000n,
          executedAt: '2026-08-11T12:00:00Z',
        },
      ],
      hasNextPage: true,
      endCursor: 'next-page',
    });
  });

  it('rejects claim-shaped events from a different pool', () => {
    expect(() =>
      parseYieldClaimPage(
        {
          data: {
            events: {
              edges: [
                {
                  cursor: 'unused',
                  node: {
                    id: '0x10:0xfeed:0x999:0x2',
                    keys: [
                      POOL_MEMBER_REWARD_CLAIMED_SELECTOR,
                      operator,
                      operator,
                    ],
                    data: ['1'],
                    transactionHash: '0xfeed',
                    executedAt: '2026-08-11T12:00:00Z',
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
        pool,
        operator
      )
    ).toThrow('unexpected pool');
  });
});
