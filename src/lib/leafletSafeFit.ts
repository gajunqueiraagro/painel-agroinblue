import L from 'leaflet';

/**
 * Safely calls fitBounds, retrying if the map's internal DOM isn't ready yet.
 * The `_leaflet_pos` error occurs when Leaflet tries to position internal
 * elements before they're fully initialised — this cannot be reliably
 * pre-checked, so we catch + retry.
 */
export function safeFitBounds(
  map: L.Map,
  bounds: L.LatLngBounds,
  options: L.FitBoundsOptions = {},
  debugName = 'Map',
  maxRetries = 6,
): void {
  let attempt = 0;

  const isContainerReady = (): boolean => {
    const container = map.getContainer?.();
    if (!container) return false;
    const { width, height } = container.getBoundingClientRect();
    return width >= 32 && height >= 32;
  };

  const tryFit = () => {
    attempt += 1;

    if (!isContainerReady()) {
      if (attempt < maxRetries) scheduleRetry();
      return;
    }

    try {
      map.invalidateSize(false);
      map.fitBounds(bounds, options);
    } catch {
      // _leaflet_pos not yet set on internal elements — retry
      if (attempt < maxRetries) {
        scheduleRetry();
        return;
      }
    }
  };

  const scheduleRetry = () => {
    requestAnimationFrame(() => {
      setTimeout(tryFit, 150);
    });
  };

  // Always defer to let the current layout commit finish
  requestAnimationFrame(() => {
    setTimeout(tryFit, 80);
  });
}
