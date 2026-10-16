#!/usr/bin/env node
'use strict';
/**
 * MySheba is light-only. On Android, userInterfaceStyle "light" is applied by
 * expo-system-ui - without it the phone's dark mode still reached every text
 * and input with no colour of its own, which came out light on the app's
 * white cards (Pricing, Record bank deposit, ...). Some phones also force-dark
 * apps; plugins/withLightOnlyAndroid.js opts out.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const base = JSON.parse(fs.readFileSync(path.join(root, 'app.base.json'), 'utf8')).expo;

assert.strictEqual(base.userInterfaceStyle, 'light', 'the app is pinned to light');
assert.ok(pkg.dependencies['expo-system-ui'], 'expo-system-ui applies userInterfaceStyle on Android');
assert.ok(base.plugins.includes('./plugins/withLightOnlyAndroid'), 'force dark is turned off');
assert.ok(/forceDarkAllowed/.test(fs.readFileSync(path.join(root, 'plugins/withLightOnlyAndroid.js'), 'utf8')));
assert.ok(/const FORCED_MODE = 'light';/.test(fs.readFileSync(path.join(root, 'src/theme/ThemeContext.js'), 'utf8')), 'the JS theme is light too');
console.log('light only: ok');
