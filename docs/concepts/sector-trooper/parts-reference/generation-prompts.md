# Generation prompts

Mode: built-in image generation tool. Input: user-supplied Sector Trooper concept. The second pass edits the initial board using the original concept as the authoritative visual reference.

## Initial board

Use case: precise-object-edit.
Asset type: modular character modeling reference sheet for Blender.
Input image 1 is the edit target and sole visual source of truth: the supplied STAKE WARS SECTOR TROOPER front and side concept. Break THIS EXACT character apart into separated head, torso, arms and legs. Preserve its silhouette, chibi proportions, low polygon flat triangular facets, ivory armor, charcoal undersuit, single amber visor sensor, off-center amber helmet stripe, angular cheek mask, triangular shoulder markings, amber triangular knee accents, chunky boots, and all existing visible armor shapes. No redesign.

Create ONE crisp high-resolution landscape technical parts board, ideally 3072x2048, with four spacious quadrants on a uniform medium-dark neutral gray background. Thin light-gray panel dividers, restrained small monospace labels, large isolated components. Neutral diffuse illumination with clear silhouette separation, minimal shadows, no dramatic studio perspective or ground/floor. No exploded hardware, bolts, connectors or mechanisms added. Detached ends show only simple charcoal undersuit joint surfaces. Orthographic-style views, front and side aligned vertically and rendered at the same scale within each part's panel. Parts may use different enlargement between panels to maximize clarity. No full assembled character.

Top left panel labeled "01 / HEAD": ONLY the complete helmet/head, detached cleanly above the neck. Large straight front view and matching right-facing side profile. Preserve broad faceted dome, full angular jaw, black recessed visor band, one small amber sensor, off-center amber top stripe from original. No shoulders, chest or torso.

Top right panel labeled "02 / TORSO + PELVIS": ONLY torso from black neck collar through waist and pelvis, including ivory chest plate, dark abdomen, ivory belt segments and central groin plate. Large straight front view and matching right-facing side profile. No head, arms, shoulder armor, thighs or legs. The shoulder pads belong to the arm panel. Show clearly where arm roots and thigh roots attach as simple dark undersuit surfaces. Preserve original torso length and taper.

Bottom left panel labeled "03 / ARM": one complete arm from shoulder pad through upper arm, dark elbow joint, ivory forearm armor, dark wrist and open black glove; separated from torso. Keep the same horizontal T-pose alignment as reference, shoulder on left and fingertips to right. TWO vertically stacked orthographic views of the SAME arm: front elevation and top view, showing shoulder pad's triangular insignia, all armor and thumb. Match original short chunky arm proportions and basic extended-hand pose. No torso fragments. Small labels "FRONT" and "TOP". Caption "Mirror for opposite arm".

Bottom right panel labeled "04 / LEGS": a FRONT view of both complete detached legs separated by a modest gap, from dark hip joint stubs down to chunky boots, and one matching right-facing SIDE profile of one leg alongside. No pelvis, waist or torso. Preserve ivory thigh armor, dark knees with small amber triangles, ivory shin armor, dark ankle gaps, ivory and black boots. Keep straight neutral standing geometry and original boot length. Caption "Separate objects: left / right".

Use small "FRONT" / "SIDE" labels beneath respective views in first, second and fourth panels. Small top header "SECTOR TROOPER / MODULAR PARTS". Small footer "Assembly joins: neck / shoulders / hips". All parts fully visible, unoccluded, uncropped with generous gaps. Exact visible design fidelity matters more than inventing details on hidden surfaces. Keep shoulder armor exclusively in arm panel and pelvis exclusively in torso panel. This is a clear visual decomposition for separately modeling meshes and assembling them, not a new character design.

## Targeted correction (selected final output)

Use case: precise-object-edit.
Input 1: ORIGINAL full-character Sector Trooper concept, authoritative anatomy and armor reference.
Input 2: EDIT TARGET, the four-panel modular parts sheet just generated.
Make one targeted correction to input 2. Preserve its entire board layout, text, background, lighting, HEAD panel and LEGS panel unchanged.
CORRECTION in ARM panel in both FRONT and TOP rows: the generated arm incorrectly has TWO long ivory armor blocks between shoulder and hand. The original character has just ONE ivory forearm guard; its very short upper arm is BLACK and mostly under the shoulder pad. Remove the extra ivory upper-arm block (the block nearest the shoulder), and replace it with a SHORT charcoal upper arm section and compact dark elbow joint. Keep the original ivory shoulder pad with black triangle insignia, ONE ivory forearm guard, dark wrist and black glove. Consequently the whole arm is shorter, exactly the original character's stubby proportions. Do not stretch the remaining forearm to fill the removed block's space. There must be two ivory regions total on each whole arm: shoulder pad and forearm guard. Use original full-character image to check the relative lengths. Maintain two clean front and top views of the same corrected detached horizontal T-pose arm. No new armor pieces.
Small secondary cleanup in TORSO + PELVIS front and side panel: remove the invented ivory socket cuffs wrapping the thigh cut ends. End the pelvis cleanly in simple dark hip attachment surfaces, preserving original belt, central ivory groin plate and side belt tabs. No thigh armor in torso panel; ivory thigh armor belongs exclusively to legs. No mechanical pegs or bolts added.
Keep all other component geometry and existing labels unchanged. Crisp clear flat faceted low-poly ivory/charcoal/amber style exactly as original.
