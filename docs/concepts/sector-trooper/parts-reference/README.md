# Sector Trooper modular modeling reference

The parts sheet separates the supplied character into four modeling groups. Generated with the built-in image generation tool; these are visual references, not Blender meshes or dimensionally exact orthographic drawings.

- **Head:** helmet, visor, sensor, stripe and jaw. Join at the neck.
- **Torso + pelvis:** neck collar, chest, back, abdomen, belt and groin plate. Arm roots join at the shoulders; legs join at the hips.
- **Arms:** shoulder pad, short dark upper arm, elbow, ivory forearm guard, wrist and glove. Model one side, then mirror for the opposite arm.
- **Legs:** thigh, knee, shin, ankle and boot. Keep left and right as separate objects.

## Assembly in Blender

Use the original full-character image (`source-reference.png`) to establish overall proportions. The parts panels are enlarged independently; do not assume the head, torso, arm and leg panels share one image scale. Hidden joint surfaces and the arm top view are interpretations.

Keep the torso as the assembly reference, and place the head, arm and leg origins at their neck, shoulder and hip joins. Use one common unit scale and character orientation across all part files. Keep a small overlap of dark joint geometry underneath the armor to avoid visible cracks. The sheet's dark socket shapes indicate connection locations, not a specified mechanical fit.

For animation, retain separate upper/lower limb and hand/foot pieces or appropriate deforming topology at elbows, knees, wrists and ankles. Mirror limbs before adding any intentional asymmetric markings. Keep the helmet's off-center stripe and single sensor as shown in the original.

## Files

- `sector-trooper-modular-parts-v1.png`: selected parts sheet.
- `source-reference.png`: unchanged supplied character concept.
- `generation-prompts.md`: exact initial and correction prompts.

Existing head, torso and leg model files elsewhere in this directory were not modified.
