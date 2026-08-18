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
