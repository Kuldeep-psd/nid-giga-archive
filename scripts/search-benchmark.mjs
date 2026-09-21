import { performance } from 'node:perf_hooks';
import { filterProjects } from '../dist/archive-search.js';

// Synthetic metadata only. This script never reads or changes the real archive.
// Run: node scripts/search-benchmark.mjs
const topics = ['Climate migration', 'Water access', 'Digital infrastructure', 'Healthcare', 'Family support'];
const queries = ['climate', 'migraton', 'digital infrastructure', '2023 healthcare', 'missing topic', 'frastructure'];
const percentile = (samples, fraction) => [...samples].sort((a, b) => a - b)[Math.floor((samples.length - 1) * fraction)];

for (const count of [100, 1000, 5000]) {
  const projects = Array.from({ length: count }, (_, i) => ({
    id: `synthetic-${i}`,
    title: `${topics[i % topics.length]} research ${i}`,
    batch: 2014 + (i % 13),
    summary: `An archive study of ${topics[i % topics.length].toLowerCase()} and everyday life.`,
    description: 'Research examines relationships between communities, services, public policy, and lived experience through field observations and interviews.',
    topics: [topics[i % topics.length]],
    domains: [i % 2 ? 'Environment' : 'Society'],
    methods: ['Interviews', 'Causal loops'],
    contributors: [`Researcher ${i}`, `Collaborator ${i % 23}`],
  }));
  const started = performance.now();
  filterProjects(projects, { query: queries[0] });
  const firstQueryMs = performance.now() - started;
  for (const query of queries) filterProjects(projects, { query });
  const samples = [];
  let resultCount = 0;
  for (let i = 0; i < 120; i += 1) {
    const before = performance.now();
    resultCount += filterProjects(projects, { query: queries[i % queries.length] }).length;
    samples.push(performance.now() - before);
  }
  console.log(JSON.stringify({
    records: count,
    firstQueryIncludingIndexMs: +firstQueryMs.toFixed(2),
    warmQueryMedianMs: +percentile(samples, 0.5).toFixed(2),
    warmQueryP95Ms: +percentile(samples, 0.95).toFixed(2),
    queriesMeasured: samples.length,
    resultCount,
  }));
}
