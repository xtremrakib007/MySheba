#!/usr/bin/env node
'use strict';
/**
 * How fast the WebView FEELS, which is mostly about what is on top of it.
 *
 * The screen covered the page with an opaque white sheet until onLoadEnd.
 * That event is the last sub-resource, not the first paint - so a government
 * status page that was readable in a second sat behind a spinner for four,
 * and the one thing the person could see carried no information at all.
 *
 * And it keyed the WebView on the url, which tears the native view down and
 * builds a new one - new renderer process, cold cache, lost session - to do
 * what changing `source` does by itself.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const screen = read('src/screens/WebViewScreen.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (error) { console.error('  FAIL  ' + name + '\n        ' + (error && error.message)); process.exitCode = 1; }
}

console.log('\nThe page is shown as it arrives, not after everything arrives');

test('progress is tracked', () => {
  assert.ok(/onLoadProgress=\{\(e\) => setProgress\(e\?\.nativeEvent\?\.progress \|\| 0\)\}/.test(screen),
    'nothing can be shown early without knowing how far along it is');
  assert.ok(/onLoadStart=\{\(\) => \{ setLoading\(true\); setProgress\(0\); \}\}/.test(screen),
    'a new page must start from zero, or the bar begins full');
});

test('the opaque cover comes off before the last byte', () => {
  const cover = /\{\(!!\(\(loading && progress < ([\d.]+)\) \|\| retrying\)\) && \(/.exec(screen);
  assert.ok(cover, 'the cover must be conditioned on progress, not only on loading');
  const threshold = Number(cover[1]);
  // Early enough to matter, late enough that it is not lifted on a blank page.
  assert.ok(threshold > 0.3 && threshold < 0.9, 'a threshold of ' + threshold + ' either hides the page or reveals nothing');
});

test('and something useful is on top while it loads', () => {
  assert.ok(/styles\.progressTrack/.test(screen) && /styles\.progressFill/.test(screen), 'there must be a bar');
  assert.ok(/width: `\$\{Math\.max\(4, Math\.round\(progress \* 100\)\)\}%`/.test(screen),
    'the bar must follow the progress, with enough width at zero to be visible');
  // It must not swallow taps meant for the page under it.
  assert.ok(/<View style=\{styles\.progressTrack\} pointerEvents="none">/.test(screen));
  const track = /progressTrack: \{[^}]*\}/.exec(screen)[0];
  assert.ok(/height: 3/.test(track), 'a bar, not a band');
});

console.log('\nThe WebView is navigated, not rebuilt');

test('no key forces a remount', () => {
  assert.ok(!/key=\{activeUrl\}/.test(screen),
    'keying on the url throws away the renderer process on every change');
  assert.ok(/source=\{\{ uri: activeUrl \}\}/.test(screen), 'changing the source is what navigates it');
  // Reloads still have a way through, or a failed page could never retry.
  assert.ok(/webviewRef\.current\?\.reload\(\)/.test(screen), 'a reload must still be possible');
});

test('it is composited and cached like a browser', () => {
  assert.ok(/androidLayerType="hardware"/.test(screen), 'a software layer is what makes long pages drag');
  assert.ok(/cacheMode="LOAD_DEFAULT"/.test(screen), 'ordinary HTTP caching, so a revisit reuses what has not expired');
  // Not the aggressive one: these are status pages, and a stale FOMEMA result
  // is worse than a slow one.
  // Scoped to the prop: the comment above it names the mode it is NOT using,
  // and a bare search for that word matches the explanation rather than the code.
  assert.ok(!/cacheMode="LOAD_CACHE_ELSE_NETWORK"/.test(screen), 'a status page must not be served stale');
  assert.ok(/overScrollMode="never"/.test(screen));
});

test('the things that made these sites work at all are untouched', () => {
  // Speed is not worth a booking flow that cannot log in.
  // Matched as JSX props on their own line. The comment above them names
  // every one of these to explain why they are there, so a bare search finds
  // the explanation and passes with the prop itself deleted.
  for (const prop of ['domStorageEnabled', 'thirdPartyCookiesEnabled', 'sharedCookiesEnabled', 'cacheEnabled']) {
    assert.ok(new RegExp('^\\s+' + prop + '$', 'm').test(screen), prop + ' was removed, and these flows need it');
  }
  assert.ok(/^\s+mixedContentMode="always"$/m.test(screen), 'mixedContentMode was removed');
});

console.log('\n' + passed + ' checks passed.\n');
