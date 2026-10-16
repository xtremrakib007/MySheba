#!/usr/bin/env node
'use strict';
/**
 * The superadmin Pricing cards must read in dark mode. They had a fixed white
 * background while their text took the phone's light dark-mode colour, so
 * nothing on them was visible. Their colours now come from the app theme.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

for (const f of ['src/components/WalletFundingSwitchCard.js', 'src/components/MarkupSettingsCard.js', 'src/components/CommissionByRoleCard.js']) {
  const s = read(f);
  assert.ok(!/backgroundColor: '#fff', borderRadius: 14/.test(s), f + ': no fixed white card');
  assert.ok(/const createStyles = \(c\) => StyleSheet\.create/.test(s) && /useTheme\(\)/.test(s), f + ': styles from the theme');
  assert.ok(/card: \{ backgroundColor: c\.card/.test(s), f + ': card uses the theme card colour');
  assert.ok(/input: \{[^}]*color: c\.text/.test(s) || !/  input:/.test(s), f + ': inputs use the theme text colour');
}
const admin = read('src/screens/AdminHomeScreen.js');
assert.ok(!/<Text style=\{\{ flex: 1 \}\}>/.test(admin), 'AdminHomeScreen: row labels carry the theme text colour');
assert.ok(!/<Text>\{/.test(admin), 'AdminHomeScreen: no uncoloured value text');
console.log('admin dark mode: ok');
