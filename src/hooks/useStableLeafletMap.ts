import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';

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
  debugControlledViewport?: boolean;
}

const serializeLatLng = (value: L.LatLngExpression | L.LatLng | null | undefined) => {
  if (!value) return null;

  try {
    const latLng = value instanceof L.LatLng ? value : L.latLng(value as any);
    return {
      lat: Number(latLng.lat.toFixed(6)),
      lng: Number(latLng.lng.toFixed(6)),
    };
  } catch {
    return null;
  }
};

const serializeBounds = (value: L.LatLngBounds | L.LatLngBoundsExpression | null | undefined) => {
  if (!value) return null;

  try {
    const bounds = value instanceof L.LatLngBounds ? value : L.latLngBounds(value as any);
    if (!bounds.isValid()) return null;

    return {
      southWest: serializeLatLng(bounds.getSouthWest()),
      northEast: serializeLatLng(bounds.getNorthEast()),
    };
  } catch {
    return null;
  }
};

const getViewportSnapshot = (map: L.Map) => {
  try {
    return {
      center: serializeLatLng(map.getCenter()),
      zoom: map.getZoom(),
    };
  } catch (error) {
    return {
      center: null,
      zoom: null,
      errorMessage: error instanceof Error ? error.message : 'viewport_unavailable',
    };
  }
};

const logViewport = (map: L.Map, debugName: string, action: string, extra?: Record<string, unknown>) => {
  console.warn('[MAP VIEWPORT]', {
    action,
    debugName,
    mapId: L.Util.stamp(map),
    ...getViewportSnapshot(map),
    ...extra,
  });
};

const patchViewportMethods = (map: L.Map, debugName: string, debugControlledViewport: boolean) => {
  const mapAny = map as any;
  if (mapAny.__viewportMethodsPatched) return;

  const wrapMethod = (methodName: 'setView' | 'fitBounds' | 'flyTo' | 'invalidateSize') => {
    const originalMethod = mapAny[methodName].bind(map);

    mapAny[methodName] = (...args: any[]) => {
      const locked = Boolean(mapAny.__viewportLocked);
      const targetPayload: Record<string, unknown> = { action: methodName, debugName, mapId: L.Util.stamp(map), locked };

      if (methodName === 'setView' || methodName === 'flyTo') {
        targetPayload.targetCenter = serializeLatLng(args[0]);
        targetPayload.targetZoom = typeof args[1] === 'number' ? args[1] : map.getZoom();
      }

      if (methodName === 'fitBounds') {
        targetPayload.targetBounds = serializeBounds(args[0]);
      }

      console.warn('[MAP TARGET]', targetPayload);

      if (debugControlledViewport && locked) {
        logViewport(map, debugName, `${methodName}:blocked`, {
          lockedTarget: mapAny.__lockedViewport ?? null,
        });
        return map;
      }

      try {
        const result = originalMethod(...args);
        logViewport(map, debugName, methodName);
        return result;
      } catch (error) {
        logViewport(map, debugName, `${methodName}:error`, {
          errorMessage: error instanceof Error ? error.message : 'unknown_error',
        });
        throw error;
      }
    };
  };

  wrapMethod('setView');
  wrapMethod('fitBounds');
  wrapMethod('flyTo');
  wrapMethod('invalidateSize');

  mapAny.__viewportMethodsPatched = true;
};

export function useStableLeafletMap({
  debugName,
  center = [-15.8, -47.9],
  zoom = 5,
  labelZoomThreshold = 14,
  debugControlledViewport = false,
}: Options) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const featureLayerRef = useRef<L.LayerGroup | null>(null);
  const labelLayerRef = useRef<L.LayerGroup | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const resizeTimeoutRef = useRef<number | null>(null);
  const lastContainerRef = useRef<HTMLDivElement | null>(null);

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
  }, [debugName]);

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

  const fixPanePos = useCallback((map: L.Map) => {
    const mapAny = map as any;
    const paneNames: Array<'tilePane' | 'overlayPane' | 'shadowPane' | 'markerPane' | 'tooltipPane' | 'popupPane'> = [
      'tilePane',
      'overlayPane',
      'shadowPane',
      'markerPane',
      'tooltipPane',
      'popupPane',
    ];

    if (mapAny._mapPane && mapAny._mapPane._leaflet_pos === undefined) {
      mapAny._mapPane._leaflet_pos = L.point(0, 0);
    }

    paneNames.forEach((name) => {
      const pane = map.getPane(name) as any;
      if (pane && pane._leaflet_pos === undefined) {
        pane._leaflet_pos = L.point(0, 0);
      }
    });
  }, []);

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
      console.warn('[MAP LIFECYCLE]', 'destroy', {
        debugName,
        mapId: L.Util.stamp(mapInstanceRef.current),
      });
      mapInstanceRef.current.remove();
    }

    mapInstanceRef.current = null;
    featureLayerRef.current = null;
    labelLayerRef.current = null;
  }, [debugName]);

  const scheduleInvalidateSize = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const metrics = syncMetrics();
    if (metrics.width < 32 || metrics.height < 32) {
      console.warn('[MAP VIEWPORT]', {
        action: 'scheduleInvalidateSize:waiting_container',
        debugName,
        metrics,
      });
      setStatus('waiting_container');
      return;
    }

    if (debugControlledViewport) {
      logViewport(map, debugName, 'scheduleInvalidateSize:ignored', { metrics });
      setStatus('ready');
      return;
    }

    setStatus('ready');
    fixPanePos(map);

    if (resizeRafRef.current != null) {
      cancelAnimationFrame(resizeRafRef.current);
    }

    console.warn('[MAP VIEWPORT]', {
      action: 'scheduleInvalidateSize:queued',
      debugName,
      metrics,
      mapId: L.Util.stamp(map),
    });

    resizeRafRef.current = requestAnimationFrame(() => {
      fixPanePos(map);
      try {
        map.invalidateSize(false);
      } catch {
        // logged by wrapped method
      }
      resizeTimeoutRef.current = window.setTimeout(() => {
        fixPanePos(map);
        try {
          map.invalidateSize(false);
        } catch {
          // logged by wrapped method
        }
      }, 140);
    });
  }, [debugControlledViewport, debugName, fixPanePos, syncMetrics]);

  const initializeMap = useCallback(() => {
    const el = mapContainerRef.current;
    const metrics = syncMetrics();

    if (!el) {
      setStatus('waiting_container');
      console.warn('[MAP LIFECYCLE]', 'container-missing', { debugName });
      return false;
    }

    if (lastContainerRef.current && lastContainerRef.current !== el) {
      console.warn('[MAP LIFECYCLE]', 'container-remount', { debugName });
    }
    lastContainerRef.current = el;

    if (metrics.width < 32 || metrics.height < 32) {
      setStatus('waiting_container');
      console.warn('[MAP LIFECYCLE]', 'container-waiting-size', {
        debugName,
        metrics,
      });
      return false;
    }

    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== el) {
      console.warn('[MAP LIFECYCLE]', 'map-instance-mismatch', {
        debugName,
        currentMapId: L.Util.stamp(mapInstanceRef.current),
      });
      destroyMap();
    }

    if (mapInstanceRef.current) {
      console.warn('[MAP LIFECYCLE]', 'reuse-instance', {
        debugName,
        mapId: L.Util.stamp(mapInstanceRef.current),
      });
      if (!debugControlledViewport) {
        scheduleInvalidateSize();
      }
      return true;
    }

    try {
      const map = L.map(el, {
        center,
        zoom,
        zoomControl: false,
        preferCanvas: false,
      });

      patchViewportMethods(map, debugName, debugControlledViewport);
      fixPanePos(map);

      console.warn('[MAP LIFECYCLE]', 'create', {
        debugName,
        mapId: L.Util.stamp(map),
        controlled: debugControlledViewport,
        metrics,
      });

      map.on('moveend', () => logViewport(map, debugName, 'moveend:event'));
      map.on('zoomend', () => logViewport(map, debugName, 'zoomend:event'));
      map.on('resize', (event: L.ResizeEvent) => {
        console.warn('[MAP VIEWPORT]', {
          action: 'resize:event',
          debugName,
          mapId: L.Util.stamp(map),
          oldSize: event.oldSize,
          newSize: event.newSize,
          ...getViewportSnapshot(map),
        });
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

      syncLabelVisibility();
      syncMetrics({ mapInitialized: true, errorMessage: null });
      setStatus('ready');
      log('mapa inicializado');

      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (debugControlledViewport) {
        console.warn('[MAP VIEWPORT]', {
          action: 'post-create-auto-viewport-disabled',
          debugName,
          mapId: L.Util.stamp(map),
        });
      } else {
        scheduleInvalidateSize();
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido ao inicializar o mapa';
      destroyMap();
      setStatus('error');
      syncMetrics({ mapInitialized: false, errorMessage: message });
      console.error(`[${debugName}] Falha ao inicializar mapa`, error);
      return false;
    }
  }, [center, debugControlledViewport, debugName, destroyMap, fixPanePos, labelZoomThreshold, log, scheduleInvalidateSize, syncMetrics, zoom]);

  const reportRenderedGeometries = useCallback((count: number) => {
    setDebugInfo((current) => ({ ...current, renderedGeometries: count }));
    log('geometrias renderizadas', { quantidade: count });
  }, [log]);

  useEffect(() => {
    let active = true;
    const container = mapContainerRef.current;

    console.warn('[MAP LIFECYCLE]', 'effect-mount', {
      debugName,
      controlled: debugControlledViewport,
      hasContainer: Boolean(container),
    });

    const tryInitialize = () => {
      if (!active) return;

      const ready = initializeMap();
      if (!ready) {
        if (debugControlledViewport) {
          console.warn('[MAP LIFECYCLE]', 'init-not-ready-no-retry', { debugName });
          return;
        }
        retryTimerRef.current = window.setTimeout(tryInitialize, 160);
      }
    };

    tryInitialize();

    if (debugControlledViewport) {
      console.warn('[MAP VIEWPORT]', {
        action: 'resizeObserver:disabled',
        debugName,
      });
      console.warn('[MAP VIEWPORT]', {
        action: 'windowResizeHandler:disabled',
        debugName,
      });
    }

    const resizeObserver = !debugControlledViewport && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          console.warn('[MAP VIEWPORT]', {
            action: 'resizeObserver:callback',
            debugName,
            metrics: readMetrics(),
          });

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
      console.warn('[MAP VIEWPORT]', {
        action: 'windowResize:callback',
        debugName,
        metrics: readMetrics(),
      });

      if (!mapInstanceRef.current) {
        initializeMap();
        return;
      }

      scheduleInvalidateSize();
    };

    if (!debugControlledViewport) {
      window.addEventListener('resize', handleWindowResize);
    }

    return () => {
      active = false;

      console.warn('[MAP LIFECYCLE]', 'effect-cleanup', { debugName });

      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      resizeObserver?.disconnect();
      if (!debugControlledViewport) {
        window.removeEventListener('resize', handleWindowResize);
      }
      destroyMap();
    };
  }, [debugControlledViewport, debugName, destroyMap, initializeMap, readMetrics, scheduleInvalidateSize]);

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
