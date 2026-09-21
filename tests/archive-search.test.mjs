import test from 'node:test';
import assert from 'node:assert/strict';
import { filterProjects, filterOptions } from '../dist/archive-search.js';

// Synthetic fixtures exercise combinations without adding invented maps to the archive.
const projects=[
  {id:'digital',batch:2026,title:'Digital garden',description:'Cloud infrastructure',domains:['Technology'],topics:['Digital life'],methods:['Causal loops'],contributors:['Kuldeep Singh']},
  {id:'water',batch:2026,title:'River systems',domains:['Environment'],topics:['Water'],methods:['Causal loops'],contributors:['Example Author']},
  {id:'older',batch:2024,title:'Cloud networks',domains:['Technology'],topics:['Digital life'],methods:['Interviews']},
  {id:'minimal',batch:2025,title:'Minimal record',tags:['Legacy topic']},
];
const ids=criteria=>filterProjects(projects,criteria).map(p=>p.id);
test('all query terms can match across fields, case-insensitively and by prefix',()=>{
  assert.deepEqual(ids({query:'  KULDeep  clo  '}),['digital']);
  assert.deepEqual(ids({query:'cloud missing'}),[]);
  assert.deepEqual(ids({query:'technology loops'}),['digital']);
});
test('batch, domain, topic, method and query intersect',()=>{
  assert.deepEqual(ids({batch:'2026',domain:'Technology',topic:'Digital life',method:'Causal loops',query:'garden'}),['digital']);
  assert.deepEqual(ids({batch:'2024',domain:'Technology',method:'Causal loops'}),[]);
  assert.deepEqual(ids({domain:'Technology',topic:'Water'}),[]);
  assert.deepEqual(ids({method:'Interviews'}),['older']);
});
test('filters match exact values and unknown filters give no matches',()=>{
  assert.deepEqual(ids({domain:'Tech'}),[]);
  assert.deepEqual(ids({topic:'Unknown'}),[]);
  assert.deepEqual(ids({batch:'2015'}),[]);
});
test('empty queries include all matches without reordering the source',()=>{
  assert.deepEqual(ids({query:' \n '}),['digital','water','older','minimal']);
  assert.deepEqual(ids({domain:'Technology'}),['digital','older']);
});
test('options come from actual metadata and tolerate partial records',()=>{
  assert.deepEqual(filterOptions(projects,'domain'),['Environment','Technology']);
  assert.deepEqual(filterOptions(projects,'topic'),['Digital life','Legacy topic','Water']);
  assert.deepEqual(ids({topic:'Legacy topic'}),['minimal']);
  assert.deepEqual(filterProjects([],{}),[]);
});

test('one-edit typos match longer terms, but every query token must match',()=>{
  assert.deepEqual(ids({query:'digita'}),['digital','older']);
  assert.deepEqual(ids({query:'digotal kuldeep'}),['digital']);
  assert.deepEqual(ids({query:'digotal missing'}),[]);
  assert.deepEqual(ids({query:'dxxital'}),[]);
});

test('numeric years and short terms are never fuzzy matched',()=>{
  assert.deepEqual(ids({query:'2027'}),[]);
  assert.deepEqual(ids({query:'riv'}),['water']);
  assert.deepEqual(ids({query:'rix'}),[]);
  assert.deepEqual(ids({query:'2024'}),['older']);
});

test('search folds accents, treats punctuation as boundaries, and tolerates scalar fields',()=>{
  const records=[
    {title:'Café — Water', contributors:['José Singh'], methods:'Interviews', topics:'Réuse'},
    {title:'Water', contributors:['Other Author']},
  ];
  assert.deepEqual(filterProjects(records,{query:'CAFE jose réuse'}),[records[0]]);
  assert.deepEqual(filterProjects(records,{query:'café-water'}),[records[0]]);
  assert.deepEqual(filterProjects(records,{query:'interviews'}),[records[0]]);
  assert.deepEqual(filterProjects(records,{query:'— …'}),records);
});

test('exact terms rank before prefix and fuzzy matches regardless of field boost',()=>{
  const records=[
    {id:'fuzzy',title:'Gardin'},
    {id:'prefix',title:'Gardens'},
    {id:'exact',title:'A study',description:'Garden'},
  ];
  assert.deepEqual(filterProjects(records,{query:'garden'}).map(p=>p.id),['exact','prefix','fuzzy']);
});

test('titles and topics rank above descriptions while filters stay exact',()=>{
  const records=[
    {id:'description',title:'A study',description:'Migration',domains:['Environment']},
    {id:'topic',title:'A study',topics:['Migration'],domains:['Environment']},
    {id:'title',title:'Migration',domains:['Technology']},
  ];
  assert.deepEqual(filterProjects(records,{query:'migration'}).map(p=>p.id),['title','topic','description']);
  assert.deepEqual(filterProjects(records,{query:'migraton',domain:'Environment'}).map(p=>p.id),['topic','description']);
  assert.deepEqual(filterProjects(records,{query:'migration',domain:'Environmen'}),[]);
});

test('in-word fragments remain a last-resort search fallback within filters',()=>{
  assert.deepEqual(ids({query:'frastructure'}),['digital']);
  assert.deepEqual(ids({query:'frastructure',batch:'2024'}),[]);
  const records=[{id:'whole',title:'Art'},{id:'inside',title:'Cartography'}];
  assert.deepEqual(filterProjects(records,{query:'art'}).map(p=>p.id),['whole']);
});

test('partial records need no IDs, source arrays stay untouched, and appended maps are indexed',()=>{
  const records=[{title:'Garden'},{title:'River'}];
  const original=structuredClone(records);
  assert.deepEqual(filterProjects(records,{query:'garden'}),[records[0]]);
  assert.deepEqual(records,original);
  records.push({title:'Garden additions'});
  assert.equal(filterProjects(records,{query:'additions'})[0],records[2]);
  assert.deepEqual(filterProjects(records,{}),records);
});

test('repeated searches reuse the metadata index for the same loaded collection',()=>{
  let titleReads=0;
  const records=[{get title(){ titleReads+=1; return 'Garden infrastructure'; }}];
  filterProjects(records,{query:'garden'});
  const readsAfterIndex=titleReads;
  assert.ok(readsAfterIndex>0);
  filterProjects(records,{query:'infra'});
  filterProjects(records,{query:'gardan'});
  filterProjects(records,{query:'missing'});
  assert.equal(titleReads,readsAfterIndex);
});

test('optional OCR makes source text searchable while all query terms still have to match',()=>{
  const records=[
    {id:'commons',title:'The Silent Crisis',domains:['Environment'],ocrText:'Community commons provide ecosystem services and support livelihoods.'},
    {id:'other',title:'Another map',ocrText:'Community decisions.'},
  ];
  const search=criteria=>filterProjects(records,criteria).map(p=>p.id);
  assert.deepEqual(search({query:'ecosystem livelihoods'}),['commons']);
  assert.deepEqual(search({query:'crisis livelihoods'}),['commons']);
  assert.deepEqual(search({query:'community missing'}),[]);
  assert.deepEqual(search({query:'ecosystem',domain:'Technology'}),[]);
});

test('curated titles and topics rank ahead of equivalent OCR-only matches',()=>{
  const records=[
    {id:'ocr',title:'A map',ocrText:'Biodiversity conservation'},
    {id:'topic',title:'A map',topics:['Biodiversity conservation']},
    {id:'title',title:'Biodiversity conservation'},
  ];
  assert.deepEqual(filterProjects(records,{query:'biodiversity conservation'}).map(p=>p.id),['title','topic','ocr']);
  assert.deepEqual(filterProjects(records,{}),records);
});

test('records without OCR keep their metadata ranking and filter behaviour',()=>{
  const records=[
    {id:'description',title:'A map',description:'Water',domains:['Environment']},
    {id:'title',title:'Water',domains:['Environment']},
    {id:'other',title:'Cloud',domains:['Technology']},
  ];
  assert.deepEqual(filterProjects(records,{query:'water'}).map(p=>p.id),['title','description']);
  assert.deepEqual(filterProjects(records,{domain:'Environment'}),records.slice(0,2));
  assert.deepEqual(filterProjects(records,{query:'missing'}),[]);
});
