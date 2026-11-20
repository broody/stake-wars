# Vanguard actions dashboard

An unlisted page for refining the player's animation. It plays every action
the Vanguard takes, each as a short scripted run of the game's own
simulation, drawn by the game's own Vanguard animation, slash and effect
renderers. What it shows is what a run shows.

```bash
pnpm dev:web
```

Then visit `http://localhost:3000/play/actions`. Add `?action=<id>` to open
one action, such as `?action=run-backhand`.

## Actions

| Group        | Actions                                                                     |
| ------------ | --------------------------------------------------------------------------- |
| Locomotion   | Idle, Walk (a light joystick push at the Walk clip's authored speed), Run, Running reversal   |
| Arc Blade    | Forehand, Backhand, Running forehand, Running backhand, Cut behind, Eclipse |
| Vanguard kit | Crescent Wave, Rebuke, Aegis (a hit, a heavy hit, then a break)             |
| Core weapons | Orbit Shards, Shard Halo, Sector Charge, Meltdown, Stake Pulse, Bastion, Orbital Strike, Chain Barrage |
| Loadouts | Moving loadout (a figure eight with Aegis, Stake Pulse and Orbit Shards) |
| Reactions    | Hurt (directional running recoil), Defeated                                            |

Defeated blends from the live pose into a three-second fall. The knees land at 0.85 seconds, the body hits the ground at 2.35 seconds, and the final pose holds.

## The inspector

- **Playback.** Play, pause, step one frame (1/60 s in game, 1/24 s for an
  authored clip) and play at 0.1×, 0.25×, 0.5× or 1×. Space plays or pauses;
  the arrow keys step.
- **Timeline.** Drag across it to scrub. The swing row has a tick for every
  authored frame where the game shows it, so the retiming reads directly: the
  wind-up plays at 0.73× and the follow-through at 2× (1.71× running), with
  frame 8 on the sim's hit. Other rows mark the clip's active frames 6–11,
  the ground slash mark, the swing, gunshot and hit sounds, crescents, shockwaves,
  charge flight and ground burns, Aegis blocks and breaks, orbital impacts, chain hops, and directional recoil.
- **Source.** IN GAME is the game's composite: the swing on the upper body
  over the gait, blended in and out, retimed, and the chest turned toward the
  target. AUTHORED CLIP plays the same clip as exported, over the whole body,
  so an authoring problem can be told apart from a retiming one.
- **View.** GAME is the run's follow camera; FRONT, SIDE, BACK and TOP circle
  the Vanguard. Drag to turn, Ctrl or ⌘ with the wheel to zoom, double-click
  to reset.
- **Swing knobs.** Stance (stand, walk, run), where the target stands (left,
  right, ahead, behind) and blade level 1–4 or Eclipse. Ahead and behind lean
  5° right so the cut's side is decided, not left to rounding.
- **Show.** The game's effects, the blade's path through the swing (an orange
  line along the tip over a faint sheet from base to tip), and the target
  Mites.
- **Readouts.** The upper-body clip and frame, its playback speed, the swing's
  blend weight, the torso turn, the legs' clip and the ground speed, read
  from the game's VanguardAnimation each frame.

## How it works

`src/game/actions/actions.ts` scripts each action: it holds the joystick,
places durable, motionless target Mites, arms the blade so one swing opens
0.3 s into the loop, and schedules hits. `driver.ts` advances the run at the
sim's fixed 30 Hz. Showing an earlier moment rebuilds the run from the same
seed and replays it, feeding the animation every quarter tick, so the gait
and the blade path come out as continuous play leaves them. `timeline.ts`
replays each action once to find when its events fire.

The viewer and the game both pose the Vanguard through `survivors/poseVanguard.ts`. `actions.test.ts` checks the scripts, the
retiming inverse, the clip lengths and the swing's blend windows against the
model.
