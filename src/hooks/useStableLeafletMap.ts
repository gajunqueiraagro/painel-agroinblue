import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';

/* ── Global patch: prevent _leaflet_pos crashes ── */
const domUtilAny = L.DomUtil as any;
if (!domUtilAny.__lovableViewportPatched) {
  const originalGetPosition = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: any) {
    if (!el) return L.point(0, 0);
    if (el._leaflet_pos === undefined) {
      el._leaflet_pos = L.point(0, 0);
    }
    try {
      return originalGetPosition.call(this, el) || el._leaflet_pos;
    } catch {
      return el._leaflet_pos;
    }
  };
  domUtilAny.__lovableViewportPatched = true;
}

type MapStatus = 'waiting_container' | 'ready' | 'error';

interface DebugInfo {
  containerFound: boolean;
  width: number;
  height: number;
  mapInitialized: boolean;
  renderedGeometries: number;
  errorMessage: string | null;
}

interface Options {
  debugName: string;
  center?: L.LatLngExpression;
  zoom?: number;
  labelZoomThreshold?: number;
}

export function useStableLeafletMap({
  debugName,
  center = [-15.8, -47.9],
  zoom = 5,
  labelZoomThreshold = 14,
}: Options) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const featureLayerRef = useRef<L.LayerGroup | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);

  const [status, setStatus] = useState<MapStatus>('waiting_container');
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    containerFound: false,
    width: 0,
    height: 0,
    mapInitialized: false,
    renderedGeometries: 0,
    errorMessage: null,
  });

  /* ── Stable config in refs (never triggers effect re-run) ── */
  const configRef = useRef({ center, zoom, labelZoomThreshold, debugName });
  configRef.current = { center, zoom, labelZoomThreshold, debugName };

  const reportRenderedGeometries = useCallback((count: number) => {
    setDebugInfo((c) => (c.renderedGeometries === count ? c : { ...c, renderedGeometries: count }));
  }, []);

  /* ── Single stable effect: create map once, destroy on real unmount ── */
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el) return;

    let destroyed = false;
    let retryTimer: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const { center: initCenter, zoom: initZoom, labelZoomThreshold: threshold, debugName: name } = configRef.current;

    const fixPanePos = (map: L.Map) => {
      const m = map as any;
      if (m._mapPane && m._mapPane._leaflet_pos === undefined) {
        m._mapPane._leaflet_pos = L.point(0, 0);
      }
      (['tilePane', 'overlayPane', 'shadowPane', 'markerPane', 'tooltipPane', 'popupPane'] as const).forEach((p) => {
        const pane = map.getPane(p) as any;
        if (pane && pane._leaflet_pos === undefined) {
          pane._leaflet_pos = L.point(0, 0);
        }
      });
    };

    const tryInit = () => {
      if (destroyed) return;

      const rect = el.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);

      setDebugInfo((c) => ({ ...c, containerFound: true, width: w, height: h }));

      if (w < 32 || h < 32) {
        setStatus('waiting_container');
        retryTimer = window.setTimeout(tryInit, 200);
        return;
      }

      // Already initialized — just invalidateSize
      if (mapInstanceRef.current) {
        const existing = mapInstanceRef.current;
        if (existing.getContainer() === el) {
          // reuse existing instance
          fixPanePos(existing);
          existing.invalidateSize(false);
          setStatus('ready');
          return;
        }
        // Container changed — destroy old
        console.warn('[MAP LIFECYCLE]', 'container-changed-destroy', { debugName: name });
        existing.remove();
        mapInstanceRef.current = null;
        featureLayerRef.current = null;
        labelLayerRef.current = null;
      }

      try {
        const map = L.map(el, {
          center: initCenter,
          zoom: initZoom,
          zoomControl: false,
          preferCanvas: false,
        });

        fixPanePos(map);

        console.warn('[MAP LIFECYCLE]', 'create', {
          debugName: name,
          mapId: L.Util.stamp(map),
          containerSize: { w, h },
        });

        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        const featureLayer = L.layerGroup().addTo(map);
        const labelLayer = L.layerGroup().addTo(map);

        const syncLabelVisibility = () => {
          if (!mapInstanceRef.current || !labelLayerRef.current) return;
          const curZoom = mapInstanceRef.current.getZoom();
          const hasLabel = mapInstanceRef.current.hasLayer(labelLayerRef.current);
          if (curZoom >= threshold && !hasLabel) {
            mapInstanceRef.current.addLayer(labelLayerRef.current);
          } else if (curZoom < threshold && hasLabel) {
            mapInstanceRef.current.removeLayer(labelLayerRef.current);
          }
        };
        map.on('zoomend', syncLabelVisibility);

        mapInstanceRef.current = map;
        featureLayerRef.current = featureLayer;
        labelLayerRef.current = labelLayer;

        syncLabelVisibility();
        setDebugInfo((c) => ({ ...c, mapInitialized: true, errorMessage: null }));
        setStatus('ready');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro desconhecido';
        console.error(`[${name}] Falha ao inicializar mapa`, error);
        setStatus('error');
        setDebugInfo((c) => ({ ...c, mapInitialized: false, errorMessage: msg }));
      }
    };

    tryInit();

    // ResizeObserver for layout changes
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (destroyed) return;
        const map = mapInstanceRef.current;
        if (!map) {
          tryInit();
          return;
        }
        const rect2 = el.getBoundingClientRect();
        if (rect2.width < 32 || rect2.height < 32) return;
        fixPanePos(map);
        map.invalidateSize(false);
        setStatus('ready');
      });
      resizeObserver.observe(el);
      if (el.parentElement) resizeObserver.observe(el.parentElement);
    }

    // Window resize
    const onWindowResize = () => {
      if (destroyed) return;
      const map = mapInstanceRef.current;
      if (!map) { tryInit(); return; }
      fixPanePos(map);
      map.invalidateSize(false);
    };
    window.addEventListener('resize', onWindowResize);

    /* ── Cleanup: only on real unmount ── */
    return () => {
      destroyed = true;
      if (retryTimer != null) window.clearTimeout(retryTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onWindowResize);

      if (mapInstanceRef.current) {
        console.warn('[MAP LIFECYCLE]', 'destroy', {
          debugName: name,
          mapId: L.Util.stamp(mapInstanceRef.current),
        });
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        featureLayerRef.current = null;
        labelLayerRef.current = null;
      }
      setStatus('waiting_container');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← empty deps: run ONCE per mount

  return {
    mapContainerRef,
    mapInstanceRef,
    featureLayerRef,
    labelLayerRef,
    status,
    debugInfo,
    reportRenderedGeometries,
  };
}
