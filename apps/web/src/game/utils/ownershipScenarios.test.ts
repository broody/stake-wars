import { describe, expect, it } from 'vitest';
import {
  CONTROL_POINT_COUNT,
  adjacentControlPointIds,
} from './controlPointGeometry';
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
      expect(scenario.ownerByControlPoint).toHaveLength(CONTROL_POINT_COUNT);
      expect(scenario.controlPointIdsByOwner).toHaveLength(
        definition.ownerCount
      );
      expect(
        scenario.counts.reduce((total, count) => total + count, 0) +
          scenario.unoccupiedControlPointIds.length
      ).toBe(CONTROL_POINT_COUNT);
      expect(scenario.counts.every((count) => count > 0)).toBe(true);
      expect(scenario.stakedStrkByOwner).toHaveLength(definition.ownerCount);
      expect(scenario.stakedStrkByOwner.every((stake) => stake > 0)).toBe(true);
      expect(scenario.unoccupiedControlPointIds.length).toBeGreaterThan(0);
      expect(new Set(scenario.unoccupiedControlPointIds).size).toBe(
        scenario.unoccupiedControlPointIds.length
      );
      expect(
        scenario.unoccupiedControlPointIds.every(
          (controlPointId) =>
            scenario.ownerByControlPoint[controlPointId] === -1
        )
      ).toBe(true);
      expect(scenario.contestedControlPointIds.length).toBeGreaterThan(0);
      expect(new Set(scenario.contestedControlPointIds).size).toBe(
        scenario.contestedControlPointIds.length
      );
      expect(
        scenario.contestedControlPointIds.every(
          (controlPointId) =>
            scenario.ownerByControlPoint[controlPointId] >= 0 &&
            adjacentControlPointIds(controlPointId).some((neighborId) => {
              const neighborOwner = scenario.ownerByControlPoint[neighborId];
              return (
                neighborOwner >= 0 &&
                neighborOwner !== scenario.ownerByControlPoint[controlPointId]
              );
            })
        )
      ).toBe(true);
    }
  );

  it('keeps every territory connected in a contiguous scenario', () => {
    const scenario = createOwnershipScenario(OWNERSHIP_SCENARIO_DEFINITIONS[1]);

    scenario.controlPointIdsByOwner.forEach((controlPointIds, owner) => {
      const territory = new Set(controlPointIds);
      const visited = new Set<number>();
      const queue = [controlPointIds[0]];

      while (queue.length > 0) {
        const controlPointId = queue.pop();
        if (controlPointId === undefined || visited.has(controlPointId))
          continue;
        visited.add(controlPointId);
        adjacentControlPointIds(controlPointId).forEach((neighbor) => {
          if (
            scenario.ownerByControlPoint[neighbor] === owner &&
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
