let libraryPromise;

// Load the large map engine only when a visitor opens a map. Failed loads can retry.
export function loadViewer() {
  if (window.OpenSeadragon) return Promise.resolve(window.OpenSeadragon);
  if (!libraryPromise) {
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (error) {
          libraryPromise = null;
          script.remove();
          reject(error);
        } else resolve(window.OpenSeadragon);
      };
      const timeout = setTimeout(() => finish(new Error('Viewer took too long to load')), 15000);
      script.src = '/assets/vendor/openseadragon.min.js';
      script.onload = () => finish(window.OpenSeadragon ? null : new Error('Viewer unavailable'));
      script.onerror = () => finish(new Error('Viewer unavailable'));
      document.head.append(script);
    });
  }
  return libraryPromise;
}

export function initialViewerState(region = 'whole') {
  return { phase: 'loading', region, zoom: 100, warning: false, detail: '' };
}

// OpenSeadragon owns only the canvas. React owns the dialog and all visible controls.
export function createMapViewer({ element, project, initialRegion = 'whole', reducedMotion = false, onChange, loadLibrary = loadViewer }) {
  const regions = project.regions || [];
  const source = project.tileSource || { type: 'image', url: project.fullImage || project.overview };
  const validRegion = initialRegion === 'whole' || regions.some(region => region.id === initialRegion) ? initialRegion : 'whole';
  let state = initialViewerState(validRegion);
  let viewer = null;
  let OSD;
  let disposed = false;
  let generation = 0;
  let retryBounds = null;

  function update(next) {
    if (disposed) return;
    state = { ...state, ...next };
    onChange(state);
  }

  function fit(region) {
    if (!viewer?.isOpen()) return;
    const section = regions.find(item => item.id === region);
    if (region !== 'whole' && !section) return;
    update({ region });
    if (region === 'whole') viewer.viewport.goHome(reducedMotion);
    else viewer.viewport.fitBounds(new OSD.Rect(...section.bounds), reducedMotion);
    viewer.viewport.applyConstraints(reducedMotion);
  }

  function zoom(factor) {
    if (state.phase !== 'ready' || !viewer?.isOpen()) return;
    viewer.viewport.zoomBy(factor, undefined, reducedMotion);
    viewer.viewport.applyConstraints(reducedMotion);
  }

  function pan(x, y) {
    if (state.phase !== 'ready' || !viewer?.isOpen()) return;
    viewer.viewport.panBy(viewer.viewport.deltaPointsFromPixels(new OSD.Point(x, y)), reducedMotion);
    viewer.viewport.applyConstraints(reducedMotion);
  }

  function fail() {
    update({ phase: 'error' });
  }

  async function initialize() {
    const attempt = ++generation;
    update({ phase: 'loading', warning: false, detail: '' });
    try {
      OSD = await loadLibrary();
      if (disposed || attempt !== generation) return;
      const instance = OSD({
        element,
        showNavigationControl: false,
        showNavigator: true,
        navigatorPosition: 'BOTTOM_RIGHT',
        navigatorWidth: project.height > project.width ? 54 : 160,
        navigatorHeight: project.height > project.width ? 128 : 40,
        navigatorAutoFade: false,
        navigatorBackground: 'var(--viewer-bg)',
        navigatorBorderColor: 'var(--viewer-border)',
        navigatorDisplayRegionColor: 'var(--viewer-selection)',
        navigatorOpacity: 1,
        drawer: 'canvas',
        animationTime: reducedMotion ? 0 : 0.45,
        blendTime: reducedMotion ? 0 : 0.15,
        minZoomImageRatio: 1,
        maxZoomPixelRatio: 2,
        visibilityRatio: 0.7,
        constrainDuringPan: true,
        homeFillsViewer: false,
        imageLoaderLimit: 6,
        maxImageCacheCount: 120,
        timeout: 20000,
        tileRetryMax: 2,
        tileRetryDelay: 600,
        zoomPerScroll: 1.25,
        gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: true, scrollToZoom: true, dragToPan: true },
        gestureSettingsTouch: { clickToZoom: false, dblClickToZoom: true, pinchToZoom: true, dragToPan: true, flickEnabled: false },
        gestureSettingsPen: { clickToZoom: false, dblClickToZoom: true, dragToPan: true },
      });
      viewer = instance;
      const active = () => !disposed && viewer === instance;
      instance.canvas.setAttribute('role', 'region');
      instance.canvas.setAttribute('aria-label', 'Gigamap, zoomable map');
      instance.canvas.setAttribute('aria-describedby', 'viewer-help');
      instance.canvas.setAttribute('aria-keyshortcuts', '+ - 0 ArrowUp ArrowDown ArrowLeft ArrowRight');
      instance.addHandler('canvas-key', event => { event.preventDefaultAction = true; });
      instance.addHandler('open', () => {
        if (!active()) return;
        if (retryBounds) {
          instance.viewport.fitBounds(retryBounds, true);
          retryBounds = null;
        } else {
          fit(state.region);
          instance.viewport.applyConstraints(true);
        }
        const image = instance.world.getItemAt(0);
        image?.addHandler('fully-loaded-change', event => {
          if (active() && instance.world.getItemAt(0) === image && !state.warning) {
            update({ detail: event.fullyLoaded ? '' : 'Refining the detail…' });
          }
        });
      });
      instance.addHandler('tile-drawn', () => {
        if (active() && state.phase !== 'ready') update({ phase: 'ready' });
      });
      instance.addHandler('zoom', () => {
        if (!active() || !instance.viewport) return;
        const zoomPercent = Math.round(instance.viewport.getZoom() / instance.viewport.getHomeZoom() * 100);
        if (Number.isFinite(zoomPercent) && state.zoom !== zoomPercent) update({ zoom: zoomPercent });
      });
      instance.addHandler('open-failed', () => { if (active()) fail(); });
      instance.addHandler('tile-load-failed', () => {
        if (!active() || state.warning) return;
        update({ warning: true, detail: 'Some details couldn’t load. Use Reload map to try again.' });
        if (state.phase !== 'ready') fail();
      });
      instance.open(source);
    } catch {
      if (!disposed && attempt === generation) fail();
    }
  }

  function retry() {
    if (disposed) return;
    if (!viewer) {
      initialize();
      return;
    }
    retryBounds = viewer.isOpen() ? viewer.viewport.getBounds() : null;
    update({ phase: 'loading', warning: false, detail: '' });
    viewer.open(source);
  }

  initialize();
  return {
    fit, zoom, pan, retry,
    destroy() {
      disposed = true;
      generation += 1;
      viewer?.destroy();
      viewer = null;
    },
  };
}
