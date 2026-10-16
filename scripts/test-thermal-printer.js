#!/usr/bin/env node
'use strict';
/**
 * Bluetooth thermal printing (PrinterMax M58 and other 58/80 mm ESC/POS
 * printers): every MySheba receipt's HTML is read back into lines and laid
 * out for narrow paper (src/utils/escpos.js), and every Print button goes
 * through printService.printHtml so a chosen thermal printer gets it.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const ROOT = path.join(__dirname, '..');
const run = (rel) => {
  const code = esbuild.buildSync({ entryPoints: [path.join(ROOT, rel)], bundle: true, format: 'cjs', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', code)(m, m.exports, require);
  return m.exports;
};
const escpos = run('src/utils/escpos.js');
const receipts = run('src/utils/receiptHtml.js');

// A shared-layout receipt: masthead, rows, a boxed PIN; no photo on paper.
const html = receipts.receiptDocument({
  subtitle: 'Transaction Receipt',
  rowsHtml: receipts.receiptRows([['Service', 'Recharge PIN'], ['Amount', 'MYR 10.00'], ['Operator', 'Umobile Pin & <Co>'], ['Order ID', 'A'.repeat(40)]]),
  blocks: [receipts.highlightBlock('PIN', '1234-5678-9012'), receipts.imageBlock('TRANSFER RECEIPT', 'https://x/y.jpg')],
});
const r = escpos.htmlToReceipt(html);
assert.strictEqual(r.title, 'MySheba');
assert.deepStrictEqual(r.lines.filter((l) => l.type === 'row').map((l) => [l.label, l.value]).slice(0, 3),
  [['Service', 'Recharge PIN'], ['Amount', 'MYR 10.00'], ['Operator', 'Umobile Pin & <Co>']], 'rows read back, entities decoded');
assert.ok(r.lines.some((l) => l.big && l.text === '1234-5678-9012'), 'the PIN prints large');
assert.ok(!r.lines.some((l) => /TRANSFER RECEIPT/.test(l.text || '')), 'a photo block does not print as a stray heading');
assert.ok(r.lines.some((l) => l.text === 'Transaction Receipt'));

// The voucher slip written as paragraphs ("Country: Nepal").
const voucher = escpos.htmlToReceipt('<html><body><h2>MySheba</h2><h3>Digital Voucher</h3><hr/><p><b>Country:</b> Malaysia</p><div style="margin:22px 0;font-size:18px"><b>ABCD-EFGH</b></div></body></html>');
assert.deepStrictEqual(voucher.lines.find((l) => l.type === 'row'), { type: 'row', label: 'Country', value: 'Malaysia' });
assert.ok(voucher.lines.some((l) => l.big && l.text === 'ABCD-EFGH'));

// Bytes: reset first, every printed line within 32 columns on 58 mm, ASCII only.
const bytes = escpos.receiptToEscPos(r, { columns: 32 });
assert.deepStrictEqual(bytes.slice(0, 2), [0x1b, 0x40]);
assert.ok(bytes.every((b) => b >= 0 && b <= 255));
const printable = String.fromCharCode(...bytes).replace(/\x1b[@]|\x1b[a-zE-d]./g, '').replace(/\x1d!./g, '');
for (const line of printable.split('\n')) assert.ok(line.length <= 32, `line fits 58 mm: "${line}"`);
assert.ok(printable.includes('Amount' + ' '.repeat(32 - 'Amount'.length - 'MYR 10.00'.length) + 'MYR 10.00'), 'label left, value right');
assert.strictEqual(escpos.toAscii('Rahim — ১০০ “ok”'), 'Rahim - ? "ok"');
assert.strictEqual(escpos.receiptToEscPos(r, { columns: 48 }).length > 0, true);

// base64 matches Node's.
for (const sample of [[], [1], [1, 2], [1, 2, 3], bytes.slice(0, 77)]) {
  assert.strictEqual(escpos.bytesToBase64(sample), Buffer.from(sample).toString('base64'));
}

// Wiring: printHtml goes to the chosen thermal printer; no screen bypasses it.
const ps = fs.readFileSync(path.join(ROOT, 'src/utils/printService.js'), 'utf8');
assert.ok(/getThermalPrinter\(\)[\s\S]{0,200}printBytes\(thermal, receiptToEscPos\(htmlToReceipt\(html\)/.test(ps), 'printHtml prints on the thermal printer');
for (const f of ['src/components/TransactionDetailModal.js', 'src/screens/RechargePinScreen.js']) {
  assert.ok(!/Print\.printAsync\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' prints through printService');
}
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.base.json'), 'utf8')).expo.android;
assert.ok(base.permissions.includes('android.permission.BLUETOOTH_CONNECT'));
for (const p of ['ACCESS_FINE_LOCATION', 'BLUETOOTH_SCAN']) assert.ok(base.blockedPermissions.includes('android.permission.' + p), p + ' is not requested');
console.log('thermal printer: ok');
