import { Fragment, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon.jsx';
import Preview from './Preview.jsx';
import MapViewer from './MapViewer.jsx';
import { formatFileSize } from '../lib/format.js';

function Credits({ heading, id, names }) {
  return (
    <section className="credits" aria-labelledby={id}>
      <h2 className="eyebrow" id={id}>{heading}</h2>
      <p>{names.length ? names.map((name, index) => (
        <Fragment key={`${name}-${index}`}>
          {index > 0 && <span aria-hidden="true"> / </span>}{name}
        </Fragment>
      )) : 'Not recorded'}</p>
    </section>
  );
}

// Every catalog entry uses this component, including future entries with optional metadata.
export default function ProjectPage({ project }) {
  const [region, setRegion] = useState(null);
  const { regions = [], methods = [], contributors = [], guides = [] } = project;
  const teamSize = contributors.length || project.teamSize;
  const overview = [project.description, project.process].filter(Boolean).join(' ');
  const batchURL = `/?batch=${project.batch}`;

  return (
    <article className="gigamap-page" aria-labelledby="project-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to={batchURL}><Icon name="back" /> Batch {project.batch}</Link>
        <span>/</span><span>Gigamap</span>
      </nav>
      <header className="project-heading">
        <div>
          <h1 id="project-title">{project.title}</h1>
          <p className="project-subtitle">{project.summary}</p>
        </div>
        <a className="download-button" href={project.download} download={`${project.title} — Gigamap.pdf`}>
          <Icon name="download" /><span>Download PDF<small>{formatFileSize(project.downloadBytes)}</small></span>
        </a>
      </header>
      <section className="map-section" aria-label="Explore the gigamap">
        <Preview
          as="button"
          type="button"
          className="map-preview"
          src={project.overview}
          width={project.width}
          height={project.height}
          alt={project.imageAlt}
          loading="eager"
          fetchPriority="high"
          data-region="whole"
          aria-haspopup="dialog"
          aria-label="Explore the map"
          onClick={() => setRegion('whole')}
        >
          <span className="explore-button"><Icon name="expand" /> Explore the map <span aria-hidden="true">↗</span></span>
        </Preview>
        <div className="map-caption">
          <span>Open the map to pan and zoom</span>
          <span>{project.width.toLocaleString('en-US')} × {project.height.toLocaleString('en-US')} px</span>
        </div>
        {regions.length > 0 && (
          <nav className="region-links" aria-label="Start with a section">
            {regions.map((item, index) => (
              <button type="button" key={item.id} data-region={item.id} aria-haspopup="dialog" onClick={() => setRegion(item.id)}>
                <span className="region-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span>{item.title}</span><Icon name="arrow" />
              </button>
            ))}
          </nav>
        )}
      </section>
      <section className="project-context" aria-labelledby="map-context-heading">
        <div className="context-text">
          <h2 className="eyebrow" id="map-context-heading">ABOUT THIS MAP</h2>
          <p>{overview}</p>
          {methods.length > 0 && <div className="method-list">{methods.map(method => <span className="tag" key={method}>{method}</span>)}</div>}
        </div>
        <dl className="project-facts">
          <div><dt>Batch</dt><dd>{project.batch}</dd></div>
          <div><dt>Team</dt><dd>{teamSize ? `${teamSize} ${teamSize === 1 ? 'contributor' : 'contributors'}` : 'Not recorded'}</dd></div>
        </dl>
      </section>
      <Credits heading="CONTRIBUTORS" id="map-contributors-heading" names={contributors} />
      <Credits heading="GUIDED BY" id="map-guides-heading" names={guides} />
      <Link className="back-link" to={batchURL}><Icon name="back" /> Back to batch {project.batch}</Link>
      {region !== null && <MapViewer key={project.id} project={project} initialRegion={region} onClose={() => setRegion(null)} />}
    </article>
  );
}
