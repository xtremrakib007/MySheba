#!/usr/bin/env node
'use strict';
/**
 * The printable receipt.
 *
 * It existed for orders only, inlined in TransactionDetailModal's Print
 * handler, so a wallet top-up - the one thing a customer asks for a receipt of
 * after paying money in - had none. Extracting the document was the only way to
 * add one without ending up with two that drift.
 *
 * Two things are checked: the extracted document is byte-for-byte what the
 * inline version produced, and nothing reaches the page unescaped.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const src = read('src/utils/receiptHtml.js')
  .replace(/^export (const|function) /gm, '$1 ');
const mod = {};
new Function('module', 'exports',
  `${src}\nmodule.exports={escapeHtml,receiptRows,imageBlock,highlightBlock,receiptDocument};`)(mod, {});
const { escapeHtml, receiptRows, imageBlock, highlightBlock, receiptDocument } = mod.exports;

// --- the document is the one that was there ---------------------------------
// Verbatim from the handler this replaced, apart from `safe` becoming the
// shared escape. Keeping it here is the only way to show the extraction changed
// nothing: a receipt that silently loses its PIN block or its table styling is
// not something anyone notices until a customer brings one to a counter.
function legacyDocument(rowsHtml, blocksHtml) {
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:12px;margin:0}
h1{font-size:20px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #ddd;text-align:center;color:#666;font-size:10px}
</style></head><body>
<h1>MySheba</h1><div class="sub">Transaction Receipt</div>
<table>${rowsHtml}</table>
${blocksHtml}
<div class="footer">Please keep this receipt for your records.</div>
</body></html>`;
}

function legacyRows(pairs) {
  return pairs
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) =>
      `<tr><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;color:#555;font-weight:600;width:38%">${escapeHtml(label)}</td><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;word-break:break-word">${escapeHtml(value)}</td></tr>`)
    .join('');
}

console.log('The extracted document is the one it replaced');
const pairs = [
  ['Service', 'Recharge'],
  ['Order ID', 'abc123'],
  ['Amount', 'MYR 25.00'],
  ['Details', ''],            // dropped
  ['Provider', '   '],        // dropped: whitespace is not a value
  ['Branch', undefined],      // dropped
];
const pin = highlightBlock('COLLECTION PIN', '482915');
const receipt = imageBlock('TRANSFER RECEIPT', 'https://example.test/r.jpg');
const passport = imageBlock('PASSPORT PHOTO', '');
assert.strictEqual(receiptRows(pairs), legacyRows(pairs), 'the table rows are unchanged');
assert.strictEqual(
  receiptDocument({ subtitle: 'Transaction Receipt', rowsHtml: receiptRows(pairs), blocks: [pin, receipt, passport] }),
  legacyDocument(legacyRows(pairs), pin + receipt + passport),
  'the whole document is unchanged'
);
assert.strictEqual(passport, '', 'a missing image adds no empty heading');
assert.strictEqual(highlightBlock('COLLECTION PIN', ''), '', 'and an order with no PIN prints no PIN box');

console.log('Nothing reaches the page unescaped');
// A bank name, a note and a display name are all text somebody typed. One of
// them unescaped turns a receipt into whatever they wrote, and the receipt is
// rendered by a real browser engine inside expo-print.
const nasty = '<img src=x onerror="alert(1)"> O\'Brien & "Co"';
const rows = receiptRows([['Bank', nasty]]);
assert(!rows.includes('<img'), 'a tag in a value must not survive as a tag');
assert(!rows.includes('onerror="'), 'nor an attribute');
assert(rows.includes('&lt;img'), 'it is shown as the text it is');
assert(rows.includes('&amp;'), 'an ampersand is escaped, not doubled later');
assert(rows.includes('&#39;'), "an apostrophe too - it closes a single-quoted attribute");
assert(rows.includes('&quot;'), 'and a double quote');
// The label is escaped as well: it is a constant today, which is exactly how a
// dynamic one gets added later without anyone rechecking.
assert(receiptRows([[nasty, 'x']]).includes('&lt;img'), 'labels are escaped too');
// A URL goes into an attribute, which is the easier of the two to break out of.
assert(!imageBlock('R', 'x" onerror="alert(1)').includes('onerror="alert(1)"'),
  'a URL must not be able to close its own attribute');
assert(!receiptDocument({ subtitle: nasty, rowsHtml: '', blocks: [] }).includes('<img src=x'),
  'the subtitle is escaped');

console.log('A top-up has a receipt at all');
const modal = read('src/components/TransactionDetailModal.js');
assert(/type === 'tx' \|\| type === 'topup'/.test(modal), 'the Print button must appear on a top-up');
assert(/function topupReceiptHtml\(/.test(modal), 'and have a receipt to print');
// Both amounts: they differ on a currency conversion, and a rejected request
// credited nothing. One of them alone cannot be checked against a bank
// statement.
assert(/\['Amount paid',/.test(modal), 'the receipt says what was paid');
assert(/\['Credited to wallet',/.test(modal), 'and what the wallet actually received');
// A credit with nobody's name against it is not something a dispute can be
// opened about.
assert(/\['Approved by', item\.completedByName/.test(modal), 'and who approved it');
// A pending top-up printed as a plain receipt reads as proof of a credit that
// has not happened.
assert(/is not proof that the wallet was credited/.test(modal),
  'a receipt for a top-up that is not approved must say so');
// The uploaded proof should be savable, not only tappable.
assert(/DownloadButton url=\{item\.receiptUrl\} filename=\{`topup-receipt-/.test(modal),
  'the payment proof on a top-up must be downloadable');

console.log('\nOne receipt document, escaped at the source, and top-ups have one too.');
