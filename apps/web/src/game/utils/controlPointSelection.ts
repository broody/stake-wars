export function updateControlPointSelection(
  current: number[],
  controlPointId: number,
  extendSelection: boolean
): number[] {
  if (extendSelection) {
    return current.includes(controlPointId)
      ? current.filter((id) => id !== controlPointId)
      : [...current, controlPointId];
  }

  return current.length === 1 && current[0] === controlPointId
    ? []
    : [controlPointId];
}
