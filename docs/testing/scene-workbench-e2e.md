# Scene Workbench E2E acceptance

This checklist is the release-candidate acceptance path for the GaiaAgent scene workbench. It complements the automated reducer/state tests and should be run against the packaged app or a local Tauri dev build.

Import/export replay note: Scene JSON export now preserves entity `graphicProperties` when the Cesium bridge exposes them. Import restores the current session `SceneState` and replays restorable visible/hidden entities back into Cesium with stable entity ids for marker/point, polyline, polygon, and model assets. Complex layers or entities without enough render parameters remain in structured ScenePanel/Agent context and are reported as skipped/failed in the status text.

Import replay consistency note: after replaying supported entities, the app now reads a fresh `exportScene()` snapshot from the Cesium bridge, reconciles the structured `SceneState` against the real map state, and then merges back imported assets that could not yet be redrawn. This keeps map-backed objects accurate without losing complex structured assets from the Scene panel or Agent context.

Export freshness note: `导出 JSON` now refreshes from the Cesium bridge before writing the file, then merges back structured-only assets. This helps exported scene files include the latest entity graphic properties needed for later replay.

Structured-only preservation note: regular scene refresh and export refresh preserve missing structured assets only when they are protected (`source=import` or `locked=true`), while explicit import replay reconciliation can preserve all imported file assets. This avoids losing complex imported context without resurrecting ordinary deleted map objects as ghost entries.

Replay coverage note: scene import replay now covers marker/point, polyline, polygon, model, billboard with exported image, box, cylinder, ellipse, rectangle, wall, and corridor when their exported render parameters are present. Bridge entity creation accepts stable `id/show` for these replayed entity types so later focus, visibility, and delete actions keep targeting the same object refs.

Replay layer stability note: replay commands also send a deterministic `layerId` (`<type>_<entityId>`). The bridge uses that id for helper layers instead of timestamp-only ids, reducing duplicate implementation layers across repeated import/export/replay cycles.

Replay helper layer upsert note: before creating a replay helper layer with a deterministic `layerId`, the bridge removes any existing helper layer with the same id. This avoids duplicate helper-layer records and Cesium entity-id collisions when the same scene file is imported repeatedly.

Bridge patch durability note: `npm run update-bridge` copies the vendor `cesium-mcp-bridge` browser bundle and then applies GaiaAgent replay patches for stable entity ids, `show`, deterministic helper `layerId`, billboard image export, and detailed `exportScene()` snapshots. `npm run build` runs this script in `prebuild`; after a production build, the generated public bridge should still contain those replay patch markers.

Browser preview smoke note: `http://127.0.0.1:5173/` loads in the in-app browser without console errors, and the Scene tab shows the empty-state controls including `导入 JSON` and `刷新`. The preview correctly reports that the desktop runtime is unavailable outside the Tauri app.

Backend regression note: `cargo fmt --manifest-path src-tauri\Cargo.toml --check` and `$env:CARGO_TARGET_DIR = Join-Path $env:TEMP 'gaiaagent-codex-target'; cargo test --manifest-path src-tauri\Cargo.toml --lib` pass, covering 64 Rust unit tests across native runtime, provider adapters, MCP validation, scene tools, task-plan persistence/replan, approval modes, prompt-injection sanitization, and trace redaction.

## Automated preflight

Run these before manual verification:

```bash
npm run check:web
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

The web gate includes:

- `src/agent/scene-state.test.ts`: bridge snapshot to workbench state lifecycle.
- `src/agent/event-reducer.test.ts`: task plan, retry/skip/replan, and in-run continuation audit chain.
- `src/components/SettingsDialog.test.ts`: Trace summaries for task plan and continuation events.

## Runtime precondition

Run the full manual scenarios in the Tauri desktop app (`npm run tauri:dev` or a packaged build). A plain browser tab at `http://127.0.0.1:5173/` can preview the layout, but it does not have the Tauri `invoke` bridge required by the native Agent runtime. In browser-preview mode the chat input should remain disabled and show a clear status message explaining that the desktop runtime is not connected.

Browser-preview smoke checks:

1. Open `http://127.0.0.1:5173/`.
2. Verify the assistant input is disabled.
3. Verify the disabled reason says the desktop runtime is not connected.
4. Open the Scene tab.
5. Verify the empty Scene panel displays `当前场景还没有对象` and a refresh action.

## Manual scenario A: object creation and management

1. Start the app and confirm the Cesium globe is visible.
2. Select a working model/provider.
3. Send: `在故宫添加一个红色标注，并把它命名为故宫集合点`.
4. Open the Scene panel.
5. Verify:
   - An entity object appears with a stable ref such as `entity:*`.
   - The object source is shown as AI/agent/tool-created.
   - The object is visible by default.
   - The object is listed in recent objects or can be inserted into the prompt as a ref.
6. Click focus on the object.
7. Verify the globe focuses/selects the same object and the panel marks it as active.
8. Hide the object from the Scene panel.
9. Verify the object remains in the list but is visually hidden/marked hidden.
10. Show it again.
11. Delete it.
12. Verify:
    - It disappears from the Scene panel.
    - It disappears from active/recent object refs.
    - The Trace panel contains the relevant tool/scene events.

## Manual scenario B: protected imported/user objects

1. Import or create a user-owned object, or use a tool call that marks `source=import`.
2. Open the Scene panel.
3. Verify imported objects show as protected/locked by default.
4. Try deleting the locked object.
5. Verify deletion is blocked or requires explicit unlock/confirmation.
6. Run `清空 AI 创建的对象`.
7. Verify imported/user/locked objects remain.

## Manual scenario C: session restore

1. Create at least one marker and one route.
2. Switch to another chat session.
3. Switch back to the original session.
4. Verify:
   - Scene objects are restored in the Scene panel.
   - Active and recent object refs are still valid.
   - The assistant can understand a follow-up like `隐藏刚才那条路线`.

## Manual scenario D: replan continuation

1. Start a multi-step task that creates at least two scene objects.
2. Force or trigger a step that needs replanning.
3. Click replan on that step.
4. Verify:
   - The same task card keeps its original completed steps.
   - The unfinished tail is replaced by new planned steps.
   - The continuation runs in the same run, recorded as `run.continued` in Trace.
   - Newly created artifacts are attached back to the replaced steps.

## Pass criteria

- The Scene panel, map view, task plan card, and Trace panel describe the same state.
- No locked/imported object is deleted by a bulk AI cleanup.
- Replan continuation does not create a detached child run for the replacement tail.
- Refreshing or switching sessions does not leave ghost active/recent refs.

## Latest smoke record

Date: 2026-07-03

Environment:

- Tauri desktop dev app: `gaia-agent.exe`
- Frontend dev server: `http://localhost:5173`
- Provider shown in app: `CC Switch Claude · claude-sonnet-4-5-20250929`
- Approval mode: auto

Executed:

1. Verified the desktop window is running and controllable.
2. Verified the Scene tab empty state before creating a new object.
3. Sent: `在故宫添加一个红色标注，命名为冒烟测试点`.
4. Observed a task plan and streaming/waiting state while the model was working.
5. Observed successful tool execution:
   - `geocode`
   - `addMarker`
6. Observed the map showing a red marker labelled `冒烟测试点`.
7. Opened the Scene tab.
8. Observed ScenePanel state:
   - `2 个对象 · 2 可见 · 1 图层 · 1 实体`
   - marker entity named `冒烟测试点`
   - marker layer named `冒烟测试点`
   - source displayed as `AI / 工具`
   - focus, visibility, lock, delete actions visible.
9. Hid the marker entity from ScenePanel.
10. Verified ScenePanel changed to `2 个对象 · 1 可见 · 1 图层 · 1 实体` and the entity action changed to `显示`.
11. Showed the marker entity again.
12. Verified ScenePanel returned to `2 个对象 · 2 可见 · 1 图层 · 1 实体`.

Result:

- Passed for Scenario A core path: object creation, task card, map rendering, ScenePanel registration, and visibility management.

Notes:

- Earlier history in the same session showed two upstream provider failures, but this smoke prompt succeeded.
- Follow-up UI change: ScenePanel now folds paired marker implementation layers into the marker entity for display, so users perceive one marker object unless an independent layer needs direct control.
- Follow-up UI change: selecting a ScenePanel object now expands an object detail block with ref/id/type/source/status/position/data/tool-call metadata, plus any folded implementation refs.
- Follow-up UI change: task-plan artifact chips now show object name, type, source, visibility, and lock state; unsynced refs remain disabled as `尚未同步`.
- Follow-up UI change: clicking a synced task-plan artifact chip now focuses the map object, opens the Scene tab, and selects the object so its detail block is visible.
- Follow-up UI change: selected ScenePanel objects now show their source task step when available; clicking it returns to the Assistant tab and highlights the producing plan step.
- Follow-up runtime change: simple conversational prompts such as `你好` or `你能做什么？` should answer without a task-plan card, while GIS action prompts still show planning.
- Follow-up scene-management change: ScenePanel object cards now support rename; entity renames sync through `scene_rename_object` / `updateEntity`, while layer names update structured SceneState.
- Follow-up scene-management change: ScenePanel bulk actions now include `导出 JSON`; exported files contain stable metadata and the full structured SceneState.
- Follow-up scene-management change: ScenePanel bulk/empty-state actions now include `导入 JSON`; imports accept GaiaAgent scene export payloads or raw `SceneState`, restore structured ScenePanel/Agent context for the current session, persist it back to the native scene store, and replay restorable imported entities back into Cesium with stable ids/layers.
- Follow-up asset-layer change: native Agent tools now include `asset_register`, `asset_list`, and `asset_describe` for structured spatial data assets that are not necessarily rendered yet. Registered assets use `asset:<id>` refs and preserve URI, CRS, geometry type, feature count, bbox, schema, metadata, provenance, and lock state in `SceneState.assets`.
- Follow-up asset-layer change: rendered data-loading tools now also register companion `asset:<layerId>` records for their `layer:<layerId>` output. Layer removal should remove the rendered layer while preserving the data asset for later reuse or re-rendering.
- Follow-up file-import change: ScenePanel now exposes `导入 GeoJSON`. Importing a local `.geojson` or `.json` FeatureCollection reads the file in the WebView, infers feature count, geometry type, bbox, and property schema, renders it through `addGeoJsonLayer`, and refreshes `SceneState` so both `layer:<file-id>` and `asset:<file-id>` appear.
- Follow-up file-import change: ScenePanel now exposes `导入 CSV` for point tables. CSV import auto-detects common longitude/latitude field names, converts valid rows to GeoJSON points, renders them through `addGeoJsonLayer`, and stores CSV metadata including row count and coordinate field names on `asset:<file-id>`.
- Follow-up asset-reuse change: locally imported GeoJSON/CSV assets store renderable GeoJSON in `asset.metadata.renderData`. If the rendered `layer:<file-id>` is removed while `asset:<file-id>` remains, the ScenePanel asset card's `添加到地图` action should recreate the layer through `addGeoJsonLayer`.
- Follow-up asset-summary change: native Agent tools now include `asset_summarize`, and `asset_describe` returns compact metadata rather than large render payloads. Verify imported assets expose feature count, geometry type, bbox, CRS, schema fields, renderability, and selected metadata without returning `metadata.renderData`.
- Follow-up analysis change: native Agent tools now include `analysis_buffer` for imported Point/MultiPoint GeoJSON assets that preserve `metadata.renderData`. The tool should generate polygon buffer GeoJSON, render it with `addGeoJsonLayer`, register `asset:<resultId>` as `analysis-result`, and keep summaries compact by omitting the stored render payload.
- Follow-up nearest-analysis change: native Agent tools now include `analysis_nearest` for two imported Point/MultiPoint assets with preserved `metadata.renderData`. The tool should generate nearest-neighbor LineString GeoJSON, include distance meters/kilometers plus source/target feature indices, render it with `addGeoJsonLayer`, register `asset:<resultId>` as `analysis-result`, and keep summaries compact by omitting the stored render payload.
- Follow-up analysis-UI change: ScenePanel data asset cards now expose a `生成 500m 缓冲区` action for renderable point assets, and selected asset details expose 100m / 500m / 1km buffer shortcuts. These actions call `analysis_buffer`, refresh remote SceneState, and should produce matching `layer:<asset-id>-buffer-<distance>` and `asset:<asset-id>-buffer-<distance>` records.
- Follow-up nearest-analysis UI change: ScenePanel selected point-asset details should list other renderable point assets as nearest-neighbor targets. Clicking a target should call `analysis_nearest`, refresh remote SceneState, and produce matching `layer:<source-id>-nearest-<target-id>` and `asset:<source-id>-nearest-<target-id>` records.
- Follow-up measure-analysis change: native Agent tools now include `analysis_measure` for renderable line/polygon/mixed GeoJSON assets. ScenePanel should show `量测长度/面积` for these assets; clicking it should call `analysis_measure`, refresh remote SceneState, and produce matching `layer:<asset-id>-measure` and `asset:<asset-id>-measure` records with per-feature length/area/perimeter fields and aggregate metadata totals.
- Follow-up spatial-join change: native Agent tools now include `analysis_spatial_join` for point-in-polygon counts. ScenePanel selected point assets should list polygon assets for regional statistics, and selected polygon assets should list point assets for in-area counts. Clicking a candidate should produce matching `layer:<polygon-id>-count-<point-id>` and `asset:<polygon-id>-count-<point-id>` records with per-polygon `pointCount`, matched point indices, and aggregate `totalMatches` metadata.
- Follow-up attribute-filter change: native Agent tools now include `analysis_filter` for renderable GeoJSON assets. ScenePanel selected assets should surface frequent scalar property values under `属性筛选`; clicking one should call `analysis_filter` with `operator=eq`, refresh remote SceneState, and produce an `analysis-result` asset/layer containing only matching features plus predicate metadata and matched/source counts.
- Follow-up export change: ScenePanel data/analysis asset cards now expose `导出 GeoJSON` when `metadata.renderData` is available. The exported file should contain the renderable GeoJSON plus a compact `gaiaAgentExport` provenance block with asset ref/id/name, source, CRS, and export time.
- Follow-up CSV-export change: ScenePanel data asset cards now expose `导出 CSV` when render data is available. Point/MultiPoint GeoJSON assets should export feature properties plus `lon`/`lat` columns, while non-point GeoJSON assets should export a feature-property table with `featureIndex`; all CSV output should use proper escaping and safe filenames.
- Follow-up report-export change: ScenePanel bulk actions now include `导出报告`. The Markdown report refreshes the map snapshot, preserves structured-only assets, and summarizes scene counts, camera, assets, analysis results, bbox/feature metadata, GeoJSON deliverables, and CSV deliverables for Point/MultiPoint assets.
- Follow-up Agent-export change: native Agent tools now include read-only `asset_export`. It can return compact asset summaries, bounded GeoJSON payloads, or bounded CSV text for point assets and non-point GeoJSON property tables without writing files; larger full deliverables should still use the ScenePanel download actions.
- Follow-up report-quality change: Markdown report generation now lives in a tested `scene-report` module. Unit coverage should verify scene counts, camera formatting, asset table escaping, analysis-result summaries, buffer parameters, analysis-type aware details for buffer / spatial join / filter / measure outputs, and empty-report fallbacks.
- Follow-up manifest-summary change: deliverables manifest generation should reuse the same analysis summary helper as Markdown reports. Analysis GeoJSON items in `manifest.json` should include business-readable descriptions such as `缓冲半径：500 米`, point-in-polygon totals, filter predicates, or measurement totals when the corresponding metadata is present.
- Follow-up business-template change: ChatPanel should surface the first coded workflow template, `区域资源覆盖评估`, as a suggestion chip. With point and polygon assets in the scene, clicking the chip should send a structured Agent prompt that references matched asset refs and asks for asset inspection, point-in-polygon statistics, optional buffer/nearest/filter analysis, and a deliverable summary.
- Follow-up business-template UX change: workflow suggestion chips should be visible from an empty new conversation, not only after the first run. The `区域资源覆盖评估` chip should show readiness text (`已匹配数据`, `需补数据`, or `导入数据后可用`) so testers can tell whether the current scene already has enough assets.
- Follow-up business-template library change: workflow suggestions should include regional resource coverage, city issue grid governance, and natural-resource compliance screening. If only one polygon asset is present, natural-resource compliance should remain partial rather than matching the same polygon as both project parcel and control boundary.
- Follow-up business-template prompt change: each workflow template should send its own step list. City issue grid governance should mention issue-type/status filtering and disposal priority, while natural-resource compliance should mention parcel/control-boundary measurement, attribute screening, and future polygon overlay follow-up rather than the regional resource coverage flow.
- Follow-up natural-resource analysis change: natural-resource compliance prompts should recommend `analysis_polygon_overlap_screen`. E2E data with one project parcel overlapping one control boundary should create one polygon analysis-result asset with `analysisType=polygon_overlap_screen`, `exactOverlay=false`, and `candidateTargetFeatureIndices=[0]`.
- Follow-up natural-resource handoff change: Markdown reports and deliverables manifests should summarize polygon overlap screens with source parcel ref, target boundary ref, suspected-conflict parcel count, candidate boundary hit count, `screenType`, and an explicit non-exact-overlay/manual-review caveat.
- Follow-up analysis-summary UI change: selecting a `polygon_overlap_screen` analysis asset in ScenePanel should show an `分析摘要` block with the same natural-resource summary fields, so operators can review suspected conflicts without exporting a report first.
- Follow-up polygon-overlap quick-action change: selecting a renderable polygon/mixed data asset in ScenePanel should show `合规初筛` targets for other renderable polygon/mixed assets. Clicking a target should call `analysis_polygon_overlap_screen`, refresh SceneState, and produce an `asset:<source-id>-overlap-<target-id>` analysis result.
- Follow-up polygon-overlap triage change: overlap-screen result features should include candidate parcel area and `overlapRiskLevel`, while result metadata should include `totalCandidateAreaSquareMeters` and `riskLevelCounts`. UI/report/manifest summaries should describe these as candidate parcel triage metrics, not exact occupied area.
- Follow-up conflict-list UI change: selecting a `polygon_overlap_screen` asset in ScenePanel should show a `冲突清单` list sorted by risk level and candidate parcel area, with each item showing parcel label, boundary hit count, target indices, and parcel area.
- Follow-up conflict-risk badge change: ScenePanel asset cards for `polygon_overlap_screen` results should show a compact `高 x / 中 x / 低 x` risk badge based on `riskLevelCounts` or feature-level `overlapRiskLevel`, with high-risk results visually emphasized and sorted ahead of lower-risk overlap results within the asset group.
- Follow-up deliverables-package change: ScenePanel now surfaces a `任务成果包` summary above the object list and exposes `导出清单`. The exported manifest should refresh the current scene snapshot and list scene JSON, Markdown report, GeoJSON assets, CSV point assets, counts, filename hints, and asset refs without bundling large payloads.
- Follow-up ZIP-package change: ScenePanel `任务成果包` now also exposes `导出 ZIP`. The ZIP should refresh the current scene snapshot and include `README.md`, `manifest.json`, `package/index.json`, `scene/scene.json`, `reports/analysis-report.md`, `data/*.geojson`, `analysis/*.geojson`, and `tables/*.csv` where point or property-table CSV is available. `package/index.json` should enumerate packaged file paths, MIME types, byte sizes, SHA-256 hashes, file count, and total bytes.
- Follow-up ZIP-import change: ScenePanel now exposes `导入 ZIP` for GaiaAgent deliverables packages. Import should read `scene/scene.json` from the package, restore registered `kind=asset` data/analysis assets, replay renderable scene objects when the bridge is ready, and preserve structured-only assets when map replay cannot redraw them.
- Follow-up ZIP-import diagnostics change: ZIP import should also parse `manifest.json` when present and include the package deliverable counts, GeoJSON count, and CSV count in the status text. Packages without a valid manifest may still import if `scene/scene.json` is valid.
- Follow-up ZIP-index diagnostics change: ZIP import should parse `package/index.json` when present and include package file count and total indexed bytes in status text. The importer should recompute indexed file byte sizes and SHA-256 hashes; matching packages report verification success, while modified or missing indexed files report verification anomalies.
- Follow-up export-quality change: export filename generation now lives in a tested `export-filenames` module shared by scene JSON, Markdown report, and asset GeoJSON downloads. Unit coverage should verify timestamp normalization, Windows-invalid character removal, fallback names, and generated extensions.
