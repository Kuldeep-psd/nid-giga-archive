import { observePreviews } from './preview-state.js';
import { contributionHTML } from './about-template.js';
import { projectPageHTML, icon, escapeHTML as esc, formatFileSize } from './project-template.js';
const mb=project=>formatFileSize(project.downloadBytes);
let libraryPromise;
function loadViewer(){
  if(window.OpenSeadragon)return Promise.resolve(window.OpenSeadragon);
  if(!libraryPromise)libraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    let settled=false;
    const finish=error=>{
      if(settled)return;settled=true;clearTimeout(timeout);
      script.onload=script.onerror=null;
      if(error){libraryPromise=null;script.remove();reject(error)}else resolve(window.OpenSeadragon);
    };
    const timeout=setTimeout(()=>finish(new Error('Viewer took too long to load')),15000);
    script.src='/assets/vendor/openseadragon.min.js';
    script.onload=()=>finish(window.OpenSeadragon?null:new Error('Viewer unavailable'));
    script.onerror=()=>finish(new Error('Viewer unavailable'));
    document.head.append(script);
  });
  return libraryPromise;
}
export function renderProject(p,content){
  document.title=`${p.title} — NID Giga Archive`;
  document.querySelector('meta[name="description"]').content=p.description;
  content.innerHTML=projectPageHTML(p);
  observePreviews(content);
  content.querySelectorAll('[data-region]').forEach(button=>button.addEventListener('click',()=>openMap(p,button.dataset.region)));
}
export function renderAbout(content){
  document.title='About — NID Giga Archive';
  document.querySelector('meta[name="description"]').content='An attempt to document gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.';
  content.innerHTML=`<nav class="breadcrumbs"><a href="/">${icon('back')} Back to the collection</a></nav>
  <div class="about-page">
    <h1>About the archive<span class="heading-dot">.</span></h1>
    <p>NID Giga Archive is an attempt to document all the gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.</p>
    ${contributionHTML()}
    <section class="contributor-section" aria-labelledby="contributor-title">
      <h2 id="contributor-title" class="eyebrow">CONTRIBUTOR</h2>
      <address class="contributor">
        <p class="contributor-name">Kuldeep Singh</p>
        <p class="contributor-batch">Information Design · Batch of 2026</p>
        <div class="contributor-links">
          <a href="mailto:ks00347@gmail.com">ks00347@gmail.com</a>
          <a href="https://www.linkedin.com/in/kuldeep-singh-9818721068/" target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>
        </div>
      </address>
    </section>
  </div>`;
}

async function openMap(p,initialRegion='whole'){
  const dialog=document.querySelector('#map-dialog');if(dialog.open)return;
  const opener=document.activeElement,previousOverflow=document.body.style.overflow;
  const source=p.tileSource||{type:"image",url:p.fullImage||p.overview};
  let viewer,closed=false,retryBounds=null,tileError=false,ready=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  dialog.innerHTML=`<div class="viewer-shell"><header class="viewer-header"><div><p class="eyebrow">BATCH ${p.batch} / SYSTEMS MAP</p><h2 id="map-title">${esc(p.title)}</h2></div><button class="viewer-close icon-button" aria-label="Close map" title="Close map (Esc)" autofocus>${icon('close')}</button></header><div class="viewer-toolbar"><label class="jump-label" for="region-select"${p.regions?.length?'':' hidden'}>Jump to <select id="region-select" disabled><option value="whole">Whole map</option>${(p.regions||[]).map(r=>`<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('')}</select></label><div class="zoom-tools" role="group" aria-label="Map zoom controls"><button class="icon-button" id="zoom-out" aria-label="Zoom out" title="Zoom out (−)" disabled>${icon('minus')}</button><output id="zoom-value" aria-label="Zoom level">100%</output><button class="icon-button" id="zoom-in" aria-label="Zoom in" title="Zoom in (+)" disabled>${icon('plus')}</button><span class="tool-divider"></span><button class="fit-button" id="fit-map" title="Fit whole map (0)" disabled>${icon('expand')}<span>Fit map</span></button></div></div><div class="viewer-stage-wrap"><div id="viewer-stage" aria-busy="true"></div><div id="viewer-message" class="viewer-message" role="status"><span class="loading-spinner"></span><strong>Opening the map…</strong><span>Details load as you explore.</span></div><div id="tile-warning" class="tile-warning" hidden><span>Some details couldn’t load.</span><button id="retry-tiles">Reload map</button></div></div><footer class="viewer-footer"><div><p id="viewer-help">Drag to move · Scroll or pinch to zoom<span> · + / − to zoom · Arrows to move · 0 to fit</span></p><small id="detail-status" role="status"></small></div><a href="${esc(p.download)}" download="${esc(p.title)} — Gigamap.pdf">${icon('download')}<span>Download PDF <small>${mb(p)}</small></span></a></footer></div>`;
  dialog.showModal();document.body.style.overflow='hidden';
  const stage=dialog.querySelector('#viewer-stage'),message=dialog.querySelector('#viewer-message'),select=dialog.querySelector('#region-select'),status=dialog.querySelector('#detail-status');
  select.value=initialRegion;
  const close=()=>{if(closed)return;closed=true;window.removeEventListener('archive:navigate',close);viewer?.destroy();viewer=null;dialog.close();dialog.innerHTML='';document.body.style.overflow=previousOverflow;dialog.removeEventListener('cancel',cancel);dialog.removeEventListener('keydown',keyHandler,true);opener?.isConnected&&opener.focus({preventScroll:true})};
  const cancel=e=>{e.preventDefault();close()};
  const setBusy=busy=>{ready=!busy;stage.setAttribute('aria-busy',String(busy));dialog.querySelectorAll('.viewer-toolbar button,.viewer-toolbar select').forEach(b=>b.disabled=busy)};
  const fit=region=>{if(!viewer?.isOpen())return;select.value=region;if(region==='whole')viewer.viewport.goHome(reduced);else{const r=(p.regions||[]).find(r=>r.id===region);if(r)viewer.viewport.fitBounds(new window.OpenSeadragon.Rect(...r.bounds),reduced)}viewer.viewport.applyConstraints(reduced)};
  const zoom=factor=>{if(!viewer?.isOpen())return;viewer.viewport.zoomBy(factor,undefined,reduced);viewer.viewport.applyConstraints(reduced)};
  const retry=()=>{dialog.querySelector('.viewer-close').focus({preventScroll:true});if(!viewer){close();openMap(p,initialRegion);return}retryBounds=viewer.isOpen()?viewer.viewport.getBounds():null;tileError=false;status.textContent='';setBusy(true);message.hidden=false;message.setAttribute('role','status');message.innerHTML='<span class="loading-spinner"></span><strong>Opening the map…</strong>';dialog.querySelector('#tile-warning').hidden=true;viewer.open(source)};
  const error=()=>{if(closed)return;setBusy(true);stage.setAttribute('aria-busy','false');message.hidden=false;message.setAttribute('role','alert');message.innerHTML='<strong>The map couldn’t load.</strong><span>Try again, or download the PDF below.</span><button class="retry-button">Try again</button>';message.querySelector('button').addEventListener('click',retry)};
  const keyHandler=e=>{if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('select,input,textarea,[contenteditable="true"]')||!ready)return;const pans={ArrowLeft:[-80,0],ArrowRight:[80,0],ArrowUp:[0,-80],ArrowDown:[0,80]};if(e.key==='+'||e.key==='=')zoom(1.5);else if(e.key==='-'||e.key==='_')zoom(1/1.5);else if(e.key==='0')fit('whole');else if(pans[e.key]){viewer.viewport.panBy(viewer.viewport.deltaPointsFromPixels(new window.OpenSeadragon.Point(...pans[e.key])),reduced);viewer.viewport.applyConstraints(reduced)}else return;e.preventDefault();e.stopPropagation()};
  window.addEventListener('archive:navigate',close);dialog.addEventListener('cancel',cancel);dialog.addEventListener('keydown',keyHandler,true);dialog.querySelector('.viewer-close').addEventListener('click',close);select.addEventListener('change',()=>fit(select.value));dialog.querySelector('#zoom-in').addEventListener('click',()=>zoom(1.5));dialog.querySelector('#zoom-out').addEventListener('click',()=>zoom(1/1.5));dialog.querySelector('#fit-map').addEventListener('click',()=>fit('whole'));dialog.querySelector('#retry-tiles').addEventListener('click',retry);
  try{
    const OSD=await loadViewer();if(closed)return;
    viewer=OSD({element:stage,showNavigationControl:false,showNavigator:true,navigatorPosition:'BOTTOM_RIGHT',navigatorWidth:p.height>p.width?54:160,navigatorHeight:p.height>p.width?128:40,navigatorAutoFade:false,navigatorBackground:'var(--viewer-bg)',navigatorBorderColor:'var(--viewer-border)',navigatorDisplayRegionColor:'var(--viewer-selection)',navigatorOpacity:1,drawer:'canvas',animationTime:reduced?0:.45,blendTime:reduced?0:.15,minZoomImageRatio:1,maxZoomPixelRatio:2,visibilityRatio:.7,constrainDuringPan:true,homeFillsViewer:false,imageLoaderLimit:6,maxImageCacheCount:120,timeout:20000,tileRetryMax:2,tileRetryDelay:600,zoomPerScroll:1.25,gestureSettingsMouse:{clickToZoom:false,dblClickToZoom:true,scrollToZoom:true,dragToPan:true},gestureSettingsTouch:{clickToZoom:false,dblClickToZoom:true,pinchToZoom:true,dragToPan:true,flickEnabled:false},gestureSettingsPen:{clickToZoom:false,dblClickToZoom:true,dragToPan:true}});
    viewer.canvas.setAttribute('role','region');viewer.canvas.setAttribute('aria-label','Gigamap, zoomable map');viewer.canvas.setAttribute('aria-describedby','viewer-help');viewer.canvas.setAttribute('aria-keyshortcuts','+ - 0 ArrowUp ArrowDown ArrowLeft ArrowRight');
    viewer.addHandler('canvas-key',event=>{event.preventDefaultAction=true});
    viewer.addHandler('open',()=>{if(closed)return;if(retryBounds){viewer.viewport.fitBounds(retryBounds,true);retryBounds=null}else{fit(initialRegion);viewer.viewport.applyConstraints(true)}viewer.world.getItemAt(0).addHandler('fully-loaded-change',event=>{if(!closed&&!tileError)status.textContent=event.fullyLoaded?'':'Refining the detail…'})});
    viewer.addHandler('tile-drawn',()=>{if(!closed&&!ready){setBusy(false);message.hidden=true;dialog.querySelector('#tile-warning').hidden=!tileError}});
    viewer.addHandler('zoom',()=>{if(!closed&&viewer.viewport){dialog.querySelector('#zoom-value').textContent=`${Math.round(viewer.viewport.getZoom()/viewer.viewport.getHomeZoom()*100)}%`}});
    viewer.addHandler('open-failed',error);
    viewer.addHandler('tile-load-failed',()=>{if(closed||tileError)return;tileError=true;if(!ready)error();else{dialog.querySelector('#tile-warning').hidden=false;status.textContent='Some details couldn’t load. Use Reload map to try again.'}});
    viewer.open(source);
  }catch(e){console.error(e);error()}
}
