import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from '../src/routes.jsx';
import { loadArchive } from '../src/lib/archive.js';

const dom = new JSDOM('<!doctype html><html><head><meta name="description"><meta name="theme-color"></head><body></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
for (const name of ['window', 'document', 'HTMLElement', 'localStorage', 'sessionStorage']) {
  globalThis[name] = dom.window[name];
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.innerHeight = 900;
globalThis.matchMedia = dom.window.matchMedia = query => ({
  media: query, matches: false, addEventListener() {}, removeEventListener() {},
});
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.scrollTo = (x, y) => {
  window.scrollX = typeof x === 'object' ? x.left || 0 : x;
  window.scrollY = typeof x === 'object' ? x.top || 0 : y;
};
const { act, cleanup, fireEvent, render, waitFor, within } = await import('@testing-library/react');

const makeProject = fields => ({
  width: 4000, height: 1000, overview: '/preview.webp', imageAlt: 'Full gigamap artwork.',
  download: '/downloads/map.pdf', downloadBytes: 1000000, tileSource: '/map.dzi',
  contributors: ['A contributor'], guides: ['A guide'], regions: [], tags: [],
  ...fields,
});
const projects = [
  makeProject({
    id: 'digital-commons', title: 'Digital commons', batch: 2026,
    summary: 'Cloud infrastructure and everyday digital life.', description: 'The relationships behind cloud infrastructure.',
    domains: ['Technology'], topics: ['Cloud infrastructure'], methods: ['Research'], tags: ['Digital life'],
  }),
  makeProject({
    id: 'climate-journeys', title: 'Climate journeys', batch: 2023,
    summary: 'Climate change and migration.', description: 'Human migration amid a changing climate.',
    domains: ['Environment'], topics: ['Climate change'], methods: ['Research'], tags: ['Climate change'],
  }),
  makeProject({
    id: 'civic-commons', title: 'Civic commons', batch: 2023,
    summary: 'Digital rights and participation.', description: 'Digital rights across a civic commons.',
    domains: ['Technology'], topics: ['Digital rights'], methods: ['Interviews'], tags: ['Digital rights'],
  }),
];
const activeRouters = new Set();
function mount(initial = '/', loader = () => ({ projects })) {
  // Exercise the production route tree, changing only its data source.
  const router = createMemoryRouter(routes.map(route => ({ ...route, loader })), { initialEntries: [initial] });
  activeRouters.add(router);
  return { router, page: render(createElement(RouterProvider, { router })) };
}
function mapTitles(page) {
  return within(page.getByRole('region', { name: 'Gigamaps' }))
    .queryAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.dataset.theme = 'light';
  window.scrollTo(0, 0);
});
afterEach(() => {
  cleanup();
  activeRouters.forEach(router => router.dispose());
  activeRouters.clear();
});

test('search, facets and batch navigation combine while preserving their URL state', async () => {
  const { router, page } = mount('/?batch=all&q=commons&domain=Technology');
  const search = await page.findByRole('searchbox', { name: 'Search gigamaps' });
  assert.equal(search.value, 'commons');
  assert.equal(page.getByRole('combobox', { name: 'Domain' }).value, 'Technology');
  assert.deepEqual(mapTitles(page).sort(), ['Civic commons', 'Digital commons']);

  fireEvent.change(page.getByRole('combobox', { name: 'Topic' }), { target: { value: 'Cloud infrastructure' } });
  assert.equal(new URLSearchParams(router.state.location.search).get('topic'), 'Cloud infrastructure');
  assert.deepEqual(mapTitles(page), ['Digital commons']);

  fireEvent.click(page.getByRole('button', { name: 'Clear filters' }));
  assert.equal(search.value, 'commons');
  assert.equal(new URLSearchParams(router.state.location.search).has('domain'), false);
  assert.equal(new URLSearchParams(router.state.location.search).has('topic'), false);
  assert.deepEqual(mapTitles(page).sort(), ['Civic commons', 'Digital commons']);

  fireEvent.change(page.getByRole('combobox', { name: 'Method' }), { target: { value: 'Research' } });
  fireEvent.click(page.getByRole('link', { name: /^2023/ }));
  await page.findByRole('heading', { name: 'No matching maps' });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(router.state.location.search)), {
    batch: '2023', q: 'commons', method: 'Research',
  });
  fireEvent.click(page.getByRole('link', { name: 'Search all batches' }));
  await page.findByRole('link', { name: /Digital commons/ });
  assert.equal(new URLSearchParams(router.state.location.search).get('batch'), 'all');
  assert.deepEqual(mapTitles(page), ['Digital commons']);

  fireEvent.click(page.getByRole('button', { name: 'Clear search' }));
  assert.equal(search.value, '');
  assert.equal(new URLSearchParams(router.state.location.search).has('q'), false);
  assert.equal(page.getByRole('combobox', { name: 'Method' }).value, 'Research');
  assert.deepEqual(mapTitles(page), ['Digital commons', 'Climate journeys']);
  fireEvent.click(page.getByRole('button', { name: 'Remove method filter: Research' }));
  assert.deepEqual(mapTitles(page), ['Digital commons', 'Climate journeys', 'Civic commons']);

  fireEvent.change(search, { target: { value: 'migration' } });
  assert.equal(new URLSearchParams(router.state.location.search).get('q'), 'migration');
  assert.deepEqual(mapTitles(page), ['Climate journeys']);
});

test('map links use clean routes and Back restores the collection query and filters without reloading its catalog', async () => {
  let loads = 0;
  const initial = '/?batch=2026&q=cloud&domain=Technology';
  const { router, page } = mount(initial, () => { loads += 1; return { projects }; });
  const card = await page.findByRole('link', { name: /Digital commons/ });
  assert.equal(card.getAttribute('href'), '/maps/digital-commons');
  card.focus();
  fireEvent.click(card);
  await page.findByRole('heading', { level: 1, name: 'Digital commons' });
  assert.equal(router.state.location.pathname, '/maps/digital-commons');
  assert.equal(page.getByRole('link', { name: /Download PDF/ }).getAttribute('href'), '/downloads/map.pdf');
  assert.equal(loads, 1);

  await act(async () => router.navigate(-1));
  assert.equal(router.state.location.pathname, '/');
  assert.equal(router.state.location.search, initial.slice(1));
  assert.equal(page.getByRole('searchbox', { name: 'Search gigamaps' }).value, 'cloud');
  assert.equal(page.getByRole('combobox', { name: 'Domain' }).value, 'Technology');
  assert.deepEqual(mapTitles(page), ['Digital commons']);
  await waitFor(() => assert.ok(document.activeElement === page.getByRole('link', { name: /Digital commons/ }), 'Back should return keyboard focus to the map that was opened'));
  assert.equal(loads, 1);
});

test('legacy project and About links reach the actual React pages', async () => {
  const legacy = mount('/?project=digital-commons&batch=2026');
  await legacy.page.findByRole('heading', { level: 1, name: 'Digital commons' });
  assert.equal(legacy.router.state.location.pathname, '/maps/digital-commons');
  assert.equal(legacy.router.state.location.search, '');
  await act(async () => legacy.router.navigate('/#about'));
  await legacy.page.findByRole('heading', { level: 1, name: 'About the archive.' });
  assert.equal(legacy.router.state.location.pathname, '/about');
  assert.equal(legacy.router.state.location.hash, '');
  assert.equal(legacy.page.getByRole('link', { name: 'ks00347@gmail.com' }).getAttribute('href'), 'mailto:ks00347@gmail.com');
});

test('the real archive loader redirects legacy map URLs before fetching catalog data', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Legacy redirects must not fetch metadata.'); });
  const response = await loadArchive({ request: new Request('http://localhost/?project=digital-commons') });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), '/maps/digital-commons');
  assert.equal(fetch.mock.callCount(), 0);
});

test('night mode and list view persist through navigation and a fresh application mount', async () => {
  const first = mount('/');
  await first.page.findByRole('searchbox', { name: 'Search gigamaps' });
  const theme = first.page.getByRole('button', { name: 'Night mode' });
  assert.equal(theme.getAttribute('aria-pressed'), 'false');
  fireEvent.click(theme);
  assert.equal(theme.getAttribute('aria-pressed'), 'true');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(localStorage.getItem('giga-archive-theme'), 'dark');
  fireEvent.click(first.page.getByRole('button', { name: 'List view' }));
  assert.equal(localStorage.getItem('giga-archive-view'), 'list');
  assert.equal(first.page.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed'), 'true');
  fireEvent.click(first.page.getByRole('link', { name: 'About' }));
  await first.page.findByRole('heading', { level: 1, name: 'About the archive.' });
  fireEvent.click(first.page.getByRole('link', { name: 'Back to the collection' }));
  await first.page.findByRole('searchbox', { name: 'Search gigamaps' });
  assert.equal(first.page.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed'), 'true');

  first.page.unmount();
  first.router.dispose();
  activeRouters.delete(first.router);
  // A new document starts with a light fallback before the stored preference is read.
  document.documentElement.dataset.theme = 'light';
  const fresh = mount('/');
  await fresh.page.findByRole('searchbox', { name: 'Search gigamaps' });
  assert.equal(fresh.page.getByRole('button', { name: 'Night mode' }).getAttribute('aria-pressed'), 'true');
  assert.equal(fresh.page.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed'), 'true');
  assert.equal(document.documentElement.dataset.theme, 'dark');
});

test('retrying a failed catalog load retains the query and filters', async t => {
  t.mock.method(console, 'error', () => {});
  let attempts = 0;
  let finishRetry;
  const initial = '/?batch=2023&q=migration&domain=Environment';
  const { router, page } = mount(initial, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('Simulated catalog outage');
    await new Promise(resolve => { finishRetry = resolve; });
    return { projects };
  });
  await page.findByRole('alert');
  assert.equal(router.state.location.search, initial.slice(1));
  fireEvent.click(page.getByRole('button', { name: 'Try again' }));
  const pending = await page.findByRole('button', { name: 'Trying again…' });
  assert.equal(pending.disabled, true);
  await act(async () => finishRetry());
  const search = await page.findByRole('searchbox', { name: 'Search gigamaps' });
  assert.equal(search.value, 'migration');
  assert.equal(page.getByRole('combobox', { name: 'Domain' }).value, 'Environment');
  assert.equal(router.state.location.search, initial.slice(1));
  assert.deepEqual(mapTitles(page), ['Climate journeys']);
  assert.equal(attempts, 2);
  assert.equal(page.queryByRole('alert'), null);
});
