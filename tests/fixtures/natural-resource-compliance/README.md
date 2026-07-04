# 自然资源合规初筛 E2E 样例数据

这组数据用于验证 GaiaAgent 的 `natural-resource-compliance-screening` 业务模板和 `analysis_polygon_overlap_screen` 工具。

## 文件

- `project-parcels.geojson`：项目地块，共 3 个面要素。
- `control-boundaries.geojson`：管控边界，共 3 个面要素。

## 预期结果

执行项目地块对管控边界的疑似重叠/压占初筛后，预期：

- `P-001 城北生态停车场` 出现在冲突清单中，命中 2 个候选边界，风险应为 `medium`。
- `P-002 东侧物流配套` 出现在冲突清单中，命中 1 个候选边界，风险应为 `low`。
- `P-003 西侧配套绿地` 不应出现在冲突清单中。

注意：当前工具是筛查级能力，不计算精确相交面积。所有命中结果都应在报告和 UI 中保留“需人工复核”的措辞。
