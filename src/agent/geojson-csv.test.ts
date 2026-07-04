import { describe, expect, it } from 'vitest'
import { geoJsonPropertiesToCsv, geoJsonToCsv, pointGeoJsonToCsv } from './geojson-csv'

describe('geojson csv export', () => {
  it('exports point feature properties with lon and lat columns', () => {
    const csv = pointGeoJsonToCsv({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { name: 'School A', district: 'North' },
          geometry: { type: 'Point', coordinates: [116.1, 39.7] },
        },
        {
          type: 'Feature',
          properties: { name: 'School, B', note: 'quoted "text"' },
          geometry: { type: 'Point', coordinates: [116.2, 39.8] },
        },
      ],
    })

    expect(csv).toBe(
      [
        'name,district,note,lon,lat',
        'School A,North,,116.1,39.7',
        '"School, B",,"quoted ""text""",116.2,39.8',
      ].join('\n'),
    )
  })

  it('exports multipoint geometry with point indexes', () => {
    const csv = pointGeoJsonToCsv({
      type: 'Feature',
      properties: { route: 'A' },
      geometry: {
        type: 'MultiPoint',
        coordinates: [
          [116.1, 39.7],
          [116.2, 39.8],
        ],
      },
    })

    expect(csv).toBe(['route,pointIndex,lon,lat', 'A,0,116.1,39.7', 'A,1,116.2,39.8'].join('\n'))
  })

  it('returns null for non-point GeoJSON', () => {
    expect(
      pointGeoJsonToCsv({
        type: 'Feature',
        properties: { name: 'Area' },
        geometry: { type: 'Polygon', coordinates: [] },
      }),
    ).toBeNull()
  })

  it('exports non-point feature properties as a review table', () => {
    const csv = geoJsonPropertiesToCsv({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            name: 'Parcel A',
            overlapRiskLevel: 'high',
            candidateTargetFeatureIndices: [0, 2],
          },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
    })

    expect(csv).toBe(
      [
        'featureIndex,name,overlapRiskLevel,candidateTargetFeatureIndices',
        '0,Parcel A,high,"[0,2]"',
      ].join('\n'),
    )
  })

  it('falls back to property-table CSV for non-point GeoJSON', () => {
    expect(
      geoJsonToCsv({
        type: 'Feature',
        properties: { name: 'Area' },
        geometry: { type: 'Polygon', coordinates: [] },
      }),
    ).toBe(['featureIndex,name', '0,Area'].join('\n'))
  })
})
