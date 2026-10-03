#!/usr/bin/env node
'use strict';
/**
 * Reads after writes inside a Firestore transaction.
 *
 * Firestore requires every read in a transaction to happen before the first
 * write. Break that and the SDK throws a plain Error, which out of a callable
 * reaches the app as "INTERNAL [500]" - naming no field, no document and no
 * line. saveApiProvider wrote the provider and then read the webhook and
 * settings documents, so configuring Success TopUp failed with exactly that,
 * and nothing in the message suggested where to look.
 *
 * It is invisible until the branch runs, which is why it survived: the read
 * sat inside an `if` that only a Success TopUp save enters.
 *
 * Only writes at the top level of the transaction body count. A tx.update()
 * inside an `if` that returns has not run when a later branch reads - the
 * poller and the transfer services are all shaped that way, and flagging them
 * would have made this check noise. An unconditional write is different: any
 * read after it in program order really does follow it.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'functions');
const WRITES = ['set', 'update', 'delete', 'create'];

/** The balanced body of the arrow function passed to runTransaction. */
function transactionBodies(src) {
  const bodies = [];
  const re = /runTransaction\s*\(\s*async\s*\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const handle = m[1];
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    bodies.push({ handle, body: src.slice(re.lastIndex, i - 1), offset: re.lastIndex });
  }
  return bodies;
}

// Comments and string bodies are blanked rather than removed, so every index
// still lines up with the original text and brace counting is not thrown off
// by a brace inside a string.
const blank = (m) => ' '.repeat(m.length);
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  .replace(/\/\/[^\n]*/g, blank)
  .replace(/'(?:[^'\\\n]|\\.)*'/g, blank)
  .replace(/"(?:[^"\\\n]|\\.)*"/g, blank)
  .replace(/`(?:[^`\\]|\\.)*`/g, blank);

/** Offsets at which `handle.<write>(` appears at brace depth 0 of the body. */
function unconditionalWrites(clean, handle) {
  const hits = [];
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    else if (depth === 0 && c === handle[0]) {
      for (const w of WRITES) {
        if (clean.startsWith(`${handle}.${w}(`, i)) { hits.push(i); break; }
      }
    }
  }
  return hits;
}

const failures = [];
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const full = path.join(DIR, file);
  const src = fs.readFileSync(full, 'utf8');
  for (const { handle, body, offset } of transactionBodies(src)) {
    const clean = strip(body);
    const writes = unconditionalWrites(clean, handle);
    if (!writes.length) continue;
    const firstWrite = writes[0];
    const read = clean.indexOf(`${handle}.get(`, firstWrite);
    if (read === -1) continue;
    const line = src.slice(0, offset).split('\n').length;
    failures.push(`${file}: transaction opened near line ${line} reads with ${handle}.get() after an unconditional ${handle}.set()/update(). Firestore throws, and the caller sees INTERNAL [500]. Hoist the read above every write.`);
  }
}

if (failures.length) {
  console.error('\nFirestore transaction ordering FAILED:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(`\n${failures.length} transaction(s) read after writing.\n`);
  process.exit(1);
}
console.log('Firestore transactions: every read happens before the first write.');
