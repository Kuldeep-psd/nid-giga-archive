import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import ProjectPage from '../src/components/ProjectPage.jsx';
import { formatFileSize } from '../src/lib/format.js';

const projectPageHTML = project => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ProjectPage, { project })));

const { projects } = JSON.parse(await readFile(new URL('../dist/data/archive.json', import.meta.url), 'utf8'));
const base = () => structuredClone(projects[0]);

test('every catalog entry uses the same page sections and its own assets', () => {
  for (const project of projects) {
    const html = projectPageHTML(project);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, project.id);
    const sections = ['class="breadcrumbs"', 'class="project-heading"', 'class="map-section"', 'class="project-context"', 'id="map-contributors-heading"', 'id="map-guides-heading"', 'class="back-link"'];
    const positions = sections.map(section => html.indexOf(section));
    assert.ok(positions.every(position => position >= 0), project.id);
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), project.id);
    assert.ok(html.includes(`src="${project.overview}"`), project.id);
    assert.ok(html.includes(`href="${project.download}"`), project.id);
    assert.ok(html.includes(`href="/?batch=${project.batch}"`), project.id);
    assert.equal((html.match(/data-region=/g) || []).length, project.regions.length + 1);
    assert.deepEqual([...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map(match => match[1]), ['Batch', 'Team'], project.id);
    const overview = html.slice(html.indexOf('<div class="context-text">'), html.indexOf('<dl class="project-facts">'));
    assert.equal((overview.match(/<p\b/g) || []).length, 1, project.id);
    assert.ok(!html.includes('context-secondary'), project.id);
    assert.ok(!/systems (?:design|thinking|mapping)|complete map|site-footer/i.test(html));
  }
});

test('future entries keep the 2023 layout and explicitly identify unrecorded credits', () => {
  const project = base();
  for (const key of ['contributors', 'guides', 'methods', 'process', 'duration', 'teamSize', 'institution']) delete project[key];
  project.regions = [];
  const html = projectPageHTML(project);
  for (const text of ['Download PDF', 'Explore the map', 'ABOUT THIS MAP', 'CONTRIBUTORS', 'GUIDED BY', 'Back to batch']) assert.ok(html.includes(text));
  assert.ok(!/class="(?:region-links|method-list)"|<dt>Duration<|<dt>Institution<|undefined|null/.test(html));
  assert.deepEqual([...html.matchAll(/<dt>([^<]+)<\/dt>/g)].map(match => match[1]), ['Batch', 'Team']);
  assert.equal((html.match(/Not recorded/g) || []).length, 3);
});

test('additional source facts and process text cannot introduce a different page format', () => {
  const project = { ...base(), duration: '12 weeks', institution: 'Source institution', process: 'Verified additional context.' };
  const html = projectPageHTML(project);
  assert.ok(html.includes(`${project.description} ${project.process}</p>`));
  assert.ok(!html.includes('<dt>Duration</dt>'));
  assert.ok(!html.includes('<dt>Institution</dt>'));
  assert.equal((html.match(/class="credits"/g) || []).length, 2);
});

test('team facts derive from credited names even when redundant team size is omitted', () => {
  const project = base();
  delete project.teamSize;
  assert.ok(projectPageHTML(project).includes('<dd>6 contributors</dd>'));
  project.contributors = ['One contributor'];
  assert.ok(projectPageHTML(project).includes('<dd>1 contributor</dd>'));
});

test('portrait and square maps preserve actual image dimensions and share the same controls', () => {
  for (const [width, height] of [[800, 2400], [1200, 1200], [3000, 600]]) {
    const html = projectPageHTML({ ...base(), width, height });
    assert.ok(html.includes(`width="${width}" height="${height}"`));
    assert.equal(html.includes('is-portrait'), height > width);
    assert.ok(html.includes('data-region="whole"'));
  }
});

test('section numbering remains correct beyond nine and all sections remain accessible', () => {
  const project = base();
  project.regions = Array.from({ length: 12 }, (_, i) => ({ id: `section-${i + 1}`, title: `Section ${i + 1}`, bounds: [0, 0, 1, 0.25] }));
  const html = projectPageHTML(project);
  assert.ok(html.includes('aria-hidden="true">09</span>'));
  assert.ok(html.includes('aria-hidden="true">10</span>'));
  assert.ok(!html.includes('>010<'));
  assert.equal((html.match(/aria-haspopup="dialog"/g) || []).length, 13);
});

test('future catalog text is escaped in headings, credits, sections, descriptions and image attributes', () => {
  const project = base();
  const text = '<img src=x onerror="alert(1)"> & a quote';
  for (const key of ['title', 'summary', 'description', 'process', 'institution', 'imageAlt']) project[key] = text;
  project.contributors = [text]; project.guides = [text]; project.methods = [text];
  project.regions[0].title = text;
  const html = projectPageHTML(project);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('onerror="alert(1)"'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; a quote'));
});

test('download labels support small and large future PDFs without showing 0 MB', () => {
  assert.equal(formatFileSize(25049162), '24 MB');
  assert.equal(formatFileSize(100545327), '96 MB');
  assert.equal(formatFileSize(512 * 1024), '512 KB');
  assert.equal(formatFileSize(1.5 * 1024 ** 3), '1.5 GB');
});
