import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const src = resolve(
  root,
  'node_modules',
  'cesium-mcp-bridge',
  'dist',
  'cesium-mcp-bridge.browser.global.js',
)
const dest = resolve(root, 'public', 'cesium-mcp-bridge.browser.global.js')

if (!existsSync(src)) {
  console.warn('[update-bridge] cesium-mcp-bridge not installed, skipping')
  process.exit(0)
}

copyFileSync(src, dest)

function replaceOnce(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`[update-bridge] unable to apply bridge patch: ${label}`)
  }
  return source.replace(before, after)
}

function replaceOnceOrAlready(source, before, after, label, already) {
  if (source.includes(before)) {
    return source.replace(before, after)
  }
  const alreadyApplied =
    typeof already === 'string'
      ? source.includes(already)
      : Array.isArray(already)
        ? already.every((snippet) => source.includes(snippet))
        : false
  if (alreadyApplied) return source
  throw new Error(`[update-bridge] unable to apply bridge patch: ${label}`)
}

function patchBridge(source) {
  let patched = source.replace(/\r\n/g, '\n')

  patched = replaceOnceOrAlready(
    patched,
    `  function setView(viewer, params) {
    const { longitude, latitude, height = 5e4, heading = 0, pitch = -45 } = params;
    validateCoordinate(longitude, latitude, height);
    const target = Cesium2.Cartesian3.fromDegrees(longitude, latitude, 0);
    const range = _heightToRange(height, pitch);`,
    `  function setView(viewer, params) {
    const { longitude, latitude, height = 5e4, heading = 0, pitch = -45, roll = 0, absolute = false } = params;
    validateCoordinate(longitude, latitude, height);
    if (absolute) {
      viewer.camera.setView({
        destination: Cesium2.Cartesian3.fromDegrees(longitude, latitude, height),
        orientation: {
          heading: Cesium2.Math.toRadians(heading),
          pitch: Cesium2.Math.toRadians(pitch),
          roll: Cesium2.Math.toRadians(roll)
        }
      });
      return;
    }
    const target = Cesium2.Cartesian3.fromDegrees(longitude, latitude, 0);
    const range = _heightToRange(height, pitch);`,
    'setView absolute camera restore',
    `absolute = false`,
  )

  patched = replaceOnce(
    patched,
    `  function addMarker(viewer, params) {
    const { longitude, latitude, label, color = "#3B82F6", size = 12 } = params;
    validateCoordinate(longitude, latitude);
    const cesiumColor = parseColor(color);
    return viewer.entities.add({
      position: Cesium4.Cartesian3.fromDegrees(longitude, latitude),`,
    `  function addMarker(viewer, params) {
    const { id, longitude, latitude, label, color = "#3B82F6", size = 12, show = true } = params;
    validateCoordinate(longitude, latitude);
    const cesiumColor = parseColor(color);
    return viewer.entities.add({
      id,
      show,
      position: Cesium4.Cartesian3.fromDegrees(longitude, latitude),`,
    'addMarker id/show',
  )

  patched = replaceOnce(
    patched,
    `  function addPolyline(viewer, params) {
    const { coordinates, color = "#3B82F6", width = 3, clampToGround = true, label } = params;
    const cesiumColor = parseColor(color);`,
    `  function addPolyline(viewer, params) {
    const { id, coordinates, color = "#3B82F6", width = 3, clampToGround = true, label, show = true } = params;
    const cesiumColor = parseColor(color);`,
    'addPolyline destructure id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      position: label ? positions[midIdx] : void 0,
      polyline: {`,
    `    return viewer.entities.add({
      id,
      show,
      position: label ? positions[midIdx] : void 0,
      polyline: {`,
    'addPolyline entity id/show',
  )

  patched = replaceOnce(
    patched,
    `  function addPolygon(viewer, params) {
    const { coordinates, color = "#3B82F6", outlineColor = "#FFFFFF", opacity = 0.6, extrudedHeight, clampToGround = true, label } = params;`,
    `  function addPolygon(viewer, params) {
    const { id, coordinates, color = "#3B82F6", outlineColor = "#FFFFFF", opacity = 0.6, extrudedHeight, clampToGround = true, label, show = true } = params;`,
    'addPolygon destructure id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      position: label && centroid ? Cesium4.Cartesian3.fromDegrees(centroid[0], centroid[1]) : void 0,
      polygon: {`,
    `    return viewer.entities.add({
      id,
      show,
      position: label && centroid ? Cesium4.Cartesian3.fromDegrees(centroid[0], centroid[1]) : void 0,
      polygon: {`,
    'addPolygon entity id/show',
  )

  patched = replaceOnce(
    patched,
    `  function addModel(viewer, params) {
    const { longitude, latitude, height = 0, url, scale = 1, heading = 0, pitch = 0, roll = 0, label } = params;`,
    `  function addModel(viewer, params) {
    const { id, longitude, latitude, height = 0, url, scale = 1, heading = 0, pitch = 0, roll = 0, label, show = true } = params;`,
    'addModel destructure id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      position,
      orientation,`,
    `    return viewer.entities.add({
      id,
      show,
      position,
      orientation,`,
    'addModel entity id/show',
  )

  patched = replaceOnce(
    patched,
    `        const bb = entity.billboard;
        props.width = tryGetValue(bb.width);`,
    `        const bb = entity.billboard;
        props.image = tryGetValue(bb.image);
        props.width = tryGetValue(bb.width);`,
    'billboard image export',
  )

  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      name: params.name,
      position,
      billboard: {`,
    `    return viewer.entities.add({
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      position,
      billboard: {`,
    'addBillboard id/show',
  )
  patched = replaceOnce(
    patched,
    `    const opts = {
      name: params.name,
      position,
      box: {`,
    `    const opts = {
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      position,
      box: {`,
    'addBox id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      name: params.name,
      corridor: {`,
    `    return viewer.entities.add({
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      corridor: {`,
    'addCorridor id/show',
  )
  patched = replaceOnce(
    patched,
    `    const opts = {
      name: params.name,
      position,
      cylinder: {`,
    `    const opts = {
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      position,
      cylinder: {`,
    'addCylinder id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      name: params.name,
      position,
      ellipse: {`,
    `    return viewer.entities.add({
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      position,
      ellipse: {`,
    'addEllipse id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      name: params.name,
      rectangle: {`,
    `    return viewer.entities.add({
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      rectangle: {`,
    'addRectangle id/show',
  )
  patched = replaceOnce(
    patched,
    `    return viewer.entities.add({
      name: params.name,
      wall: {`,
    `    return viewer.entities.add({
      id: params.id,
      show: params.show ?? true,
      name: params.name,
      wall: {`,
    'addWall id/show',
  )

  patched = replaceOnceOrAlready(
    patched,
    `    addMarker(params) {
      const entity = addMarker(this._viewer, params);
      const layerId = \`marker_\${Date.now()}\`;`,
    `    addMarker(params) {
      const layerId = params.layerId ?? (params.id ? \`marker_\${params.id}\` : \`marker_\${Date.now()}\`);
      this.removeLayer(layerId);
      const entity = addMarker(this._viewer, params);`,
    'addMarker stable layer',
    `      const layerId = \`marker_\${entity.id}\`;`,
  )
  patched = replaceOnceOrAlready(
    patched,
    `    addPolyline(params) {
      const entity = addPolyline(this._viewer, params);
      const layerId = \`polyline_\${Date.now()}\`;`,
    `    addPolyline(params) {
      const layerId = params.layerId ?? (params.id ? \`polyline_\${params.id}\` : \`polyline_\${Date.now()}\`);
      this.removeLayer(layerId);
      const entity = addPolyline(this._viewer, params);`,
    'addPolyline stable layer',
    `      const layerId = \`polyline_\${entity.id}\`;`,
  )
  patched = replaceOnceOrAlready(
    patched,
    `    addPolygon(params) {
      const entity = addPolygon(this._viewer, params);
      const layerId = \`polygon_\${Date.now()}\`;`,
    `    addPolygon(params) {
      const layerId = params.layerId ?? (params.id ? \`polygon_\${params.id}\` : \`polygon_\${Date.now()}\`);
      this.removeLayer(layerId);
      const entity = addPolygon(this._viewer, params);`,
    'addPolygon stable layer',
    `      const layerId = \`polygon_\${entity.id}\`;`,
  )
  patched = replaceOnceOrAlready(
    patched,
    `    addModel(params) {
      const entity = addModel(this._viewer, params);
      const layerId = \`model_\${Date.now()}\`;`,
    `    addModel(params) {
      const layerId = params.layerId ?? (params.id ? \`model_\${params.id}\` : \`model_\${Date.now()}\`);
      this.removeLayer(layerId);
      const entity = addModel(this._viewer, params);`,
    'addModel stable layer',
    `      const layerId = \`model_\${entity.id}\`;`,
  )

  patched = replaceOnceOrAlready(
    patched,
    `    _registerEntityLayer(entity, type, name, color) {
      const layerId = \`\${type}_\${Date.now()}\`;`,
    `    _registerEntityLayer(entity, type, name, color, layerIdHint) {
      const layerId = layerIdHint ?? (entity.id ? \`\${type}_\${entity.id}\` : \`\${type}_\${Date.now()}\`);`,
    'register entity stable layer',
    `      const layerId = \`\${type}_\${entity.id}\`;`,
  )

  const entityWrappers = [
    ['addBillboard', 'billboard'],
    ['addBox', 'box'],
    ['addCorridor', 'corridor'],
    ['addCylinder', 'cylinder'],
    ['addEllipse', 'ellipse'],
    ['addRectangle', 'rectangle'],
    ['addWall', 'wall'],
  ]
  for (const [method, type] of entityWrappers) {
    patched = replaceOnce(
      patched,
      `    ${method}(params) {
      return this._registerEntityLayer(${method}(this._viewer, params), "${type}", params.name);
    }`,
      `    ${method}(params) {
      const layerId = params.layerId ?? (params.id ? \`${type}_\${params.id}\` : \`${type}_\${Date.now()}\`);
      this.removeLayer(layerId);
      return this._registerEntityLayer(${method}(this._viewer, params), "${type}", params.name, void 0, layerId);
    }`,
      `${method} stable layer`,
    )
  }

  patched = replaceOnceOrAlready(
    patched,
    `    results.push({
      entityId: entity.id,
      name: name ? String(name) : void 0,
      type,
      position
    });`,
    `    results.push({
      entityId: entity.id,
      name: name ? String(name) : void 0,
      type,
      visible: entity.show !== false,
      position
    });`,
    'queryEntities visible',
    `      visible: entity.show !== false,`,
  )

  patched = replaceOnceOrAlready(
    patched,
    `    return {
      entityId: entity.id,
      name: entity.name ?? void 0,
      type,
      position,
      properties,
      graphicProperties,
      description
    };`,
    `    return {
      entityId: entity.id,
      name: entity.name ?? void 0,
      type,
      visible: entity.show !== false,
      position,
      properties,
      graphicProperties,
      description
    };`,
    'getEntityProperties visible',
    `      visible: entity.show !== false,`,
  )

  patched = replaceOnceOrAlready(
    patched,
    `    exportScene() {
      return {
        view: this.getView(),
        layers: this.listLayers(),
        entities: this.queryEntities({}),
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    }`,
    `    exportScene() {
      const entities = this.queryEntities({}).map((entity) => {
        try {
          const details = this.getEntityProperties({ entityId: entity.entityId });
          return {
            ...entity,
            name: entity.name ?? details.name,
            visible: entity.visible ?? details.visible,
            position: entity.position ?? details.position,
            graphicProperties: details.graphicProperties,
            properties: details.properties,
            description: details.description
          };
        } catch {
          return entity;
        }
      });
      return {
        view: this.getView(),
        layers: this.listLayers(),
        entities,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    }`,
    'exportScene entity details',
    [
      `      const entities = this.queryEntities({}).map((entity) => {`,
      `            graphicProperties: details.graphicProperties,`,
    ],
  )

  return patched
}

const patched = patchBridge(readFileSync(dest, 'utf8'))
writeFileSync(dest, patched, 'utf8')

console.log(
  '[update-bridge] cesium-mcp-bridge.browser.global.js updated with GaiaAgent replay patches',
)
