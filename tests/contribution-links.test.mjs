import test from 'node:test';
import assert from 'node:assert/strict';
import { contributionHTML } from '../dist/about-template.js';
import { siteConfig, validateSiteConfig } from '../dist/site-config.js';

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
