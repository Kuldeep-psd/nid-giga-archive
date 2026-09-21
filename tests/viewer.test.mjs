import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapViewer } from '../src/lib/viewer.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
const project = {
  width: 4000, height: 1000, overview: '/preview.webp', tileSource: '/tiles/map.dzi',
  regions: [{ id: 'context', title: 'Context', bounds: [0, 0, 0.3, 0.25] }],
};

function setup(options = {}) {
  const states = [];
  const instances = [];
  const calls = [];
  function OSD(config) {
    const events = new Map();
    const imageEvents = new Map();
    let open = false;
    const image = { addHandler(name, handler) { imageEvents.set(name, handler); } };
    const viewer = {
      config, canvas: { setAttribute() {} },
      addHandler(name, handler) { events.set(name, handler); },
      emit(name, event = {}) { events.get(name)?.(event); },
      emitImage(name, event) { imageEvents.get(name)?.(event); },
      open(source) { open = true; calls.push(['open', source]); },
      isOpen() { return open; },
      world: { getItemAt() { return image; } },
      viewport: {
        goHome(reduced) { calls.push(['home', reduced]); },
        fitBounds(bounds, reduced) { calls.push(['fit', bounds, reduced]); },
        applyConstraints() {},
        zoomBy(factor) { calls.push(['zoom', factor]); },
        getBounds() { return { x: 0.2, y: 0.1, width: 0.3, height: 0.1 }; },
        getZoom() { return 2; },
        getHomeZoom() { return 1; },
        deltaPointsFromPixels(point) { return point; },
        panBy(point) { calls.push(['pan', point]); },
      },
      destroy() { calls.push(['destroy']); open = false; },
    };
    instances.push(viewer);
    return viewer;
  }
  OSD.Rect = class Rect { constructor(...bounds) { this.bounds = bounds; } };
  OSD.Point = class Point { constructor(x, y) { this.x = x; this.y = y; } };
  const controller = createMapViewer({ element: {}, project, onChange: state => states.push(state), loadLibrary: async () => OSD, ...options });
  return { controller, states, instances, calls, OSD };
}

test('viewer stays loading until a tile is drawn, fits the requested section and supports controls', async () => {
  const { controller, states, instances, calls } = setup({ initialRegion: 'context', reducedMotion: true });
  await flush();
  const viewer = instances[0];
  assert.equal(states.at(-1).phase, 'loading');
  controller.zoom(1.5);
  assert.equal(calls.filter(([name]) => name === 'zoom').length, 0);
  viewer.emit('open');
  assert.deepEqual(calls.find(([name]) => name === 'fit')[1].bounds, [0, 0, 0.3, 0.25]);
  assert.equal(viewer.config.animationTime, 0);
  viewer.emit('tile-drawn');
  assert.equal(states.at(-1).phase, 'ready');
  controller.zoom(1.5);
  controller.pan(80, 0);
  viewer.emit('zoom');
  assert.equal(states.at(-1).zoom, 200);
  assert.ok(calls.some(([name, factor]) => name === 'zoom' && factor === 1.5));
  assert.ok(calls.some(([name, point]) => name === 'pan' && point.x === 80));
  controller.fit('whole');
  assert.equal(states.at(-1).region, 'whole');
  assert.ok(calls.some(([name]) => name === 'home'));
  controller.destroy();
});

test('partial tile failure remains usable and retry preserves the current bounds', async () => {
  const { controller, states, instances, calls } = setup();
  await flush();
  const viewer = instances[0];
  viewer.emit('open');
  viewer.emit('tile-drawn');
  viewer.emit('tile-load-failed');
  assert.equal(states.at(-1).phase, 'ready');
  assert.equal(states.at(-1).warning, true);
  viewer.emitImage('fully-loaded-change', { fullyLoaded: true });
  assert.match(states.at(-1).detail, /couldn’t load/);
  controller.retry();
  assert.equal(states.at(-1).phase, 'loading');
  assert.equal(states.at(-1).warning, false);
  viewer.emit('open');
  assert.deepEqual(calls.filter(([name]) => name === 'fit').at(-1)[1], { x: 0.2, y: 0.1, width: 0.3, height: 0.1 });
  viewer.emit('tile-drawn');
  assert.equal(states.at(-1).phase, 'ready');
  controller.destroy();
});

test('initial tile failure exposes an error and can recover on retry', async () => {
  const { controller, states, instances } = setup();
  await flush();
  const viewer = instances[0];
  viewer.emit('tile-load-failed');
  assert.equal(states.at(-1).phase, 'error');
  controller.retry();
  assert.equal(states.at(-1).phase, 'loading');
  viewer.emit('open');
  viewer.emit('tile-drawn');
  assert.equal(states.at(-1).phase, 'ready');
  controller.destroy();
});

test('closing a viewer during library loading prevents late canvas creation', async () => {
  let complete;
  const loaded = new Promise(resolve => { complete = resolve; });
  const { controller, states, instances, OSD } = setup({ loadLibrary: () => loaded });
  controller.destroy();
  complete(OSD);
  await flush();
  assert.equal(instances.length, 0);
  assert.equal(states.length, 1);
});

test('library failure retries without remounting the dialog and cleanup ignores late events', async () => {
  let attempt = 0;
  let OSD;
  const fixture = setup({ loadLibrary: async () => { if (++attempt === 1) throw new Error('offline'); return OSD; } });
  OSD = fixture.OSD;
  await flush();
  assert.equal(fixture.states.at(-1).phase, 'error');
  fixture.controller.retry();
  await flush();
  fixture.instances[0].emit('tile-drawn');
  assert.equal(fixture.states.at(-1).phase, 'ready');
  fixture.controller.destroy();
  const count = fixture.states.length;
  fixture.instances[0].emit('tile-load-failed');
  fixture.instances[0].emit('zoom');
  fixture.controller.retry();
  assert.equal(fixture.states.length, count);
  assert.equal(fixture.calls.filter(([name]) => name === 'destroy').length, 1);
});

test('portrait and future image-only maps share the viewer with safe region fallback', async () => {
  const { controller, states, instances, calls } = setup({
    project: { width: 800, height: 2400, overview: '/future.webp', regions: [] }, initialRegion: 'missing',
  });
  await flush();
  assert.deepEqual(calls[0], ['open', { type: 'image', url: '/future.webp' }]);
  assert.equal(instances[0].config.navigatorWidth, 54);
  assert.equal(instances[0].config.navigatorHeight, 128);
  assert.equal(states.at(-1).region, 'whole');
  controller.destroy();
});
