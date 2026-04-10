import type { ToolSchema } from './types'

// ── Bridge tool categories (aligned with cesium-mcp-runtime toolset names) ──

/**
 * Static fallback: tool name → bridge toolset.
 * Used when _meta.toolset is absent (runtime < 1.139.18).
 * Names MUST match bridge-native toolset identifiers exactly.
 */
const BRIDGE_TOOL_CATEGORIES: Record<string, string> = {
  // view (8)
  flyTo: 'view', setView: 'view', getView: 'view', zoomToExtent: 'view',
  saveViewpoint: 'view', loadViewpoint: 'view', listViewpoints: 'view', exportScene: 'view',
  // entity (10)
  addMarker: 'entity', addPolyline: 'entity', addPolygon: 'entity',
  addModel: 'entity', addLabel: 'entity',
  updateEntity: 'entity', removeEntity: 'entity', batchAddEntities: 'entity',
  queryEntities: 'entity', getEntityProperties: 'entity',
  // layer (8)
  addGeoJsonLayer: 'layer', removeLayer: 'layer', setLayerVisibility: 'layer',
  listLayers: 'layer', getLayerSchema: 'layer', updateLayerStyle: 'layer',
  setBasemap: 'layer', clearAll: 'layer',
  // interaction (3)
  screenshot: 'interaction', highlight: 'interaction', measure: 'interaction',
  // camera (4)
  lookAtTransform: 'camera', startOrbit: 'camera', stopOrbit: 'camera', setCameraOptions: 'camera',
  // entity-ext (7)
  addBillboard: 'entity-ext', addBox: 'entity-ext', addCorridor: 'entity-ext',
  addCylinder: 'entity-ext', addEllipse: 'entity-ext', addRectangle: 'entity-ext', addWall: 'entity-ext',
  // animation (8)
  createAnimation: 'animation', controlAnimation: 'animation', removeAnimation: 'animation',
  listAnimations: 'animation', updateAnimationPath: 'animation', trackEntity: 'animation', controlClock: 'animation',
  // scene (3)
  setGlobeLighting: 'scene', setSceneOptions: 'scene', setPostProcess: 'scene',
  // tiles (5)
  load3dTiles: 'tiles', loadTerrain: 'tiles', loadImageryService: 'tiles', loadCzml: 'tiles', loadKml: 'tiles',
  // trajectory (1)
  playTrajectory: 'trajectory',
  // heatmap (1)
  addHeatmap: 'heatmap',
  // geolocation (1)
  geocode: 'geolocation',
  // misc
  setIonToken: 'scene',
}

/** Query keyword → bridge toolset names to include */
const CATEGORY_TRIGGERS: [RegExp, string[]][] = [
  [/飞|去|到|看|位置|定位|跳|缩放|zoom|fly|view|经纬|坐标|视角|书签|viewpoint/, ['view']],
  [/环绕|orbit|camera|相机/, ['camera']],
  [/底图|切换|basemap|卫星|暗色|亮色|天地图|高德|OSM|arcgis/, ['layer']],
  [/图层|GeoJSON|geojson|WMS|WMTS|移除图层|样式/, ['layer']],
  [/3D\s*Tiles|tileset|建筑|白膜|地形|高程|terrain|KML|CZML|影像服务|瓦片/, ['tiles']],
  [/标记|标注|点|线|面|多边形|图标|模型|实体|marker|polygon|polyline|entity|label/, ['entity']],
  [/广告牌|盒子|墙|走廊|圆柱|椭圆|矩形|billboard|box|wall|corridor|cylinder/, ['entity-ext', 'entity']],
  [/动画|播放|运动|animation/, ['animation']],
  [/轨迹|trajectory/, ['trajectory', 'animation']],
  [/时钟|时间|clock/, ['animation']],
  [/量测|测量|距离|面积|截图|高亮|screenshot|measure|highlight/, ['interaction']],
  [/热力|heatmap/, ['heatmap']],
  [/地理编码|geocode|地址/, ['geolocation']],
  [/光照|阴影|大气|雾|后处理|泛光|SSAO|环境|scene/, ['scene']],
  [/清除|导出/, ['layer', 'view']],
  [/加载|数据|地图/, ['layer', 'tiles']],
]

/** Tools always included regardless of query (commonly needed utilities) */
const ALWAYS_INCLUDE = new Set(['geocode', 'getView', 'clearAll'])

/** Keyword → tool name/description patterns for MCP tool inclusion */
const MCP_TRIGGERS: [RegExp, RegExp][] = [
  [/路线|导航|路径|驾车|步行|骑行|route|direction|driving|walking|cycling/, /route|direction|driving|walking|riding|navigation/i],
  [/搜索|查找|查询|找|周边|附近|search|poi|nearby/, /search|query|poi|nearby|around/i],
  [/地址|编码|逆编码|geocod/, /geocod|address|regeo/i],
  [/天气|weather/, /weather/i],
  [/行政区|district|boundary/, /district|boundary|admin/i],
  [/交通|路况|traffic/, /traffic/i],
  [/地图|maps/, /maps/i],
]

/**
 * Select tools relevant to the user query.
 * - Bridge tools: filter by category based on query keywords
 * - MCP tools: filter by keyword triggers
 * - Fallback: include all if no keywords matched
 */
export function selectToolsForQuery(
  query: string,
  allTools: ToolSchema[],
  mcpToolNames: Set<string>,
): ToolSchema[] {
  // Separate bridge vs MCP
  const bridgeTools = allTools.filter(t => !mcpToolNames.has(t.name))
  const mcpTools = allTools.filter(t => mcpToolNames.has(t.name))

  // --- Bridge tool filtering by category ---
  const matchedCategories = new Set<string>()
  for (const [pattern, cats] of CATEGORY_TRIGGERS) {
    if (pattern.test(query)) {
      for (const c of cats) matchedCategories.add(c)
    }
  }

  let selectedBridge: ToolSchema[]
  if (matchedCategories.size === 0) {
    // No category matched → include all bridge tools
    selectedBridge = bridgeTools
  } else {
    selectedBridge = bridgeTools.filter(t => {
      if (ALWAYS_INCLUDE.has(t.name)) return true
      // Prefer dynamic _meta.toolset from bridge; fallback to static map
      const toolset = t._meta?.toolset ?? BRIDGE_TOOL_CATEGORIES[t.name]
      return toolset != null && matchedCategories.has(toolset)
    })
  }

  // --- MCP tool filtering by keyword ---
  let selectedMcp: ToolSchema[] = []
  if (mcpTools.length > 0) {
    for (const [queryPattern, toolPattern] of MCP_TRIGGERS) {
      if (queryPattern.test(query)) {
        for (const t of mcpTools) {
          if ((toolPattern.test(t.name) || toolPattern.test(t.description)) && !selectedMcp.includes(t)) {
            selectedMcp.push(t)
          }
        }
      }
    }
    // Include MCP tools mentioned by name
    for (const t of mcpTools) {
      if (query.toLowerCase().includes(t.name.toLowerCase()) && !selectedMcp.includes(t)) {
        selectedMcp.push(t)
      }
    }
    // Fallback: include all MCP if no keyword matched
    if (selectedMcp.length === 0) selectedMcp = mcpTools
  }

  const result = [...selectedBridge, ...selectedMcp]
  const cats = matchedCategories.size > 0 ? [...matchedCategories].join(',') : 'all'
  console.log(`[GaiaAgent] Tool filter: ${selectedBridge.length}/${bridgeTools.length} bridge [${cats}] + ${selectedMcp.length}/${mcpTools.length} MCP = ${result.length} tools`)
  return result
}

export const SYSTEM_PROMPT = `You are GaiaAgent, a professional 3D geospatial AI assistant controlling a CesiumJS globe.

## Planning Mode
You receive a user request and produce a JSON execution plan.
The plan will be executed step-by-step automatically — you will NOT see intermediate results.
Therefore, each step must be self-contained with explicit parameters (coordinates, IDs, etc.).

## Output Format
Respond ONLY with a JSON object — no markdown, no code fences, no prose:
{
  "goal": "<one-line description>",
  "steps": [
    {
      "tool": "<exact tool name from the list>",
      "params": { <flat key-value pairs matching the tool schema> },
      "description": "<what this step does>"
    }
  ]
}
Rules:
- Use ONLY exact tool names from the list below (case-sensitive: "flyTo" not "fly_to").
- params must be a flat object — no nested objects.
- If the task needs a single tool call, use exactly 1 step.
- Respond in the same language as the user's request.

## Conversational Responses
If the user sends a greeting, asks a general question, or makes any request that does NOT need a tool:
{
  "goal": "<one-line description>",
  "reply": "<your natural language response>",
  "steps": []
}
Do NOT invent unnecessary tool calls to appear helpful — only use tools when genuinely needed.

## GIS Domain Knowledge

### Coordinate System
- All coordinates: WGS84 (EPSG:4326), [longitude, latitude] order.
- Default distance unit: meters. Default height unit: meters above ground.

### Camera Heights (reference)
- City overview: 10000-50000m
- District level: 2000-5000m
- Street level: 200-800m
- Building close-up: 50-200m

### Common Workflows

1. **Navigate to a location**: flyTo with known lat/lon/height.
2. **Add a marker/label**: addMarker or addLabel with lat/lon + text.
3. **Load GeoJSON data**: addGeoJsonLayer with URL or inline data.
4. **3D model/tileset**: load3dTiles with URL, or with assetId for Cesium Ion assets.
5. **Measure distance**: measure with type="distance".
6. **Change basemap**: setBasemap with provider name.
7. **Adjust lighting/time**: setGlobeLighting or controlClock.

### Context Reuse (Critical)
Before planning, check conversation history and scene state for reusable data:
- If camera is already at a location, don't flyTo the same place again.
- If a layer is already on the map, reference its ID for removal/update instead of re-adding.
- Use coordinates from scene state (camera position) when the user says "here" or "current location".
- When user says "lower/higher", adjust the current camera height proportionally.

### Plan Examples

User: "飞到故宫"
{
  "goal": "飞到故宫",
  "steps": [
    {"tool": "flyTo", "params": {"latitude": 39.9163, "longitude": 116.3972, "height": 2000}, "description": "飞到故宫上空"}
  ]
}

User: "降低高度" (scene state: Camera at lat=39.92, lon=116.40, height=2000m)
{
  "goal": "降低相机高度",
  "steps": [
    {"tool": "setView", "params": {"latitude": 39.92, "longitude": 116.40, "height": 500}, "description": "将相机高度从2000m降至500m"}
  ]
}

User: "在天安门添加一个标注"
{
  "goal": "在天安门添加标注",
  "steps": [
    {"tool": "addLabel", "params": {"text": "天安门", "latitude": 39.9087, "longitude": 116.3975}, "description": "在天安门位置添加文字标注"}
  ]
}

User: "清除所有图层然后切换到卫星底图"
{
  "goal": "清除图层并切换卫星底图",
  "steps": [
    {"tool": "clearAll", "params": {}, "description": "清除所有实体和图层"},
    {"tool": "setBasemap", "params": {"provider": "satellite"}, "description": "切换到卫星影像底图"}
  ]
}
`

export function formatToolSchemas(tools: ToolSchema[]): string {
  if (tools.length === 0) return ''
  const lines: string[] = ['\n## Available Tools']
  for (const t of tools) {
    const props = t.inputSchema?.properties ?? {}
    const required = new Set(t.inputSchema?.required ?? [])
    const params = Object.entries(props).map(([k, v]) => {
      const req = required.has(k)
      const enumVals = (v as { enum?: string[] }).enum
      const typeStr = enumVals ? enumVals.map((e: string) => `"${e}"`).join('|') : (v.type ?? 'any')
      return `${k}${req ? '' : '?'}: ${typeStr}`
    }).join(', ')
    lines.push(`- ${t.name}(${params}) — ${t.description}`)
    // Add parameter descriptions when they provide extra context
    for (const [k, v] of Object.entries(props)) {
      const desc = (v as { description?: string }).description
      if (desc) lines.push(`    ${k}: ${desc}`)
    }
  }
  return lines.join('\n')
}
