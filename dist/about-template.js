import { escapeHTML as esc } from './project-template.js';
import { siteConfig, validateSiteConfig } from './site-config.js';

export function contributionHTML(config = siteConfig) {
  const errors = validateSiteConfig(config);
  if (errors.length) throw new Error(errors.join(' '));
  return `<section class="contribution-section" aria-labelledby="contribute-title">
    <h2 id="contribute-title" class="eyebrow">CONTRIBUTE</h2>
    <div class="contribution-route">
      <h3>Submit a gigamap</h3>
      <p>Share your map and its credits through the submission form.</p>
      ${config.submissionFormUrl
        ? `<a href="${esc(config.submissionFormUrl)}" target="_blank" rel="noopener noreferrer">Open Google Form <span aria-hidden="true">↗</span></a>`
        : '<p class="contribution-pending">Google Form <span aria-hidden="true">·</span> Coming soon</p>'}
    </div>
    <div class="contribution-route">
      <h3>Contribute on GitHub</h3>
      <p>This is an open-source project. Improve the website, correct details, or add a map through a pull request.</p>
      <a href="${esc(config.repositoryUrl)}" target="_blank" rel="noopener noreferrer">View repository <span aria-hidden="true">↗</span></a>
    </div>
  </section>`;
}
