# Hero classes — Vanguard, Drifter, Channeler

**Status: v0 ground settings.** This is the agreed starting point for
building and simulating the classes. Expect the numbers to move. Change them
here, and add a line to the [changelog](#changelog) so later simulation
results can be traced to the settings they ran against. Implementation order:
Vanguard, then Drifter, then Channeler.

Design for replacing the Sector Trooper in Core Survivors with three playable
classes. It defines each class's kit and in-run progression in the
simulation's own units so the balance harness can test it directly.

- Simulation and content: `apps/web/src/game/survivors/{content.ts,sim.ts}`.
  Balance harness: `pnpm sim:balance` (`apps/web/scripts/survivors-balance.mjs`,
  `balance/*`).
- Units match `sim.ts`: world units on a Core of radius ≈5.006, seconds,
  30 Hz steps. Reference values: player speed 1 (Vanguard 0.77), `VIEW` 3.4, Arc Blade reach
  0.77, Bolt Caster range ≈3.9, Mite radius 0.12.
- Numbers assume `might = area = cooldownScale = 1`. Pierce follows the sim:
  pierce *N* hits *N* + 1 enemies. "DPS" columns are rough arithmetic for parity
  checks before the first simulation, not measurements.

## Decisions this proposal makes

1. **Progression means in-run progression.** The current mode has no
   meta-progression (`localStorage` only stores audio volume). Masteries below
   could later become cross-run unlocks, but that is out of scope.
2. **The existing structure stays.** Weapons level from 1 to 5. A level 5
   weapon with its paired system at level 1 or higher offers an evolution.
   Level-ups offer three cards, the caps stay at six weapons and six systems,
   and each run has two rerolls. Supply Drops, offer weights and the
   Field Repair / Calibrate fallbacks are unchanged.
3. **Your hands are your class; the Core is shared.** Weapons that use the held
   weapon are class-exclusive. Core tech is available to every class.
   - **Arc Blade becomes Vanguard-only.**
   - **Bolt Caster** is an optional off-hand gun for the Vanguard and Sector
     Trooper. It also provides the basis for Drifter's proposed Twin Pistols.
   - Every class keeps the shared pool: Orbit Shards, Orbital Strike, Sector
     Charge, Stake Pulse and all six shared systems.
   - Vanguard can draft eight weapons for six slots. Drifter and Channeler
     are each designed around seven options for six slots.
4. **The Arc Blade is unchanged.** Vanguard keeps today's 100 integrity but
   starts at a Skitter's speed, 0.77, so it differs from the current player
   by Aegis and speed. The `trooper-baseline` build below reproduces today's
   player exactly and isolates what Aegis, speed and the new weapons each
   change. Drifter and Channeler
   are tuned toward parity with Vanguard, and Vanguard against that baseline.
5. **The `vanguard` id becomes the class.** `catalog/entries.ts` and
   `sounds.ts` already use `'vanguard'` for the player. The Sector Trooper remains available as the balance baseline.
6. **Casting never roots the player.** The genre convention holds: movement
   input always moves you. Long casts (Skyfall) play on the upper body. The
   alternative, a short root traded for a bigger effect, is a possible
   Channeler mastery, but this design does not use it.
7. **Sustain never scales with the crowd.** This follows commit 87105b8, which
   stopped sustain from scaling with the crowd. There is no healing on kill and
   no lifesteal. Defensive tools are time-gated: a shield gauge that recharges
   only while you avoid hits, invulnerability windows and periodic shockwaves.
8. **Runs last about ten minutes.** The mode stays endless and is scored by
   time survived, but a good build falls at about 10:00. The original tuning
   had good builds falling between minutes 14 and 18. Two constants in
   `sim.ts` compress it:
   - **`PACE` = 1.15.** The Legion's clock runs 1.15× faster: spawns, enemy
     health, damage and speed, unlocks and the event script all read it.
     Weapons, attacks and pickups keep real time.
   - **`XP_CURVE`.** The XP to the next level is `6 + 1.6 × level²`. Early
     levels come every 20–30 s, and later ones get steep. A strong run
     reaches about level 21 at 5:00 and 35 at 10:00, short of the ~66
     upgrades it would take to own and evolve everything, so builds have to
     choose. `LEVEL_PACE` (1) divides it for sweeps.
   - Set together by simulation, they put the trooper's minute-5 kit at a
     10:03 median fall and the maxed kit at 12:31.

## At a glance

|                       | Vanguard (blade)                      | Drifter (pistols)                          | Channeler (staff)                   |
| --------------------- | ------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Fantasy               | Holds the line, cuts through it       | Never stops moving, never stops firing     | Plants the staff and owns the area  |
| Engagement range      | Close (0.8–1.2); crescents reach ~3   | Mid–long (1.5–4.2)                         | Area around self + anywhere in view |
| Rewarded behavior     | Stepping in and taking hits           | Constant movement (Drift)                  | Standing ground (Focus)             |
| Defensive tool        | Aegis shield gauge, Rebuke knockback  | Speed, Hammerfan knockback, i-frames       | Stun, slow, Sanctum wall            |
| Boss / elite answer   | Duelist cuts under Aegis              | Deadeye burst + vulnerability mark         | Skyfall lances, stun-damage amps    |
| Crowd answer          | Cleave arcs, piercing crescents       | Pierce, ricochet, point-blank fan          | Splash, aftershocks, lances         |
| Crowd control         | Knockback                             | Knockback                                  | Slow, stun, pull, wall              |
| Hostile bolts         | Destroys them (Blade Ward, Rampart)   | Outruns them                               | Walls them out (Sanctum)            |
| Concept-sheet promise | Sweeps, defensive pulse, orbit blades | Nearest fire, pierce, ricochet, movement   | Shards, radial pulses, CC, area     |

### Base stats

|             | Vanguard  | Drifter      | Channeler    | Sector Trooper (now) |
| ----------- | --------- | ------------ | ------------ | -------------------- |
| Max HP      | 100       | 85           | 95           | 100                  |
| Move speed  | 0.77      | 1.10         | 1.00         | 1.00                 |
| Magnet      | 0.55      | 0.55         | 0.70         | 0.55                 |
| Trait       | Aegis (a five-rank branch) | Drift        | Focus        | —                    |
| Starter     | Arc Blade | Twin Pistols | Prism Bolt   | Arc Blade            |
| Evolution pairs | FORCE, Amplifier, Aegis | Overclock, FORCE, Thrusters | Amplifier, TBD, Tractor Beam | — |

`createRun(seed, groundRadius, starter)` already accepts a starter weapon. A
class id would replace that parameter and also select base stats, trait and the
offer pool.

### Run arc

- **0–2 min.** Each class finishes its starter and one technique. Vanguard
  learns to spend Aegis in the crowd and step out to recharge, Drifter learns
  to keep moving, and Channeler learns where to plant.
- **2–5 min.** The first evolution arrives once a weapon reaches level 5
  with its system, around 3:00 for a focused build. Class weapons deal
  with the Warden differently: Vanguard parks on it under Aegis, Drifter
  shreds it with marks and Channeler drops lances on it.
- **5 min+.** Masteries and the shared Core tech take over. The tier III
  option that extends a class trait to every weapon is how each class
  "overlaps" in the late game while still playing differently. Enemy health
  starts compounding at 5:13, and good builds fall around 10:00.

At `PACE` 1.15 the Wardens arrive at 3:03, 5:39, 7:41, 9:51 and 12:02.

---

## Vanguard — blade

Knight of the line. Vanguard is the most forgiving class: it keeps the current
blade, adds a recharging shield, and has the longest reach of any melee in the
game.

### Trait — Aegis

Aegis is a recharging shield gauge in front of your integrity. Think of it as
your time budget inside the crowd: wade in on a full gauge, step out to
recharge. It is a branch, not a given: the Vanguard spawns without it and
raises it through the level-up offers as the `aegis` system, five ranks that
each cost a pick and one of the six system slots.

| Rank | What it adds | Gauge |
| --- | --- | --- |
| 1 | Immediately equips 2 full segments. Refills 4 s after the last hit, 6 s after a break. | 2 |
| 2 | +1 segment. | 3 |
| 3 | Refills 1 s sooner: 3 s, and 5 s after a break. | 3 |
| 4 | +1 segment. | 4 |
| 5 | +1 segment. | 5 |

Rank 5 is the v0 trait below, so a fully raised branch plays exactly as the
trait did. `--aegis` sweeps set that top rank and the lower ranks follow
(`aegisAtRank` in `survivors/aegis.ts`).

| Rule | v0 value |
| --- | --- |
| Capacity | **5 segments** at rank 5. Rank 1 equips both segments immediately. Each later capacity increase adds one charged segment. |
| Cost of a hit | 1 segment for contact and bolts. 3 segments for the telegraphed heavy attacks: Bulwark thrust, Volt leap, Warden slam. A hit that costs more than what is left breaks the gauge and the remainder is absorbed. |
| Effect of a blocked hit | A blocked hit deals no integrity damage. It grants the normal 0.6 s invulnerability, so a crowd lands at most one hit per 0.6 s window (about 0.63 s at 30 Hz), so a full gauge lasts at least 2.5 s in constant contact. |
| Recharge delay | Refilling starts **3 s** after the last hit, blocked or not. Any new hit restarts the delay. |
| Recharge rate | **2 segments/s**, so empty to full takes 2.5 s once refilling starts. |
| Break | When the gauge empties, the shield shatters and the delay becomes **5 s**. Subsequent hits deal their full damage to integrity. |
| Overflow (`spill`) | v0: 0, so a hit that costs more than the segments left is still absorbed whole as the gauge breaks. At 1, the share it could not cover goes through to integrity. |
| Cost growth (`growth`) | v0: 0, so a hit costs the same all run. At 0.08 the cost grows with the Legion's damage, 8% per Legion minute. |

- Integrity only takes damage while the gauge is empty.
- Hits are counted, not damage, so Lancer, Captain and Warden bolt spam is
  exactly what Aegis is built to soak.
- The HUD shows a cell per segment. An ivory field rises around the Vanguard
  as soon as the shield is equipped. Hits send a ripple outward from the
  point of contact, with a stronger response to heavy impacts. The last hit
  fractures the panels and the HUD reads `BROKEN` until one whole segment
  returns.
- **Scaling note:** enemy damage grows 8% per Legion minute but a segment
  absorbs a whole hit, so Aegis is worth more later in the run. At Legion
  minute 6 a full gauge of Bulwark-grade hits is about 75 integrity; at Legion
  minute 15 it is about 110. That is real minute 5:13 and 13:03 at `PACE` 1.15.
  This is the first thing to check in simulation.

### Arc Blade — starter

One cut per swing at every level; the old level-2 backhand follow-up is gone.
The arc widens 30° a level instead, to a full 180° at level 4. Eclipse (pair
**FORCE**) is unchanged.

| Level | Card | Damage per cut | Cooldown | Arc | Reach |
| --- | --- | --- | --- | --- | --- |
| L1 | Aims a 90° slash at a nearby enemy. | 14 | 1.3 s | 90° | 0.77 |
| L2 | +30% damage and a wider 120° arc. | 18.2 | 1.3 s | 120° | 0.77 |
| L3 | +25% reach and a wider 150° arc. | 18.2 | 1.3 s | 150° | 0.9625 |
| L4 | Cuts a full 180°. Swings faster. | 18.2 | 1.1 s | 180° | 0.9625 |
| L5 | +30% damage and faster sweeps. | 22.4 | 0.9 s | 180° | 0.9625 |
| Eclipse | A full-circle cut that throws the Legion back. | 42, radius 1.18 | 1.15 s | 360° | — |

DPS: about 10.8 at L1, 16.5 at L4 and 24.9 at L5 on the side it faces, and
36.5 area DPS with Eclipse. A 180° cut covers the whole side toward its
target; only Eclipse covers both. Each cut still uses the forehand or
backhand clip depending on which side the target is on.

**Retime:** Vanguard's clip strikes at frame 8 of 22 (0.333 s), with an active
window of 0.25–0.458 s. The trooper saber struck at 11/24 of 0.75 s. Keep the
sim's `duration = min(…, cooldown)` scaling and play the clip at
`0.917 / duration`. Clips: `Attack`, `AttackBackhand`, `RunAttack`,
`RunAttackBackhand`, plus the `upper_body_bones` mask for cuts at any point in
the stride.

### Crescent Wave — class technique (pair Amplifier → Meridian)

This weapon has its own cooldown. Once it is ready, the **next Arc Blade cut**
also releases a crescent along that cut's aim.

- The crescent is a travelling arc segment, speed 2.4.
- It hits every enemy in its path once each and applies knockback 0.4.
- It needs no clip of its own and never competes with the blade for the arm.

| Lv | Card | Crescents | Damage | Width | Range | Cooldown |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Every few seconds, a cut releases a crescent through every enemy in its path. | 1 | 16 | 0.55 | 2.4 | 2.6 s |
| 2 | +1 crescent. | 2, fanned ±12° | 16 | 0.55 | 2.4 | 2.6 s |
| 3 | +40% damage. | 2 | 22.4 | 0.55 | 2.4 | 2.6 s |
| 4 | +30% width and range. | 2 | 22.4 | 0.72 | 3.1 | 2.6 s |
| 5 | Releases crescents more often. | 2 | 22.4 | 0.72 | 3.1 | 1.8 s |
| **Meridian** | Every cut releases a wide crescent that crosses the whole view. | 1 per cut (Eclipse: 4 in a cross) | 26 | 1.0 | 3.4 | every cut |

Lane DPS: L1 ≈ 6.2, L5 ≈ 12.4 per lane, Meridian ≈ 26 per cut.

Meridian with an unevolved L5 blade gives a crescent every 0.9 s; with
Eclipse it gives 4 crescents per 1.15 s. Watch this pairing in simulation.

An Eclipse cut covers a full circle and has no aim, so before Meridian a
crescent released by Eclipse aims at the nearest enemy.

### Rebuke — class technique (pair Aegis → Rampart)

This is the concept sheet's "expanding defensive pulse".

- When you take a hit or Aegis blocks one, a shockwave bursts from you.
- An internal cooldown (ICD) limits how often hits can trigger it.
- From L2 it also fires on a timer, so a kiting player still gets value.

| Lv | Card | Radius | Damage | Knockback | Hit ICD | Timer |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | When you are hit, shielded or not, a shockwave throws enemies back. | 0.9 | 20 | 1.6 | 3 s | — |
| 2 | Also bursts on its own every 7 seconds. | 0.9 | 20 | 1.6 | 3 s | 7 s |
| 3 | +40% damage and a wider burst. | 1.1 | 28 | 1.6 | 3 s | 7 s |
| 4 | Each burst restores 1 Aegis segment. | 1.1 | 28 | 1.6 | 3 s | 7 s |
| 5 | Bursts more often. | 1.1 | 28 | 1.6 | 2 s | 5 s |
| **Rampart** | A wide ring that erases hostile bolts and restores Aegis. | 1.5, expands over 0.35 s | 36 | 2.2 | 2 s | 5 s |

- Rampart restores 2 segments per burst instead of 1. Restoring segments
  does not reset the recharge delay.
- Area DPS from the timer: L2 2.9, L5 5.6, Rampart 7.2.
- Hit triggers add up to 14 DPS at L5 and 18 with Rampart.
- **Asset:** a VFX ring only. When the shield is modeled, this becomes a
  shield bash with a short upper-body `Brace` clip. No core ability depends on
  the shield.

---

## Drifter — pistols

Fast and fragile. Damage depends on staying in motion, and Drifter is the
class built to kill elites and bosses. All four authored fire patterns have a
job:

| Fire pattern | Used by |
| --- | --- |
| Single | Twin Pistols L1 |
| Dual alternating | Twin Pistols L2+ |
| Three-round burst | Deadeye |
| Volley | Hammerfan |

### Trait — Drift

- Moving (input magnitude > 0.5) fills Drift from 0 to 1 over **1.2 s**.
- Standing still drains it over **0.6 s**.
- Drifter class weapons recharge up to **20% faster**:
  `cooldown × (1 − 0.2·drift)`.
- Shown as the poncho trail and a thin HUD arc.

### Twin Pistols — starter (pair Overclock → Hailfire)

Twin Pistols are the Drifter’s proposed starting weapon.

- Each shot targets the nearest enemy within 4.2.
- Bolt speed 3.4, lifetime 1.2 s (range ≈4.1), knockback 0.3.
- At L2 the model switches from `drifter-single-gun.glb` to
  `drifter-dual-gun.glb`, and shots alternate hands, offset by half the
  interval.

| Lv | Card | Pistols | Interval per pistol | Damage | Pierce | DPS* |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Fires at the nearest enemy. | 1 | 0.70 s | 8 | 0 | 11.4 |
| 2 | Draws a second pistol. | 2 | 0.70 s | 8 | 0 | 22.9 |
| 3 | +30% damage. Shots pierce 1 enemy. | 2 | 0.70 s | 10.4 | 1 | 29.7 |
| 4 | Each pistol picks its own target. Fires 15% faster. | 2 | 0.61 s | 10.4 | 1 | 34.1 |
| 5 | +30% damage. Pierces 1 more. | 2 | 0.61 s | 12.8 | 2 | 42.0 |
| **Hailfire** | Both pistols pour out shots that ricochet between enemies. | 2 | 0.30 s | 14 | 1 + 2 ricochets | 93 |

\*DPS assumes no Drift; full Drift multiplies it by 1.25.

- A ricochet jumps to the nearest enemy within 1.4 that the shot has not hit,
  at 80% damage.
- For comparison, the Bolt Caster reaches 58 DPS at L5 and Railstorm about 141.
- **Clips:** `*SingleGun` and `*DualGun` Idle/Walk/Run/Attack, plus walk-fire
  and run-fire. These already exist.

### Deadeye — class technique (pair FORCE → Kill Order)

- Fires a three-round burst at the **toughest visible enemy**: highest current
  HP within `VIEW`.
- Rounds have speed 7, lifetime 0.6 s and pierce every enemy.
- A hit **marks** the target. Marked enemies take extra damage from every
  source, including Core tech.
- Fire events follow `AttackSingleGunBurst`: frames 6, 11 and 16, so the
  rounds leave at 0.25, 0.458 and 0.667 s.

| Lv | Card | Damage per round | Cooldown | Mark |
| --- | --- | --- | --- | --- |
| 1 | Fires a burst at the toughest enemy in view. Hits mark it to take +20% damage. | 18 | 4.0 s | +20%, 4 s |
| 2 | +30% damage. | 23.4 | 4.0 s | +20% |
| 3 | A Deadeye kill refunds half the cooldown. | 23.4 | 4.0 s | +20% |
| 4 | Marked enemies take +30% damage. | 23.4 | 4.0 s | +30% |
| 5 | Fires more often. | 23.4 | 2.8 s | +30% |
| **Kill Order** | Every round crits. Marks last until the target falls. | 46.8 (crit) | 2.8 s | +30%, permanent |

- Direct DPS: L1 13.5, L5 25.1, Kill Order 50.
- The mark multiplies the whole build's damage against bosses.
- **Asset:** the burst clip is standing only. It needs an upper-body mask, or
  a walk/run burst variant, so it can fire mid-stride.

### Hammerfan — class technique (pair Thrusters → Vanishing Act)

- A point-blank escape. It triggers when **≥3 enemies are within 0.9**, or any
  enemy is within 0.5, and the weapon is ready.
- Fires a radial fan from both pistols, using the `AttackDualGunVolley` event
  at frame 6 (0.25 s).
- Bolts have speed 3 and lifetime 0.55 s (range ≈1.65).

| Lv | Card | Bolts | Damage | Pierce | Knockback | Cooldown |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | When enemies crowd you, fan both pistols in a full circle. | 8 | 10 | 0 | 0.9 | 5 s |
| 2 | +4 bolts. | 12 | 10 | 0 | 0.9 | 5 s |
| 3 | +40% damage. Bolts pierce 1 enemy. | 12 | 14 | 1 | 0.9 | 5 s |
| 4 | Throws enemies twice as far. | 12 | 14 | 1 | 1.8 | 5 s |
| 5 | Recovers faster. | 12 | 14 | 1 | 1.8 | 3.5 s |
| **Vanishing Act** | Every fan also blurs you: brief invulnerability and a burst of speed. | 16 | 16 | 1 | 1.8 | 3.5 s |

- Vanishing Act grants **0.8 s invulnerability** and **+40% speed for 1.5 s**.
  That is up to 23% invulnerability uptime in a crowd. Watch this in
  simulation.
- **Asset:** the volley clip is standing only. It needs a mask or a moving
  variant.

---

## Channeler — staff

The controller. Channeler hits are slow and heavy, rewards planting, and can
lock an area down. It is the only class with stun, pull or walls.

### Trait — Focus

- Standing still (input magnitude < 0.1, not being shoved) fills Focus from 0
  to 1 over **1.0 s**.
- Moving drains it over **1.5 s**, so short repositioning keeps most of it.
- Channeler class weapons gain up to **+25% area**: `area × (1 + 0.25·focus)`.
- Shown as hovering sigils that orbit faster and brighter. These are the
  concept's "floating sigils".

### Staff animation priority

The staff is one arm with three long one-shot clips: Bolt 1.33 s, Slam 1.83 s
and Skyfall 3 s.

- The sim stays timer-driven.
- Presentation plays the highest-priority clip: **Skyfall > Groundbreak >
  Prism Bolt**.
- A cast that cannot get the arm fires its effect as VFX from `staff.tip` or
  `staff.base` without playing its clip.
- Drifter uses the same rule: **Hammerfan > Deadeye > Twin Pistols**.

### Prism Bolt — starter (pair Amplifier → Refraction)

- Windup 0.5 s (`FireCharge` at frame 12 of `AttackStaffBolt`).
- The orb travels at speed 2.2 for 1.6 s (range ≈3.5) toward the nearest
  enemy.
- It bursts on the first hit, or at the end of its lifetime. The burst damages
  every enemy inside its radius and slows them using the existing
  `enemy.slow` / `slowTime`.

| Lv | Card | Damage | Burst radius | Slow | Cooldown | Extra |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Hurls a prism that bursts on impact and slows. | 18 | 0.30 | 30%, 1.2 s | 1.5 s | — |
| 2 | Bursts scatter three shards at nearby enemies. | 18 | 0.30 | 30% | 1.5 s | 3 shards × 6, seek within 0.8 |
| 3 | +40% damage. | 25.2 | 0.30 | 30% | 1.5 s | shards |
| 4 | +30% burst size and a stronger slow. | 25.2 | 0.39 | 45% | 1.5 s | shards |
| 5 | Hurls prisms faster. | 25.2 | 0.39 | 45% | 1.1 s | shards |
| **Refraction** | Prisms pass through enemies, bursting on each of the first three. | 28 | 0.42 | 45% | 1.1 s | 3 shards per burst |

- DPS per enemy in a burst: L1 12, L5 22.9, plus about 16 spread across the
  shards.
- **Asset:** `AttackStaffBolt` is a standing full-body clip. Drifter and
  Channeler have no `upper_body_bones` mask yet, so moving casts need one, or
  walk/run cast variants.

### Groundbreak — class technique (evolution Sanctum, pair TBD)

- Windup 0.667 s (`GroundImpact` at frame 16 of `AttackStaffSlam`).
- A ring around you deals damage, knockback 1.2 and a **stun**.
- Stun stops an enemy's movement and attack timers.
  - Elites are stunned for half the duration.
  - Bosses are immune, as they already are to knockback.
  - A committed attack, such as a Volt leap or a Bulwark drive, finishes
    before the stun applies, so no enemy freezes in mid-air.

| Lv | Card | Radius | Damage | Stun | Cooldown |
| --- | --- | --- | --- | --- | --- |
| 1 | Slams the staff down: a shockwave that stuns and throws back nearby enemies. | 0.9 | 22 | 0.6 s | 5 s |
| 2 | +25% radius. | 1.125 | 22 | 0.6 s | 5 s |
| 3 | An aftershock follows, half again as wide. | + aftershock 1.69 after 0.5 s, 50% damage, no stun | 22 | 0.6 s | 5 s |
| 4 | +40% damage. Stuns last longer. | 1.125 | 30.8 | 0.9 s | 5 s |
| 5 | Slams more often. | 1.125 | 30.8 | 0.9 s | 3.5 s |
| **Sanctum** | Each slam raises a prism wall that enemies and their bolts cannot cross. | wall at 1.2 for 2.5 s | 30.8 | 0.9 s | 3.5 s |

- Sanctum's wall stays where the slam happened; it does not follow you.
- It blocks non-boss movement and deletes hostile bolts.
- A boss walks through and shatters it.
- Area DPS: L1 4.4, L5 13.2.
- Stun uptime at L5 is about 26% on enemies within reach.
- **Risk:** Sanctum is the riskiest balance item. A wall with 71% uptime plus
  Focus could make standing still too safe. Tune the wall lifetime first.

### Skyfall — class technique (pair Tractor Beam → Singularity)

Skyfall would share Tractor Beam with Sector Charge.

- The cast plays `AttackStaffSkyfall` on the upper body at 1.5×, so the
  release (frame 46) lands at 1.28 s. The player is not rooted.
- At release it picks targets: the densest clusters first, then random visible
  enemies.
- Lances land **0.4 s** later on ground markers.

| Lv | Card | Lances | Damage | Radius | Cooldown | Extra |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Calls prism lances down on enemies across the view. | 4 | 50 | 0.45 | 11 s | — |
| 2 | +2 lances. | 6 | 50 | 0.45 | 11 s | — |
| 3 | Lances leave a slowing field. | 6 | 50 | 0.45 | 11 s | 40% slow, 2.5 s |
| 4 | +40% damage and wider lances. | 6 | 70 | 0.56 | 11 s | field |
| 5 | +2 lances. Called more often. | 8 | 70 | 0.56 | 8 s | field |
| **Singularity** | Lances drag enemies into the impact, and gems they pull fly to you. | 8 | 80 | 0.6 | 8 s | 1.0 pull for 0.4 s |

- Total DPS: L1 18, L5 70, Singularity 80. For comparison, Orbital Strike at
  L5 deals 84.
- **Asset:** the clip is full-body, so it needs an upper-body mask. Without
  one, the cast would have to root the player (see decision 6).

---

## Masteries (optional layer)

Masteries can be cut without affecting the kits above.

- **When:** three times per run, a level-up offers **two mastery cards**
  instead of the normal three. Aim for about **1:45, 4:00 and 6:30**, then read
  the matching player levels from the sim's natural runs.
- **Alternative:** award masteries from the Warden's large Supply Drop
  (3:03, 5:39, 7:41) so each one is earned by a boss kill.
- **Structure:**
  - Tier I shapes how you play the trait.
  - Tier II is a choice between offense or utility and defense.
  - Tier III offers either "the trait now powers every weapon", which is where
    classes overlap through the shared Core tech, or a signature capstone.

| Tier | Vanguard | Drifter | Channeler |
| --- | --- | --- | --- |
| I-a | **Shieldwall** — +4 Aegis segments (9), and recharging starts 1 s sooner. | **Light Feet** — Drift fills in 0.4 s, lingers 1 s after stopping, +8% speed. | **Deep Focus** — Focus fills in 0.5 s and lingers 1.5 s after moving. |
| I-b | **Duelist** — Arc Blade cuts that strike exactly one enemy deal +60%. | **Hollow Points** — Drifter shots pierce 1 more enemy. | **Undertow** — Channeler slows are 15 points stronger, and slowed enemies take +15% damage. |
| II-a | **Blade Ward** — two spectral blades orbit at 0.38 and destroy hostile bolts they touch. 8 damage per touch, at most once per 0.4 s per enemy. | **Ricochet** — pistol shots bounce once to an enemy within 1.2 for 60% damage (Hailfire: one extra bounce). | **Ward Sigil** — while Focused, enemies within 0.8 are slowed 35% and deal 40% less contact damage. |
| II-b | **Last Stand** — once per 60 s, a hit that would take you below 25% leaves you at 25%, refills Aegis and grants 2 s invulnerability. | **Afterimage** — invulnerability after a hit lasts 1.2 s instead of 0.6 s, with +50% speed during it. | **Conductor** — stunned enemies take +40% damage; stuns last 30% longer. |
| III-a | **Juggernaut** — while Aegis holds at least half its segments, every weapon deals +25% damage and the Bulwark shove can't move you. | **Overdrive** — Drift's fire-rate bonus applies to every weapon, including Core tech. | **Resonant Core** — Focus's area bonus applies to every weapon, and Core tech hits slow 20%. |
| III-b | **Endless Arc** — every 4th Arc Blade swing is a full-circle cut (after Eclipse: every 4th Eclipse has 1.5× radius). | **Dead Man's Hand** — +10% crit chance; Drifter crits deal 3× instead of 2×. | **Starcaller** — every 5th Prism Bolt also drops a Skyfall lance on its target, even without Skyfall. |

Blade Ward is the concept sheet's orbiting blades, kept as a mastery so
Vanguard's weapon count stays at three.

---

## Content entries

New `WeaponId` values: `crescent`, `rebuke`, `pistols`, `deadeye`,
`hammerfan`, `prism`, `groundbreak`, `skyfall`. `bolts` is removed. `aegis`
joins the `SystemId` set as the Vanguard's branch; each hero's `systems` list
says what it can be offered, and the other classes keep the shared set.

| Id | Name | Class | Pair | Evolution | `evolutionDetail` |
| --- | --- | --- | --- | --- | --- |
| `blade` | Arc Blade | Vanguard | `force` | Eclipse | *(unchanged)* |
| `crescent` | Crescent Wave | Vanguard | `amplifier` | Meridian | Every cut releases a wide crescent that crosses the whole view. |
| `rebuke` | Rebuke | Vanguard | `aegis` | Rampart | A wide ring that erases hostile bolts and restores Aegis. |
| `pistols` | Twin Pistols | Drifter | `overclock` | Hailfire | Both pistols pour out shots that ricochet between enemies. |
| `deadeye` | Deadeye | Drifter | `force` | Kill Order | Every round crits, and marks last until the target falls. |
| `hammerfan` | Hammerfan | Drifter | `thrusters` | Vanishing Act | Every fan also grants brief invulnerability and a burst of speed. |
| `prism` | Prism Bolt | Channeler | `amplifier` | Refraction | Prisms pass through enemies, bursting on each of the first three. |
| `groundbreak` | Groundbreak | Channeler | TBD | Sanctum | Each slam raises a prism wall that enemies and their bolts cannot cross. |
| `skyfall` | Skyfall | Channeler | `tractor` | Singularity | Lances drag enemies into the impact, and the gems they pull fly to you. |

### Which multipliers apply

Crit (6%, 2×) and might (FORCE, Calibrate) apply to every weapon. In the
current sim, Overclock skips Stake Pulse and Orbit Shards; the class weapons
all take it.

| Weapon | Area (Amplifier) scales | Overclock | Class trait |
| --- | --- | --- | --- |
| Crescent Wave | width | cooldown | — |
| Rebuke | radius | timer and hit ICD | — |
| Twin Pistols | — | interval | Drift |
| Deadeye | — | cooldown | Drift |
| Hammerfan | — | cooldown | Drift |
| Prism Bolt | burst radius, shard seek | cooldown | Focus (area) |
| Groundbreak | ring, aftershock, wall | cooldown | Focus (area) |
| Skyfall | lance, field and pull radius | cooldown | Focus (area) |

Drift and Overclock multiply. Hailfire at full Drift with Overclock 5 fires
every 0.3 × 0.8 × 0.6 = 0.144 s per pistol, about 194 DPS. Railstorm with
Overclock 5 reaches about 235, so this is in band, but it is the Drifter
ceiling to check.

**Offer weights (optional):** new-weapon offers weighted 1.2 for class
weapons and 0.8 for shared Core tech, so each class reliably finds its
identity. The current weight is 0.9 for every weapon.

---

## Getting ready to simulate

### New simulation primitives

Costs are relative to the current `sim.ts`.

| Primitive | Needed by | Cost |
| --- | --- | --- |
| Class id in `createRun`: base stats, trait, starter, offer pool | all | low; the starter hook exists |
| Movement-state meter from input magnitude | Drift, Focus | low |
| Aegis gauge in the damage path, before armor: segments, heavy-hit cost, recharge delay, break | Aegis, Shieldwall, Rebuke L4, Rampart, Juggernaut, Last Stand | low |
| On-hit / on-block trigger hook | Rebuke | low |
| Ride-another-weapon trigger (fire on next cut) | Crescent Wave | low |
| Travelling arc projectile, hits each enemy once | Crescent Wave, Meridian | medium |
| Impact splash + slow on a player projectile | Prism Bolt (slow already exists) | low |
| "Toughest visible enemy" targeting | Deadeye | low |
| Swept-segment hit test for fast projectiles | Deadeye (speed 7 moves 0.233 per tick, more than a Skitter's 0.14 hit radius) | low |
| Vulnerability mark, read in `damage()` | Deadeye, Undertow, Conductor | low |
| Ricochet / bounce | Hailfire, Ricochet | medium |
| Crowd-count trigger | Hammerfan | low |
| Player invulnerability and speed buffs | Vanishing Act, Afterimage, Last Stand | low |
| Hostile-bolt deletion by an area | Blade Ward, Rampart, Sanctum | low |
| Stun status (bosses immune, elites half) | Groundbreak, Conductor | medium; must pause attack timers safely mid-windup |
| Delayed secondary ring | Groundbreak L3 | low |
| Lingering slow field (charge-zone clone) | Skyfall L3+ | low |
| Cluster targeting | Skyfall | low; random visible enemies for v1 |
| Radial pull | Singularity | medium |
| Movement-blocking radial wall | Sanctum | **high**; v1 fallback: blocks bolts only |
| Windups from clip events | Prism 0.5, Groundbreak 0.667, Skyfall 1.28, Deadeye 0.25/0.458/0.667, Hammerfan 0.25 | low |

**Hardcodes to unpick:**

- The `Weapon` interface carries blade- and shard-specific fields.
- `damageBy` / `tossOrigin` special-case `'blade'` and `'bolts'`.
- Bolt hits are tagged `'bolts'` and zone ticks `'charge'`.
- `PAIRED_WEAPON` maps each system to one weapon. It must become
  one-to-many: Amplifier pairs with strike, crescent and prism. Tractor Beam pairs
  with charge and the proposed skyfall. Aegis pairs with rebuke, FORCE with
  blade and deadeye, and Thrusters with shards and hammerfan.
- These are keyed by weapon id: `WEAPON_UPDATES`, `SurvivorsIcon`,
  `describeOffer`, and the balance bot and builds.

**Suggested build order:**

1. **Vanguard first.** The Arc Blade already exists; it adds Aegis, Rebuke and
   Crescent Wave.
2. **Drifter.** Bolt Caster becomes Twin Pistols; it adds the mark, ricochet
   and Drift.
3. **Channeler.** It has the most new mechanics: stun, pull and wall.

### Bot policies (do this before the first comparison run)

The current pilot kites and sidesteps, and `offerScore` prioritizes `aegis`
and `nanorepair`. Without class policies, a simulation will "prove" that
Vanguard and Channeler are weak.

- **Vanguard — engage.** While Aegis holds at least half its segments, close to
  0.6–0.9 from the densest nearby cluster. Below that, kite until it refills;
  recharging needs 3 s without a hit.
- **Drifter — kite.** Use the current policy. Keep moving and hold a 1.5–3
  gap.
- **Channeler — anchor.** Stand still when no telegraph, contact threat or
  hostile bolt lane is within about 0.8. Relocate when the crowd closes.
- **Class-aware `offerScore`:** value class weapons and their pairs, and score
  defensive picks per class.
- **Masteries:** besides the greedy policy, run forced "always a" and "always
  b" sweeps per tier so each option is measured.

### Builds (literal ids, same size as the existing `mid`)

The existing `mid` is 22 levels plus 2 evolutions. Each build below matches
that.

| Build | Weapons | Systems | Evolutions |
| --- | --- | --- | --- |
| `trooper-baseline` (today's player: 100 HP, speed 1, no trait) | blade 5, strike 5, pulse 3 | force 3, amplifier 2, tractor 2, nanorepair 2 | Eclipse, Chain Barrage |
| `vanguard-mid` (same build plus Aegis rank 3; `kit` and `max` take rank 5) | blade 5, strike 5, pulse 3 | force 3, amplifier 2, tractor 2, nanorepair 2, aegis 3 | Eclipse, Chain Barrage |
| `vanguard-kit` | blade 5, rebuke 5, crescent 3 | force 3, aegis 5, amplifier 2, nanorepair 2, tractor 2 | Eclipse, Rampart |
| `drifter-mid` | pistols 5, deadeye 5, pulse 3 | overclock 3, force 2, tractor 2, nanorepair 2 | Hailfire, Kill Order |
| `channeler-mid` | prism 5, groundbreak 5, skyfall 3 | amplifier 3, TBD 2, nanorepair 2, tractor 2 | Refraction, Sanctum |

A per-class `max` build is every reachable weapon and system at level 5,
evolved. It has six weapon slots. Variants can sample different six-weapon loadouts.

### Parity targets

Every class must pass the `balance/targets.ts` bands for ten-minute runs:

| Band | Target | Before (15–18 minute runs) |
| --- | --- | --- |
| Early (120 s) | 90% | 180 s |
| Mid safe (minute 5) | 95% | minute 8 |
| Mid median | 540–660 s (9–11 min) | 840–1080 s |
| Max median | 600–780 s (10–13 min) | 960–1320 s |
| Mid losing by | minute 10 | minute 15 |
| Max losing by | minute 12 | minute 18 |

Additional cross-class targets:

- Greedy / natural median fall time within **±10%** of Vanguard.
- `*-mid` medians within **±10%**; `max` within **±15%**.
- First Warden (≈2430 HP at 3:03): kill time within **±25%** of Vanguard at
  `mid`.
- No class weapon above **45% damage share** at `max`, so a class is not just
  its starter.
- Each mastery pair: neither option picked by the scorer more than 70% of the
  time, and no more than a **10% survival difference** between the two.

### Additional metrics to report

- Aegis: hits absorbed per minute, share of incoming hits absorbed, breaks
  per minute. Drift and Focus uptime.
- Stun uptime on elites; mark uptime on bosses.
- Captain and Warden time-to-kill.
- Damage taken by source.
- Survival by mastery option.
- Hostile bolts deleted.

### First knobs to sweep

| Class | Knobs |
| --- | --- |
| Vanguard | Aegis segments 3–8; recharge delay 2–4 s; recharge rate 1.5–3/s; heavy-hit cost 1–3; base integrity 90–110; Rebuke timer |
| Drifter | Base HP 80–95; Drift bonus 15–30%; Hammerfan trigger count/cooldown; Vanishing Act invulnerability 0.5–0.8 s |
| Channeler | Focus fill/drain; Groundbreak stun 0.5–0.9 s; Sanctum wall lifetime 1.5–2.5 s; Skyfall cooldown |

## Vanguard — implementation status

**Built in the sim and game:**

- Hero ids: `vanguard` and `trooper` (the pre-class player, kept as the
  balance baseline).
- Aegis (`survivors/aegis.ts`), Crescent Wave and Rebuke with Meridian and
  Rampart.
- The per-hero offer pool and the one-to-many evolution pairing
  (`pairedWeapons`).
- HUD gauge, crescent and shockwave effects, the shield shell, offer cards
  and icons.
- The Vanguard model as the player (`utils/vanguardAnimation.ts`,
  `components/3d/SurvivorVanguard.tsx`). It has Idle/Walk/Run blended by
  speed, sword cuts on the upper body retimed to the sim's hit, ivory
  slashes, and the catalog entry. `&hero=trooper` still shows the Sector
  Trooper.

`/play?survive=1` plays the Vanguard. Add `&hero=trooper` for the old player.

**Not yet built:**

- Masteries.
- Its Defeated clip is being authored; until it lands, the Vanguard holds
  its last pose when it falls.
- Dedicated sounds. Blocks, breaks and shockwaves reuse existing cues.
- A class-aware bot offer scorer. Greedy picks still score every new weapon
  the same, though Crescent Wave and Rebuke get picked anyway.

**Simulate:**

```bash
pnpm sim:balance --heroes trooper,vanguard --builds natural,mid,kit
pnpm sim:balance --heroes vanguard --builds mid --aegis segments=6/growth=0.08
pnpm sim:balance --heroes vanguard --stance kite
pnpm sim:balance --heroes trooper --pace 1.4/1.5 --levels 1.5/2
```

- `--aegis` tries Aegis settings without editing code. Its keys are
  `segments`, `heavyCost`, `rechargeDelay`, `brokenDelay`, `rechargeRate` and
  `growth`. `/` separates variants, and each variant is reported separately.
- The shielded bot engages by default; `--stance kite` measures the shield
  alone.
- `--pace` and `--levels` try other `PACE` and `LEVEL_PACE` values and
  combine with `--aegis`. Runs now default to a 15-minute cap.

**First result, v0 settings, before ten-minute runs** (16 seeds, 25-minute
cap, greedy picks, original pacing):

| Build | Median fall | Last the cap | Aegis share of incoming damage |
| --- | --- | --- | --- |
| trooper mid | 14:20 | 0% | — |
| vanguard natural | 25:00 | 56% | 87% |
| vanguard mid | 25:00 | 69% | 85% |
| vanguard kit | 25:00 | 69% | 94% |

At v0 the 10-hit gauge is far too strong. It takes almost every hit through
minute 14, and the Vanguard `mid` build misses both targets that should end a
run: the median fall time, and losing health on balance by minute 15. The
cause is the scaling note under Aegis: a segment absorbs a whole hit while
enemy damage grows every minute.

**Aegis sweep, before ten-minute runs** (`vanguard mid`, same 16 seeds):

| Variant | Median fall | Last the cap | Aegis share | Breaks/min |
| --- | --- | --- | --- | --- |
| v0 | 25:00 | 69% | 85% | 1.4 |
| `segments=6` | 25:00 | 63% | 80% | 3.0 |
| `rechargeDelay=5,rechargeRate=1` | 25:00 | 56% | 78% | 2.2 |
| `growth=0.08` | **15:40** | 0% | 59% | 9.5 |
| `segments=6,growth=0.08` | 15:40 | 0% | 54% | 10.8 |

- Fewer segments or a slower refill barely matter. Making each hit cost more
  as enemy damage grows does.
- `growth=0.08` keeps the 10-hit feel at the start: about 6.4 hits at minute
  7 and 4.5 at minute 15. It lands 9% above the trooper's 14:20, inside the
  ±10% parity target and the 14:00–18:00 band.
- It misses "losing health by minute 15" by a hair: at minute 15, 255
  taken against 258 healed with 63% still standing. Integrity barely moves
  until the shield stops keeping up, then drops fast (72 → 255 → 355 a
  minute), so the end comes as a cliff rather than a slow bleed. A target
  that reads health per minute may need an Aegis-aware definition.
- It is the candidate for v0.1. It is not applied yet.

**Stance control** (`--stance kite`, same seeds): v0 still outlasts the cap
in 63% of runs, so the strength is the shield, not the bot walking into
contact. `growth=0.08` falls at 15:15 when kiting and passes all three
`mid` targets.

**Ten-minute runs, first tuning** (`PACE` 1.4 with the old XP curve sped up
1.5×, 16 seeds, 15-minute cap). Superseded by the slower XP curve below:

| Build | Median fall | Last the cap | Aegis share |
| --- | --- | --- | --- |
| trooper natural | 3:45 | 0% | — |
| trooper mid | **10:02** | 0% | — |
| trooper max | **11:32** | 0% | — |
| vanguard mid, v0 | 15:00 | 63% | 84% |
| vanguard max, v0 | 15:00 | 100% | 100% |
| vanguard mid, `growth=0.08` | 12:25 | 13% | 58% |
| vanguard max, `growth=0.08` | 14:14 | 13% | 78% |

- The trooper passes all six ten-minute targets, so the pacing itself is set.
- The natural bot falls early at every pace (3:45 here, 4:56 before
  compression); it is weaker at dodging than a player.
- At this pace `growth=0.08` is no longer enough for the Vanguard: its mid
  build is 24% above the trooper's, against 9% before.

**Aegis at ten-minute pacing, first tuning** (Vanguard, same seeds; these
numbers need a re-run on the slower XP curve; the trooper's mid
falls at 10:02 and max at 11:32):

| Aegis setting | Mid | Max | Natural |
| --- | --- | --- | --- |
| `growth=0.12` | 11:40 | 14:21 | — |
| `growth=0.16` | 12:34 | 14:23 | — |
| `growth=0.08,segments=7` | 11:34 | 13:47 | — |
| `spill=1` | 15:00 (63% last the cap) | 15:00 (100%) | 8:19 |
| **`growth=0.08,spill=1`** | **10:58** | **13:14** | 7:50 |
| `growth=0.12,spill=1` | 11:05 | 12:53 | 8:59 |

- Raising `growth` alone stops helping past 0.12. A hit that costs more
  than the segments left is still absorbed whole, so every refill blocks
  one full late-game hit however big.
- `spill=1` lets the uncovered share of that hit through to integrity.
  Together with growth, it brings the Vanguard to parity with the trooper:
  `growth=0.08,spill=1` is 9% above it at `mid` (target ±10%) and 15%
  above at `max` (±15%).
- It keeps the most of the ten-hit feel: 10 hits at the start, about 6 at
  5:00 and 5 at 10:00.
- The natural bot lasts about twice as long as the trooper (7:50 against
  3:45). That suits the most forgiving class, but it is worth watching.
- **Candidate for v0.1:** `growth=0.08, spill=1`. Not yet adopted.

## Asset dependencies

| Ability | Clip | Status |
| --- | --- | --- |
| Arc Blade, Crescent Wave | Vanguard `Attack`, `AttackBackhand`, `RunAttack*` + mask | Exist; retime impact to frame 8 |
| Rebuke, Blade Ward | VFX only | Shield bash later, once the shield is modeled |
| Twin Pistols | Drifter single/dual Idle/Walk/Run/Attack + walk/run fire | Exist; swap GLB at L2 |
| Deadeye | `AttackSingleGunBurst` | Standing only; needs an upper-body mask or moving variant |
| Hammerfan | `AttackDualGunVolley` | Standing only; needs a mask or moving variant |
| Prism Bolt | `AttackStaffBolt` | Standing full-body; needs a mask or walk/run cast |
| Groundbreak | `AttackStaffSlam` | Standing crouch; a masked version may read oddly, so a moving variant may be better |
| Skyfall | `AttackStaffSkyfall` | Full-body 3 s; upper-body mask required (no root) |
| Focus sigils, Drift trail, Aegis gauge and shell | VFX/HUD | New |

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-04 | v0 ground settings agreed. |
| 2026-10-04 | Aegis changed from a single guard on a 10 s recharge to a 10-segment shield gauge: 1 segment per hit (3 for heavy attacks), recharge after 3 s unhit at 2 segments/s, 5 s delay after a break. Because the shield is now much stronger, Vanguard keeps 100 integrity and speed 1.0 (was 110 and 0.95). Rebuke L4, Rampart, Shieldwall, Juggernaut, Last Stand and the engage bot policy now refer to segments. |
| 2026-10-04 | Vanguard built in the sim and game with the v0 settings. First simulation: v0 Aegis is far too strong (`vanguard mid` outlasts the 25-minute cap in 69% of runs; trooper falls at 14:20). A sweep points to `growth=0.08`, which makes hit cost track enemy damage (median 15:40). Not yet adopted. |
| 2026-10-04 | Runs now target about ten minutes, still endless. `PACE` 1.4 runs the Legion's clock (spawns, health, damage, speed, unlocks, event script) 1.4× faster, and `LEVEL_PACE` 1.5 brings levels 1.5× sooner. Targets moved to: mid falls 9–11 min, max 10–13. The trooper baseline passes all six (mid 10:02, max 11:32). Added the `spill` Aegis knob (default 0). At this pace `growth=0.08,spill=1` gives Vanguard parity (mid 10:58, max 13:14); not yet adopted. |
| 2026-10-04 | Upgrades came too fast: a strong run was maxed by about 4:30. The XP curve is now `6 + 1.6 × level²` (`XP_CURVE`, replacing the old curve sped up 1.5×). A strong run reaches level 21 at 5:00 and 35 at 10:00, down from 48.5 and 87; a weak one 7.5 and 12, down from 14.5 and 34. `PACE` re-tuned to 1.15 to keep ten-minute runs: trooper mid falls at 10:03, max at 12:31. The Vanguard Aegis numbers above predate this and need a re-run. |
| 2026-10-05 | Arc Blade: removed the level-2 backhand follow-up cut; every swing is one cut. The arc now widens 30° a level to 180° at level 4, which also swings faster (1.1 s); level 5 is +30% damage and a 0.9 s swing. Eclipse unchanged. |
| 2026-10-05 | Seekers: aim lines on the ground are back (the other enemies' warnings stay off). Each Seeker pack wave adds a lane, from 3 up to 8, and lanes past four cross the first axis. |
| 2026-10-05 | Vanguard starts at a Skitter's speed, 0.77 (was 1); Thrusters still add 10% a level, and Skitters still speed up with the Legion clock. Aegis cut to 5 segments (was 10); heavy hits still cost 3. The engage bot now closes in while at least half the gauge holds (was 5 segments). Simulation at `PACE` 1.15 with the new XP curve: `vanguard natural` falls at 4:22, but `mid` outlasts the 15-minute cap in 63% of runs and `max` in all of them (trooper: 4:21, 9:59, 12:25). A hit still costs one segment whatever it deals, so the shield still scales too well; the earlier `growth=0.08,spill=1` result was measured at 10 segments and needs a fresh sweep. |
| 2026-10-05 | Seeker packs: eight Seekers a pack (was five), the extra three at the back of the file (`SEEKER_PACK`). Pack Seekers are now solid, the first enemy that is: the player can't walk through a waiting column, and a charging one shoves the player across its lane to the side they're on rather than passing through or carrying them. A shielded Vanguard can no longer spend a segment to cut through a pack. Trooper baseline: natural 4:22, mid 10:06, max 12:33 (was 4:21, 9:59, 12:25); the max build now only breaks even at minute 12, so its "losing by 12" target misses. |
| 2026-10-31 | Fewer Skitters early: their share of trickle spawns starts at 0.15 (was 0.5) at Legion minute 0.75 and climbs to 0.5 by minute 3, so they are about 13% of spawns at first instead of a third; Mites fill the gap. The 0:40 Skitter swarm sends 12 (was 20). In a 24-seed sim the natural Vanguard median fall moved 4:01 → 2:56 and the mid build 12:26 → 11:31, both within the run-to-run noise of about a minute. |
| 2026-10-28 | The Aegis shell no longer turns with the player's heading: it stays square to the screen and tumbles slowly (0.4 rad/s) about an axis that wanders, from a random start. Visual only. |
| 2026-10-28 | Aegis is now a branch, not a trait: the Vanguard spawns without a shield and is offered `aegis` as a system, five ranks costing a pick each and one of the six system slots. Rank 1 is a 2-segment gauge with 4 s / 6 s delays, rank 2 and 4 add a segment, rank 3 brings the delays to 3 s / 5 s, and rank 5 adds the fifth segment, so a full branch equals the old trait. A raised rank's new segment comes full; a new gauge still starts empty. Offer cards show each rank's text. The bot scores the branch above new weapons (22 − rank) so the engage stance has something to engage with; `mid` builds hand rank 3, `kit` and `max` rank 5. Rebuke's level-4 restore and Rampart still only act on a raised gauge. The earlier sweeps today predate this. |
| 2026-10-28 | Aegis starts empty instead of full: the gauge charges in after the usual 3 s delay, so the first segment holds at about 3.5 s and the gauge is full near 5.5 s, and the shell is not drawn until then. The HUD reads `0/5` while it charges and keeps `BROKEN` for an actual break. The engage bot kites until half the gauge holds, so it hangs back for the first few seconds of a run. |
| 2026-10-20 | Every living enemy is now solid, not just pack Seekers: the player can't walk through one, and one that walks into the player pushes them back. Defeated remains, enemies still breaching and Volt Mites in the air don't block. The contact-damage rules are unchanged, but a blocked player stays in contact, so they take hits for longer. A Bulwark line now carries a player who stands in its path ahead of it (about 4.8 units, until the line expires) unless they get around it or cut through; standing still in front of one now costs 250 integrity, was 60; and walking straight out of the Encircle ring is blocked in most directions (12 of 16 just after it spawns, fewer as it crowds in). Simulation (24 seeds, `PACE` 1.15): trooper natural 4:13, mid 10:04, max 12:31 (was 4:21, 10:06, 12:33). The wading Vanguard is pinned in crowds and takes more hits: natural 3:08 (was 4:12), mid median 13:03 with 38% outlasting the 15-minute cap (was 79%), max still lasts the cap in every run. Vanguard targets still miss. |
| 2026-11-20 | Removed Plating. Aegis unlocks Rampart for Rebuke, and Tractor Beam unlocks Meltdown for Sector Charge. Earlier balance results used the former upgrade pool. |
| 2026-11-20 | Restored the off-hand Bolt Caster to the Vanguard’s upgrade pool. Overclock evolves it into Railstorm. |
