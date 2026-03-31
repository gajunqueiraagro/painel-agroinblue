import L from 'leaflet';

/**
 * Safely calls fitBounds, retrying if the map's internal DOM isn't ready yet.
 */
export function safeFitBounds(
  map: L.Map,
  bounds: L.LatLngBounds,
  options: L.FitBoundsOptions = {},
  debugName = 'Map',
  maxRetries = 8,
): void {
  let attempt = 0;

  const tryFit = () => {
    attempt += 1;

    const container = map.getContainer?.();
    if (!container) {
      console.warn(`[safeFitBounds:${debugName}] attempt ${attempt}: no container`);
      if (attempt < maxRetries) scheduleRetry();
      return;
    }

    const { width, height } = container.getBoundingClientRect();
    if (width < 32 || height < 32) {
      console.warn(`[safeFitBounds:${debugName}] attempt ${attempt}: container too small (${width}x${height})`);
      if (attempt < maxRetries) scheduleRetry();
      return;
    }

    try {
      map.invalidateSize({ animate: false });
      map.fitBounds(bounds, options);
      console.warn(`[safeFitBounds:${debugName}] ✅ fitBounds SUCCESS on attempt ${attempt}, center=${map.getCenter()}, zoom=${map.getZoom()}`);
    } catch (err) {
      console.warn(`[safeFitBounds:${debugName}] attempt ${attempt} FAILED:`, err);
      if (attempt < maxRetries) {
        scheduleRetry();
      }
    }
  };

  const scheduleRetry = () => {
    setTimeout(tryFit, 200);
  };

  // First attempt after a short delay
  setTimeout(tryFit, 100);
}
