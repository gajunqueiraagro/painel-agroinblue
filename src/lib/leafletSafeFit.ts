import L from 'leaflet';

/**
 * Safely calls fitBounds only after confirming the map container is rendered
 * with valid dimensions. Retries up to `maxRetries` times using rAF + setTimeout
 * if the container isn't ready yet.
 */
export function safeFitBounds(
  map: L.Map,
  bounds: L.LatLngBounds,
  options: L.FitBoundsOptions = {},
  debugName = 'Map',
  maxRetries = 5,
): void {
  let attempt = 0;

  const tryFit = () => {
    attempt += 1;
    const container = map.getContainer();

    if (!container) {
      console.warn(`[${debugName}] safeFitBounds: no container (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) scheduleRetry();
      return;
    }

    const { width, height } = container.getBoundingClientRect();

    if (width < 32 || height < 32) {
      console.warn(`[${debugName}] safeFitBounds: container too small ${width}x${height} (attempt ${attempt}/${maxRetries})`);
      if (attempt < maxRetries) scheduleRetry();
      return;
    }

    // Container is ready — invalidate size first, then fit
    map.invalidateSize(false);
    map.fitBounds(bounds, options);
    console.info(`[${debugName}] safeFitBounds: success at attempt ${attempt} (${width}x${height})`);
  };

  const scheduleRetry = () => {
    requestAnimationFrame(() => {
      setTimeout(tryFit, 80);
    });
  };

  tryFit();
}
