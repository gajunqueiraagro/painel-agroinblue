import L from 'leaflet';

/**
 * Safely calls fitBounds.
 * Works around the _leaflet_pos error by ensuring the map pane's
 * internal position property is set before calling fitBounds.
 */
export function safeFitBounds(
  map: L.Map,
  bounds: L.LatLngBounds,
  options: L.FitBoundsOptions = {},
  debugName = 'Map',
  maxRetries = 8,
): void {
  let attempt = 0;

  const fixPanePositions = () => {
    // Fix _leaflet_pos on ALL pane elements inside the map container
    const container = map.getContainer?.();
    if (!container) return;
    const panes = container.querySelectorAll('[class*="leaflet-"]');
    panes.forEach((el: any) => {
      if (el._leaflet_pos === undefined && el.classList.contains('leaflet-map-pane')) {
        el._leaflet_pos = L.point(0, 0);
      }
    });
    // Also fix via the map's internal _mapPane reference
    const mapAny = map as any;
    if (mapAny._mapPane && mapAny._mapPane._leaflet_pos === undefined) {
      mapAny._mapPane._leaflet_pos = L.point(0, 0);
    }
  };

  const tryFit = () => {
    attempt += 1;

    const container = map.getContainer?.();
    if (!container || container.offsetWidth < 32 || container.offsetHeight < 32) {
      if (attempt < maxRetries) setTimeout(tryFit, 250);
      return;
    }

    fixPanePositions();

    try {
      map.invalidateSize({ animate: false });
    } catch {
      // invalidateSize can also fail with _leaflet_pos — ignore
    }

    fixPanePositions();

    try {
      map.fitBounds(bounds, options);
      console.info(`[safeFitBounds:${debugName}] ✅ OK attempt=${attempt}`);
    } catch (err) {
      console.warn(`[safeFitBounds:${debugName}] attempt ${attempt} failed`);
      if (attempt < maxRetries) {
        setTimeout(tryFit, 300);
      }
    }
  };

  setTimeout(tryFit, 80);
}
