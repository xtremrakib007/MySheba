const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const REGION = 'us-central1';
const MAX_BODY_BYTES = 256 * 1024;
const webhookSecret = defineSecret('mysheba-webhook-secret-balance');

if (!admin.apps.length) admin.initializeApp();

function verifySignature(rawBody, signature, secret) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !secret) return false;
  const provided = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  if (!/^[a-fA-F0-9]{64}$/.test(provided)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), expected);
}

function cleanText(value, max = 200) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, max) : null;
}

exports.iimmpactBalanceWebhook = onRequest({
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
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).send('Expected a JSON object');
  }

  // The Balance webhook's complete schema has not yet been supplied. Store
  // only common operational fields, and never mutate customer wallets or
  // provider configuration from an unconfirmed payload schema.
  const record = {
    eventType: cleanText(payload.type || payload.event, 100),
    timestamp: cleanText(payload.timestamp || payload.created_at, 100),
    status: cleanText(payload.status, 100),
    currency: cleanText(payload.currency, 12),
    balance: payload.balance == null ? null : cleanText(payload.balance, 50),
    availableBalance: payload.available_balance == null ? null : cleanText(payload.available_balance, 50),
    source: 'iimmpact-balance-webhook',
    signatureVerified: true,
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Deterministic retry key: use provider event ID when present, otherwise
  // hash the exact signed body. A retry of the same delivery is idempotent.
  const identity = cleanText(payload.event_id || payload.id, 200) ||
    crypto.createHash('sha256').update(rawBody).digest('hex');
  const eventId = crypto.createHash('sha256').update(identity).digest('hex');
  const ref = admin.firestore().collection('iimmpactBalanceWebhookEvents').doc(eventId);
  try {
    try {
      await ref.create(record);
      return res.status(200).json({ ok: true, duplicate: false });
    } catch (error) {
      if (error.code === 6 || error.code === 'already-exists') {
        return res.status(200).json({ ok: true, duplicate: true });
      }
      throw error;
    }
  } catch (error) {
    console.error('IIMMPACT balance event persistence failed', String(error && error.message || error));
    return res.status(503).send('Temporary webhook persistence failure');
  }
});

exports._test_verifyIimmpactBalanceSignature = verifySignature;
