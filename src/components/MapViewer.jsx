import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';
import { createMapViewer, initialViewerState } from '../lib/viewer.js';
import { formatFileSize } from '../lib/format.js';

export default function MapViewer({ project, initialRegion = 'whole', onClose }) {
  const dialogRef = useRef(null);
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const controlsRef = useRef(null);
  const openerRef = useRef(null);
  const [state, setState] = useState(() => initialViewerState(initialRegion));
  const ready = state.phase === 'ready';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!openerRef.current) openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    closeRef.current.focus({ preventScroll: true });
    const controls = createMapViewer({
      element: stageRef.current,
      project,
      initialRegion,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onChange: setState,
    });
    controlsRef.current = controls;
    return () => {
      controls.destroy();
      controlsRef.current = null;
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true });
    };
  }, [project, initialRegion]);

  function retry() {
    closeRef.current?.focus({ preventScroll: true });
    controlsRef.current?.retry();
  }

  function onKeyDown(event) {
    if (!ready || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('select,input,textarea,[contenteditable="true"]')) return;
    const controls = controlsRef.current;
    const pans = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
    if (event.key === '+' || event.key === '=') controls.zoom(1.5);
    else if (event.key === '-' || event.key === '_') controls.zoom(1 / 1.5);
    else if (event.key === '0') controls.fit('whole');
    else if (pans[event.key]) controls.pan(...pans[event.key]);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog id="map-dialog" ref={dialogRef} aria-labelledby="map-title" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDownCapture={onKeyDown}>
      <div className="viewer-shell">
        <header className="viewer-header">
          <div><p className="eyebrow">BATCH {project.batch} / GIGAMAP</p><h2 id="map-title">{project.title}</h2></div>
          <button ref={closeRef} type="button" className="viewer-close icon-button" aria-label="Close map" title="Close map (Esc)" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="viewer-toolbar">
          <label className="jump-label" htmlFor="region-select" hidden={!project.regions?.length}>
            Jump to <select id="region-select" disabled={!ready} value={state.region} onChange={event => controlsRef.current?.fit(event.target.value)}>
              <option value="whole">Whole map</option>
              {(project.regions || []).map(region => <option key={region.id} value={region.id}>{region.title}</option>)}
            </select>
          </label>
          <div className="zoom-tools" role="group" aria-label="Map zoom controls">
            <button type="button" className="icon-button" id="zoom-out" aria-label="Zoom out" title="Zoom out (−)" disabled={!ready} onClick={() => controlsRef.current?.zoom(1 / 1.5)}><Icon name="minus" /></button>
            <output id="zoom-value" aria-label="Zoom level">{state.zoom}%</output>
            <button type="button" className="icon-button" id="zoom-in" aria-label="Zoom in" title="Zoom in (+)" disabled={!ready} onClick={() => controlsRef.current?.zoom(1.5)}><Icon name="plus" /></button>
            <span className="tool-divider" />
            <button type="button" className="fit-button" id="fit-map" title="Fit whole map (0)" disabled={!ready} onClick={() => controlsRef.current?.fit('whole')}><Icon name="expand" /><span>Fit map</span></button>
          </div>
        </div>
        <div className="viewer-stage-wrap">
          <div id="viewer-stage" ref={stageRef} aria-busy={state.phase === 'loading'} />
          {state.phase !== 'ready' && (
            <div id="viewer-message" className="viewer-message" role={state.phase === 'error' ? 'alert' : 'status'}>
              {state.phase === 'error' ? <>
                <strong>The map couldn’t load.</strong>
                <span>Try again, or download the PDF below.</span>
                <button type="button" className="retry-button" onClick={retry}>Try again</button>
              </> : <>
                <span className="loading-spinner" aria-hidden="true" />
                <strong>Opening the map…</strong><span>Details load as you explore.</span>
              </>}
            </div>
          )}
          {ready && state.warning && <div id="tile-warning" className="tile-warning"><span>Some details couldn’t load.</span><button type="button" id="retry-tiles" onClick={retry}>Reload map</button></div>}
        </div>
        <footer className="viewer-footer">
          <div>
            <p id="viewer-help">Drag to move · Scroll or pinch to zoom<span> · + / − to zoom · Arrows to move · 0 to fit</span></p>
            <small id="detail-status" role="status">{state.detail}</small>
          </div>
          <a href={project.download} download={`${project.title} — Gigamap.pdf`}><Icon name="download" /><span>Download PDF <small>{formatFileSize(project.downloadBytes)}</small></span></a>
        </footer>
      </div>
    </dialog>,
    document.body,
  );
}
