# Sector Trooper — off-hand Bolt Caster

The Bolt Caster upgrade equips this stockless, compact version of the approved
Sector Trooper rifle in the left hand; the right hand retains the saber.

`build_bolt_caster.py` imports the original rifle GLB, removes its shoulder stock
and support-hand rest, shortens its length to 68% and widens it to 115%. The ivory
shell, charcoal receiver, amber stripe, recessed muzzle and status lamps retain
the existing character's materials. There are 37 editable mesh parts.

The standalone `.blend` and `.glb` share a grip-centered origin. Blender -Y is
forward and Z is up; exported glTF +Z is forward and +Y is up. `BoltCaster_Muzzle`
is the firing-effect anchor. The character source and its seven animation clips
are unchanged by this authoring script.

Runtime `BoltCasterAnimation` attaches the asset to `handL` and applies a left-arm
IK layer after the saber/run pose. It aims along the simulation's latest volley,
adds recoil and an amber muzzle flash, and stays attached during the death clip.
The gun appears only after acquiring `bolts`, including its Railstorm evolution.
The gun layer does not change weapon stats or projectile collision behavior.

Rebuild with the installed Blender executable in background mode and copy the
GLB to the survivor worktree's `apps/web/public/models/sector-trooper/`.
