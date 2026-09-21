import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import AboutPage, { ContributionSection } from '../src/components/AboutPage.jsx';
import { siteConfig, validateSiteConfig } from '../dist/site-config.js';

const render = component => renderToStaticMarkup(React.createElement(MemoryRouter, null, component));
const contributionHTML = config => render(React.createElement(ContributionSection, { config }));

test('the not-yet-created Google Form is honest, non-interactive text', () => {
  const html = contributionHTML({ ...siteConfig, submissionFormUrl: null });
  assert.match(html, /Google Form.*Coming soon/);
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /href="https:\/\/github.com\/Kuldeep-psd\/nid-giga-archive"/);
  assert.doesNotMatch(html, /<button|href="#"/);
});

test('a configured Google Form becomes an accessible external link', () => {
  for (const submissionFormUrl of ['https://forms.gle/example', 'https://docs.google.com/forms/d/e/example/viewform?usp=sharing&x=1']) {
    const html = contributionHTML({ ...siteConfig, submissionFormUrl });
    assert.match(html, />Open Google Form /);
    assert.equal((html.match(/rel="noopener noreferrer"/g) || []).length, 2);
    assert.doesNotMatch(html, /Coming soon/);
  }
  assert.match(contributionHTML({ ...siteConfig, submissionFormUrl: 'https://forms.gle/example?a=1&b=2' }), /a=1&amp;b=2/);
});

test('configuration rejects unsafe or misleading submission and repository links', () => {
  for (const submissionFormUrl of ['javascript:alert(1)', 'http://forms.gle/example', 'https://forms.gle.evil.test/form', 'https://evil.test/', 'https://docs.google.com/document/example', 'https://name:password@forms.gle/example', '']) {
    assert.ok(validateSiteConfig({ ...siteConfig, submissionFormUrl }).length);
    assert.throws(() => contributionHTML({ ...siteConfig, submissionFormUrl }));
  }
  assert.ok(validateSiteConfig({ ...siteConfig, repositoryUrl: 'https://github.com.evil.test/a/b' }).length);
});

test('the React About page retains the approved archive context and contributor details', () => {
  const html = render(React.createElement(AboutPage));
  assert.match(html, /Information Design and Universal Design departments at the National Institute of Design/);
  assert.match(html, /Information Design · Batch of 2026/);
  assert.match(html, /href="mailto:ks00347@gmail.com"/);
  assert.match(html, /href="https:\/\/www.linkedin.com\/in\/kuldeep-singh-9818721068\/"/);
  assert.match(html, /href="\/"[^>]*>.*Back to the collection/);
  assert.equal((html.match(/class="contributor-section"/g) || []).length, 1);
  assert.doesNotMatch(html, /<footer|href="tel:|Batch of 2024|GIGA ARCHIVE/);
});
