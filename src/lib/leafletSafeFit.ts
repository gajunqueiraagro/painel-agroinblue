import L from 'leaflet';

/**
 * Safely calls fitBounds only after confirming the map container is fully
 * rendered with valid dimensions and internal panes initialised.
 * Retries via rAF + setTimeout if the container isn't ready yet.
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
    const container = map.getContainer();
    if (!container) return false;

    const { width, height } = container.getBoundingClientRect();
    if (width < 32 || height < 32) return false;

    // Leaflet sets _leaflet_pos on the map pane during initialisation.
    // If it's missing, fitBounds/setView will throw.
    const pane = container.querySelector('.leaflet-map-pane') as HTMLElement | null;
    if (!pane || !(pane as any)._leaflet_pos) return false;

    return true;
  };

  const tryFit = () => {
    attempt += 1;

    if (!isContainerReady()) {
      console.warn(
        `[${debugName}] safeFitBounds: not ready (attempt ${attempt}/${maxRetries})`,
      );
      if (attempt < maxRetries) {
        scheduleRetry();
      }
      return;
    }

    map.invalidateSize(false);
    map.fitBounds(bounds, options);
    console.info(`[${debugName}] safeFitBounds: OK (attempt ${attempt})`);
  };

  const scheduleRetry = () => {
    requestAnimationFrame(() => {
      setTimeout(tryFit, 120);
    });
  };

  // Always defer the first attempt to let the current layout commit finish
  requestAnimationFrame(() => {
    setTimeout(tryFit, 60);
  });
}
