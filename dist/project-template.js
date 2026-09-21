// Every archive entry uses this page. Keep project-specific content in archive.json.
const icons = {
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  minus: '<path d="M5 12h14"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};
export const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.arrow}</svg>`;
export const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}
const esc = escapeHTML;
const credits = (heading, id, names) => `
  <section class="credits" aria-labelledby="${id}">
    <h2 class="eyebrow" id="${id}">${heading}</h2>
    <p>${names.length ? names.map(esc).join('<span aria-hidden="true"> / </span>') : 'Not recorded'}</p>
  </section>`;

export function projectPageHTML(project) {
  const { regions = [], methods = [], contributors = [], guides = [] } = project;
  const teamSize = contributors.length || project.teamSize;
  const batch = esc(project.batch);
  // The 2023 layout is the contract: one overview, two facts, two credit rows.
  // Extra source metadata must not introduce per-project layout variants.
  const overview = [project.description, project.process].filter(Boolean).join(' ');
  return `<article class="gigamap-page" aria-labelledby="project-title">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="/?batch=${batch}">${icon('back')} Batch ${batch}</a><span>/</span><span>Gigamap</span>
  </nav>
  <header class="project-heading">
    <div><h1 id="project-title">${esc(project.title)}</h1><p class="project-subtitle">${esc(project.summary)}</p></div>
    <a class="download-button" href="${esc(project.download)}" download="${esc(project.title)} — Gigamap.pdf">
      ${icon('download')}<span>Download PDF<small>${formatFileSize(project.downloadBytes)}</small></span>
    </a>
  </header>
  <section class="map-section" aria-label="Explore the gigamap">
    <button type="button" data-preview class="map-preview is-loading${project.height > project.width ? ' is-portrait' : ''}" data-region="whole" aria-haspopup="dialog" aria-label="Explore the map">
      <img src="${esc(project.overview)}" width="${project.width}" height="${project.height}" alt="${esc(project.imageAlt)}" decoding="async" fetchpriority="high">
      <span class="explore-button">${icon('expand')} Explore the map <span aria-hidden="true">↗</span></span>
    </button>
    <div class="map-caption"><span>Open the map to pan and zoom</span><span>${project.width.toLocaleString('en-US')} × ${project.height.toLocaleString('en-US')} px</span></div>
    ${regions.length ? `<nav class="region-links" aria-label="Start with a section">${regions.map((region, index) => `
      <button type="button" data-region="${esc(region.id)}" aria-haspopup="dialog">
        <span class="region-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span>${esc(region.title)}</span>${icon('arrow')}
      </button>`).join('')}
    </nav>` : ''}
  </section>
  <section class="project-context" aria-labelledby="map-context-heading">
    <div class="context-text">
      <h2 class="eyebrow" id="map-context-heading">ABOUT THIS MAP</h2>
      <p>${esc(overview)}</p>
      ${methods.length ? `<div class="method-list">${methods.map(method => `<span class="tag">${esc(method)}</span>`).join('')}</div>` : ''}
    </div>
    <dl class="project-facts">
      <div><dt>Batch</dt><dd>${batch}</dd></div>
      <div><dt>Team</dt><dd>${teamSize ? `${teamSize} ${teamSize === 1 ? 'contributor' : 'contributors'}` : 'Not recorded'}</dd></div>
    </dl>
  </section>
  ${credits('CONTRIBUTORS', 'map-contributors-heading', contributors)}
  ${credits('GUIDED BY', 'map-guides-heading', guides)}
  <a class="back-link" href="/?batch=${batch}">${icon('back')} Back to batch ${batch}</a>
</article>`;
}
