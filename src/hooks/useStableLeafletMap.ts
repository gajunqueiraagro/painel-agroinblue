import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';

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
  const retryTimerRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);

  const [status, setStatus] = useState<MapStatus>('waiting_container');
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    containerFound: false,
    width: 0,
    height: 0,
    mapInitialized: false,
    renderedGeometries: 0,
    errorMessage: null,
  });

  const log = useCallback((_message: string, _payload?: Record<string, unknown>) => {
    // Debug logs silenced — uncomment for troubleshooting:
    // if (_payload) console.info(`[${debugName}] ${_message}`, _payload);
    // else console.info(`[${debugName}] ${_message}`);
  }, []);

  const readMetrics = useCallback(() => {
    const el = mapContainerRef.current;
    if (!el) {
      return { containerFound: false, width: 0, height: 0 };
    }

    const rect = el.getBoundingClientRect();
    return {
      containerFound: true,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }, []);

  const syncMetrics = useCallback((patch?: Partial<DebugInfo>) => {
    const metrics = readMetrics();
    setDebugInfo((current) => {
      const next = { ...current, ...metrics, ...patch };
      // Only update if something actually changed to avoid infinite ResizeObserver loops
      if (
        current.containerFound === next.containerFound &&
        current.width === next.width &&
        current.height === next.height &&
        current.mapInitialized === next.mapInitialized &&
        current.renderedGeometries === next.renderedGeometries &&
        current.errorMessage === next.errorMessage
      ) {
        return current;
      }
      return next;
    });
    return metrics;
  }, [readMetrics]);

  const destroyMap = useCallback(() => {
    if (resizeRafRef.current != null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }

    if (resizeTimeoutRef.current != null) {
      window.clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = null;
    }

    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
    }

    mapInstanceRef.current = null;
    featureLayerRef.current = null;
    labelLayerRef.current = null;
  }, []);

  const ensurePanePos = useCallback((map: L.Map) => {
    try {
      const pane = map.getPane('mapPane') as any;
      if (pane && pane._leaflet_pos === undefined) {
        pane._leaflet_pos = L.point(0, 0);
        pane.style.transform = '';
      }
    } catch { /* ignore */ }
  }, []);

  const scheduleInvalidateSize = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const metrics = syncMetrics();
    if (metrics.width < 32 || metrics.height < 32) {
      setStatus('waiting_container');
      return;
    }

    setStatus('ready');
    ensurePanePos(map);

    if (resizeRafRef.current != null) {
      cancelAnimationFrame(resizeRafRef.current);
    }

    resizeRafRef.current = requestAnimationFrame(() => {
      ensurePanePos(map);
      try { map.invalidateSize(false); } catch { /* _leaflet_pos race */ }
      resizeTimeoutRef.current = window.setTimeout(() => {
        ensurePanePos(map);
        try { map.invalidateSize(false); } catch { /* _leaflet_pos race */ }
      }, 140);
    });
  }, [ensurePanePos, syncMetrics]);

  const initializeMap = useCallback(() => {
    const el = mapContainerRef.current;
    const metrics = syncMetrics();

    if (!el) {
      setStatus('waiting_container');
      return false;
    }

    log('container encontrado', { altura: metrics.height, largura: metrics.width });

    if (metrics.width < 32 || metrics.height < 32) {
      setStatus('waiting_container');
      log('altura do container', { altura: metrics.height, largura: metrics.width });
      return false;
    }

    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== el) {
      destroyMap();
    }

    if (mapInstanceRef.current) {
      scheduleInvalidateSize();
      return true;
    }

    try {
      const map = L.map(el, {
        center,
        zoom,
        zoomControl: false,
        preferCanvas: true,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const featureLayer = L.layerGroup().addTo(map);
      const labelLayer = L.layerGroup().addTo(map);

      const syncLabelVisibility = () => {
        if (!labelLayerRef.current || !mapInstanceRef.current) return;

        if (mapInstanceRef.current.getZoom() >= labelZoomThreshold) {
          if (!mapInstanceRef.current.hasLayer(labelLayerRef.current)) {
            mapInstanceRef.current.addLayer(labelLayerRef.current);
          }
          return;
        }

        if (mapInstanceRef.current.hasLayer(labelLayerRef.current)) {
          mapInstanceRef.current.removeLayer(labelLayerRef.current);
        }
      };

      map.on('zoomend', syncLabelVisibility);

      mapInstanceRef.current = map;
      featureLayerRef.current = featureLayer;
      labelLayerRef.current = labelLayer;

      // Fix: ensure mapPane has _leaflet_pos set (can be missing in flex layouts)
      const mapPane = map.getPane('mapPane') as any;
      if (mapPane && mapPane._leaflet_pos === undefined) {
        mapPane._leaflet_pos = L.point(0, 0);
        log('Fixed missing _leaflet_pos on mapPane');
      }

      syncLabelVisibility();
      syncMetrics({ mapInitialized: true, errorMessage: null });
      setStatus('ready');
      log('mapa inicializado');

      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      scheduleInvalidateSize();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao inicializar o mapa';
      destroyMap();
      setStatus('error');
      syncMetrics({ mapInitialized: false, errorMessage: message });
      console.error(`[${debugName}] Falha ao inicializar mapa`, error);
      return false;
    }
  }, [center, debugName, destroyMap, labelZoomThreshold, log, scheduleInvalidateSize, syncMetrics, zoom]);

  const reportRenderedGeometries = useCallback((count: number) => {
    setDebugInfo((current) => ({ ...current, renderedGeometries: count }));
    log('geometrias renderizadas', { quantidade: count });
  }, [log]);

  useEffect(() => {
    let active = true;
    const container = mapContainerRef.current;

    const tryInitialize = () => {
      if (!active) return;

      const ready = initializeMap();
      if (!ready) {
        retryTimerRef.current = window.setTimeout(tryInitialize, 160);
      }
    };

    tryInitialize();

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const metrics = readMetrics();

          if (metrics.width < 32 || metrics.height < 32) {
            setStatus('waiting_container');
            return;
          }

          if (!mapInstanceRef.current) {
            initializeMap();
            return;
          }

          scheduleInvalidateSize();
        })
      : null;

    if (container && resizeObserver) {
      resizeObserver.observe(container);
      if (container.parentElement) {
        resizeObserver.observe(container.parentElement);
      }
    }

    const handleWindowResize = () => {
      if (!mapInstanceRef.current) {
        initializeMap();
        return;
      }

      scheduleInvalidateSize();
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      active = false;

      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      destroyMap();
    };
  }, [destroyMap, initializeMap, log, scheduleInvalidateSize, syncMetrics]);

  return {
    mapContainerRef,
    mapInstanceRef,
    featureLayerRef,
    labelLayerRef,
    status,
    debugInfo,
    scheduleInvalidateSize,
    reportRenderedGeometries,
  };
}
