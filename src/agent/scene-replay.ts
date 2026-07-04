import type { SceneState, SpatialAsset } from './types'

export interface SceneReplayCommand {
  method:
    | 'addGeoJsonLayer'
    | 'addMarker'
    | 'addPolyline'
    | 'addPolygon'
    | 'addModel'
    | 'addBillboard'
    | 'addBox'
    | 'addCylinder'
    | 'addEllipse'
    | 'addRectangle'
    | 'addWall'
    | 'addCorridor'
  params: Record<string, unknown>
  sourceRef: string
}

function numeric(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function positions(value: unknown): Array<[number, number, number?]> | undefined {
  if (!Array.isArray(value)) return undefined
  const parsed = value
    .map((entry): [number, number, number?] | null => {
      if (!Array.isArray(entry)) return null
      const lon = numeric(entry[0])
      const lat = numeric(entry[1])
      const height = numeric(entry[2])
      if (lon === undefined || lat === undefined) return null
      return height === undefined ? [lon, lat] : [lon, lat, height]
    })
    .filter((entry): entry is [number, number, number?] => entry !== null)
  return parsed.length > 0 ? parsed : undefined
}

function objectPositions(value: unknown) {
  return positions(value)?.map(([longitude, latitude, height]) => ({ longitude, latitude, height }))
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function materialFromRender(render: Record<string, unknown>) {
  return typeof render.color === 'string' ? render.color : undefined
}

function labelFor(asset: SpatialAsset) {
  return asset.name || asset.id
}

function baseEntityParams(asset: SpatialAsset) {
  const render = asset.render ?? {}
  const type = asset.type.trim().toLowerCase()
  return {
    id: asset.id,
    layerId: `${type}_${asset.id}`,
    label: labelFor(asset),
    name: labelFor(asset),
    color: typeof render.color === 'string' ? render.color : undefined,
    scale: numeric(render.scale),
    show: asset.visible !== false,
  }
}

function buildEntityReplayCommand(asset: SpatialAsset): SceneReplayCommand | null {
  const render = asset.render ?? {}
  const type = asset.type.trim().toLowerCase()

  if (['marker', 'point'].includes(type) && asset.position) {
    return {
      method: 'addMarker',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        size: numeric(render.pixelSize),
      },
    }
  }

  if (type === 'polyline') {
    const coordinates = positions(render.positions)
    if (!coordinates || coordinates.length < 2) return null
    return {
      method: 'addPolyline',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        coordinates,
        width: numeric(render.width),
        clampToGround: typeof render.clampToGround === 'boolean' ? render.clampToGround : undefined,
      },
    }
  }

  if (type === 'polygon') {
    const coordinates = positions(render.positions)
    if (!coordinates || coordinates.length < 3) return null
    return {
      method: 'addPolygon',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        coordinates,
        extrudedHeight: numeric(render.extrudedHeight),
      },
    }
  }

  if (type === 'model' && asset.position && typeof render.uri === 'string') {
    return {
      method: 'addModel',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        height: asset.position.height,
        url: render.uri,
      },
    }
  }

  if (type === 'billboard' && asset.position && typeof render.image === 'string') {
    return {
      method: 'addBillboard',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        height: asset.position.height,
        image: render.image,
      },
    }
  }

  if (type === 'box' && asset.position) {
    const dimensions = record(render.dimensions)
    const width = numeric(dimensions?.x ?? dimensions?.width)
    const length = numeric(dimensions?.y ?? dimensions?.length)
    const height = numeric(dimensions?.z ?? dimensions?.height)
    if (width === undefined || length === undefined || height === undefined) return null
    return {
      method: 'addBox',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        height: asset.position.height,
        dimensions: { width, length, height },
        material: materialFromRender(render),
      },
    }
  }

  if (type === 'cylinder' && asset.position) {
    const length = numeric(render.length)
    const topRadius = numeric(render.topRadius)
    const bottomRadius = numeric(render.bottomRadius)
    if (length === undefined || topRadius === undefined || bottomRadius === undefined) return null
    return {
      method: 'addCylinder',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        height: asset.position.height,
        length,
        topRadius,
        bottomRadius,
        material: materialFromRender(render),
      },
    }
  }

  if (type === 'ellipse' && asset.position) {
    const semiMajorAxis = numeric(render.semiMajorAxis)
    const semiMinorAxis = numeric(render.semiMinorAxis)
    if (semiMajorAxis === undefined || semiMinorAxis === undefined) return null
    return {
      method: 'addEllipse',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        longitude: asset.position.lon,
        latitude: asset.position.lat,
        height: asset.position.height,
        semiMajorAxis,
        semiMinorAxis,
        material: materialFromRender(render),
      },
    }
  }

  if (type === 'rectangle') {
    const coordinates = record(render.coordinates)
    const west = numeric(coordinates?.west)
    const south = numeric(coordinates?.south)
    const east = numeric(coordinates?.east)
    const north = numeric(coordinates?.north)
    if (west === undefined || south === undefined || east === undefined || north === undefined) {
      return null
    }
    return {
      method: 'addRectangle',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        west,
        south,
        east,
        north,
        material: materialFromRender(render),
      },
    }
  }

  if (type === 'wall') {
    const wallPositions = objectPositions(render.positions)
    if (!wallPositions || wallPositions.length < 2) return null
    return {
      method: 'addWall',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        positions: wallPositions,
        material: materialFromRender(render),
      },
    }
  }

  if (type === 'corridor') {
    const corridorPositions = objectPositions(render.positions)
    const width = numeric(render.width)
    if (!corridorPositions || corridorPositions.length < 2 || width === undefined) return null
    return {
      method: 'addCorridor',
      sourceRef: asset.ref,
      params: {
        ...baseEntityParams(asset),
        positions: corridorPositions,
        width,
        material: materialFromRender(render),
      },
    }
  }

  return null
}

function buildAssetReplayCommand(asset: SpatialAsset): SceneReplayCommand | null {
  const metadata = record(asset.metadata)
  if (metadata?.renderTool !== 'addGeoJsonLayer' || !metadata.renderData) return null
  const { reRenderedAt: _reRenderedAt, ...replayMetadata } = metadata
  return {
    method: 'addGeoJsonLayer',
    sourceRef: asset.ref,
    params: {
      id: asset.id,
      name: labelFor(asset),
      data: metadata.renderData,
      dataRefId: asset.uri ?? asset.dataRefId ?? asset.id,
      source: asset.source ?? 'import',
      locked: asset.locked ?? true,
      type: asset.type,
      uri: asset.uri ?? asset.dataRefId,
      crs: asset.crs,
      geometryType: asset.geometryType,
      featureCount: asset.featureCount,
      bbox: asset.bbox,
      schema: asset.schema,
      metadata: replayMetadata,
    },
  }
}

export function buildSceneReplayCommands(scene: SceneState): SceneReplayCommand[] {
  const assets = Object.values(scene.assets)
  return [
    ...assets
      .filter((asset) => asset.kind === 'asset')
      .map(buildAssetReplayCommand)
      .filter((command): command is SceneReplayCommand => command !== null),
    ...assets
      .filter((asset) => asset.kind === 'entity')
      .map(buildEntityReplayCommand)
      .filter((command): command is SceneReplayCommand => command !== null),
  ]
}
