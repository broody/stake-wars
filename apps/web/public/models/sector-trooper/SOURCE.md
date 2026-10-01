# Sector Trooper

`sector-trooper.glb` is copied from
`docs/concepts/sector-trooper/armed/sector-trooper-armed.glb`.
The editable Blender source is
`docs/concepts/sector-trooper/head/sector-trooper-head.blend`.

The export includes the trooper, full-size rifle, weapon socket and ten actions:

| Movement | Armed carry | Firing |
| --- | --- | --- |
| Idle | Armed_Idle | Idle_Shoot |
| Forward | Run_Carry_Forward | Walk_Shoot_Forward |
| Left | Strafe_Carry_Left | Strafe_Shoot_Left |
| Right | Strafe_Carry_Right | Strafe_Shoot_Right |
| Backward | Backward_Carry | Backward_Shoot |

Local preview: `/play?trooper=1`, optionally combined with `mites` and `lancers`.
The rifle is always equipped. W runs forward, A/D strafe, S hustles backward.
Hold Space to blend into the matching firing animation; release to return to
chest carry. Idle includes breathing or braced recoil. Diagonals blend directional
clips with synchronized foot-contact phase. Firing clips span multiple strides;
the runtime samples gait seconds so changing fire state preserves stride phase. Forward movement smoothly slows
from the 1.76 m/s authored run to the 0.72 m/s firing walk; strafe and backward
paces stay unchanged. Game scale is applied to these authored speeds. This controls animation only, with no projectile or damage
simulation. Esc toggles the player controls on and off.

Left-drag to orbit the camera horizontally or vertically. Right-drag aligns
the trooper to the camera direction and steers its facing; WASD follows that
heading. The view angle persists when released. Vertical orbit is limited to
keep the camera above the ground. Mouse controls remain available while
movement is paused. Mouse-wheel or trackpad scrolling smoothly zooms in and
out between 1.1 and 12 world units from the camera target, retaining the orbit
angle and the camera's field of view.
Input clears on blur, hidden tabs, text-field focus and inactive game routes.

The model uses scale 0.35, glTF +Z facing, and an authored sole height of
-1.265625. An inner offset puts its soles on the existing invisible Core ground
sphere. Movement parallel-transports the body and heading around that sphere,
including across poles. Camera follows from behind. This is a local character
preview; movement does not submit transactions or alter onchain sectors.

Reexport with background Blender using `armed/export_game.py` against the
canonical blend, then run `armed/check_game_export.py` in background Blender
before copying the GLB here. The exporter samples at 96 fps to preserve the
quarter-frame hand contacts and does not save its retimed working scene.
`game-export.json` records clip timing; `game-export-check.json` records the
geometry comparison against Blender for all ten clips. Keep timings in
`apps/web/src/game/utils/trooperController.ts` and mappings in
`apps/web/src/game/utils/trooperAnimation.ts` aligned with these assets.

Aim controls: right-click/drag selects an aim point through the camera center,
including its vertical angle. On release, that aim direction stays relative to
the player; left-drag remains free camera orbit. The firing crosshair projects
that aim point and hides on Space release, pause, lost focus, or when occluded
by the Core. Its default aim is down near the Core. Recoil is visual only and
does not move the crosshair. Both upper-arm roots receive the same rigid aim
adjustment, preserving hand contact with the rifle.

`trooperAim.ts` exposes the steady endpoint and a muzzle-to-endpoint ray for
future laser simulation. Current collision is the invisible Core ground sphere,
with a 30-unit range fallback; enemy hitboxes/projectiles/damage are not yet
implemented. Future target collisions must feed this same endpoint before
projecting the crosshair and rendering the shot.


The preview spawns only the controllable player. Autonomous trooper patrols are
not mounted. The bottom-left controls panel is removed; only the firing
crosshair is displayed.
