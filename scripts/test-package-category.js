#!/usr/bin/env node
'use strict';
/**
 * Packs by kind, then by how long they last.
 *
 * Grouped only by validity, a minute pack sits inside a 30-day data section and
 * has to be read to be ruled out. Kind answers the first question, validity the
 * second.
 *
 * Success TopUp sends `product_type`, which providerCatalog maps to `category`.
 * Everything checked here is about the cases where that word is one we have not
 * seen, or is missing - which is most of what a third-party catalogue sends over
 * time.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function load(rel, names) {
  const src = read(rel).replace(/^export (const|function) /gm, '$1 ');
  const mod = {};
  new Function('module', 'exports', `${src}\nmodule.exports={${names.join(',')}};`)(mod, {});
  return mod.exports;
}

const { categoryOf, groupByCategory } = load('src/utils/packageCategory.js', ['categoryOf', 'groupByCategory']);
const { groupByValidity } = load('src/utils/packageValidity.js', ['validityDays', 'groupByValidity']);

console.log('The four categories the real catalogue actually uses');
// BD_Mobile_Operator_Packages.xlsx: 239 regular + 211 drive packs, and exactly
// these four words between them. Everything else in this file is about words
// that are not these.
assert.strictEqual(categoryOf({ category: 'Data' }).label, 'Internet',
  'the provider says Data; the customer came to the Internet screen for internet');
assert.strictEqual(categoryOf({ category: 'Call Rate' }).label, 'Voice',
  'Call Rate joins Voice rather than making a section of one');
assert.strictEqual(categoryOf({ category: 'Voice' }).label, 'Voice');
assert.strictEqual(categoryOf({ category: 'Bundle' }).label, 'Bundle');

console.log('The provider\'s own word decides');
assert.strictEqual(categoryOf({ category: 'Internet' }).key, 'internet');
assert.strictEqual(categoryOf({ category: 'Bundle' }).key, 'bundle');
assert.strictEqual(categoryOf({ category: 'Voice' }).key, 'voice');
// Three spellings of one thing. Left alone they make three sections of one pack
// each, which is worse than no grouping.
for (const word of ['Voice', 'voice', 'Minute', 'Call Rate', 'TalkTime', 'মিনিট']) {
  assert.strictEqual(categoryOf({ category: word }).key, 'voice', `${word} is a voice pack`);
}
for (const word of ['Internet', 'Data', 'ইন্টারনেট', 'ডাটা']) {
  assert.strictEqual(categoryOf({ category: word }).key, 'internet', `${word} is internet`);
}
for (const word of ['Bundle', 'Combo', 'Mixed', 'বান্ডেল']) {
  assert.strictEqual(categoryOf({ category: word }).key, 'bundle', `${word} is a bundle`);
}

console.log('A kind we have not seen keeps its own name');
// Burying it under "Other" hides a product that is for sale, and renaming it
// would put our word on their catalogue.
const unseen = categoryOf({ category: 'Drive Offer' });
assert.strictEqual(unseen.label, 'Drive Offer', 'the provider\'s wording is kept');
assert.notStrictEqual(unseen.key, '__other__', 'and it is not lumped in with the unknowns');
assert.strictEqual(unseen.provided, true, 'it came from the provider, not a guess');

console.log('With no kind at all, the title is read');
assert.strictEqual(categoryOf({ name: '1GB Internet 7 Days' }).key, 'internet');
assert.strictEqual(categoryOf({ name: '100 Minutes 30 Days' }).key, 'voice');
assert.strictEqual(categoryOf({ name: 'Combo 2GB + 100 Min' }).key, 'bundle');
// A guess is marked as one. Nothing reads this yet; it matters the first time
// somebody asks why a pack is filed where it is.
assert.strictEqual(categoryOf({ name: '1GB Internet' }).provided, false, 'a guess says it is a guess');
assert.strictEqual(categoryOf({ name: 'Eid Special' }).key, '__other__', 'and an unguessable one goes to Other');
// Bengali digits must not be mistaken for a word. "৩০ দিন ডাটা" is internet.
assert.strictEqual(categoryOf({ name: '৩০ দিন ডাটা প্যাক' }).key, 'internet', 'a Bengali title is read too');

console.log('Known kinds first, Other last, nothing empty');
const catalogue = [
  { id: 'a', name: '1GB', category: 'Internet', valid: '7 Days', price: 5 },
  { id: 'b', name: '5GB', category: 'Internet', valid: '30 Days', price: 20 },
  { id: 'c', name: '100 Min', category: 'Minute', valid: '30 Days', price: 8 },
  { id: 'd', name: 'Combo', category: 'Bundle', valid: '7 Days', price: 12 },
  { id: 'e', name: 'Drive Pack', category: 'Drive Offer', valid: '3 Days', price: 3 },
  { id: 'f', name: 'Eid Special', valid: 'Unlimited', price: 50 },
];
const groups = groupByCategory(catalogue);
assert.deepStrictEqual(groups.map((g) => g.label),
  ['Voice', 'Bundle', 'Internet', 'Drive Offer', 'Other'],
  'known kinds in their fixed order, then the provider\'s own, then Other');
assert(!groups.some((g) => g.packages.length === 0), 'an empty kind gets no heading');
assert.strictEqual(groups.reduce((n, g) => n + g.packages.length, 0), catalogue.length,
  'every pack lands in exactly one group - a catalogue that loses a row is worse than an ugly one');

console.log('And inside a kind, by how long it lasts');
const internet = groups.find((g) => g.label === 'Internet');
assert.deepStrictEqual(groupByValidity(internet.packages).map((g) => g.label), ['7 Days', '30 Days'],
  'shortest first, in the provider\'s own wording');

console.log('The picker always offers All');
const picker = read('src/components/PackagePicker.js');
// A kind can be a guess, and a wrong guess must not make a pack unreachable.
assert(/label="All"/.test(picker), 'All must be a chip');
assert(/useState\('all'\)/.test(picker), 'and the one selected first, so nothing is hidden on arrival');
// Switching operator changes which kinds exist; a stale selection would light no
// chip while showing everything.
assert(/categories\.some\(\(c\) => c\.key === kind\) \? kind : 'all'/.test(picker),
  'a selected kind that no longer exists must fall back to All');
assert(/categories\.length > 1/.test(picker), 'one kind is not a choice worth chips');
// Asserted as a call, not a mention: the import line carries the name too, so
// matching the bare word passed with the call deleted.
assert(/groupByCategory\(packages\)/.test(picker), 'the picker must actually group by kind');
assert(/categories\.map\(\(c\) =>[\s\S]{0,120}<Chip/.test(picker), 'and render a chip per kind');

console.log('Both screens use it, neither rolls its own');
for (const rel of ['src/steps/InternetSteps.js', 'src/steps/OfferPacksSteps.js']) {
  const step = read(rel);
  assert(/<PackagePicker/.test(step), `${rel} must use the shared picker`);
  assert(!/groupByValidity/.test(step), `${rel} must not group packages itself`);
}

console.log('\nPacks are sorted by kind, then by how long they last.');
