#!/usr/bin/env node
'use strict';

/**
 * Double-escaped sequences that were meant to be single escapes.
 *
 * This bug has now shipped three times in this repo, and it is invisible every
 * time - the code parses, lints and runs, it just quietly matches the wrong
 * thing:
 *
 *   functions/transactionService.js  /^\\d{4}$/  matched a literal backslash
 *                                    then "d{4}", so no PIN ever validated.
 *   functions/userSearch.js          prefix + '\\uf8ff' is a backslash plus
 *                                    "uf8ff" - six characters, not U+F8FF. As
 *                                    the upper bound of a Firestore prefix
 *                                    range, with '\' at 0x5C and lowercase
 *                                    letters at 0x61+, it excluded every name
 *                                    continuing with a lowercase letter:
 *                                    searching "Rak" could not find "Rakib".
 *
 * Two shapes are flagged, both of which are almost always a mistake:
 *
 *   1. A REGEX LITERAL containing \\d \\w \\s \\S \\D \\W or \\b outside a
 *      character class - in /…/ the escape is already single, so \\d means
 *      "a backslash, then d". Inside a class a backslash is a legitimate
 *      member, so classes are stripped before checking, and \\. is never
 *      flagged: it is how you match an escape sequence.
 *   2. A STRING containing \\u followed by four hex digits - the only reason to
 *      write that is to produce a literal backslash before "uXXXX", which
 *      essentially never happens; the intent is the character.
 *
 * NOT flagged, because they are correct: \\d and friends inside a string that
 * feeds `new RegExp(...)`, where the string must literally contain \d. Those
 * are detected by looking for RegExp construction on the same line.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = ['functions', 'src', 'scripts', 'admin-web/src'];
const SKIP = /node_modules|[/\\]dist[/\\]|\.min\.|package-lock\.json/;

const findings = [];
let filesScanned = 0;

// Strip line and block comments so the explanations above - and in the files -
// cannot trip this.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:/])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(Math.max(0, m.length - p.length)));
}

const REGEX_LITERAL = /(^|[=(,:[!&|?{;\s])\/(?![/*])((?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n[])+)\/[gimsuyd]*/g;

/**
 * A doubled escape is only wrong OUTSIDE a character class.
 *
 * Inside one, a backslash is a member: [^'\\] means "not a quote and not a
 * backslash", and \\. means "a backslash then any character" - both the
 * standard way to tokenise a string literal, and both correct. Flagging those
 * made the first version of this scanner fail on four files that were right.
 *
 * So strip character classes before looking, and ignore \\. entirely: it is
 * almost always a deliberate escape-sequence matcher, unlike \\d or \\s
 * which have no sane literal reading.
 */
function outsideCharClasses(pattern) {
  return pattern.replace(/\[(?:\\.|[^\]\\])*\]/g, '[]');
}
const BAD_IN_REGEX = /\\\\[dwsSDWb]/;
const BAD_UNICODE_STRING = /(['"`])(?:(?!\1)[^\\]|\\.)*?\\\\u[0-9a-fA-F]{4}/;

function scanFile(rel) {
  const full = path.join(ROOT, rel);
  const raw = fs.readFileSync(full, 'utf8');
  const src = stripComments(raw);
  filesScanned += 1;

  src.split('\n').forEach((line, i) => {
    const lineNo = i + 1;

    // 1. Regex literals with a doubled escape.
    for (const m of line.matchAll(REGEX_LITERAL)) {
      if (BAD_IN_REGEX.test(outsideCharClasses(m[2]))) {
        findings.push({
          rel, lineNo, kind: 'regex-literal',
          detail: `/${m[2]}/ contains a doubled escape. In a regex literal \\\\d matches a backslash then "d"; write \\d.`,
          text: line.trim().slice(0, 120),
        });
      }
    }

    // 2. Strings with \\uXXXX, unless the line builds a RegExp (where the
    //    string legitimately needs to carry a backslash).
    if (BAD_UNICODE_STRING.test(line) && !/new RegExp|RegExp\(/.test(line)) {
      findings.push({
        rel, lineNo, kind: 'unicode-string',
        detail: 'A string contains \\\\uXXXX, which is a backslash followed by "uXXXX" rather than the character. Write \\uXXXX.',
        text: line.trim().slice(0, 120),
      });
    }
  });
}

function walk(dir) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (SKIP.test(rel)) continue;
    if (entry.isDirectory()) { walk(rel); continue; }
    if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name)) scanFile(rel);
  }
}

for (const dir of SCAN_DIRS) walk(dir);

if (findings.length) {
  console.error('Escape audit FAILED:\n');
  for (const f of findings) {
    console.error(`  ${f.rel}:${f.lineNo}  [${f.kind}]`);
    console.error(`    ${f.detail}`);
    console.error(`    ${f.text}\n`);
  }
  console.error(`${findings.length} doubled escape(s) across ${filesScanned} files.`);
  console.error('If a string genuinely needs a literal backslash, build it with String.raw or a named constant so the intent is visible.');
  process.exit(1);
}
console.log(`Escape audit: no doubled escapes in ${filesScanned} files.`);
