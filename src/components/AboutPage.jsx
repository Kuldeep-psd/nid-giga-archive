import React, { useEffect } from 'react';
import { Link } from 'react-router';
import { siteConfig, validateSiteConfig } from '../../dist/site-config.js';
import { Icon } from './Icon.jsx';

export function ContributionSection({ config = siteConfig }) {
  const errors = validateSiteConfig(config);
  if (errors.length) throw new Error(errors.join(' '));

  return (
    <section className="contribution-section" aria-labelledby="contribute-title">
      <h2 id="contribute-title" className="eyebrow">CONTRIBUTE</h2>
      <div className="contribution-route">
        <h3>Submit a gigamap</h3>
        <p>Share your map and its credits through the submission form.</p>
        {config.submissionFormUrl ? (
          <a href={config.submissionFormUrl} target="_blank" rel="noopener noreferrer">
            Open Google Form <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <p className="contribution-pending">Google Form <span aria-hidden="true">·</span> Coming soon</p>
        )}
      </div>
      <div className="contribution-route">
        <h3>Contribute on GitHub</h3>
        <p>This is an open-source project. Improve the website, correct details, or add a map through a pull request.</p>
        <a href={config.repositoryUrl} target="_blank" rel="noopener noreferrer">
          View repository <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

export default function AboutPage() {
  useEffect(() => {
    document.title = 'About — NID Giga Archive';
    document.querySelector('meta[name="description"]')?.setAttribute(
      'content',
      'An attempt to document gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.',
    );
  }, []);

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/"><Icon name="back" /> Back to the collection</Link>
      </nav>
      <div className="about-page">
        <h1>About the archive<span className="heading-dot">.</span></h1>
        <p>NID Giga Archive is an attempt to document all the gigamaps produced over the years by the Information Design and Universal Design departments at the National Institute of Design.</p>
        <ContributionSection />
        <section className="contributor-section" aria-labelledby="contributor-title">
          <h2 id="contributor-title" className="eyebrow">CONTRIBUTOR</h2>
          <address className="contributor">
            <p className="contributor-name">Kuldeep Singh</p>
            <p className="contributor-batch">Information Design · Batch of 2026</p>
            <div className="contributor-links">
              <a href="mailto:ks00347@gmail.com">ks00347@gmail.com</a>
              <a href="https://www.linkedin.com/in/kuldeep-singh-9818721068/" target="_blank" rel="noopener noreferrer">
                LinkedIn <span aria-hidden="true">↗</span>
              </a>
            </div>
          </address>
        </section>
      </div>
    </>
  );
}
