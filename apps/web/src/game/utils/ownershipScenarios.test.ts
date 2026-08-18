import { describe, expect, it } from 'vitest';
import { SECTOR_COUNT, adjacentSectorIds } from './sectorGeometry';
import {
  MAX_STAKE_RELIEF_HEIGHT,
  OWNERSHIP_SCENARIO_DEFINITIONS,
  STAKE_RELIEF_CAP_STRK,
  createOwnershipScenario,
  stakeReliefHeight,
} from './ownershipScenarios';

describe('ownership scenarios', () => {
  it.each(OWNERSHIP_SCENARIO_DEFINITIONS)(
    'fills the Core for $title',
    (definition) => {
      const scenario = createOwnershipScenario(definition);
      expect(scenario.ownerBySector).toHaveLength(SECTOR_COUNT);
      expect(scenario.sectorIdsByOwner).toHaveLength(definition.ownerCount);
      expect(
        scenario.counts.reduce((total, count) => total + count, 0) +
          scenario.unoccupiedSectorIds.length
      ).toBe(SECTOR_COUNT);
      expect(scenario.counts.every((count) => count > 0)).toBe(true);
      expect(scenario.stakedStrkByOwner).toHaveLength(definition.ownerCount);
      expect(scenario.stakedStrkByOwner.every((stake) => stake > 0)).toBe(true);
      expect(scenario.unoccupiedSectorIds.length).toBeGreaterThan(0);
      expect(new Set(scenario.unoccupiedSectorIds).size).toBe(
        scenario.unoccupiedSectorIds.length
      );
      expect(
        scenario.unoccupiedSectorIds.every(
          (sectorId) => scenario.ownerBySector[sectorId] === -1
        )
      ).toBe(true);
      expect(scenario.contestedSectorIds.length).toBeGreaterThan(0);
      expect(new Set(scenario.contestedSectorIds).size).toBe(
        scenario.contestedSectorIds.length
      );
      expect(
        scenario.contestedSectorIds.every(
          (sectorId) =>
            scenario.ownerBySector[sectorId] >= 0 &&
            adjacentSectorIds(sectorId).some((neighborId) => {
              const neighborOwner = scenario.ownerBySector[neighborId];
              return (
                neighborOwner >= 0 &&
                neighborOwner !== scenario.ownerBySector[sectorId]
              );
            })
        )
      ).toBe(true);
    }
  );

  it('keeps every territory connected in a contiguous scenario', () => {
    const scenario = createOwnershipScenario(OWNERSHIP_SCENARIO_DEFINITIONS[1]);

    scenario.sectorIdsByOwner.forEach((sectorIds, owner) => {
      const territory = new Set(sectorIds);
      const visited = new Set<number>();
      const queue = [sectorIds[0]];

      while (queue.length > 0) {
        const sectorId = queue.pop();
        if (sectorId === undefined || visited.has(sectorId)) continue;
        visited.add(sectorId);
        adjacentSectorIds(sectorId).forEach((neighbor) => {
          if (
            scenario.ownerBySector[neighbor] === owner &&
            !visited.has(neighbor)
          ) {
            queue.push(neighbor);
          }
        });
      }

      expect(visited.size).toBe(territory.size);
    });
  });

  it('is deterministic', () => {
    const definition = OWNERSHIP_SCENARIO_DEFINITIONS[2];
    expect(createOwnershipScenario(definition)).toEqual(
      createOwnershipScenario(definition)
    );
  });

  it('caps logarithmic stake relief without flattening smaller differences', () => {
    expect(stakeReliefHeight(100)).toBeLessThan(stakeReliefHeight(1_000));
    expect(stakeReliefHeight(1_000)).toBeLessThan(
      stakeReliefHeight(STAKE_RELIEF_CAP_STRK)
    );
    expect(stakeReliefHeight(STAKE_RELIEF_CAP_STRK)).toBeCloseTo(
      MAX_STAKE_RELIEF_HEIGHT
    );
    expect(stakeReliefHeight(STAKE_RELIEF_CAP_STRK * 10)).toBeCloseTo(
      MAX_STAKE_RELIEF_HEIGHT
    );
  });

  it('supports a capped linear stake relief scale', () => {
    expect(stakeReliefHeight(STAKE_RELIEF_CAP_STRK / 2, false)).toBeCloseTo(
      MAX_STAKE_RELIEF_HEIGHT / 2
    );
    expect(stakeReliefHeight(STAKE_RELIEF_CAP_STRK, false)).toBeCloseTo(
      MAX_STAKE_RELIEF_HEIGHT
    );
    expect(stakeReliefHeight(STAKE_RELIEF_CAP_STRK * 10, false)).toBeCloseTo(
      MAX_STAKE_RELIEF_HEIGHT
    );
  });
});
