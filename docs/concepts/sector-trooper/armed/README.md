# Armed idle

The combined character source is `../head/sector-trooper-head.blend`.
It now opens with **Run_Carry_Forward** selected (see below). **Armed_Idle** uses
frames **1–72 at 24 fps**. Press Space
over the viewport to play the subtle three-second breathing loop: about 6 mm
of chest rise with gentle chest rotation and 8 mm of rifle rise and fall.
The feet remain planted and the right wrist continues the forearm naturally. Frame 73
duplicates the starting pose for an eventual seamless animation export.

Idle carries the rifle diagonally across the chest with relaxed elbows and its muzzle
raised 28 degrees toward the character's left. A forward-pointing, shouldered
hold is used by the firing stance.

The editable rifle is appended from `../rifle/sector-trooper-rifle.blend`,
at its full source size (retaining the source's 90% width),
and attached to the `weapon` socket beneath `hand.R`. Both hand grip markers stay aligned through the loop.
The existing simplified fists, character geometry, original bones and six earlier
actions are preserved. The rig has one additional nondeforming weapon socket.
The armed game export below now replaces the game's GLB.

- `armed_idle.py`: create/revise the pose using Blender MCP in the character file.
  Arm placement uses an analytic two-bone solve baked to the existing FK bones.
- `render_armed.py`: render hero and side views in a separate background process.
- `check_armed.py`: compare a temporary before/after file pair, then validate hand
  contacts and the loop seam. The temporary paths are explicit in the script.
- `armed-idle-check.json`: latest validation results.
- `armed-idle.png`, `armed-idle-side.png`: rendered inspection views.

Preview cameras are in `13 | ARMED - rifle and preview`. Earlier unarmed actions
remain available, but do not yet have an authored rifle-carry pose.

## Firing idle

**Idle_Shoot** uses frames **1–24 at 24 fps**, with an identical endpoint at 25.
The left foot is forward and the right foot back, with a deeper knee bend,
33 cm of fore/aft foot stagger, a stronger forward brace and about 47 degrees
of combined pelvis and torso rotation. The full-size rifle
points forward from the shoulder. Two inspection shots per second produce
30 mm of rearward recoil and up to 3.2 degrees of muzzle rise, with a more visible
1.6-degree chest reaction, followed by recovery.
No muzzle flash or projectile effects are included in this authoring preview.

`idle_shoot.py` authors the action using the same two-bone arm solver.
The `weapon` bone allows a different ergonomic wrist orientation in each armed
pose while maintaining rifle alignment. Armed_Idle gains only constant weapon
socket keys; its original body animation curves are unchanged.

`check_shoot.py` is the current combined validation: it compares the original
actions and bones, samples both armed clips every quarter-frame, and checks hand
contacts, right-wrist bend, planted feet and loop seams. Results are in
`idle-shoot-check.json`. `check_armed.py` and its report record the initial carry
validation before the weapon socket was added.

`render_shoot.py` renders `idle-shoot.png` and `idle-shoot-side.png`. The Shooting
Hero/Front/Side cameras are in the same armed collection. The game export
includes the weapon socket and its sampled animation, along with the rifle.

## Walking forward while firing

**Walk_Shoot_Forward** plays frames **1–84 at 24 fps**, with a matching endpoint
at 85. This 3.5-second preview contains three original 28-frame walk strides
and seven recoil cycles, keeping firing cadence independent of footfalls.
It is an in-place animation with an intended forward actor speed of **0.72 m/s**.

The original walk supplies the foot paths, hip movement and belt-plate clearance.
The body sits slightly lower in the approved turned firing brace. The rifle
remains aimed forward, with a small amount of stride bob and the existing
stronger recoil. Both arms are solved to the weapon grips throughout.

`walk_shoot.py` adds the action without editing any earlier clips. It samples at
quarter-frame intervals with linear interpolation to avoid independent curve
overshoot separating the hands and weapon. The game export retains
this sampling density and independently verifies the exported geometry.

`check_walk_shoot.py` validates at eighth-frame intervals, including between
authored samples: original action preservation, foot transforms compared with
Walk, grip contact, wrist alignment, forward aim and the loop seam. Results are
in `walk-shoot-check.json`. `render_walk_shoot.py` creates the hero/side views.

## Strafing while firing

**Strafe_Shoot_Left** and **Strafe_Shoot_Right** each play frames **1–84 at
24 fps**, with a matching endpoint at 85. Each preview combines six original
14-frame hustle cycles with seven recoil cycles. The original sideways speed
is **0.9257 m/s**; character-left is Blender +X and character-right is Blender -X.
These are in-place animations, with the weapon aimed along Blender -Y in both.

The original strafe foot paths, directional hip motion and restrained body lean
are retained under the turned shooting brace. The upper body holds the weapon
steadily instead of swinging the arms. The existing stronger recoil is retained.

`strafe_shoot.py` calls the shared authoring code with `SIDE='Left'` or `'Right'`.
`check_strafe_shoot.py` checks both against their source gaits at eighth-frame
intervals and verifies all prior actions are unchanged. Latest results are in
`strafe-shoot-left-check.json` and `strafe-shoot-right-check.json`.
`render_strafe_shoot.py` renders both sets of inspection views.

## Moving backward while firing

**Backward_Shoot** plays frames **1–48 at 24 fps**, with its matching endpoint at
49. The two-second preview combines three original 16-frame backward hustle
cycles with four recoil cycles. Intended actor speed is **1.08 m/s** along
Blender +Y (glTF -Z), while the rifle continues aiming along Blender -Y.

The original toe-first retreat footwork and hip movement are retained. The
upper body keeps the turned firing posture with a slight backward lean, steady
grips and the approved recoil. Like the other clips, it is animated in place.

`backward_shoot.py` authors the clip through the shared locomotion code.
`check_backward_shoot.py` validates contacts, wrist alignment, forward aim,
foot paths and seams at eighth-frame intervals and confirms earlier actions
were preserved. Results are in `backward-shoot-check.json`.
`render_backward_shoot.py` creates the hero and side inspection images.

## Nonfiring chest-carry movement

The relaxed diagonal hold comes directly from **Armed_Idle**. Its clavicle,
upper-arm, forearm and hand poses are reused in the chest's local frame, while
the torso, hips and feet follow each original movement. The rifle follows the
chest with no recoil and no independent forward aiming. The right wrist stays
straight; both hands maintain the idle's grip throughout.

| Action | Playback at 24 fps | Matching endpoint | Actor speed |
| --- | --- | --- | --- |
| Strafe_Carry_Left | 1–14 | 15 | 0.9257 m/s left |
| Strafe_Carry_Right | 1–14 | 15 | 0.9257 m/s right |
| Backward_Carry | 1–16 | 17 | 1.08 m/s backward |

`carry_locomotion.py` takes `SOURCE='Strafe_Left'`, `'Strafe_Right'` or
`'Backward'`. Each clip is sampled at quarter-frame intervals and retains
the source gait's original pace, torso lean and foot paths.
`check_carry_locomotion.py` validates between authored samples, including exact
foot-path preservation, grip contact, loop seams and the rifle's position
relative to the chest. It also confirms all previous actions are unchanged.
The three reports are named `strafe-carry-left-check.json`,
`strafe-carry-right-check.json` and `backward-carry-check.json`.
`render_carry_locomotion.py` renders all three inspection sets.

## Armed game export

The game uses ten clips: carry and firing for idle, forward, left, right and
backward. `Run_Carry_Forward` adds an 18-frame chest-carry run at 1.76 m/s,
authored with `carry_locomotion.py` using `SOURCE='Run'`. It preserves the
approved run's legs and torso with the idle's chest-relative rifle and arms.
`Walk_Carry_Forward` remains in the Blender source, but the game uses running
for nonfiring forward movement and walking only while firing.

`export_game.py` runs in background Blender against the canonical blend. It
exports the body, rifle and attachment markers, includes the weapon bone, and
samples at 96 fps. Retiming happens only in that temporary process and is never
saved to the editable source. `check_game_export.py` imports the result into an
empty background scene and checks evaluated world geometry at six points in
each action against the source samples captured by the exporter. Results are in
`game-export-check.json`; clip metadata is in `game-export.json`.

The validated `sector-trooper-armed.glb` is copied to
`apps/web/public/models/sector-trooper/sector-trooper.glb`.
Preview `/play?trooper=1`: WASD moves, holding Space fires, and releasing Space
returns to chest carry. Both states share a normalized contact-phase clock. Forward movement slows
from running to walking when firing and accelerates when Space is released;
strafing and backward movement retain their hustle speeds.
The browser smoothly blends state changes, clears input when focus is lost,
and retains the existing camera controls. This is animation playback; projectile
and damage mechanics are not included.
