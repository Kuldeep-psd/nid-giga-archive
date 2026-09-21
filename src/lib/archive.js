import { redirect } from 'react-router';

export const defaultDescription = 'An evolving archive of gigamaps. Browse by batch, search projects, explore the details, and download the original maps.';
export const facets = ['domain', 'topic', 'method'];
export const projectURL = project => `/maps/${encodeURIComponent(project.id)}`;
export function batchURL(batch, search = '') {
  const existing = new URLSearchParams(search);
  const next = new URLSearchParams({ batch: String(batch) });
  ['q', ...facets].forEach(key => { if (existing.get(key)) next.set(key, existing.get(key)); });
  return `/?${next}`;
}

export async function loadArchive({ request }) {
  const url = new URL(request.url);
  // Preserve shared links from the original archive.
  const legacyProject = url.pathname === '/' && url.searchParams.get('project');
  if (legacyProject) return redirect(`/maps/${encodeURIComponent(legacyProject)}`);
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await fetch('/data/archive.json', { signal: controller.signal });
    if (!response.ok) throw new Error('The archive could not be loaded.');
    const data = await response.json();
    if (!Array.isArray(data.projects)) throw new Error('The archive data is invalid.');
    return { projects: [...data.projects].sort((a, b) => b.batch - a.batch || a.title.localeCompare(b.title)) };
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abort);
  }
}

// Navigation and filters reuse the loaded catalog; an explicit retry can revalidate it.
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }) {
  return currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search && defaultShouldRevalidate;
}
