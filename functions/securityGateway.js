const { HttpsError } = require('firebase-functions/v2/https');

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_DEPTH = 8;
const MAX_KEYS = 160;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 8192;
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function walk(value, state, depth = 0) {
  if (depth > MAX_DEPTH) throw new HttpsError('invalid-argument', 'Request payload is too deeply nested.');
  if (value == null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new HttpsError('invalid-argument', 'Request contains an invalid number.');
    return;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new HttpsError('invalid-argument', 'Request contains an oversized text field.');
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw new HttpsError('invalid-argument', 'Request contains an oversized list.');
    state.keys += value.length;
    if (state.keys > MAX_KEYS) throw new HttpsError('invalid-argument', 'Request contains too many fields.');
    for (const item of value) walk(item, state, depth + 1);
    return;
  }
  if (typeof value !== 'object') throw new HttpsError('invalid-argument', 'Request contains an unsupported value.');
  const keys = Object.keys(value);
  state.keys += keys.length;
  if (state.keys > MAX_KEYS) throw new HttpsError('invalid-argument', 'Request contains too many fields.');
  for (const key of keys) {
    if (DANGEROUS_KEYS.has(key)) throw new HttpsError('invalid-argument', 'Request contains an invalid field.');
    if (key.length > 200) throw new HttpsError('invalid-argument', 'Request contains an oversized field name.');
    walk(value[key], state, depth + 1);
  }
}

function enforceRequestEnvelope(request, options = {}) {
  const maxBytes = Number(options.maxBytes) || MAX_REQUEST_BYTES;
  let serialized;
  try {
    serialized = JSON.stringify(request?.data ?? null);
  } catch (_) {
    throw new HttpsError('invalid-argument', 'Request payload cannot be processed.');
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new HttpsError('invalid-argument', 'Request payload is too large.');
  }
  walk(request?.data ?? null, { keys: 0 });
}

function safeProviderText(value, max = 2048) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '').slice(0, max);
}

module.exports = { enforceRequestEnvelope, safeProviderText, MAX_REQUEST_BYTES };
