const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const REGION = 'us-central1';
const MAX_BODY_BYTES = 1024 * 1024;
const webhookSecret = defineSecret('mysheba-iimmpact-webhook-secret-catalog');
const ALLOWED_EVENTS = new Set([
  'product.created', 'product.updated', 'product.deleted',
  'option.created', 'option.updated', 'option.deleted',
  'category.created', 'category.updated', 'category.deleted',
  'group.created', 'group.updated', 'group.deleted',
]);
const RESOURCE_BY_TYPE = Object.freeze({
  product: 'products',
  option: 'options',
  category: 'categories',
  group: 'groups',
});
const OMIT_KEYS = /(?:password|secret|token|authorization|pin|serial|account.?number|voucher.?url|private.?key)/i;

if (!admin.apps.length) admin.initializeApp();

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false;
  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[a-fA-F0-9]{64}$/.test(provided)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
}

function sanitize(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    if (OMIT_KEYS.test(key)) continue;
    result[key.slice(0, 100)] = sanitize(child, depth + 1);
  }
  return result;
}

function safeEvent(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const type = typeof payload.type === 'string' ? payload.type : '';
  const resource = typeof payload.resource === 'string' ? payload.resource : '';
  const id = payload.id == null ? '' : String(payload.id).slice(0, 200);
  const prefix = type.split('.')[0];
  if (!ALLOWED_EVENTS.has(type) || RESOURCE_BY_TYPE[prefix] !== resource || !id) return null;
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) return null;
  const timestamp = typeof payload.timestamp === 'string' ? payload.timestamp.slice(0, 100) : null;
  if (timestamp && Number.isNaN(Date.parse(timestamp))) return null;
  return {
    type,
    resource,
    resourceId: id,
    timestamp,
    data: sanitize(payload.data),
  };
}

exports.iimmpactCatalogChangeWebhook = onRequest({
  region: REGION,
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [webhookSecret],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return res.status(400).send('Missing request body');
  if (rawBody.length > MAX_BODY_BYTES) return res.status(413).send('Payload too large');

  const secret = webhookSecret.value();
  if (!secret) return res.status(503).send('Webhook secret unavailable');
  if (!verifySignature(rawBody, req.get('X-Webhook-Signature'), secret)) {
    return res.status(401).send('Invalid webhook signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return res.status(400).send('Invalid JSON');
  }
  const event = safeEvent(payload);
  if (!event) return res.status(400).send('Invalid or unsupported catalog event');

  // IIMMPACT's example has no delivery ID. Prefer its event timestamp for a
  // stable retry key; include the resource ID and type to avoid collisions.
  const identity = [event.type, event.resource, event.resourceId, event.timestamp || crypto.createHash('sha256').update(rawBody).digest('hex')].join(':');
  const eventId = crypto.createHash('sha256').update(identity).digest('hex');
  const db = admin.firestore();
  const ref = db.collection('iimmpactCatalogChangeEvents').doc(eventId);
  try {
    try {
      await ref.create({
        ...event,
        source: 'iimmpact-catalog-change',
        signatureVerified: true,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processingStatus: 'accepted',
      });
      return res.status(200).json({ ok: true, duplicate: false });
    } catch (error) {
      if (error.code === 6 || error.code === 'already-exists') {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      throw error;
    }
  } catch (error) {
    console.error('IIMMPACT catalog-change event persistence failed', String(error && error.message || error));
    return res.status(503).send('Temporary webhook persistence failure');
  }
});

exports._test_verifyIimmpactCatalogSignature = verifySignature;
exports._test_safeIimmpactCatalogEvent = safeEvent;
