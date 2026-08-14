export const MAX_CONTROL_ACTION_BATCH = 200;
export const MAX_CONTROL_POINT_SELECTION = 1_000;

export function requiresControlPointActionSplit(itemCount: number): boolean {
  return itemCount > MAX_CONTROL_ACTION_BATCH;
}

export function chunkControlPointActions<T>(items: readonly T[]): T[][] {
  if (items.length > MAX_CONTROL_POINT_SELECTION) {
    throw new RangeError(
      `At most ${MAX_CONTROL_POINT_SELECTION} Control Points can be selected`
    );
  }

  const chunks: T[][] = [];
  for (
    let offset = 0;
    offset < items.length;
    offset += MAX_CONTROL_ACTION_BATCH
  ) {
    chunks.push(items.slice(offset, offset + MAX_CONTROL_ACTION_BATCH));
  }
  return chunks;
}
