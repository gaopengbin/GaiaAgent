# 自然资源合规初筛手工 E2E

更新日期：2026-07-04

本文记录 GaiaAgent 第一条 GIS 业务闭环的手工验收流程：导入项目地块与管控边界，执行自然资源合规初筛，人工复核疑似冲突，并导出成果包。

## 1. 样例数据

使用仓库内置样例：

- `tests/fixtures/natural-resource-compliance/project-parcels.geojson`
- `tests/fixtures/natural-resource-compliance/control-boundaries.geojson`

样例为 WGS84 GeoJSON 面数据：

- 项目地块：3 个。
- 管控边界：3 个。
- 预期疑似冲突地块：2 个。
- 预期无冲突地块：1 个。

## 2. 启动方式

开发态：

```powershell
npm run tauri:dev
```

发布产物 smoke：

```powershell
src-tauri/target/release/gaia-agent.exe
```

## 3. 验收步骤

### 3.1 导入项目地块

1. 打开 ScenePanel。
2. 点击导入 GeoJSON。
3. 选择 `tests/fixtures/natural-resource-compliance/project-parcels.geojson`。
4. 验证地图上出现项目地块图层。
5. 验证 ScenePanel 中出现项目地块资产卡。
6. 验证资产摘要显示：
   - geometry type 为 polygon 或 mixed。
   - feature count 为 3。
   - bbox 存在。

### 3.2 导入管控边界

1. 再次点击导入 GeoJSON。
2. 选择 `tests/fixtures/natural-resource-compliance/control-boundaries.geojson`。
3. 验证地图上出现管控边界图层。
4. 验证 ScenePanel 中出现管控边界资产卡。
5. 验证资产摘要显示 feature count 为 3。

### 3.3 启动自然资源合规初筛

任选一种方式：

方式 A：从业务模板启动。

1. 在 ChatPanel 输入区找到业务模板入口。
2. 选择自然资源合规初筛。
3. 确认模板 readiness 不再是缺数据状态。
4. 发送模板生成的任务提示。
5. 验证模型调用或建议调用 `analysis_polygon_overlap_screen`。

方式 B：从 ScenePanel 快捷操作启动。

1. 选中项目地块资产。
2. 在资产详情中找到合规初筛或类似快捷操作。
3. 选择管控边界资产作为目标边界。
4. 执行分析。

### 3.4 验证疑似冲突结果

分析完成后，应出现一个 `analysis-result` 资产，metadata 中应包含：

- `analysisType=polygon_overlap_screen`
- `sourceAssetRef` 指向项目地块。
- `targetAssetRef` 指向管控边界。
- `featureCount=2`
- `totalOverlapCandidates=3`
- `exactOverlay=false` 或等价的非精确叠加提示。

UI 预期：

- ScenePanel 出现疑似冲突清单。
- `P-001 城北生态停车场` 出现在清单中，候选边界数为 2，风险为 `medium`。
- `P-002 东侧物流配套` 出现在清单中，候选边界数为 1，风险为 `low`。
- `P-003 西侧配套绿地` 不出现在清单中。
- 点击清单条目后，地图能定位或高亮对应地块。
- 报告或摘要中保留“筛查结果需人工复核”的措辞。

### 3.5 人工复核

1. 将 `P-001` 标记为确认。
2. 将 `P-002` 标记为排除或待复核。
3. 验证复核统计更新。
4. 切换复核过滤器，确认待复核、已确认、已排除列表正确。
5. 验证复核状态写入结果 GeoJSON properties，例如：
   - `reviewStatus`
   - `reviewStatusLabel`
   - `reviewNote`

### 3.6 导出成果

1. 导出 Markdown 报告。
2. 导出分析结果 GeoJSON。
3. 导出 CSV 或属性表，如果当前 UI 提供。
4. 导出 ZIP 成果包。
5. 验证 ZIP 中至少包含：
   - `README.md`
   - `manifest.json`
   - `scene/scene.json`
   - Markdown 报告
   - 项目地块 GeoJSON
   - 管控边界 GeoJSON
   - 疑似冲突分析结果 GeoJSON

### 3.7 重新导入成果包

1. 新建或清空当前会话。
2. 导入上一步生成的 ZIP。
3. 验证 scene JSON 能恢复。
4. 验证项目地块、管控边界、分析结果资产仍存在。
5. 验证 manifest/index 校验信息可见。

## 4. 通过标准

本 E2E 通过需要同时满足：

- 两个样例 GeoJSON 均能导入并注册为空间资产。
- 自然资源合规初筛生成一个可渲染 `analysis-result` 资产。
- 疑似冲突数量为 2，候选边界总数为 3。
- `P-001` 和 `P-002` 命中，`P-003` 不命中。
- 冲突清单支持定位或高亮。
- 复核状态可以写回分析结果。
- Markdown 报告和 ZIP 成果包能够导出。
- ZIP 能重新导入并保留资产。

## 5. 已知限制

- 当前 `analysis_polygon_overlap_screen` 是筛查工具，不是精确 polygon overlay。
- 候选面积是项目地块自身面积，不是实际相交面积。
- 样例坐标均为 WGS84，经纬度范围较小；不能代表大数据性能。
- 后续需要增加坐标系转换、拓扑修复、精确相交面积和法规规则库。
