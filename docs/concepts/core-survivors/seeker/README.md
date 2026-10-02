# Hollow Legion — 04 Seeker

Modeled from `seeker-reference.png`, supplied by the user. First-pass geometry was
built in isolated Blender; the finishing pass, sensor depth correction, export,
validation and final renders were performed through the live Blender MCP session.
The saved model is open in Blender.

The Seeker has a faceted hound head, recessed scarlet eye slits and throat insert,
paired swept-back armor blades, a narrow chassis, four articulated legs and
three-toed mechanical paws. Graphite vertex-color facets and scarlet emissive
sensors match the other Hollow Legion models.

- `seeker.blend`: editable model, 20-bone rigid armor rig, packed reference,
  studio lights and hero/front/side/top cameras.
- `seeker.glb`: 1,704 triangles, two material primitives, 20 joints.
- `seeker-preview.png`, `seeker-front.png`, `seeker-side.png`, `seeker-top.png`:
  final model renders.
- `build_seeker.py`: isolated first-pass generator.
- `refine_seeker.py`: idempotent finishing pass, run in the Seeker scene via MCP.
- `render_seeker.py`: render the current live Seeker scene.
- `validation.json`: finite geometry, grounded soles, nondegenerate triangles,
  and complete rigid skin weights checked in live Blender.

Blender coordinates use -Y forward and +Z up. glTF uses +Z forward and +Y up.
Soles rest at zero. Source dimensions are 1.85 wide × 3.29 long × 1.93 high.
Root controls global motion; Body, Neck, Head, FinL/FinR and independent leg chains
support subsequent animation. Rear legs have an additional hock joint.

The model includes the eight clips described below. Core Survivors and the model
catalog now render `apps/web/public/models/hollow-legion/seeker.glb` at scale 0.125.
Movement drives the gait; simulation phases drive the in-place charge clips.
Death removes contact damage and collision immediately, plays the side collapse,
and fades the body away at 2.5 seconds. Try `/play?survive=1&survivePreview=seeker`
or `survivePreview=seeker-defeat` in development.

Reproduce by running `build_seeker.py` in a fresh background Blender, opening the
result in the live Blender session, and running `refine_seeker.py` followed by
`render_seeker.py` through MCP. The original live session was backed up locally
under `revisions/live-before-seeker.blend` before opening Seeker.

## Animation set

Authored and exported through the live Blender MCP session by `animate_seeker.py`.
The original neutral model is preserved in `revisions/pre-animation/seeker.blend`.

| Clip | Seconds | Behavior |
| --- | ---: | --- |
| Idle | 2.0 | Planted paws, restrained breathing and sensor-head movement |
| Walk | 1.2 | Four-beat walk, sequential paw contacts |
| Run | 0.65 | Diagonal trot with longer stride and lower body |
| ChargeWindup | 0.8 | Crouch, rear preload, raised fins, then launch stance |
| Charge | 0.25 | Seamless, low bounding loop with folding hocks |
| ChargeRecover | 0.6 | Planted brake and return to ready stance |
| ChargeAttack | 2.4 | Full wind-up, one-second forward drive, and recovery |
| Defeated | 1.8 | Front-leg buckle, side collapse, folded paws, final hold |

The charge is modeled to match the existing simulation: 0.8 seconds of aim,
1 second of drive, 0.6 seconds of recovery. ChargeAttack travels 12 source metres
(3 world units at the recommended 0.25 game scale), holds its landing position,
and never snaps back. The looping Charge gait has a matching 12 m/s stance speed.

For gameplay, use ChargeWindup → Charge (loop as needed) → ChargeRecover while
letting the simulation translate the actor. Pack wind-ups can stretch to 1.6
seconds and pack charges can keep looping. ChargeAttack is the complete root-motion
version for previews; strip its root travel if playing it on a moving game actor.
Do not apply both the simulation's travel and the clip's root motion.

All eight clips retain the same geometry, materials, bones and inverse binds.
The export samples at 120 Hz; the editable Blender timeline remains at 24 fps.
Analytical leg solves preserve segment lengths and grounded contacts. A 0.01-source-
metre collision margin keeps armor clear through interpolated export samples.
The runtime uses the separate in-place clips; ChargeAttack stays an authoring preview.

`validate_animation.mjs` samples the exported GLB at 240 Hz, checks ground clearance,
finite transforms, joint lengths, loop endpoints, charge phase continuity, the
12-metre displacement, a planted charging paw and the final death hold.
`animation-validation.json` contains the result. `seeker-charge.mp4` previews the
complete moving attack; `render_charge_preview.py` renders it through live MCP.

The fins now sweep outward by 0.25 radians at rest and during both movement
gaits, fold to -0.16 radians during windup/charge, and reopen during recovery.
The runtime scale is 0.125 (50% of the original size); charge playback compensates for scale.
