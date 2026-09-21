import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import ProjectPage from '../src/components/ProjectPage.jsx';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false });
window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
const { act, cleanup, fireEvent, render } = await import('@testing-library/react');
afterEach(() => { cleanup(); delete window.OpenSeadragon; });

const project = {
  id: 'future-map', title: 'Future map', summary: 'A future catalog entry.', description: 'The map overview.',
  batch: 2027, width: 4000, height: 1000, overview: '/preview.webp', imageAlt: 'The entire artwork.',
  download: '/downloads/future.pdf', downloadBytes: 1000000, tileSource: '/tiles/future.dzi',
  contributors: ['A contributor'], guides: [], methods: [],
  regions: [{ id: 'context', title: 'Context', bounds: [0, 0, 0.3, 0.25] }],
};

function mockEngine() {
  const calls = [];
  let instance;
  function OSD({ element }) {
    const events = new Map();
    let zoom = 1;
    let opened = false;
    const canvas = document.createElement('div');
    canvas.tabIndex = 0;
    element.append(canvas);
    instance = {
      canvas,
      addHandler(name, callback) { events.set(name, callback); },
      emit(name, event = {}) { events.get(name)?.(event); },
      open() { opened = true; calls.push('open'); },
      isOpen() { return opened; },
      world: { getItemAt: () => ({ addHandler() {} }) },
      viewport: {
        goHome() { zoom = 1; instance.emit('zoom'); },
        fitBounds(bounds) { calls.push(bounds); },
        applyConstraints() {},
        zoomBy(factor) { zoom *= factor; instance.emit('zoom'); },
        getZoom: () => zoom,
        getHomeZoom: () => 1,
        getBounds: () => ({ x: 0, y: 0, width: 1, height: 0.25 }),
        deltaPointsFromPixels: point => point,
        panBy(point) { calls.push(point); },
      },
      destroy() { calls.push('destroy'); canvas.remove(); opened = false; },
    };
    return instance;
  }
  OSD.Rect = class Rect { constructor(...bounds) { this.bounds = bounds; } };
  OSD.Point = class Point { constructor(x, y) { this.x = x; this.y = y; } };
  window.OpenSeadragon = OSD;
  return { calls, get viewer() { return instance; } };
}

test('shared page opens a React dialog, enables zoom after drawing and returns focus on close', async () => {
  const engine = mockEngine();
  const page = render(createElement(StrictMode, null, createElement(MemoryRouter, null, createElement(ProjectPage, { project }))));
  const explore = page.getByRole('button', { name: 'Explore the map' });
  explore.focus();
  fireEvent.click(explore);
  await act(async () => {});
  const dialog = page.getByRole('dialog', { name: 'Future map' });
  const close = page.getByRole('button', { name: 'Close map' });
  assert.equal(document.activeElement, close);
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(page.getByRole('button', { name: 'Zoom in' }).disabled, true);
  assert.equal(dialog.querySelector('#viewer-stage').getAttribute('aria-busy'), 'true');
  act(() => { engine.viewer.emit('open'); engine.viewer.emit('tile-drawn'); });
  assert.equal(page.getByRole('button', { name: 'Zoom in' }).disabled, false);
  fireEvent.click(page.getByRole('button', { name: 'Zoom in' }));
  assert.equal(page.getByLabelText('Zoom level').textContent, '150%');
  fireEvent.keyDown(engine.viewer.canvas, { key: 'ArrowRight' });
  assert.ok(engine.calls.some(call => call?.x === 80));
  const panCount = engine.calls.length;
  fireEvent.keyDown(page.getByLabelText('Jump to'), { key: 'ArrowRight' });
  assert.equal(engine.calls.length, panCount, 'native select keys must not pan the map');
  fireEvent.change(page.getByLabelText('Jump to'), { target: { value: 'context' } });
  assert.deepEqual(engine.calls.at(-1).bounds, [0, 0, 0.3, 0.25]);
  fireEvent.click(close);
  assert.equal(page.queryByRole('dialog'), null);
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.activeElement, explore);
  assert.equal(engine.calls.at(-1), 'destroy');
});

test('section entry, load errors, retry and native dialog cancellation use the same lifecycle', async () => {
  const engine = mockEngine();
  const page = render(createElement(MemoryRouter, null, createElement(ProjectPage, { project })));
  const section = page.getByRole('button', { name: 'Context' });
  section.focus();
  fireEvent.click(section);
  await act(async () => {});
  act(() => engine.viewer.emit('open'));
  assert.equal(page.getByLabelText('Jump to').value, 'context');
  act(() => engine.viewer.emit('open-failed'));
  assert.match(page.getByRole('alert').textContent, /couldn’t load/);
  fireEvent.click(page.getByRole('button', { name: 'Try again' }));
  assert.equal(engine.calls.filter(call => call === 'open').length, 2);
  assert.equal(document.activeElement, page.getByRole('button', { name: 'Close map' }));
  act(() => { engine.viewer.emit('open'); engine.viewer.emit('tile-drawn'); });
  fireEvent(page.getByRole('dialog'), new window.Event('cancel', { bubbles: false, cancelable: true }));
  assert.equal(page.queryByRole('dialog'), null);
  assert.equal(document.activeElement, section);
  assert.equal(document.body.style.overflow, '');
});
