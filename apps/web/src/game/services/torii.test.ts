import { describe, expect, it } from 'vitest';
import { parseIndexedControlPoints } from './torii';

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
