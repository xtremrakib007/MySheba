// Receipts for a Bluetooth thermal printer (58 mm / 80 mm, ESC/POS), such as
// the PrinterMax M58.
//
// Every MySheba receipt is built as HTML (utils/receiptHtml.js and the screens
// that print their own). Rather than a second layout per receipt, the HTML is
// read back into lines - the masthead, label/value rows, the boxed PIN - and
// laid out for narrow paper here. No React and no Bluetooth in this file, so a
// test can check the bytes.
//
// Thermal printers in this class print plain ASCII in their default code page;
// anything else (Bengali, emoji, curly quotes) is replaced so it never prints
// as noise.

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

/** Characters per line in the printer's normal font. */
export const PAPER_COLUMNS = { 58: 32, 80: 48 };

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', bull: '•', mdash: '—', ndash: '–', rarr: '→', larr: '←' };
function decode(text) {
  return String(text)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => (ENTITIES[name.toLowerCase()] ?? m));
}
// Tags out, entities kept: text is decoded once, after every tag is gone, so a
// typed "<" in a value is never mistaken for markup.
const stripTags = (html) => String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const ASCII_MAP = { '·': '-', '•': '*', '—': '-', '–': '-', '→': '->', '←': '<-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '×': 'x', '✓': 'v', '₹': 'Rs' };
/** Printable ASCII only. */
export function toAscii(text) {
  return String(text ?? '')
    .replace(/[^\x20-\x7e]/g, (ch) => ASCII_MAP[ch] ?? (/\s/.test(ch) ? ' ' : '?'))
    .replace(/\?{2,}/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

const isBig = (attrs) => {
  const size = /font-size:\s*(\d+)px/i.exec(attrs || '');
  return (size && Number(size[1]) >= 18) || /class="[^"]*pin-code/i.test(attrs || '');
};

/**
 * A receipt's HTML as { title, lines }: lines are
 *   { type: 'row', label, value } | { type: 'text', text, big }.
 */
export function htmlToReceipt(html) {
  let s = String(html || '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // An uploaded photo (transfer receipt, passport) cannot be printed on a
    // thermal slip; its heading goes with it rather than standing alone.
    .replace(/<div[^>]*>\s*<b>[^<]*<\/b>\s*<br\s*\/?>\s*<img[^>]*>\s*<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '');
  const asRow = (label, value) => `\n\u0001${stripTags(label)}\u0002${stripTags(value)}\n`;
  // Label/value pairs written without a table: <span>Label</span><b>Value</b>
  // (remittance receipt, invoice) and class="label" / class="value" blocks.
  s = s.replace(/<span\b[^>]*>([^<]*)<\/span>\s*<b\b[^>]*>([^<]*)<\/b>/gi, (_, label, value) => asRow(label, value));
  s = s.replace(/<div class="label">([^<]*)<\/div>\s*<div class="value">([^<]*)<\/div>/gi, (_, label, value) => asRow(label, value));
  // Table rows become one marked line each.
  s = s.replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, (_, inner) => {
    const cells = [];
    inner.replace(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi, (__, cell) => { cells.push(stripTags(cell)); return ''; });
    return `\n\u0001${cells.join('\u0002')}\n`;
  });
  // A boxed value set large (a PIN, an amount) prints large.
  s = s.replace(/<(\w+)\b([^>]*)>\s*(?:<b>)?([^<]*)(?:<\/b>)?\s*<\/\1>/gi, (m, tag, attrs, text) => (isBig(attrs) && text.trim() ? `\n\u0003${text}\n` : m));
  s = s.replace(/<(?:\/?(?:div|p|h[1-6]|table|tbody|thead|li|ul|ol|section|header|footer)\b[^>]*|br\s*\/?|hr\s*\/?)>/gi, '\n');
  s = s.replace(/<[^>]*>/g, ' ');

  let title = '';
  const lines = [];
  for (const raw of decode(s).split('\n')) {
    if (raw.startsWith('\u0001')) {
      const cells = raw.slice(1).split('\u0002').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2) lines.push({ type: 'row', label: cells[0], value: cells.slice(1).join(' ') });
      else if (cells.length === 1) lines.push({ type: 'text', text: cells[0] });
      continue;
    }
    const big = raw.startsWith('\u0003');
    const text = (big ? raw.slice(1) : raw).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (!title && /^mysheba$/i.test(text)) { title = text; continue; }
    // "Country: Nepal" written as a paragraph is a row too.
    const pair = !big && /^([^:]{1,24}):\s+(.+)$/.exec(text);
    if (pair) lines.push({ type: 'row', label: pair[1].trim(), value: pair[2].trim() });
    else lines.push({ type: 'text', text, big });
  }
  return { title: title || 'MySheba', lines };
}

function wrap(text, width) {
  const words = toAscii(text).split(' ').filter(Boolean);
  const out = [];
  let line = '';
  for (let word of words) {
    while (word.length > width) { // a long PIN or link
      if (line) { out.push(line); line = ''; }
      out.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= width) line += ' ' + word;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/** The receipt as ESC/POS bytes for a printer `columns` characters wide. */
export function receiptToEscPos(receipt, { columns = PAPER_COLUMNS[58] } = {}) {
  const bytes = [];
  const push = (...b) => bytes.push(...b);
  const text = (t) => { for (const ch of toAscii(t)) push(ch.charCodeAt(0)); push(LF); };
  const raw = (t) => { for (const ch of t) push(ch.charCodeAt(0)); push(LF); };
  const align = (n) => push(ESC, 0x61, n);
  const bold = (on) => push(ESC, 0x45, on ? 1 : 0);
  const size = (n) => push(GS, 0x21, n);
  const rule = () => raw('-'.repeat(columns));

  push(ESC, 0x40); // reset
  align(1); bold(true); size(0x11);
  for (const l of wrap(receipt?.title || 'MySheba', Math.floor(columns / 2))) raw(l);
  size(0); bold(false);
  rule();
  for (const line of receipt?.lines || []) {
    if (line.type === 'row') {
      const label = toAscii(line.label);
      const value = toAscii(line.value);
      align(0);
      if (/\bpin\b/i.test(label) && value && value !== '-' && value.length <= columns) {
        // A PIN is what the slip is for: its own large line.
        align(1); raw(label);
        bold(true); size(0x01); raw(value); size(0); bold(false);
      } else if (label.length + 1 + value.length <= columns) {
        raw(label + ' '.repeat(columns - label.length - value.length) + value);
      } else {
        bold(true); for (const l of wrap(label, columns)) raw(l); bold(false);
        align(2); for (const l of wrap(value, columns)) raw(l);
      }
    } else if (line.big) {
      align(1); bold(true); size(0x01);
      for (const l of wrap(line.text, columns)) raw(l);
      size(0); bold(false);
    } else {
      // A heading in capitals (SENDER DETAILS) prints bold.
      const heading = /[A-Z]/.test(line.text) && line.text === line.text.toUpperCase();
      align(1); if (heading) bold(true);
      for (const l of wrap(line.text, columns)) raw(l);
      if (heading) bold(false);
    }
  }
  align(1); rule();
  text('Thank you for using MySheba');
  push(ESC, 0x64, 4); // feed past the tear bar
  return bytes;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** Bytes as base64, for the Bluetooth module's write. */
export function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63]);
  }
  return out;
}
