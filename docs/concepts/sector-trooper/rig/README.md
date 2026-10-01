# Sector Trooper rig

The complete character is rigged in the same authoring file,
`../head/sector-trooper-head.blend`, through Blender Lab MCP. The model retains
all 6,680 triangles, 71 editable mesh pieces and six shared materials. Geometry,
armor wall thickness and existing comparison cameras were preserved.
The gloves were subsequently reshaped into relaxed fists, retaining their
original topology, skin weights and animation keys.

`SectorTrooper_Rig` contains 31 bones: 25 deform bones and six controls,
including the nondeforming `weapon` socket added for the armed poses in `../armed/`.
There are no individual finger bones; each simplified glove moves as a unit.
58 mesh pieces use rigid single-bone weights. The remaining charcoal undersuit
and joint pieces use at most two weights per vertex. Forearm, head, vest, thigh,
shin and boot armor stay rigid. Shoulder pads and knee guards follow joint
rotation through dedicated armor bones.

## Posing in Blender

The file opens with **Backward** selected and a 1–16 frame playback range.
Press Space over the viewport to play or pause. Its exported endpoint is frame
17, defining a 0.6667-second cycle. **Strafe_Left** and **Strafe_Right** use
playback frames 1–14. Their identical endpoint at frame 15 defines the exported 0.5833-second
cycle; omit it from playback to avoid a duplicated endpoint. **Run** remains
available in the Action Editor: play frames 1–18, with its exported endpoint at
19. **Walk** uses playback frames 1–28 and an exported endpoint at frame 29.

The five-second **Rig_Check** demonstration remains available in the Action
Editor. Select that action and set the playback range to 1–121. Its markers identify
Rest (1), Ready (25), Crouch (49), Step (73), Reach (97), and Rest again (121).
This is a rig inspection clip, not a finished walk or run cycle.

To pose manually, unlink the active action in the Action Editor first; all six
actions have fake users and remain available. Select all controls and use Alt-G and
Alt-R to return their transforms to the modeling pose. Bone controls are grouped
in the armature's Body, Arms FK, Legs IK, Armor hinges and Deform helpers
collections. Deform helpers are hidden by default.

| Control | Operation |
| --- | --- |
| `root` | Move or rotate the entire character, including foot and knee controls |
| `pelvis` | Move the body while the foot controls remain planted |
| `spine`, `chest`, `neck`, `head` | Rotate the body and head |
| `clavicle.L/R` | Adjust shoulder placement |
| `upper_arm.L/R`, `forearm.L/R`, `hand.L/R` | Rotate the arms and wrists with FK |
| `foot_ik.L/R` | Move each foot with G; rotate the boot with R |
| `knee_pole.L/R` | Move to steer the knee bend direction |
| `front_guard`, `rear_guard` | Rotate the belt-mounted armor plates for clearance |

Leg IK disables stretching. The skeleton has a tiny internal knee prebend to
stabilize the solver, while the visible rest mesh differs by less than 0.05 mm
from the original. Extreme poses can require adjustments to the shoulder and
pelvic plate controls; the rig does not implement automatic armor collision.

## Export and checks

`../legs/sector-trooper-model.glb` is skinned and includes sampled Walk, Run,
Strafe_Left, Strafe_Right, Backward and Rig_Check animations. It contains one skin with 25 joints, and all 71 mesh nodes
are bound to it. IK and armor-follow constraints are sampled into ordinary
joint animation for playback outside Blender. No runtime IK is required.
The model retains the existing coordinate origin and approximately 1.883 m
height; its rest soles are at Blender Z=-1.265625 m.

- `build_rig.py`: create skeleton, controls and explicit weights. Refuses to
  overwrite an existing armature or existing vertex groups.
- `pose_rig.py`: reusable control poses for inspection.
- `create_rig_check.py`: build the editable six-pose demonstration action.
- `finish_rig.py`: validate, export and save the current rig. Use this instead
  of the earlier static model finish scripts.
- `render_rig.py`: render ready, crouch, step and reach views in a background
  Blender process, explicitly selecting the Rig_Check action.
- `check_export.py`: import the exported GLB in a disposable background
  process and compare skinned world geometry against the authoring scene at
  sampled frames from all six actions. It refuses to run in the live Blender UI.
- `rig-metadata.json`: weights, counts, rest shape and current-action pose checks.
- `export-check.json`: independent GLB import/deformation verification.
- `rest-baseline.json`: evaluated world vertices before rigging.
- `rig-preview.png`, `rig-crouch.png`, `rig-step.png`, `rig-reach.png`: inspection
  renders of the saved animation.

The rig's rest geometry, finite normalized weights, rigid armor distances,
foot targets and ground contact have been checked. The GLB import comparison
matches the authoring poses to within 0.004 mm at the sampled frames.

## Walk cycle

The gait uses a heel strike, flat support and a toe-pivot push-off, followed by
an eased swing with matched takeoff and landing velocities. Support lasts 62%
of each leg's cycle, so weight transfers with a brief period of double support
and no airborne phase. Hips rise during midstance and lower under loading;
small lateral weight shifts and pelvic rotation are opposed by the chest and
arm swing. The head counter-rotates to reduce unnecessary sway. Belt plates
hinge slightly to clear the advancing thighs.

The cycle is tailored to the character's short legs and large rigid boots:
0.84 m per full stride, about 103 steps/minute and **0.72 m/s** forward motion
at normal playback. It loops in place. For gameplay, move the actor forward
along glTF +Z at `0.72 * playbackRate` m/s and use the same playback rate for
the Walk clip. Blender's corresponding forward axis is -Y. This keeps the
supporting foot planted relative to the world. The actor's rotation remains
under the game controller.

- `animate_walk.py`: creates editable half-frame IK/FK control keys and cycle
  modifiers while preserving geometry, rest skeleton, weights and Rig_Check.
- `setup_walk_preview.py`: adds dedicated walk cameras in a separate collection,
  preserving all previous comparison camera settings.
- `check_walk.py`: checks ground contact and support at 112 subframe times, and
  compares the complete mesh at both ends of the loop. Measured contact drift
  stays below 0.22 mm, with an identical first and last pose.
- `walk-metadata.json`, `walk-check.json`: gait settings and checks.
- `render_walk.py`: produces 28 frames each from hero and side cameras, plus
  `walk-preview.png`, in a separate background Blender process.
- `walk-preview.mp4`: four repeated cycles, with hero and side views together.

To rebuild the walk, run `animate_walk.py`, `setup_walk_preview.py`,
`finish_rig.py`, and `check_walk.py` through MCP, then run `check_export.py`
and `render_walk.py` in background Blender processes. The export check compares
seven Walk frames, eight Run frames, nine frames per strafe, nine Backward frames and four Rig_Check
frames against the source scene.

## Run cycle

Run follows the supplied airborne stride study in `sector-trooper-run-reference.png`,
also packed into the Blender file. The trailing leg extends behind the hips
through the airborne apex, then folds and sweeps forward. At the frame-1 apex,
its knee is about 9 cm behind the hip and its ankle about 36 cm behind it.
The leading knee drives forward, and the arms have distinct drive and recovery poses. The
front elbow bends to about 105 degrees while the rear arm opens to about 51
degrees. Both hands use the simplified relaxed fist geometry described in `../arms/`.
The torso twists against the hips, with a small forward/back pulse and
helmet follow-through. Lateral weight shift and side bend stay restrained.
The evaluated upper-chest control travels about 4.5 cm side to side, with about
29 degrees of total twist across a cycle; the pelvis rises and falls about
8 cm. Its mean position is 7.5 cm forward of the rest pelvis, keeping the body
over the legs while retaining compression for landings.
Measured motion ranges are recorded in `run-check.json`.

The knees compress under load and fold during recovery. Each foot supports
the body for 32% of its cycle, with airborne phases totaling about 36% of
the complete cycle and no double support. Heel contact rolls through the sole
into a toe-pivot push-off. The head counter-rotates and the belt plates hinge to
clear the thighs. Leg compression is tuned to the short legs and large boots.
Swing clearance reaches about 24 cm, with both feet at least 9.6 cm off the floor
at the highest part of the flight. Frame 1 starts in the late-flight reference
stride, shortly before heel contact.

The 18-frame cycle at 24 fps lasts **0.75 seconds**, with 160 steps/minute and
a 1.32 m full stride. It loops in place. Move the actor along glTF +Z at
`1.76 * playbackRate` m/s while applying the same playback rate to Run.

- `animate_run.py`: creates editable quarter-frame control keys and cycle
  modifiers, preserving the model, skeleton, weights, Walk and Rig_Check.
- `setup_run_preview.py`: adds dedicated Run cameras with matching framing.
- `check_run.py`: checks Run using the shared contact and loop checker at 144
  subframe times. Contact drift stays below 0.58 mm; the first and last mesh
  poses are identical. The check also verifies flight, absence of double support,
  and records the evaluated torso movement ranges.
- `run-metadata.json`, `run-check.json`: gait settings and measured checks.
- `render_run.py`: renders 18 hero frames, 18 side frames and `run-preview.png`
  in a separate background Blender process.
- `run-preview.mp4`: six repeated cycles with hero and side views together.

To rebuild Run, run `animate_run.py`, `setup_run_preview.py`, `finish_rig.py`
and `check_run.py` through MCP, then run `check_export.py` and `render_run.py`
in background Blender processes.

## Strafe left and right

These are fast lateral running steps with a forward-facing torso. The lead
foot steps outward and the following foot recovers without crossing. The
knees compress under load, boots push off their edges, and short airborne
phases separate the contacts. The body leans slightly toward travel and twists
gently; the helmet stays aimed forward. Both elbows remain bent, with only
6 degrees of upper-arm swing amplitude and 4 degrees of elbow variation.
The restrained arms keep the movement distinct from forward running.

Each clip spans **14 frames at 24 fps**, or **0.5833 seconds**, and covers a
0.54 m stride at **0.926 m/s**. Support occupies 42% of each foot's cycle,
leaving roughly 16% of the cycle airborne. The character loops in place:
move it along its local **+X for Strafe_Left** or **-X for Strafe_Right** at
`0.9257142857 * playbackRate` m/s. Its facing stays Blender -Y / glTF +Z.
Left and right refer to the character's perspective. Scale movement and clip
rate together; no root motion or runtime IK is required.

- `animate_strafe.py`: authors both mirrored clips using quarter-frame control
  keys, preserving all geometry, weights, rest bones and earlier actions.
- `setup_strafe_preview.py`: adds front and hero cameras with existing framing.
- `check_strafe.py`: checks both actions at 112 subframe samples each. Verifies
  planted contacts, boot separation, brief flight, mirrored bone motion, a
  stationary root and identical first/last evaluated mesh poses.
- `strafe-metadata.json`, `strafe-check.json`: settings and measured checks.
- `render_strafe.py`: renders both loops and hero stills in background Blender.
- `strafe-preview.mp4`: both directions shown together from the front.

Measured contact drift stays below 0.25 mm and floor penetration below 0.09 mm.
The soles remain at least 8.8 cm apart across both loops, and the left/right
bone poses mirror within 0.001 mm. `check_export.py` also verifies both sampled
strafe clips after importing the exported GLB into a separate process.

To rebuild, run `animate_strafe.py`, `setup_strafe_preview.py`,
`check_strafe.py` and `finish_rig.py` through MCP, then run `check_export.py`
and `render_strafe.py` in background Blender processes.

## Backward hustle

**Backward** is a quick retreat while facing forward, with approximately six
degrees of backward torso lean and a stabilized helmet. Each foot reaches
behind the body, lands toe-first, settles through the sole and releases the
heel. Short airborne phases and soft knee compression give it a running
cadence. Bent elbows stay close to the strafe pose, with only six degrees of
upper-arm swing amplitude and four degrees of elbow variation.

The **16-frame cycle at 24 fps** lasts **0.6667 seconds**, with a 0.72 m stride
and **1.08 m/s** backward movement. For gameplay, translate along local glTF
**-Z** at `1.08 * playbackRate` m/s while retaining the model's +Z facing.
The equivalent Blender movement is +Y. The clip is in place and uses the same
rig and skin as the other locomotion clips.

- `animate_backward.py`: authors editable quarter-frame IK/FK keys while
  preserving the model, skeleton, weights and all five earlier actions.
- `setup_backward_preview.py`: adds hero, side and front preview cameras.
- `check_backward.py`: checks 128 subframe times through the shared locomotion
  checker, including reversed support travel and the backward torso lean.
- `backward-metadata.json`, `backward-check.json`: settings and measured checks.
- `render_backward.py`: renders hero and side loops in background Blender.
- `backward-preview.mp4`: repeated cycles with both views together.

The evaluated chest leans backward by 5.5–6.5 degrees. Contact drift remains
below 0.35 mm, floor penetration below 0.25 mm, and the complete first and last
mesh poses match exactly. The exported clip is checked independently by
`check_export.py` after importing the GLB in a disposable Blender process.

To rebuild, run `animate_backward.py`, `setup_backward_preview.py`,
`check_backward.py` and `finish_rig.py` through MCP, then run `check_export.py`
and `render_backward.py` in background Blender processes.
