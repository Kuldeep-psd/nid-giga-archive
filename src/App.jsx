import { useEffect, useLayoutEffect, useRef } from 'react';
import { Link, Navigate, Outlet, ScrollRestoration, useLoaderData, useLocation, useNavigation, useNavigationType, useRevalidator, useRouteError } from 'react-router';
import { Icon } from './components/Icon.jsx';
import Loading from './components/Loading.jsx';
import { useTheme } from './hooks/useTheme.js';
import { usePinnedLayout } from './hooks/usePinnedLayout.js';
import { batchURL, defaultDescription } from './lib/archive.js';

export function Frame({ projects = [], children, loading = false }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const main = useRef(null);
  const previousPath = useRef(location.pathname);
  const { theme, toggle } = useTheme();
  const params = new URLSearchParams(location.search);
  const about = location.pathname === '/about' || ['#about', '#contact'].includes(location.hash);
  const collection = location.pathname === '/' && !about && !params.has('project');
  const project = projects.find(item => `/maps/${encodeURIComponent(item.id)}` === location.pathname);
  const selectedBatch = project ? String(project.batch) : params.get('batch') || 'all';
  const batches = [...new Set(projects.map(item => item.batch))].sort((a, b) => b - a);
  useLayoutEffect(() => {
    document.body.classList.toggle('collection-page', collection);
    return () => document.body.classList.remove('collection-page');
  }, [collection]);
  usePinnedLayout(collection);
  useEffect(() => {
    const title = about ? 'About' : project?.title || (collection ? selectedBatch === 'all' ? 'All gigamaps' : `Batch ${selectedBatch}` : 'Map not found');
    document.title = `${title} — NID Giga Archive`;
    const description = about ? 'An attempt to document gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.' : project?.description || defaultDescription;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [about, project, collection, selectedBatch]);
  useEffect(() => {
    if (previousPath.current !== location.pathname && navigationType !== 'POP') main.current?.focus({ preventScroll: true });
    previousPath.current = location.pathname;
  }, [location.pathname, navigationType]);

  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header">
      <Link className="brand" to="/" aria-label="NID Giga Archive home"><span>Giga Archive<span className="brand-dot">.</span></span></Link>
      <img className="institution-logo" src="/assets/brand/nid-logo.svg" width="400" height="56" alt="National Institute of Design" />
      <nav className="header-nav" aria-label="Information">
        <Link className="header-link" to="/about" aria-current={about ? 'page' : undefined}>About</Link>
        <button className="theme-toggle" id="theme-toggle" type="button" aria-label="Night mode" aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'} onClick={toggle}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
      </nav>
    </header>
    <div className="workspace">
      <aside className="sidebar" aria-label="Archive navigation">
        <p className="nav-label">COLLECTION</p>
        <Link className={`nav-item${collection && selectedBatch === 'all' ? ' selected' : ''}`} to={batchURL('all', location.search)} aria-current={collection && selectedBatch === 'all' ? 'page' : undefined} data-nav="all"><span>All gigamaps</span><span className="nav-count">{loading ? '' : String(projects.length).padStart(2, '0')}</span></Link>
        <div className="batch-heading"><p className="nav-label">BATCHES</p><span className="nav-label">↓</span></div>
        <nav id="batch-nav" aria-label="Batches">
          {loading ? <span className="loading-shape loading-nav" aria-hidden="true" /> : batches.map(batch => <Link key={batch} className={`nav-item${!about && String(batch) === selectedBatch ? ' selected' : ''}`} to={batchURL(batch, location.search)} data-nav={batch} aria-current={!about && String(batch) === selectedBatch ? 'page' : undefined}><span>{batch}</span><span className="nav-count">{String(projects.filter(item => item.batch === batch).length).padStart(2, '0')}</span></Link>)}
        </nav>
      </aside>
      <main ref={main} id="main" tabIndex={-1}><div id="content" aria-busy={loading}>{children}</div></main>
    </div>
  </>;
}

export default function App() {
  const { projects } = useLoaderData();
  const location = useLocation();
  const navigation = useNavigation();
  if (location.pathname === '/' && ['#about', '#contact'].includes(location.hash)) return <Navigate to="/about" replace />;
  const oldProject = location.pathname === '/' && new URLSearchParams(location.search).get('project');
  if (oldProject) return <Navigate to={`/maps/${encodeURIComponent(oldProject)}`} replace />;
  return <Frame projects={projects}>
    {navigation.state !== 'idle' && <p className="navigation-status" role="status">Opening page…</p>}
    <Outlet context={{ projects }} />
    <ScrollRestoration storageKey="nid-archive-scroll-positions" />
  </Frame>;
}

export function InitialLoading() {
  return <Frame loading><Loading /></Frame>;
}

export function ArchiveError() {
  const error = useRouteError();
  const revalidator = useRevalidator();
  useEffect(() => { console.error('Archive loading failed:', error); }, [error]);
  return <Frame><div className="empty-state" role="alert">
    <h1>The archive couldn’t load.</h1><p>Your search and filters are saved. Please try again in a moment.</p>
    <button type="button" className="retry-button" disabled={revalidator.state !== 'idle'} onClick={() => revalidator.revalidate()}>{revalidator.state === 'idle' ? 'Try again' : 'Trying again…'}</button>
  </div></Frame>;
}

export function PageError() {
  return <div className="empty-state" role="alert"><h1>This page couldn’t load.</h1><p>Your place in the archive is saved.</p><button type="button" className="retry-button" onClick={() => window.location.reload()}>Try again</button><Link className="text-button" to="/">Return to the collection</Link></div>;
}

export function NotFound() {
  return <div className="empty-state"><h1>Map not found</h1><p>This entry is not in the archive yet.</p><Link className="text-button" to="/">Return to the collection</Link></div>;
}
