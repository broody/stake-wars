/**
 * What "hard but not too hard" means for the simulator. The bot dodges worse
 * than a practiced player, so its own (natural) build mostly checks the
 * opening; the handed builds stand in for players who have built well, and
 * their health curves are what the targets hold. Times are seconds.
 */
export const TARGETS = {
  /** Most natural runs must outlast the opening, however poorly they build. */
  earlySeconds: 180,
  earlyShare: 0.9,
  /** A good minute-8 kit is safe through minute 8... */
  midSafeMinute: 8,
  midSafeShare: 0.95,
  /** ...but falls between minutes 14 and 18. */
  midMedian: [840, 1080],
  /** Even everything maxed and evolved falls between minutes 16 and 22. */
  maxMedian: [960, 1320],
  /**
   * The minute by which each kit is losing health on balance (median damage
   * taken over the minute exceeds healing) and stays losing for the rest of
   * the run. Falls above hang on whether the bot dodges a burst; this does
   * not, so it is what catches a build that heals faster than it can be hurt.
   */
  midLosingBy: 15,
  maxLosingBy: 18,
} as const;
