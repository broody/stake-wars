# Enemy swarm URL preview

The preview uses the authored Mite and Lancer GLBs and is enabled by URL parameters in both development and production builds. Without a positive enemy count, the normal Core is shown and the swarm renderer is not loaded. Drive the Core remains in its separate PR.

```bash
pnpm dev:web:sepolia --port 3001 --strictPort
```

Run this from `/Users/broody/development/stake-wars`. Port 3001 keeps the other preview on port 3000 available; both use the shared Sepolia configuration.

## URL quantities

Set `mites` and `lancers` independently:

On any deployed frontend, append `?mites=200&lancers=100` to `/play`. If the URL already has a query string, append `&mites=200&lancers=100` instead. Local examples:

- `http://localhost:3001/play?mites=200&lancers=100` — 200 Mites and 100 Lancers.
- `http://localhost:3001/play?lancers=50` — 50 Lancers only.
- `http://localhost:3001/play?mites=37` — 37 Mites only.
- Missing parameters or zero disable that enemy type. If both are zero, the normal Core view is shown.

Counts accept whole numbers and are capped at **1,000 per type** before any allocation. Empty, negative, fractional, or nonnumeric values are ignored. The panel displays the actual spawned quantities.

## Behavior and rendering

Both enemy types wander over the Core with independent headings, speeds, and run phases. The two models use the same 35% scale, preserving the taller Lancer silhouette. Their authored Run clips have separate durations and travel speeds: Mite 0.5 seconds at 1.008 m/s, Lancer 0.667 seconds at 2.70 m/s. World travel is scaled by model size and individual playback rate.

Each model's Run clip is baked into 24 poses once when its batch is created, then interpolated by the GPU. A populated enemy type uses two material draw calls, with no live skeleton or mixer per enemy. A mixed population uses four swarm draw calls and `394 × mites + 722 × lancers` triangles per main render pass. Animation duration is a per-material uniform, so the shared shader handles both clips correctly.

An invisible spherical ground layer sits 0.006 world units above the Core. Actors use its constant radius and continuous surface orientation, avoiding height changes and sideways snaps at triangle edges. The shell is mathematical, with no mesh, raycasts, or added draw calls. In the staked view it expands above the highest raised sector, so actors can float above lower sectors. Travel speed accounts for the shell radius. This preview does not implement collision avoidance, terrain foot placement, attacks, or gameplay state.

**Pause swarm**, **Resume swarm**, and **Reshuffle swarm** control both types together. A closer orbit camera and neutral fill lighting make the dark armor easier to see. The frame-rate display measures recent browser cadence; it is not a target-device benchmark. Its tooltip shows scene draw calls and triangles. The 200-Mite/100-Lancer preview rendered about 153,000 total scene triangles at approximately 120 FPS on the development machine.

## Checks

`NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @stakewars/web test` passes 296 tests. The Node flag avoids the local Node/jsdom storage conflict. Web build, lint, formatting, and `git diff --check` also pass.

Coverage includes URL parsing and count limits, zero/single/multiple populations, species-specific movement speed, deterministic distribution, varied gaits, continuous orientation and ground height, tangent headings, clearance above raised sectors, pause timing, and baking both actual GLBs without changing their source geometry. The swarm renderer is a separate lazy-loaded chunk in production builds and is requested only when a positive enemy count is present.
