import { adjacentSectorIds, isSectorId } from './sectorGeometry';

export function updateSectorSelection(
  current: number[],
  sectorId: number,
  extendSelection: boolean
): number[] {
  if (extendSelection) {
    return current.includes(sectorId)
      ? current.filter((id) => id !== sectorId)
      : [...current, sectorId];
  }

  return current.length === 1 && current[0] === sectorId ? [] : [sectorId];
}

export function combineSectorSelections(
  current: readonly number[],
  next: readonly number[],
  extendSelection: boolean
): number[] {
  return [...new Set(extendSelection ? [...current, ...next] : next)];
}

export function contiguousSectorIds(
  startSectorId: number,
  candidateSectorIds: readonly number[]
): number[] {
  if (!isSectorId(startSectorId)) {
    throw new RangeError(`Invalid Sector ID: ${startSectorId}`);
  }

  const candidates = new Set(candidateSectorIds);
  if (!candidates.has(startSectorId)) return [];

  const contiguous = new Set([startSectorId]);
  const pending = [startSectorId];

  while (pending.length > 0) {
    const sectorId = pending.pop();
    if (sectorId === undefined) break;

    adjacentSectorIds(sectorId).forEach((neighborId) => {
      if (!candidates.has(neighborId) || contiguous.has(neighborId)) return;
      contiguous.add(neighborId);
      pending.push(neighborId);
    });
  }

  return [...contiguous].sort((left, right) => left - right);
}
