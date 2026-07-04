function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function csvCell(value: unknown) {
  if (value === undefined || value === null) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function position(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null
  const lon = Number(value[0])
  const lat = Number(value[1])
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
}

function featureList(geojson: unknown) {
  if (!isRecord(geojson)) return []
  if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
    return geojson.features
  }
  if (geojson.type === 'Feature') return [geojson]
  if (
    geojson.type === 'Point' ||
    geojson.type === 'MultiPoint' ||
    geojson.type === 'LineString' ||
    geojson.type === 'MultiLineString' ||
    geojson.type === 'Polygon' ||
    geojson.type === 'MultiPolygon'
  ) {
    return [{ type: 'Feature', properties: {}, geometry: geojson }]
  }
  return []
}

function rowsToCsv(rows: Record<string, unknown>[], preferredTrailingFields: string[] = []) {
  if (rows.length === 0) return null

  const fields = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key)
      return set
    }, new Set<string>()),
  )
  const orderedFields = [
    ...fields.filter((field) => !preferredTrailingFields.includes(field)),
    ...preferredTrailingFields.filter((field) => fields.includes(field)),
  ]
  return [
    orderedFields.map(csvCell).join(','),
    ...rows.map((row) => orderedFields.map((field) => csvCell(row[field])).join(',')),
  ].join('\n')
}

export function pointGeoJsonToCsv(geojson: unknown) {
  const rows: Record<string, unknown>[] = []

  for (const feature of featureList(geojson)) {
    if (!isRecord(feature)) continue
    const geometry = feature.geometry
    if (!isRecord(geometry)) continue
    const properties = isRecord(feature.properties) ? feature.properties : {}
    if (geometry.type === 'Point') {
      const coordinate = position(geometry.coordinates)
      if (!coordinate) continue
      rows.push({ ...properties, lon: coordinate[0], lat: coordinate[1] })
    } else if (geometry.type === 'MultiPoint' && Array.isArray(geometry.coordinates)) {
      geometry.coordinates.forEach((item, index) => {
        const coordinate = position(item)
        if (!coordinate) return
        rows.push({ ...properties, pointIndex: index, lon: coordinate[0], lat: coordinate[1] })
      })
    }
  }

  return rowsToCsv(rows, ['lon', 'lat'])
}

export function geoJsonPropertiesToCsv(geojson: unknown) {
  const rows: Record<string, unknown>[] = []

  for (const [index, feature] of featureList(geojson).entries()) {
    if (!isRecord(feature)) continue
    const properties = isRecord(feature.properties) ? feature.properties : {}
    rows.push({ featureIndex: index, ...properties })
  }

  return rowsToCsv(rows)
}

export function geoJsonToCsv(geojson: unknown) {
  return pointGeoJsonToCsv(geojson) ?? geoJsonPropertiesToCsv(geojson)
}
