import L from 'leaflet';

/**
 * Safely calls fitBounds, ensuring the map pane's _leaflet_pos is initialised.
 * Leaflet sets _leaflet_pos during _resetView, but if the container was in a
 * flex/hidden context at init time, it may be undefined.  We fix it manually.
 */
export function safeFitBounds(
  map: L.Map,
  bounds: L.LatLngBounds,
  options: L.FitBoundsOptions = {},
  debugName = 'Map',
  maxRetries = 6,
): void {
  let attempt = 0;

  const ensurePanePos = () => {
    try {
      const pane = map.getPane('mapPane') as any;
      if (pane && pane._leaflet_pos === undefined) {
        // Manually set the initial position to (0,0)
        pane._leaflet_pos = L.point(0, 0);
        pane.style.transform = '';
        console.warn(`[safeFitBounds:${debugName}] Fixed missing _leaflet_pos on mapPane`);
      }
    } catch {
      // ignore
    }
  };

  const tryFit = () => {
    attempt += 1;

    const container = map.getContainer?.();
    if (!container || container.offsetWidth < 32 || container.offsetHeight < 32) {
      if (attempt < maxRetries) setTimeout(tryFit, 200);
      return;
    }

    ensurePanePos();

    try {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, options);
      console.warn(`[safeFitBounds:${debugName}] ✅ fitBounds OK attempt=${attempt}, center=${map.getCenter()}, zoom=${map.getZoom()}`);
    } catch (err) {
      console.warn(`[safeFitBounds:${debugName}] attempt ${attempt} failed:`, err);
      if (attempt < maxRetries) {
        // Try fixing the pane pos and retry
        ensurePanePos();
        setTimeout(tryFit, 250);
      }
    }
  };

  // Start after a short delay to let layout settle
  setTimeout(tryFit, 60);
}
