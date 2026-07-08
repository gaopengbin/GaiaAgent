import { useEffect, useRef } from 'react'

interface CesiumViewerProps {
  onBridgeReady: (bridge: unknown) => void
  ionToken?: string
  theme: 'light' | 'dark'
}

declare const Cesium: unknown
declare const CesiumMcpBridge: { CesiumBridge: new (viewer: unknown) => unknown }

type ViewerInstance = { destroy: () => void; isDestroyed: () => boolean }
type CesiumViewerInstance = ViewerInstance & {
  scene: {
    backgroundColor: unknown
    globe: { baseColor: unknown }
    skyBox?: { show?: boolean } | undefined
    skyAtmosphere?: { show?: boolean } | undefined
    sun?: { show?: boolean } | undefined
    moon?: { show?: boolean } | undefined
  }
  imageryLayers: { add: (l: unknown) => unknown; remove: (l: unknown, destroy?: boolean) => void }
  camera: { flyTo: (opts: Record<string, unknown>) => void }
}

const DEFAULT_ION_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkODBmYWNiMi1kOTRiLTRjZTEtOTI0ZC00MTE2OWU0NzRkNzAiLCJpZCI6NDQ0NDAsImlhdCI6MTc2MzMxMTQxNX0.5qbneXFnJvmLIf1Tbcf-SPZCEk7pNKEN_ltxD3eeRWk'

function mapTheme(theme: 'light' | 'dark') {
  if (theme === 'light') {
    return {
      background: '#eef2f7',
      base: '#d8e2ee',
      tiles: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    }
  }
  return {
    background: '#06080d',
    base: '#07101a',
    tiles: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  }
}

export function CesiumViewer({ onBridgeReady, ionToken, theme }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumViewerInstance | null>(null)
  const baseLayerRef = useRef<unknown>(null)
  const bridgeRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const C = Cesium as {
      Ion: { defaultAccessToken: string }
      Viewer: new (el: HTMLDivElement, opts: Record<string, unknown>) => unknown
      Color: { fromCssColorString: (s: string) => unknown }
      Cartesian3: { fromDegrees: (lon: number, lat: number, alt: number) => unknown }
      ImageryLayer: new (provider: unknown) => unknown
      UrlTemplateImageryProvider: new (opts: Record<string, unknown>) => unknown
    }
    C.Ion.defaultAccessToken = ionToken || DEFAULT_ION_TOKEN

    const el = containerRef.current
    // Tear down any leftover Cesium widget from a previous (StrictMode) mount
    while (el.firstChild) el.removeChild(el.firstChild)

    const viewer = new C.Viewer(el, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
    }) as CesiumViewerInstance

    viewerRef.current = viewer
    if (viewer.scene.skyBox) viewer.scene.skyBox.show = false
    if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = false
    if (viewer.scene.sun) viewer.scene.sun.show = false
    if (viewer.scene.moon) viewer.scene.moon.show = false
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(104, 35, 20_000_000),
      duration: 0,
    })

    try {
      const bridge = new CesiumMcpBridge.CesiumBridge(viewer) as {
        execute: (cmd: { action: string; params: Record<string, unknown> }) => Promise<unknown>
      }
      bridgeRef.current = bridge
      ;(window as unknown as Record<string, unknown>).__bridge = bridge
      console.log('[CesiumViewer] CesiumBridge initialized, window.__bridge set')
      onBridgeReady(bridge)
    } catch (err) {
      console.error('[CesiumViewer] CesiumBridge init failed:', err)
    }
    return () => {
      try {
        viewerRef.current = null
        baseLayerRef.current = null
        ;(viewer as unknown as ViewerInstance).destroy()
      } catch {
        /* ignore */
      }
    }
  }, [onBridgeReady, ionToken])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const C = Cesium as {
      Color: { fromCssColorString: (s: string) => unknown }
      ImageryLayer: new (provider: unknown) => unknown
      UrlTemplateImageryProvider: new (opts: Record<string, unknown>) => unknown
    }
    const mapStyle = mapTheme(theme)
    viewer.scene.backgroundColor = C.Color.fromCssColorString(mapStyle.background)
    viewer.scene.globe.baseColor = C.Color.fromCssColorString(mapStyle.base)
    if (baseLayerRef.current) {
      viewer.imageryLayers.remove(baseLayerRef.current, true)
      baseLayerRef.current = null
    }
    baseLayerRef.current = viewer.imageryLayers.add(
      new C.ImageryLayer(
        new C.UrlTemplateImageryProvider({
          url: mapStyle.tiles,
          maximumLevel: 18,
        }),
      ),
    )
  }, [theme, ionToken])

  return <div ref={containerRef} className="h-full w-full" />
}
