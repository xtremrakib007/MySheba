#!/usr/bin/env node
'use strict';

/**
 * No translation string may carry a dial code of its own.
 *
 * `register.otpHintSms` read "...we texted to +60{phone}." in all seven
 * locales, and RegisterScreen passes {phone} already carrying the country's
 * dial code. Every Malaysian saw
 *
 *   Enter the 6-digit code we texted to +60+60 1123083556.
 *
 * and every Bangladeshi was told their code had gone to +60+880..., naming
 * the wrong country on the one screen where the number has to be right. The
 * SMS itself was always correct - toE164() builds it from the picker - so
 * nothing failed and nothing logged; it only ever looked wrong.
 *
 * This app serves nine countries from one dial-code picker (src/data/
 * countries.js). A literal dial code in a translated string is wrong for at
 * least eight of them, so the rule is simply that there are none.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'src', 'i18n', 'translations');
const problems = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  text.split('\n').forEach((line, i) => {
    // A dial code is a + followed by one to four digits. Nothing else in these
    // files legitimately looks like that.
    const hits = line.match(/\+[0-9]{1,4}/g);
    if (hits) problems.push(`src/i18n/translations/${file}:${i + 1}  ${hits.join(', ')}`);
  });
}

if (problems.length) {
  console.error(`Hardcoded dial code(s) in translations: ${problems.length}\n`);
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nThe caller passes the number with its own dial code. Use {phone} alone.');
  process.exit(1);
}

console.log(`Dial-code audit: clean (${fs.readdirSync(DIR).filter((f) => f.endsWith('.js')).length} locales).`);
