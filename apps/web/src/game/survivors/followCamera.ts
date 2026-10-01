/** The follow camera's authored framing, in ground units above and behind the trooper. */
export const FOLLOW_CAMERA = {
  height: 3.3,
  back: 0.9,
  lead: 0.15,
  /**
   * Narrow screens pull back until at least this much ground shows either
   * side of the trooper; landscape screens already see more.
   */
  minHalfWidth: 1.8,
  maxPullback: 1.8,
} as const;

/**
 * How much farther the camera sits than its authored framing, for a vertical
 * field of view `fov` (degrees) and a width-to-height `aspect`.
 */
export function followPullback(fov: number, aspect: number) {
  const halfWidth =
    FOLLOW_CAMERA.height * Math.tan((fov * Math.PI) / 360) * aspect;
  if (!(halfWidth > 0)) return 1;
  return Math.min(
    FOLLOW_CAMERA.maxPullback,
    Math.max(1, FOLLOW_CAMERA.minHalfWidth / halfWidth)
  );
}
