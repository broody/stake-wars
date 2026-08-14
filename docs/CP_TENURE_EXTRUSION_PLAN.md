# Control Point tenure extrusion plan

## Recommendation

Use a fixed absolute tenure scale with logarithmic compression and a visual cap.
Do not normalize heights against the oldest currently visible or player-owned
Control Point.

Relative normalization makes the same Control Point change height when another
point is captured, released, or simply enters the queried set. That weakens the
map as a learned spatial language for frequent visitors. A fixed curve gives the
same age the same height for every player and every session, while logarithmic
compression preserves differences among young points without allowing old
points to dominate the globe.

Adjacent Control Points held by the same Operator form a contiguous plateau at
the height of the longest-held point in that connected territory. Disconnected
territories remain independent, even when they share an owner.

`DEFAULT_TENURE_EXTRUSION_ENABLED` is the temporary feature switch. `Planet`
also accepts `tenureExtrusionEnabled`, so a later UI control can toggle the
visualization without changing the tenure or geometry APIs. The height map
collapses to zero while disabled, leaving a clean interpolation target for a
future animated transition.

Initial curve:

```ts
const MAX_TENURE_DAYS = 365;
const MAX_EXTRUSION = 0.75; // CORE_RADIUS is 5

height =
  MAX_EXTRUSION *
  Math.log1p(Math.min(ageDays, MAX_TENURE_DAYS)) /
  Math.log1p(MAX_TENURE_DAYS);
```

This produces stable reference heights of approximately:

| Current ownership age | Extrusion |
| --- | ---: |
| 1 day | 0.09 |
| 7 days | 0.26 |
| 30 days | 0.44 |
| 90 days | 0.57 |
| 1 year or more | 0.75 |

The one-year cap is a visual ceiling, not a claim that tenure stops. The exact
duration remains visible in the selected Control Point panel. Keep the cap and
curve as named constants so they can be tuned after viewing real distributions.

## Meaning of tenure

Tenure means time since the current controller captured the Control Point.

- A capture or displacement starts tenure at the current block timestamp.
- A new capture starts new tenure on the destination point.
- Reinforcement does not reset tenure.
- Release clears tenure.
- A later recapture starts a new tenure, even for a previous controller.
- Only active Control Points participate; stale/disqualified state follows the
  existing active-control classification.

This is deliberately ownership tenure, not the age of the Operator's validator
stake or the time since the last stake reinforcement.

## Data plan

Make tenure authoritative in current on-chain state rather than reconstructing
unbounded event history on every page load.

1. Add `controlled_since: u64` to the `ControlPoint` model. This is an additive
   Dojo model change; existing entities receive zero.
2. Set it with Starknet's block timestamp inside `capture_with_synced`, which
   also covers displacement captures.
3. Preserve it during reinforcement and set it to zero in `clear_point`.
4. Add it to `ControlPointStatus`, the single and batched status readers, the
   frontend types, and Starknet response parsing.
5. Include it as `controlled_since` in the existing Torii Control Point query.
6. On optimistic capture confirmation, use the current client time only as a
   temporary display value; replace it on the next Torii/status refresh.

### Existing Sepolia points

An additive migration leaves `controlled_since == 0` for points captured before
the migration. Do not display these as newly captured.

Use a bounded compatibility fallback for zero-valued occupied points:

- Query historical `ControlPointCaptured` models with cursor, controller, and
  `ownership_generation`.
- Match the event to the current `(control_point_id, controller,
  ownership_generation)` tuple.
- Read the unique matching blocks' timestamps from the configured Starknet RPC.
- Cache the derived values for the session.
- Prefer nonzero model state as soon as it exists.

The current Torii schema exposes the required capture fields and encodes block
number in each event cursor. The fallback is only for ownership that predates
the model change and naturally disappears as those points turn over. Paginate
the compatibility query; do not permanently make full event-history loading the
primary path.

## Rendering plan

Treat the Control mode globe as a territorial relief map. Projection mode stays
flat so image projection remains an undistorted surface.

1. Add a pure `tenureExtrusionHeight(controlledSince, now)` utility containing
   clamping and the fixed curve.
2. Add a geometry builder that creates an outward triangular prism for each
   occupied Control Point:
   - the top triangle is each canonical vertex scaled to
     `CORE_RADIUS + height`;
   - three side quads connect the surface triangle to its raised top;
   - no bottom face is needed because it is hidden by the core;
   - top and side geometry can use separate subdued material values so the
     silhouette carries the information without adding another color scale.
3. Build one combined non-indexed geometry for all occupied points rather than
   one mesh per Control Point. At 2,000 points this remains modest geometry and
   avoids thousands of React/Three objects.
4. Recompute height geometry on load and in a coarse time bucket (hourly is
   sufficient). Do not rebuild it every animation frame.
5. Render ownership color on the top faces (gold for the connected Operator,
   white for others) and darker sides. Preserve the existing seams between
   different owners.
6. Ensure hover, selection, and transaction treatments are drawn at the raised
   top height in Control mode. Existing flat overlays would otherwise disappear
   beneath the extrusion.
7. Keep the canonical sphere as the interaction surface, and explicitly make
   decorative extrusion meshes non-raycastable. Verify side-on clicks near tall
   walls select the intended underlying point; if that is unreliable, attach a
   Control Point ID attribute/face map to the extrusion geometry and resolve
   events from it.
8. On capture, optionally animate the new prism from zero to its current height
   over roughly 300 ms. Respect `prefers-reduced-motion`. This is polish after
   the static geometry is correct.

## Interface plan

- Add `HELD FOR` to the single-selection panel, formatted as a useful duration
  (`3h`, `12d`, `8mo`, `1y 4mo`) and backed by the exact timestamp.
- For multi-selection, show the selected tenure range rather than implying one
  duration applies to every point.
- Extend the Control Point legend with a compact vertical relief key at fixed
  anchors such as `1D`, `7D`, `30D`, `1Y+`.
- If the index is loading or tenure is unavailable, keep the ownership surface
  visible at zero extrusion and show `---` for the duration. Missing data must
  not invent age.
- Keep Projection mode behavior and its legend unchanged.

## Delivery slices

### 1. Data semantics and migration-safe state

- Contract model/status changes and Cairo tests for capture, reinforcement,
  displacement, release, and zero-valued state.
- Torii/Starknet parsing changes and TypeScript unit tests.
- Compatibility reconstruction for pre-migration Sepolia ownership.

### 2. Pure scale and geometry

- Fixed logarithmic scale utility with boundary tests.
- Triangular-prism geometry builder with tests for vertex counts, base radius,
  top radius, invalid IDs/timestamps, and the 365-day cap.

### 3. Control mode integration

- Combined occupied relief mesh in `Planet`.
- Raised hover/selection/transaction layers.
- Confirm Projection mode remains flat.

### 4. Readability and polish

- `HELD FOR` detail and fixed-scale legend.
- Capture transition with reduced-motion behavior, if the static version reads
  well.
- Tune `MAX_EXTRUSION` and material contrast using screenshots at mobile and
  desktop sizes with synthetic 1-day, 7-day, 30-day, 90-day, and 1-year points.

## Verification

- `pnpm --filter @stakewars/web test`
- `pnpm --filter @stakewars/web build:sepolia`
- `pnpm --filter @stakewars/web lint`
- `pnpm contracts:test`
- `pnpm contracts:build`
- `pnpm format:check`
- `git diff --check`
- Run `pnpm dev:web:sepolia` with the approved local Torii launcher and visually
  verify Control and Projection modes at `http://localhost:3000/?app=game`.

No Sepolia migration is part of implementation until it is separately approved.
Before any approved migration, follow the repository's Sepolia test, build,
inspect, account verification, migrate, re-inspect, and Torii restart workflow.

## Acceptance criteria

- The same tenure always maps to the same height across users and sessions.
- No Control Point exceeds the fixed maximum extrusion.
- Reinforcement leaves tenure unchanged; ownership changes reset it.
- Current pre-migration Sepolia points do not appear newly captured merely
  because their new model field defaults to zero.
- Ownership colors, seams, selection, hover, and transaction feedback remain
  readable on raised points.
- Projection mode geometry is unchanged.
- Unknown tenure is represented as unknown, never as a fabricated duration.
- The full 2,000-point case stays interactive on a representative mobile device.

## Integration note

The source checkout currently has uncommitted work touching `World.tsx`,
`ControlPointContext.tsx`, `starknet.ts`, `control.cairo`, contract tests, and the
PRD. This worktree was created from its committed `HEAD`, so implementation
should begin after that work is committed and this branch is rebased (or its
relevant changes are intentionally ported). Do not copy the dirty checkout over
this worktree wholesale.
