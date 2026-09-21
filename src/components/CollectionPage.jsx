import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigationType, useOutletContext, useSearchParams } from 'react-router';
import { filterOptions, filterProjects, facetValues } from '../../dist/archive-search.js';
import { batchURL, facets, projectURL } from '../lib/archive.js';
import { Icon } from './Icon.jsx';
import Preview from './Preview.jsx';

const facetLabel = facet => facet[0].toUpperCase() + facet.slice(1);
const openedCards = new Map();
const ProjectCard = memo(function ProjectCard({ project, remember }) {
  return <Link className="project-card" to={projectURL(project)} onClick={() => remember(project.id)}>
    <Preview className="card-preview" src={project.overview} width={project.width} height={project.height} alt={project.imageAlt || `Overview of ${project.title}`} />
    <div className="card-content">
      <div className="card-title"><h2>{project.title}</h2><Icon name="arrow" /></div>
      <p className="card-description">{project.summary}</p>
      <p className="card-year"><span className="sr-only">Batch </span>{project.batch}</p>
      <div className="card-bottom"><div className="tags">{project.tags.map(tag => <span key={tag} className="tag">{tag}</span>)}</div></div>
    </div>
  </Link>;
});

export default function CollectionPage() {
  const { projects } = useOutletContext();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [params, setParams] = useSearchParams();
  const batch = params.get('batch') || 'all';
  const query = params.get('q') || '';
  const selected = Object.fromEntries(facets.map(facet => [facet, params.get(facet) || '']));
  const signature = JSON.stringify({ batch, query, ...selected });
  const [draft, setDraft] = useState(query);
  const composing = useRef(false);
  const search = useRef(null);
  const results = useRef(null);
  const focusFrame = useRef(null);
  const [view, setView] = useState(() => { try { return localStorage.getItem('giga-archive-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const options = useMemo(() => Object.fromEntries(facets.map(facet => [facet, filterOptions(projects, facet)])), [projects]);
  const filtered = useMemo(() => filterProjects(projects, { batch, query, ...selected }), [projects, signature]);
  const available = useMemo(() => Object.fromEntries(facets.map(facet => [facet, new Set(filterProjects(projects, { batch, query, ...selected, [facet]: '' }).flatMap(project => facetValues(project, facet)))])), [projects, signature]);
  const matchesElsewhere = batch !== 'all' && !filtered.length && filterProjects(projects, { query, ...selected }).length > 0;
  const activeFacets = facets.filter(facet => selected[facet]);
  const hasFilters = activeFacets.length > 0 || Boolean(query.trim());
  const remember = useCallback(id => {
    openedCards.set(location.key, id);
    if (openedCards.size > 100) openedCards.delete(openedCards.keys().next().value);
  }, [location.key]);
  useLayoutEffect(() => {
    const id = openedCards.get(location.key);
    if (navigationType === 'POP' && id) {
      const link = [...results.current.querySelectorAll('.project-card')].find(card => card.getAttribute('href') === projectURL({ id }));
      link?.focus({ preventScroll: true });
    }
  }, [location.key, navigationType]);
  useEffect(() => { if (!composing.current) setDraft(query); }, [query]);
  useEffect(() => {
    const keydown = event => {
      if (document.querySelector('dialog[open]') || event.isComposing) return;
      const command = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const typing = document.activeElement?.closest('input,textarea,select,[contenteditable="true"]');
      if (command || (event.key === '/' && !event.metaKey && !event.ctrlKey && !typing)) {
        event.preventDefault(); search.current?.focus(); if (command) search.current?.select();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); cancelAnimationFrame(focusFrame.current); };
  }, []);
  const update = changes => {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
      return next;
    }, { replace: true, preventScrollReset: true });
    window.scrollTo(0, 0);
  };
  const clearSearch = () => { setDraft(''); update({ q: '' }); search.current?.focus(); };
  const clearFilters = () => { update(Object.fromEntries(facets.map(facet => [facet, '']))); document.querySelector('#filter-domain')?.focus(); };
  const reset = () => { setDraft(''); update({ q: '', ...Object.fromEntries(facets.map(facet => [facet, ''])) }); search.current?.focus(); };
  const focusResults = () => {
    cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => (results.current?.querySelector('.project-card') || results.current)?.focus());
  };
  return <>
    <h1 className="sr-only">{batch === 'all' ? 'All gigamaps' : `Batch ${batch}`}</h1>
    <div className="collection-controls">
      <form className="archive-search" role="search" aria-label="Search the archive" onSubmit={event => { event.preventDefault(); if (!composing.current) focusResults(); }}>
        <div className="search-field"><Icon name="search" />
          <input ref={search} type="search" id="search" name="q" value={draft} aria-keyshortcuts="/ Meta+K Control+K" placeholder={batch === 'all' ? 'Search maps, topics, people…' : 'Search this batch…'} aria-label="Search gigamaps" aria-describedby="search-scope" aria-controls="results" autoComplete="off" spellCheck={false} enterKeyHint="search"
            onChange={event => { setDraft(event.target.value); if (!composing.current && !event.nativeEvent.isComposing) update({ q: event.target.value }); }}
            onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => { composing.current = false; update({ q: event.currentTarget.value }); }}
            onKeyDown={event => {
              if (composing.current || event.nativeEvent.isComposing) return;
              if (event.key === 'Escape' && draft) { event.preventDefault(); event.stopPropagation(); clearSearch(); }
              if (event.key === 'ArrowDown') { event.preventDefault(); focusResults(); }
            }} />
          <kbd id="search-shortcut" aria-hidden="true" hidden={Boolean(draft)}>/</kbd>
          <button className="search-erase" id="search-clear" type="button" aria-label="Clear search" title="Clear search (Esc)" hidden={!draft} onClick={clearSearch}><Icon name="close" /></button>
        </div>
        <span id="search-scope" className="sr-only">{batch === 'all' ? 'Search across all batches.' : `Search within batch ${batch}.`} Search titles, topics, contributor names, and recognized map text where available. Minor typos are supported. Press Enter or Down Arrow to move to results.</span>
        <div className="collection-tools">
          <div className="search-facets" role="group" aria-label="Filter gigamaps">{facets.map(facet => {
            const values = selected[facet] && !options[facet].includes(selected[facet]) ? [...options[facet], selected[facet]] : options[facet];
            return <label key={facet} className={`facet-control${selected[facet] ? ' is-active' : ''}`} htmlFor={`filter-${facet}`}><span className="sr-only">{facetLabel(facet)}</span>
              <select id={`filter-${facet}`} name={facet} value={selected[facet]} title={selected[facet] || facetLabel(facet)} onChange={event => update({ [facet]: event.target.value })}>
                <option value="">{facetLabel(facet)}</option>{values.map(value => <option key={value} value={value} disabled={value !== selected[facet] && !available[facet].has(value)}>{value}</option>)}
              </select><Icon name="chevron" /></label>;
          })}</div>
          <div className="collection-view" role="group" aria-label="Display as">{['grid', 'list'].map(value => <button key={value} type="button" data-view={value} aria-label={value === 'grid' ? 'Tile view' : 'List view'} title={value === 'grid' ? 'Tile view' : 'List view'} aria-pressed={view === value} onClick={() => { setView(value); try { localStorage.setItem('giga-archive-view', value); } catch {} window.scrollTo(0, 0); }}><Icon name={value} /></button>)}</div>
        </div>
        <div className="active-filters" id="active-filters" hidden={!activeFacets.length}>
          <div id="active-filter-list" aria-label="Selected filters">{activeFacets.map(facet => <button key={facet} type="button" className="filter-chip" aria-label={`Remove ${facet} filter: ${selected[facet]}`} onClick={() => { update({ [facet]: '' }); document.querySelector(`#filter-${facet}`)?.focus(); }}><span><span className="filter-chip-key">{facetLabel(facet)}</span>{selected[facet]}</span><Icon name="close" /></button>)}</div>
          <button type="button" className="clear-facet-filters" id="clear-filters" onClick={clearFilters}>Clear filters</button>
        </div>
        <p className="sr-only" id="search-status" role="status" aria-live="polite" aria-atomic="true">{filtered.length} {filtered.length === 1 ? 'map' : 'maps'} found{batch === 'all' ? ' across all batches' : ` in batch ${batch}`}.</p>
      </form>
    </div>
    <section ref={results} className="results-scroll" tabIndex={0} aria-label="Gigamaps"><div id="results" className={`project-list ${view}`}>
      {filtered.length ? filtered.map(project => <ProjectCard key={project.id} project={project} remember={remember} />) : <div className="search-empty"><Icon name="search" /><h2>{hasFilters ? 'No matching maps' : 'No maps in this batch yet'}</h2><p>{matchesElsewhere ? 'Try your search across the full archive.' : 'Try a different term or remove a filter.'}</p><div className="empty-actions">{matchesElsewhere && <Link className="search-all-link" to={batchURL('all', params)}>Search all batches <Icon name="arrow" /></Link>}{hasFilters && <button type="button" className="search-reset" id="reset-results" onClick={reset}>Clear search &amp; filters</button>}</div></div>}
    </div></section>
  </>;
}
