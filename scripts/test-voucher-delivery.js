#!/usr/bin/env node
'use strict';
/**
 * A voucher released after the order was accepted as "processing" arrives on
 * the provider's callback. functions/voucherDelivery.js must find its PIN,
 * link or serial there so the webhook can save it for the customer.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { voucherFromCallback } = require('../functions/voucherDelivery');

assert.deepStrictEqual(voucherFromCallback({ data: { pin: ' 1234-5678 ', sn: 'SN9', expiry: '2027-01-01' } }),
  { pin: '1234-5678', deliveryLink: '', deliveryNote: '', expiry: '2027-01-01', serialNumber: 'SN9', secret: '1234-5678' });
const link = voucherFromCallback({ data: { voucherlink: 'https://v.example/abc' } });
assert.strictEqual(link.deliveryLink, 'https://v.example/abc');
assert.strictEqual(link.pin, '');
assert.strictEqual(voucherFromCallback({ data: { voucherlink: 'javascript:alert(1)' } }), null, 'only http(s) links');
assert.strictEqual(voucherFromCallback({ data: { sn: 'ONLYSERIAL' } }).pin, 'ONLYSERIAL', 'a serial-only voucher still has a code');
assert.strictEqual(voucherFromCallback({ data: { custom: { code: 'XYZ' } } }, 'data.custom.code').pin, 'XYZ', 'configured path first');
assert.strictEqual(voucherFromCallback({ data: { status: 'Success' } }), null);
assert.strictEqual(voucherFromCallback(null), null);

// The webhook saves it and marks the order readable; History and the
// purchase screens can read it back (with this device's session proof).
const webhook = fs.readFileSync(path.join(__dirname, '../functions/apiWebhookService.js'), 'utf8');
assert.ok(/order\.service === 'Recharge PIN'/.test(webhook) && /rechargePinAvailable = true/.test(webhook), 'webhook saves a late voucher');
const client = fs.readFileSync(path.join(__dirname, '../src/firebase/rechargePinService.js'), 'utf8');
assert.ok(/getRechargePin'\)\(\{ transactionId, \.\.\.session \}\)/.test(client), 'getRechargePin sends the session proof');
for (const screen of ['src/screens/RechargePinScreen.js', 'src/screens/IimmpactProductScreen.js']) {
  assert.ok(fs.readFileSync(path.join(__dirname, '..', screen), 'utf8').includes('waitForRechargePin('), screen + ' waits for a pending voucher');
}
const detail = fs.readFileSync(path.join(__dirname, '../src/components/TransactionDetailModal.js'), 'utf8');
assert.ok(detail.includes('<VoucherPin item={item} voucherState={voucherState} />'), 'History shows the PIN');
// Read as soon as the receipt opens, not behind a tap, and printed/shared on it.
assert.ok(/function useVoucher[\s\S]*?useEffect[\s\S]*?getRechargePin\(id\)/.test(detail), 'the receipt loads the PIN when it opens');
assert.ok(!detail.includes('SHOW VOUCHER PIN'), 'no tap is needed to see the PIN');
assert.ok(detail.includes("orderReceiptData(item, pinOverride, voucherState.voucher)") && detail.includes("'VOUCHER PIN'"), 'the printed and shared receipt carries the PIN');
console.log('voucher delivery: ok');
