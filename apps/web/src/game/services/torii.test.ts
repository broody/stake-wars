import { describe, expect, it } from 'vitest';
import {
  NEW_POOL_MEMBER_SELECTOR,
  POOL_MEMBER_REWARD_CLAIMED_SELECTOR,
  filterSectorsByOperatorGeneration,
  parseIndexedSectors,
  parseOperatorActivity,
  parsePoolMemberStartPage,
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

describe('Torii Sector parsing', () => {
  it('parses and sorts indexed Sectors', () => {
    expect(
      parseIndexedSectors({
        data: {
          stakewarsSectorModels: {
            edges: [
              {
                node: {
                  id: 1275,
                  controller: '0xabc',
                  controller_generation: '0x4',
                  capture_force: '0x2386f26fc10000',
                  ownership_generation: '0x2',
                  controlled_since: '0x64',
                },
              },
              {
                node: {
                  id: '4',
                  controller: '0xdef',
                  controller_generation: '0x3',
                  capture_force: '0x1',
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
        controllerGeneration: 3n,
        captureForce: 1n,
        ownershipGeneration: 1n,
        controlledSince: null,
      },
      {
        id: 1275,
        controller: '0xabc',
        controllerGeneration: 4n,
        captureForce: 10_000_000_000_000_000n,
        ownershipGeneration: 2n,
        controlledSince: 100,
      },
    ]);
  });

  it('surfaces GraphQL errors', () => {
    expect(() =>
      parseIndexedSectors({ errors: [{ message: 'model unavailable' }] })
    ).toThrow('model unavailable');
  });

  it('rejects out-of-range Sector IDs', () => {
    expect(() =>
      parseIndexedSectors({
        data: {
          stakewarsSectorModels: {
            edges: [
              {
                node: {
                  id: 2000,
                  controller: '0xabc',
                  controller_generation: '0x1',
                  capture_force: '0x1',
                  ownership_generation: '0x1',
                },
              },
            ],
          },
        },
      })
    ).toThrow('invalid Sector ID');
  });

  it('drops stale ownership generations after a global relinquishment', () => {
    expect(
      filterSectorsByOperatorGeneration(
        [
          {
            id: 1,
            controller: '0xabc',
            controllerGeneration: 3n,
            captureForce: 10n,
            ownershipGeneration: 1n,
            controlledSince: null,
          },
          {
            id: 2,
            controller: '0x0abc',
            controllerGeneration: 4n,
            captureForce: 20n,
            ownershipGeneration: 1n,
            controlledSince: null,
          },
          {
            id: 3,
            controller: '0x0',
            controllerGeneration: 0n,
            captureForce: 0n,
            ownershipGeneration: 1n,
            controlledSince: null,
          },
        ],
        [{ operator: '0xabc', generation: 4n }]
      ).map(({ id }) => id)
    ).toEqual([2, 3]);
  });
});

describe('Torii Operator activity parsing', () => {
  const emptyCollections = {
    captures: { edges: [] },
    takeovers: { edges: [] },
    displacements: { edges: [] },
    reinforcements: { edges: [] },
    releases: { edges: [] },
    disqualifications: { edges: [] },
    relinquishments: { edges: [] },
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
                sector_id: 42,
                controller: '0xabc',
                capture_force: '0x2386f26fc10000',
              },
            },
          ],
        },
        displacements: {
          edges: [
            {
              cursor: activityCursor(12, '0xdisplace', 3),
              node: {
                sector_id: 42,
                controller: '0xdef',
                previous_controller: '0xabc',
                capture_force: '0x2b0a1a4c5a0000',
                returned_force: '0x27147114878000',
              },
            },
          ],
        },
        reinforcements: {
          edges: [
            {
              cursor: activityCursor(11, '0xreinforce', 2),
              node: {
                sector_id: 42,
                added_force: '75',
                capture_force: '175',
              },
            },
          ],
        },
      },
    });

    expect(activity.map(({ type }) => type)).toEqual([
      'displacement',
      'reinforcement',
      'capture',
    ]);
    expect(activity[0]).toMatchObject({
      blockNumber: 12,
      transactionHash: '0xdisplace',
      sectorId: 42,
      amount: 11_000_000_000_000_000n,
      counterparty: '0xdef',
    });
    expect(activity[1]).toMatchObject({
      amount: 75n,
      secondaryAmount: 175n,
    });
  });

  it('reports a takeover with the displaced Operator and returned FORCE', () => {
    const activity = parseOperatorActivity({
      data: {
        ...emptyCollections,
        takeovers: {
          edges: [
            {
              cursor: activityCursor(20, '0xtakeover', 1),
              node: {
                sector_id: 42,
                controller: '0xabc',
                previous_controller: '0xdef',
                capture_force: '550',
                returned_force: '500',
              },
            },
          ],
        },
      },
    });

    expect(activity).toMatchObject([
      {
        type: 'takeover',
        sectorId: 42,
        amount: 550n,
        secondaryAmount: 500n,
        counterparty: '0xdef',
      },
    ]);
  });

  it('decodes permanent operator retirement', () => {
    const activity = parseOperatorActivity({
      data: {
        ...emptyCollections,
        relinquishments: {
          edges: [
            {
              cursor: activityCursor(25, '0xexit', 4),
              node: {
                invalidated_force: '700',
                released_sector_count: 2,
              },
            },
          ],
        },
      },
    });

    expect(activity).toEqual([
      expect.objectContaining({
        type: 'retirement',
        amount: 700n,
        affectedSectorCount: 2,
        transactionHash: '0xexit',
      }),
    ]);
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
                  sector_id: 1,
                  controller: '0xabc',
                  capture_force: '1',
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

describe('Torii pool membership parsing', () => {
  it('decodes a pool entry used as the yield observation start', () => {
    const result = parsePoolMemberStartPage(
      {
        data: {
          events: {
            edges: [
              {
                cursor: 'unused',
                node: {
                  id: '0x20:0xfeed:0x755e4:0x3',
                  keys: [NEW_POOL_MEMBER_SELECTOR, '0xabc', '0xvalidator'],
                  data: ['0xdef', '0x3635c9adc5dea00000'],
                  transactionHash: '0xfeed',
                  executedAt: '2026-05-12T00:00:00Z',
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
      '0x755e4',
      '0xabc'
    );

    expect(result).toEqual({
      starts: [
        {
          blockNumber: 32,
          eventIndex: 3,
          executedAt: '2026-05-12T00:00:00Z',
        },
      ],
      hasNextPage: false,
      endCursor: null,
    });
  });
});
