/**
 * What "hard but not too hard" means for the simulator: runs that last about
 * eight minutes for the Vanguard with natural picks and about ten for a good
 * preset kit. Times are seconds.
 */
export const TARGETS = {
  /** Most natural runs must outlast the opening, however poorly they build. */
  earlySeconds: 120,
  earlyShare: 0.9,
  /** Median defeat for the default Vanguard bot earning its own upgrades. */
  naturalMedian: [450, 510],
  /** A good minute-5 kit is safe through minute 5... */
  midSafeMinute: 5,
  midSafeShare: 0.95,
  /** ...but falls between minutes 9 and 11. */
  midMedian: [540, 660],
  /** Even everything maxed and evolved falls between minutes 10 and 13. */
  maxMedian: [600, 780],
  /**
   * The minute by which each kit is losing health on balance (median damage
   * taken over the minute exceeds healing) and stays losing for the rest of
   * the run. Falls above hang on whether the bot dodges a burst; this does
   * not, so it is what catches a build that heals faster than it can be hurt.
   */
  midLosingBy: 10,
  maxLosingBy: 12,
} as const;
