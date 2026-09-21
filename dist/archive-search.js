import MiniSearch from './assets/vendor/minisearch-7.2.0.js';

// Search uses catalog metadata and optional OCR extracted during ingestion.
// Map images and PDF contents are never fetched at search time.
// Each loaded array gets one index. Replace the array when editing existing metadata.
const indexes = new WeakMap();
const fieldBoosts = { title: 5, topics: 4, domains: 3, tags: 3, contributors: 2, methods: 2, batch: 2, summary: 1.5, description: 1, ocrText: 0.35 };
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const tokenize = text => normalize(text).match(/[\p{L}\p{N}\p{M}]+/gu) ?? [];
const textValues = values => (Array.isArray(values) ? values : [values])
  .filter(value => typeof value === 'string' || typeof value === 'number').join(' ');

export function facetValues(project, facet) {
  const values = facet === 'topic' ? (project.topics ?? project.tags)
    : facet === 'domain' ? project.domains : project.methods;
  return (Array.isArray(values) ? values : values ? [values] : []).map(String);
}

export function filterOptions(projects, facet) {
  return [...new Set(projects.flatMap(project => facetValues(project, facet)))].sort((a, b) => a.localeCompare(b));
}

function getIndex(projects) {
  const existing = indexes.get(projects);
  if (existing?.length === projects.length) return existing;

  const records = projects.map((project, id) => {
    const fields = {
      title: textValues(project.title),
      summary: textValues(project.summary),
      description: textValues(project.description),
      batch: textValues(project.batch),
      domains: textValues(facetValues(project, 'domain')),
      topics: textValues(facetValues(project, 'topic')),
      tags: textValues(project.tags),
      methods: textValues(facetValues(project, 'method')),
      contributors: textValues(project.contributors),
      ocrText: textValues(project.ocrText),
    };
    const text = normalize(Object.values(fields).join(' '));
    return { id, fields, text, terms: new Set(tokenize(text)) };
  });
  const index = new MiniSearch({
    fields: Object.keys(fieldBoosts),
    tokenize,
    processTerm: normalize,
    searchOptions: {
      combineWith: 'AND',
      prefix: true,
      // One edit, never a percentage: longer words must not admit unrelated results.
      fuzzy: term => term.length >= 4 && !/^\d+$/.test(term) ? 1 : false,
      maxFuzzy: 1,
      boost: fieldBoosts,
      weights: { prefix: 0.6, fuzzy: 0.2 },
    },
  });
  // Internal numeric IDs also allow partial records without an archive ID.
  index.addAll(records.map(record => ({ id: record.id, ...record.fields })));
  const cached = { index, records, length: projects.length };
  indexes.set(projects, cached);
  return cached;
}

function matchTier(record, terms) {
  if (terms.every(term => record.terms.has(term))) return 0;
  const words = [...record.terms];
  if (terms.every(term => words.some(word => word.startsWith(term)))) return 1;
  return 2;
}

export function filterProjects(projects, { batch = 'all', query = '', domain = '', topic = '', method = '' } = {}) {
  const matchesFilters = project => (batch === 'all' || String(project.batch) === String(batch))
    && (!domain || facetValues(project, 'domain').includes(domain))
    && (!topic || facetValues(project, 'topic').includes(topic))
    && (!method || facetValues(project, 'method').includes(method));
  const terms = [...new Set(tokenize(query))];
  if (!terms.length || !projects.length) return projects.filter(matchesFilters);

  const { index, records } = getIndex(projects);
  const matches = index.search(terms.join(' '), { filter: result => matchesFilters(projects[result.id]) });
  if (matches.length) {
    return matches.map(result => ({ ...result, tier: matchTier(records[result.id], terms) }))
      .sort((a, b) => a.tier - b.tier || b.score - a.score || a.id - b.id)
      .map(result => projects[result.id]);
  }

  // Preserve useful in-word searches (e.g. "frastructure") only when the index
  // finds no matches within the selected filters. Normal queries use the index.
  return records.filter(record => matchesFilters(projects[record.id])
    && terms.every(term => record.text.includes(term))).map(record => projects[record.id]);
}
