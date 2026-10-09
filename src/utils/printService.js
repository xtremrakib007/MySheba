// Printing for MySheba. Everything printable in the app goes through here so
// there is one place that knows about the user's chosen printer.
//
// Android has no "pick a printer and remember it" API: Print.printAsync opens
// the system print dialog, which lists whatever printers the device's print
// services expose (Wi-Fi, Bluetooth, USB, cloud). iOS does let the app pick a
// printer up front (Print.selectPrinterAsync), so on iOS we remember that
// choice and print straight to it. Either way the device's own print stack
// does the work - the app never talks to a printer directly.
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'mysheba:defaultPrinter';

/** Only iOS can pre-select and remember a printer. */
export const canSelectPrinter = Platform.OS === 'ios';

export async function getDefaultPrinter() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const printer = JSON.parse(raw);
    return printer && printer.url ? printer : null;
  } catch (e) {
    return null;
  }
}

export async function clearDefaultPrinter() {
  try { await AsyncStorage.removeItem(STORAGE_KEY); } catch (e) { /* nothing saved */ }
}

/**
 * Opens the OS printer picker (iOS) and remembers the choice.
 * @returns {Promise<{name: string, url: string}>} the selected printer
 */
export async function selectDefaultPrinter() {
  if (!canSelectPrinter) {
    throw new Error('On Android you pick the printer in the print dialog that opens when you print.');
  }
  const printer = await Print.selectPrinterAsync();
  if (printer && printer.url) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ name: printer.name || 'Printer', url: printer.url }));
  }
  return printer;
}

/**
 * Prints HTML through the device. Uses the remembered printer when there is
 * one; otherwise the OS shows its own print dialog.
 */
export async function printHtml(html) {
  const printer = canSelectPrinter ? await getDefaultPrinter() : null;
  await Print.printAsync(printer ? { html, printerUrl: printer.url } : { html });
}

/** Prints an already-rendered file (payslips, salary reports). */
export async function printUri(uri) {
  const printer = canSelectPrinter ? await getDefaultPrinter() : null;
  await Print.printAsync(printer ? { uri, printerUrl: printer.url } : { uri });
}

const COMPANY_NAME = 'MySheba';
const WEBSITE = 'www.mysheba.top';
const EMAIL = 'info@mysheba.top';

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const money = (v) => `MYR ${(Number(v) || 0).toFixed(2)}`;

function formatWhen(value) {
  if (!value) return '-';
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
  } catch (e) {
    return String(value);
  }
}

function row(label, value) {
  if (value == null || value === '') return '';
  return `<tr><td class="label">${esc(label)}</td><td class="value">${esc(value)}</td></tr>`;
}

/**
 * A receipt for one transaction, including the recharge PIN when the order
 * carries one, so a shop can hand the customer a printed slip.
 */
export function buildTransactionReceiptHtml(tx = {}, profile = {}) {
  const rows = [
    row('Service', tx.service),
    row('Details', tx.details),
    row('Customer', tx.customerPhone || profile.phone),
    row('Amount', money(tx.amount)),
    row('Total paid', money(tx.total != null ? tx.total : tx.amount)),
    row('Status', (tx.rejected ? 'rejected' : tx.status || 'pending').toUpperCase()),
    row('Reference', tx.id),
    row('Date', formatWhen(tx.createdAt)),
  ].join('');

  const pinBlock = tx.pin
    ? `<div class="pin">
         <div class="pin-label">${esc(tx.pinSerial ? 'RECHARGE PIN' : 'COLLECTION PIN')}</div>
         <div class="pin-code">${esc(tx.pin)}</div>
         ${tx.pinSerial ? `<div class="pin-meta">Serial: ${esc(tx.pinSerial)}</div>` : ''}
         ${tx.pinExpiresAt ? `<div class="pin-meta">Valid until: ${esc(formatWhen(tx.pinExpiresAt))}</div>` : ''}
       </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #101828; margin: 0; padding: 22px; }
      .brand { text-align: center; border-bottom: 2px solid #00a99d; padding-bottom: 12px; }
      .brand h1 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
      .brand p { margin: 4px 0 0; font-size: 11px; color: #667085; }
      h2 { font-size: 13px; letter-spacing: 1px; color: #667085; margin: 18px 0 8px; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; }
      td { padding: 7px 0; border-bottom: 1px solid #eaecf0; font-size: 13px; vertical-align: top; }
      td.label { color: #667085; width: 42%; }
      td.value { text-align: right; font-weight: 600; }
      .pin { margin-top: 18px; border: 2px dashed #f0ad00; border-radius: 10px; padding: 14px; text-align: center; background: #fffaeb; }
      .pin-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #b54708; }
      .pin-code { font-size: 26px; font-weight: 800; letter-spacing: 4px; margin-top: 6px; font-family: "Courier New", monospace; }
      .pin-meta { font-size: 10px; color: #667085; margin-top: 4px; }
      .foot { margin-top: 24px; text-align: center; font-size: 10px; color: #98a2b3; line-height: 1.6; }
    </style></head><body>
    <div class="brand">
      <h1>MySheba</h1>
      <p>${esc(COMPANY_NAME)}</p>
    </div>
    <h2>Transaction Receipt</h2>
    <table>${rows}</table>
    ${pinBlock}
    <div class="foot">${esc(WEBSITE)} &middot; ${esc(EMAIL)}<br />This is a computer-generated receipt.</div>
  </body></html>`;
}

/** Prints the receipt for one transaction. */
export async function printTransactionReceipt(tx, profile) {
  await printHtml(buildTransactionReceiptHtml(tx, profile));
}

/** A small page used to confirm the printer setup works. */
export async function printTestPage() {
  await printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8" /></head>
    <body style="font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;padding:28px;text-align:center">
      <h1 style="color:#00a99d;margin:0">MySheba</h1>
      <p style="font-size:14px">Printer test page</p>
      <p style="font-size:12px;color:#667085">${esc(new Date().toLocaleString())}</p>
      <p style="margin-top:26px;font-size:13px">If you can read this, printing works on this device.</p>
    </body></html>`);
}
