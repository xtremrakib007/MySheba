#!/usr/bin/env node
'use strict';
/**
 * The home header, per country.
 *
 * A Bangladeshi in Kuala Lumpur, an Indian in Jakarta and a Nepali in Doha open
 * the same app. The header is the one place it says where somebody is from, and
 * everything else stays as it is.
 *
 * The ways this goes wrong are all quiet: a country the app serves with no
 * header of its own, a header for a country whose flag cannot be drawn, or an
 * unknown country returning nothing and taking the home screen down.
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
const { heroFor, HERO_COUNTRIES, greetingForHour } = load('src/data/countryHero.js', ['heroFor', 'HERO_COUNTRIES', 'greetingForHour']);

console.log('Every country has a header, and an unknown one still gets one');
for (const code of HERO_COUNTRIES) {
  const hero = heroFor(code);
  assert(hero.name, `${code} must be named`);
  assert(Array.isArray(hero.gradient) && hero.gradient.length === 2, `${code} needs two gradient stops`);
  for (const c of [...hero.gradient, hero.accent]) {
    assert(/^#[0-9A-Fa-f]{6}$/.test(c), `${code} has a colour that is not a hex triplet: ${c}`);
  }
}
// Never null: the home screen draws this before it knows anything, and a
// missing header is a blank screen rather than a missing flourish.
for (const unknown of ['', null, undefined, 'ZZ', 'not a country']) {
  const hero = heroFor(unknown);
  assert(Array.isArray(hero.gradient) && hero.gradient.length === 2, 'an unknown country still gets a gradient');
  assert.strictEqual(hero.name, '', 'and is not given a made-up name');
}
assert.strictEqual(heroFor('bd').name, 'Bangladesh', 'a lowercase code is the same country');

console.log('Every header country can have its flag drawn');
// A header naming a country it cannot draw a flag for looks broken in exactly
// the place this feature exists to improve.
const flags = read('src/components/CountryFlag.js');
const drawn = new Set([...flags.matchAll(/^ {2}([A-Z]{2}): \(\) => \(/gm)].map((m) => m[1]));
for (const code of HERO_COUNTRIES) {
  assert(drawn.has(code), `${code} has a header but no flag is drawn for it`);
}

console.log('The greeting follows the clock, not the build');
assert.strictEqual(greetingForHour(5), 'Good morning');
assert.strictEqual(greetingForHour(11), 'Good morning');
assert.strictEqual(greetingForHour(12), 'Good afternoon');
assert.strictEqual(greetingForHour(16), 'Good afternoon');
assert.strictEqual(greetingForHour(17), 'Good evening');
assert.strictEqual(greetingForHour(23), 'Good evening');
// A bad hour must not produce "Good undefined".
for (const bad of [-1, 24, NaN, null, 'x']) {
  assert.strictEqual(greetingForHour(bad), 'Welcome', `an impossible hour (${bad}) falls back`);
}

console.log('Only the home screen wears it, and the rest of the app is untouched');
const header = read('src/components/AppHeader.js');
assert(/hero = false/.test(header), 'the hero is opt-in, so other screens keep a plain bar');
assert(/if \(!hero\) \{/.test(header), 'and they return early rather than paying for it');
const home = read('src/screens/CustomerHomeScreen.js');
assert(/<AppHeader[^/]*hero/.test(home), 'the customer home asks for it');
// AdminFeaturesScreen uses AppHeader too and must not have been changed.
assert(!/<AppHeader[^/]*hero/.test(read('src/screens/AdminFeaturesScreen.js')),
  'the admin landing keeps the plain bar');

console.log('A photo is supported and not required');
// The design wants a landmark behind the greeting; those are licensed
// photographs. Until one exists the gradient is the design, not a gap.
const data = read('src/data/countryHero.js');
assert(/HOW TO ADD A PHOTO/.test(data), 'the file says how to add one');
assert(/look\.photo\s*\n?\s*\?/.test(header) || /look\.photo$/m.test(header) || /look\.photo\b/.test(header),
  'the header uses a photo when the country has one');
assert(/ImageBackground/.test(header), 'and draws it behind the gradient scrim');

console.log('\nOne header that knows where you are from; everything else unchanged.');
