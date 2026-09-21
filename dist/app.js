import { observePreviews } from './preview-state.js';
import { filterOptions, filterProjects, facetValues } from './archive-search.js';
const icons={chevron:'<path d="m7 10 5 5 5-5"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',list:'<path d="M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.arrow}</svg>`;
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let projects=[],view='grid',routeRevision=0,collectionURL=null,positionTimer,searchFrame,archiveReady=false,stopCollectionLayout;
try{if(localStorage.getItem('giga-archive-view')==='list')view='list'}catch{}
const content=document.querySelector('#content');
const params=()=>new URLSearchParams(location.search);
const currentBatch=()=>params().get('batch')||'all';
const projectURL=p=>`/?project=${encodeURIComponent(p.id)}`;
if('scrollRestoration' in history)history.scrollRestoration='manual';
document.body.classList.toggle('collection-page',!new URLSearchParams(location.search).has('project')&&!['#about','#contact'].includes(location.hash));
window.dispatchEvent(new Event('archive:boot'));
const defaultDescription='An evolving archive of gigamaps. Browse by batch, search projects, explore the details, and download the original maps.';

function saveCollectionPosition(link){
  const scroller=document.querySelector('.results-scroll');
  if(!scroller||collectionURL!==location.href)return;
  const card=link?.matches('.project-card')?link:document.activeElement?.closest('.project-card');
  history.replaceState({...history.state,archiveCollection:{url:collectionURL,view,pageTop:window.scrollY,project:card?.getAttribute('href')||history.state?.archiveCollection?.project||null}},'');
}
function queueCollectionPosition(){
  const revision=routeRevision;
  clearTimeout(positionTimer);
  positionTimer=setTimeout(()=>{if(revision===routeRevision)saveCollectionPosition()},150);
}

// Let the browser own scrolling; measure only the space occupied by sticky controls.
function watchCollectionLayout(){
  const header=document.querySelector('.site-header'),sidebar=document.querySelector('.sidebar'),controls=document.querySelector('.collection-controls');
  const update=()=>{
    const headerHeight=header.offsetHeight;
    const navigationHeight=matchMedia('(max-width: 960px)').matches?sidebar.offsetHeight:0;
    const stack=headerHeight+navigationHeight+controls.offsetHeight;
    const availableHeight=Math.min(innerHeight,window.visualViewport?.height||innerHeight);
    document.body.style.setProperty('--archive-header-height',`${headerHeight}px`);
    document.body.style.setProperty('--archive-nav-height',`${navigationHeight}px`);
    document.documentElement.style.setProperty('--archive-sticky-offset',`${stack}px`);
    document.body.classList.toggle('collection-relaxed',availableHeight-stack<240);
  };
  const observer=new ResizeObserver(update);
  [header,sidebar,controls].forEach(node=>observer.observe(node));
  window.addEventListener('resize',update);
  window.visualViewport?.addEventListener('resize',update);
  update();
  stopCollectionLayout=()=>{
    observer.disconnect();
    window.removeEventListener('resize',update);
    window.visualViewport?.removeEventListener('resize',update);
    document.body.classList.remove('collection-relaxed');
    document.body.style.removeProperty('--archive-header-height');
    document.body.style.removeProperty('--archive-nav-height');
    document.documentElement.style.removeProperty('--archive-sticky-offset');
  };
}

function renderCard(p){return `<a class="project-card" href="${projectURL(p)}"><div data-preview class="card-preview is-loading${p.height>p.width?' is-portrait':''}"><img src="${esc(p.overview)}" width="${p.width||2400}" height="${p.height||600}" alt="${esc(p.imageAlt||`Overview of ${p.title}`)}" loading="lazy" decoding="async"></div><div class="card-content"><div class="card-title"><h2>${esc(p.title)}</h2>${icon('arrow')}</div><p class="card-description">${esc(p.summary)}</p><p class="card-year"><span class="sr-only">Batch </span>${p.batch}</p><div class="card-bottom"><div class="tags">${p.tags.map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></div></div></a>`}

const cardMarkup=new Map();
function cachedCard(project){if(!cardMarkup.has(project.id))cardMarkup.set(project.id,renderCard(project));return cardMarkup.get(project.id)}
const facets=['domain','topic','method'];
const facetLabel=facet=>facet[0].toUpperCase()+facet.slice(1);
function filterControls(){
  return `<div class="search-facets" role="group" aria-label="Filter gigamaps">${facets.map(facet=>{
    const value=params().get(facet)||'',options=filterOptions(projects,facet);
    // A bookmarked value stays removable even if its metadata has changed.
    if(value&&!options.includes(value))options.push(value);
    const label=facetLabel(facet);
    return `<label class="facet-control" for="filter-${facet}"><span class="sr-only">${label}</span><select id="filter-${facet}" name="${facet}" title="${esc(value||label)}"><option value="">${label}</option>${options.map(option=>`<option value="${esc(option)}"${value===option?' selected':''}>${esc(option)}</option>`).join('')}</select>${icon('chevron')}</label>`;
  }).join('')}</div>`;
}
function updateBatchLinks(){
  const current=params();
  document.querySelectorAll('[data-nav]').forEach(link=>{
    const url=new URL('/',location.origin);
    url.searchParams.set('batch',link.dataset.nav);
    ['q',...facets].forEach(key=>{if(current.get(key))url.searchParams.set(key,current.get(key))});
    link.href=url.pathname+url.search;
  });
}
function updateFilterChips(selected){
  const active=facets.filter(facet=>selected[facet]);
  document.querySelector('#active-filters').hidden=!active.length;
  document.querySelector('#active-filter-list').innerHTML=active.map(facet=>`<button type="button" class="filter-chip" data-remove-facet="${facet}" aria-label="Remove ${facet} filter: ${esc(selected[facet])}"><span><span class="filter-chip-key">${facetLabel(facet)}</span>${esc(selected[facet])}</span>${icon('close')}</button>`).join('');
  facets.forEach(facet=>{
    const select=document.querySelector('#filter-'+facet);
    select.closest('.facet-control').classList.toggle('is-active',Boolean(selected[facet]));
    select.title=selected[facet]||facetLabel(facet);
  });
  content.querySelectorAll('[data-remove-facet]').forEach(button=>button.addEventListener('click',()=>{
    const select=document.querySelector('#filter-'+button.dataset.removeFacet);
    select.value='';results(true);select.focus();
  }));
}
function updateFacetAvailability(selected,query,batch){
  facets.forEach(facet=>{
    const candidates=filterProjects(projects,{batch,query,...selected,[facet]:''});
    const available=new Set(candidates.flatMap(project=>facetValues(project,facet)));
    for(const option of document.querySelector('#filter-'+facet).options){
      option.disabled=Boolean(option.value&&option.value!==selected[facet]&&!available.has(option.value));
    }
  });
}
function results(updateURL=false){
  cancelAnimationFrame(searchFrame);
  const raw=document.querySelector('#search').value;
  const selected=Object.fromEntries(facets.map(facet=>[facet,document.querySelector('#filter-'+facet).value]));
  const hasFilters=Object.values(selected).some(Boolean),hasSearch=Boolean(raw.trim()),batch=currentBatch();
  if(updateURL){
    const url=new URL(location.href);
    Object.entries({q:raw,...selected}).forEach(([key,value])=>value?url.searchParams.set(key,value):url.searchParams.delete(key));
    history.replaceState({},'',url);
  }
  updateBatchLinks();
  const filtered=filterProjects(projects,{batch,query:raw,...selected});
  const hasMatchesElsewhere=batch!=='all'&&filterProjects(projects,{query:raw,...selected}).length>0;
  const allURL=new URL('/',location.origin);
  Object.entries({batch:'all',q:raw,...selected}).forEach(([key,value])=>{if(value)allURL.searchParams.set(key,value)});
  const resultNode=document.querySelector('#results');
  const signature=JSON.stringify(filtered.map(project=>project.id));
  if(!filtered.length||resultNode.dataset.signature!==signature){
    resultNode.dataset.signature=signature;
    resultNode.innerHTML=filtered.length?filtered.map(cachedCard).join(''):
    `<div class="search-empty">${icon('search')}<h2>${hasFilters||hasSearch?'No matching maps':'No maps in this batch yet'}</h2><p>${hasMatchesElsewhere?'Try your search across the full archive.':'Try a different term or remove a filter.'}</p><div class="empty-actions">${hasMatchesElsewhere?`<a class="search-all-link" href="${esc(allURL.pathname+allURL.search)}">Search all batches ${icon('arrow')}</a>`:''}${hasFilters||hasSearch?'<button type="button" class="search-reset" id="reset-results">Clear search & filters</button>':''}</div></div>`;
    observePreviews(resultNode);
  }
  document.querySelector('#search-status').textContent=`${filtered.length} ${filtered.length===1?'map':'maps'} found${batch==='all'?' across all batches':` in batch ${batch}`}.`;
  document.querySelector('#search-clear').hidden=!raw;
  document.querySelector('#search-shortcut').hidden=Boolean(raw);
  updateFilterChips(selected);
  updateFacetAvailability(selected,raw,batch);
  if(updateURL)window.scrollTo(0,0);
  collectionURL=location.href;
  document.querySelector('#reset-results')?.addEventListener('click',()=>{
    document.querySelector('#search').value='';
    facets.forEach(facet=>document.querySelector('#filter-'+facet).value='');
    results(true);document.querySelector('#search').focus();
  });
}
function clearSearch(){document.querySelector('#search').value='';results(true);document.querySelector('#search').focus()}
function clearFilters(){facets.forEach(facet=>document.querySelector('#filter-'+facet).value='');results(true);document.querySelector('#filter-domain').focus()}
function renderCollection(){
  const batch=currentBatch();
  document.title=`${batch==='all'?'All gigamaps':`Batch ${batch}`} — NID Giga Archive`;
  content.innerHTML=`<h1 class="sr-only">${batch==='all'?'All gigamaps':`Batch ${esc(batch)}`}</h1><div class="collection-controls">
  <form class="archive-search" role="search" aria-label="Search the archive">
    <div class="search-field">${icon('search')}<input type="search" id="search" name="q" aria-keyshortcuts="/ Meta+K Control+K" value="${esc(params().get('q')||'')}" placeholder="${batch==='all'?'Search maps, topics, people…':'Search this batch…'}" aria-label="Search gigamaps" aria-describedby="search-scope" aria-controls="results" autocomplete="off" spellcheck="false" enterkeyhint="search"><kbd id="search-shortcut" aria-hidden="true">/</kbd><button class="search-erase" id="search-clear" type="button" aria-label="Clear search" title="Clear search (Esc)" hidden>${icon('close')}</button></div>
    <span id="search-scope" class="sr-only">${batch==='all'?'Search across all batches.':`Search within batch ${esc(batch)}.`} Search titles, topics, contributor names, and recognized map text where available. Minor typos are supported. Press Enter or Down Arrow to move to results.</span>
    <div class="collection-tools">${filterControls()}<div class="collection-view" role="group" aria-label="Display as"><button type="button" data-view="grid" aria-label="Tile view" title="Tile view" aria-pressed="${view==='grid'}">${icon('grid')}</button><button type="button" data-view="list" aria-label="List view" title="List view" aria-pressed="${view==='list'}">${icon('list')}</button></div></div>
    <div class="active-filters" id="active-filters" hidden><div id="active-filter-list" aria-label="Selected filters"></div><button type="button" class="clear-facet-filters" id="clear-filters">Clear filters</button></div>
    <p class="sr-only" id="search-status" role="status" aria-live="polite" aria-atomic="true"></p>
  </form></div>
  <section class="results-scroll" tabindex="0" aria-label="Gigamaps"><div id="results" class="project-list ${view}"></div></section>`;
  const search=document.querySelector('#search');
  const focusResults=()=>{results(true);(content.querySelector('.project-card')||content.querySelector('.results-scroll')).focus()};
  document.querySelector('.archive-search').addEventListener('submit',event=>{event.preventDefault();focusResults()});
  search.addEventListener('input',event=>{if(event.isComposing)return;cancelAnimationFrame(searchFrame);searchFrame=requestAnimationFrame(()=>results(true))});
  search.addEventListener('compositionend',()=>results(true));
  search.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'&&event.currentTarget.value){event.preventDefault();event.stopPropagation();clearSearch()}
    if(event.key==='ArrowDown'){event.preventDefault();focusResults()}
  });
  document.querySelector('#search-clear').addEventListener('click',clearSearch);
  facets.forEach(facet=>document.querySelector('#filter-'+facet).addEventListener('change',()=>results(true)));
  document.querySelector('#clear-filters').addEventListener('click',clearFilters);
  content.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{
    view=button.dataset.view;
    try{localStorage.setItem('giga-archive-view',view)}catch{}
    document.querySelector('#results').className=`project-list ${view}`;
    window.scrollTo(0,0);
    content.querySelectorAll('[data-view]').forEach(choice=>choice.setAttribute('aria-pressed',choice.dataset.view===view));
    saveCollectionPosition();
  }));
  results();
  watchCollectionLayout();
  document.querySelector('.results-scroll').addEventListener('focusin',()=>saveCollectionPosition());
}
async function route(focus=false,restore=false){
  cancelAnimationFrame(searchFrame);
  stopCollectionLayout?.();stopCollectionLayout=null;
  const revision=++routeRevision;
  content.setAttribute('aria-busy','true');
  const saved=restore?history.state?.archiveCollection:null;
  collectionURL=null;
  window.dispatchEvent(new Event('archive:navigate'));
  if(location.hash==='#contact')history.replaceState({},'',`${location.pathname}${location.search}#about`);
  const id=params().get('project'),p=projects.find(p=>p.id===id),about=location.hash==='#about';
  document.body.classList.toggle('collection-page',!id&&!about);
  document.querySelector('meta[name="description"]').content=defaultDescription;
  updateBatchLinks();
  document.querySelectorAll('[data-nav]').forEach(a=>{const selected=!about&&a.dataset.nav===(p?String(p.batch):currentBatch());a.classList.toggle('selected',selected);selected?a.setAttribute('aria-current','page'):a.removeAttribute('aria-current')});
  if(p||about){
    try{const module=await import('./project.js');if(revision!==routeRevision)return;p?module.renderProject(p,content):module.renderAbout(content)}
    catch(error){if(revision!==routeRevision)return;console.error(error);content.innerHTML=`<div class="empty-state" role="alert"><h1>This page couldn’t load.</h1><p>Your place in the archive is saved.</p><a class="text-button" href="${esc(location.pathname+location.search+location.hash)}" data-reload>Try again</a></div>`}
  }else if(id){content.innerHTML='<div class="empty-state"><h1>Map not found</h1><p>This entry is not in the archive yet.</p><a class="text-button" href="/">Return to the collection</a></div>'}
  else renderCollection();
  if(revision!==routeRevision)return;
  content.setAttribute('aria-busy','false');
  const scroller=document.querySelector('.results-scroll');
  if(scroller&&saved?.url===location.href&&saved.view===view&&Number.isFinite(saved.pageTop)&&saved.pageTop>=0){
    const restorePosition=()=>{if(revision!==routeRevision)return;window.scrollTo(0,saved.pageTop)};
    restorePosition();requestAnimationFrame(restorePosition);
    if(focus){
      const card=[...scroller.querySelectorAll('.project-card')].find(link=>link.getAttribute('href')===saved.project);
      (card||scroller).focus({preventScroll:true});
    }
  }else if(focus){document.querySelector('#main').focus({preventScroll:true});window.scrollTo(0,0)}
}

document.addEventListener('click',e=>{
  const a=e.target.closest('a');
  if(!archiveReady||!a||a.hasAttribute('download')||a.hasAttribute('data-reload')||a.target||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;
  const url=new URL(a.href);
  if(url.origin===location.origin&&url.pathname==='/'&&a.getAttribute('href')!=='#main'){e.preventDefault();saveCollectionPosition(a);history.pushState({},'',url);route(true)}
});
window.addEventListener('popstate',()=>{if(archiveReady)route(true,true)});
window.addEventListener('pagehide',()=>{clearTimeout(positionTimer);saveCollectionPosition()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveCollectionPosition()});
window.addEventListener('scroll',queueCollectionPosition,{passive:true});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]')||event.isComposing)return;
  const command=(event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k';
  const typing=document.activeElement?.closest('input,textarea,select,[contenteditable="true"]');
  if(command||(event.key==='/'&&!event.metaKey&&!event.ctrlKey&&!typing)){
    const search=document.querySelector('#search');
    if(search){event.preventDefault();search.focus();if(command)search.select()}
  }
});
async function loadArchive(){
  archiveReady=false;
  content.setAttribute('aria-busy','true');
  content.replaceChildren(document.querySelector('#loading-template').content.cloneNode(true));
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch('/data/archive.json',{signal:controller.signal});
    if(!response.ok)throw new Error('Could not load archive');
    const data=await response.json();
    if(!Array.isArray(data.projects))throw new Error('Invalid archive');
    projects=data.projects;cardMarkup.clear();
    projects.sort((a,b)=>b.batch-a.batch||a.title.localeCompare(b.title));
    const batches=[...new Set(projects.map(project=>project.batch))];
    document.querySelector('#batch-nav').innerHTML=batches.map(batch=>`<a class="nav-item" href="/?batch=${batch}" data-nav="${batch}"><span>${batch}</span><span class="nav-count">${String(projects.filter(project=>project.batch===batch).length).padStart(2,'0')}</span></a>`).join('');
    document.querySelector('#total-count').textContent=String(projects.length).padStart(2,'0');
    archiveReady=true;
    await route(false,true);
  }catch(error){
    archiveReady=false;
    console.error(error);
    content.setAttribute('aria-busy','false');
    content.innerHTML='<div class="empty-state" role="alert"><h1>The archive couldn’t load.</h1><p>Your search and filters are saved. Please try again in a moment.</p><button type="button" class="retry-button" id="retry-archive">Try again</button></div>';
    document.querySelector('#retry-archive').addEventListener('click',()=>{loadArchive().then(()=>document.querySelector('#main').focus({preventScroll:true}))},{once:true});
  }finally{clearTimeout(timeout)}
}
await loadArchive();
