import { useEffect, useRef } from 'react'

interface CesiumViewerProps {
  onBridgeReady: (bridge: unknown) => void
  ionToken?: string
}

declare const Cesium: unknown
declare const CesiumMcpBridge: { CesiumBridge: new (viewer: unknown) => unknown }

type ViewerInstance = { destroy: () => void; isDestroyed: () => boolean }

const DEFAULT_ION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkODBmYWNiMi1kOTRiLTRjZTEtOTI0ZC00MTE2OWU0NzRkNzAiLCJpZCI6NDQ0NDAsImlhdCI6MTc2MzMxMTQxNX0.5qbneXFnJvmLIf1Tbcf-SPZCEk7pNKEN_ltxD3eeRWk'

export function CesiumViewer({ onBridgeReady, ionToken }: CesiumViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
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
    }) as {
      scene: { backgroundColor: unknown; globe: { baseColor: unknown } }
      imageryLayers: { add: (l: unknown) => void }
      camera: { flyTo: (opts: Record<string, unknown>) => void }
    }

    viewer.scene.backgroundColor = C.Color.fromCssColorString('#0a0e17')
    viewer.scene.globe.baseColor = C.Color.fromCssColorString('#0a0e17')
    viewer.imageryLayers.add(
      new C.ImageryLayer(
        new C.UrlTemplateImageryProvider({
          url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          maximumLevel: 18,
        })
      )
    )
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
      try { (viewer as unknown as ViewerInstance).destroy() } catch { /* ignore */ }
    }
  }, [onBridgeReady])

  return (
    <div ref={containerRef} className="h-full w-full" />
  )
}
