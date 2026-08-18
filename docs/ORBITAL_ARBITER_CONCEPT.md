# Orbital Arbiter Concept

**Status:** Exploratory design; not approved for implementation
**Last updated:** 2026-08-18

## Summary

The Arbiter is a visible object orbiting the Core. Recurring rounds use a
STRK20 sealed-bid auction to determine temporary influence over bounded global
game rules. Bids should remain hidden during the bidding phase, while the
result, active rules, activation time, and expiry remain public.

The feature is intended as an optional strategic layer over the existing
delegation-backed Control Point game. It must not replace native staking as the
source of territorial force or give an auction winner unrestricted
administrative authority.

## Central Design Concern

Giving one Operator exclusive control of the Arbiter may suppress too much of
the game. Every Operator should retain meaningful agency during an Arbiter
round, and winning the auction should confer an advantage or agenda-setting
force rather than absolute control.

This participation model is deliberately unresolved. Candidate structures to
consider later include:

1. **Agenda setter:** The auction winner selects a short list of edicts, then
   all eligible Operators choose which one activates.
2. **Orbital council:** The top several sealed bidders each receive one bounded
   command or vote, with no single bidder controlling the full ruleset.
3. **Amplified influence:** Every Operator receives baseline command influence;
   the auction winner receives additional weight or one exclusive modifier.
4. **Distributed charges:** All Operators can earn or acquire limited Arbiter
   actions, while the auction winner receives more charges, earlier access, or
   reduced activation costs.
5. **Multiple seats:** Separate auctions award economic, military, and visual
   authorities, preventing one Operator from controlling every category.
6. **Regional authority:** Several Operators control different map regions
   instead of one Operator setting Core-wide rules.

No model above is selected yet.

## Candidate Edicts

All values must be bounded by the contract and expire automatically.

| Edict | Candidate effect |
| --- | --- |
| Time Dilation | Apply a bounded increase or decrease to response windows for new lead changes during the round. |
| Martial Law | Select a bounded minimum Challenge raise, such as 5%, 10%, or 20%. |
| Open Season | Select a region where neutral captures and Challenges have lower requirements for every Operator. |
| Armistice | Temporarily prevent new Challenges while allowing existing responses, settlements, retirement, and synchronization. |
| Sanctuary | Freeze one Control Point symmetrically: no attack, reinforcement, release, sacrifice, or image changes. |
| Blockade | Prevent one point from being reinforced, released, or sacrificed while preserving its Controller's right to answer an active Challenge. |
| Sacrifice Embargo | Prevent points in a selected region from being sacrificed to fund Challenges. |
| Supply Lines | Require a reinforced point to be contiguous with another point controlled by the same Operator. |
| Bounty Beacon | Attach part of the round's auction proceeds to a selected Control Point for capture or end-of-round control. |
| Orbital Broadcast | Grant a moderated global message, Core overlay, visual theme, or artwork projected from the orbiting Arbiter. |

## Safety and Fairness Constraints

- The Arbiter must never call or override the existing administrative
  `set_paused` control. Emergency pause and unpause remain restricted to the
  production multisig.
- A gameplay ceasefire must be represented as a separate, expiring round rule.
- No edict may stop an incumbent from answering a Challenge that has already
  started; otherwise an authority holder could manufacture an unavoidable
  capture.
- Challenge rules should be snapshotted at initiation or lead change so a
  later edict cannot unexpectedly rewrite an existing deadline or minimum bid.
- Settlement, position resolution, Operator synchronization, retirement, and
  emergency administration must remain available during gameplay restrictions.
- Targeted effects should have an activation delay, a short duration, and a
  cooldown preventing repeated targeting of the same Control Point.
- The contract should expose an explicit allowlist of edicts and bounded
  parameters rather than accepting arbitrary calls or configuration values.
- A round should limit how many military, economic, and visual effects may be
  active simultaneously.

## Sealed-Bid Auction Boundary

The linked STRK20 sealed-bid auction page is a request-for-startups design
brief, not a production package. Its proposed protocol has listing, bidding,
and reveal phases; bids use escrowed encrypted notes; revealed amounts must
match those notes; and a force-reveal path is required when a bidder does not
cooperate.

A StakeWars implementation would therefore require a separately designed,
reviewed, audited, and deployed auction protocol. Decisions still required
include:

- First-price versus second-price/Vickrey settlement.
- Bid asset and minimum bid.
- Treatment of winning proceeds and losing bids.
- Eligibility: all stakers, active Operators, or current Control Point owners.
- Tie breaking, non-reveal forfeiture, cancellation, and emergency recovery.
- Whether the winner, top bidders, or all eligible Operators receive authority.
- Exact information revealed after settlement.

Privacy must be described narrowly: bid values and bidder relationships may be
hidden during the auction, depending on the final protocol, while the resulting
authority, activated edicts, affected targets, and game activity remain public.

## Potential Contract Shape

This is a discussion aid, not an approved schema.

- `ArbiterRound`: round identifier, phase timestamps, auction address, status,
  settlement result, and expiry.
- `RoundRules`: bounded active modifiers and their activation/expiry times.
- `ArbiterAuthority`: temporary seats, charges, voting weight, or selected
  agenda, depending on the participation model.
- `TargetCooldown`: prevents repeated targeting of the same Control Point.
- A dedicated Arbiter system validates and activates allowed edicts.
- Existing Control System entrypoints read applicable `RoundRules` without
  transferring custody of delegated STRK.
- The image API reads the same onchain rules before authorizing publication.

The current backend maintenance process is already named **Arbiter** in the
PRD. If the orbiting object retains that name, rename the maintenance role to
**Keeper** or **Resolver** to keep product authority separate from permissionless
maintenance.

## Open Questions

1. What meaningful Arbiter interaction should every Operator receive each
   round, regardless of auction outcome?
2. Is auction victory primarily agenda-setting, voting weight, action charges,
   or temporary office?
3. Should authority be Core-wide, regional, categorical, or divided among the
   top bidders?
4. Should auction proceeds be burned, returned to gameplay as bounties, sent to
   a treasury, or distributed to other Operators?
5. How long should bidding, reveal, authority, and cooldown periods last?
6. Which edicts create counterplay, and which merely suppress another
   Operator's ability to act?
7. Can an Arbiter holder target its own Control Points, and should self-targeted
   Sanctuary or Blockade have additional restrictions?
8. Should active Challenges always be grandfathered under their original
   rules?
9. How does authority behave if its holder retires or loses all Control Points?
10. Should the Arbiter be a seasonal event, a continuous recurring system, or
    activated only after minimum participation is reached?

## Non-Goals for the Initial Design

- Replacing delegation-backed Capture Force with an auction token.
- Giving a player access to administrative pause, upgrades, configuration, or
  treasury controls.
- Making deployed stake, public Control Point actions, or active edicts appear
  private.
- Selecting an implementation before the shared-authority model is resolved.

## References

- [STRK20 sealed-bid auction RFP](https://strk20.starknet.io/rfp/sealed-bid-auctions)
- [STRK20 private DeFi through the Wallet API](https://strk20-by-example.org/starknet-wallet-api/private-defi)
- [StakeWars product requirements](./PRD.md)
