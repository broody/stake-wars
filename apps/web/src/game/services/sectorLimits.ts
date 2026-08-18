export const MAX_CONTROL_ACTION_BATCH = 200;
export const MAX_SECTOR_SELECTION = 1_000;

export function requiresSectorActionSplit(itemCount: number): boolean {
  return itemCount > MAX_CONTROL_ACTION_BATCH;
}

export function chunkSectorActions<T>(items: readonly T[]): T[][] {
  if (items.length > MAX_SECTOR_SELECTION) {
    throw new RangeError(
      `At most ${MAX_SECTOR_SELECTION} Sectors can be selected`
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
