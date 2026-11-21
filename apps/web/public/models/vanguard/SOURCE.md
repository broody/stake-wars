# Vanguard

The Vanguard wears an ivory helmet and charcoal cape and carries an orange
lightsaber in the right hand. Its hilt comes from the Sector Trooper saber.
The blade runs from 0.158 to 0.995 m along the animated weapon socket, matching
the Arc Blade trail. A white emissive core and a soft orange halo keep
the blade visible at gameplay scale.

The editable Vanguard rig and its original Blender export live in
`docs/concepts/core-survivors/vanguard` in the main checkout. To rebuild the
game asset, run this from the repository root with the original export as input.

```sh
python3 docs/concepts/core-survivors/vanguard/equip_lightsaber.py \
  /path/to/original/vanguard.glb \
  apps/web/public/models/sector-trooper/sector-trooper-saber.glb \
  apps/web/public/models/vanguard/vanguard.glb
```

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
