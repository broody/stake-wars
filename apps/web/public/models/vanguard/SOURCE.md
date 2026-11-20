# Vanguard

`vanguard.glb` is copied from `docs/concepts/core-survivors/vanguard/vanguard.glb`.
The editable Blender source, authoring scripts, renders and validation live in
that folder (currently in the main checkout); see its README.

The Vanguard is the Core Survivors player. The model is an armored knight with
an ivory helmet, a charcoal cape and a white-edged sword in the right hand. It
has two skinned meshes, `Vanguard_Armor` and `Vanguard_Sword`, on one 61-bone
FK rig, with 79,252 triangles in about 10.3 MB.

| Clip | Seconds | Game use |
| --- | --- | --- |
| Idle | 2.0 | Standing, blended out as the player moves |
| Walk | 1.333 | Slow analog movement; authored at 0.81 m/s, stride 1.08 m |
| Run | 0.833 | Full speed; authored at 2.88 m/s, stride 2.4 m |
| Attack / AttackBackhand | 0.917 | Standing cuts with a planted step on the backhand |
| RunAttack / RunAttackBackhand | 0.833 | Arc Blade cuts while moving, upper body only |
| Defeated | 3.0 | Player death, one-shot fall from the current pose |

How the game plays it is set in `apps/web/src/game/utils/vanguardAnimation.ts`
(`VANGUARD`):

- **Scale and grounding.** Scale 0.227 matches the old Sector Trooper's height
  on screen. The soles sit at the origin.
- **Gait.** Walk and Run share one stride phase, so the blend between them
  keeps the feet in step. The phase advances by ground covered, so feet stay
  planted at any speed.
- **Swings.** Swings use the upper-body bones listed in the model's
  `sword-metadata.json`, so the legs keep their gait. The cut lands at frame
  8. The swing is retimed so that frame meets the sim's hit, which keeps the
  Arc Blade's damage timing unchanged from the trooper's.
- **Footwork.** A sharp turn holds the supporting boot briefly as the body turns. A standing backhand opens the right boot and shifts the hips over it before the sword recovers.
- **Facing.** The model faces glTF +Z, and the game turns the parent; no clip
  carries root motion.

The model has no Draco or meshopt compression yet. Compressing it is the main
lever on its download size.
