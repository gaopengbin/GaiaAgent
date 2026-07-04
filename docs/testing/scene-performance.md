# Scene Performance Baseline

GaiaAgent 0.2 targets CesiumJS 1.142 and the matching `cesium-mcp-bridge` / `cesium-mcp-runtime` 1.142.1 pair.

Automated coverage builds a 20,000-entity authoritative scene snapshot and requires the TypeScript asset registry plus incremental patch generation to complete within 1.5 seconds on CI. Run it with `npm run test`.

For large GeoJSON rendering, prefer the bridge's `addGeoJsonPrimitive` tool introduced with the 1.142 toolchain. It uses CesiumJS `GeoJsonPrimitive` rather than creating one Entity/DataSource object per feature.

Release smoke test:

1. Load a GeoJSON dataset with at least 50,000 point or polygon features using `addGeoJsonPrimitive`.
2. Pan, zoom, select a feature, toggle visibility, then remove the layer.
3. Confirm tool completion events retain their `callId`, the layer appears once in the asset registry, and removal produces one scene patch without stale assets.
4. Record dataset size, load latency, peak working set and median frame rate in the release worklog.

The browser contract fixture is available at `tests/fixtures/scene-performance.html` while the Vite dev server is running. On 2026-07-01 it loaded 50,000 points through `GeoJsonPrimitive` in 47 ms in the project test browser, registered exactly one layer, and removed it without leaving a stale layer. This number is environment-specific; the pass/fail invariants are the durable acceptance evidence.
