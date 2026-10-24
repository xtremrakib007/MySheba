const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

const catalogWebhookSecret = defineSecret('mysheba-iimmpact-webhook-secret');
const REGION = 'us-central1';
const MAX_BODY_BYTES = 1024 * 1024;
const EVENTS = new Set(['order.completed', 'order.timeout']);

function validSignature(rawBody, header, secret) {
  if (!Buffer.isBuffer(rawBody) || !header || !secret) return false;
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(header).trim());
  if (!match) return false;
  const supplied = Buffer.from(match[1], 'hex');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

function cleanText(value, max = 500) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, max);
}

function safeEvent(payload) {
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 100).map((item) => ({
    productCode: cleanText(item?.product_code, 100),
    amount: cleanText(item?.amount, 50),
    quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : null,
    transactions: Array.isArray(item?.transactions) ? item.transactions.slice(0, 100).map((tx) => ({
      refid: cleanText(tx?.refid, 200),
      status: cleanText(tx?.status, 100),
      statusCode: tx?.status_code == null ? null : cleanText(tx.status_code, 50),
      remarks: cleanText(tx?.remarks, 500),
      // Deliberately exclude account numbers, serial numbers, PINs and voucher URLs.
    })) : [],
  })) : [];

  return {
    type: cleanText(payload.type, 100),
    orderId: cleanText(payload.order_id, 200),
    userId: cleanText(payload.user_id, 200),
    totalAmount: cleanText(payload.total_amount, 50),
    refundAmount: cleanText(payload.refund_amount, 50),
    status: cleanText(payload.status, 100),
    paymentReference: cleanText(payload.payment_reference, 200),
    completedAt: cleanText(payload.completed_at, 100),
    items,
  };
}

exports.iimmpactCatalogWebhook = onRequest({
  region: REGION,
  timeoutSeconds: 30,
  memory: '256MiB',
  secrets: [catalogWebhookSecret],
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const rawBody = req.rawBody;
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return res.status(400).send('Missing request body');
  if (rawBody.length > MAX_BODY_BYTES) return res.status(413).send('Payload too large');

  const secret = catalogWebhookSecret.value();
  if (!secret) {
    console.error('IIMMPACT Catalog SDK webhook secret is not configured in Secret Manager');
    return res.status(503).send('Webhook secret unavailable');
  }

  if (!validSignature(rawBody, req.get('X-Webhook-Signature'), secret)) {
    return res.status(401).send('Invalid webhook signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return res.status(400).send('Invalid JSON');
  }

  const event = safeEvent(payload);
  if (!EVENTS.has(event.type)) return res.status(400).send('Unsupported event type');
  if (!event.orderId) return res.status(400).send('Missing order_id');

  // The event ID is deterministic so provider retries cannot create duplicate records.
  const eventId = crypto.createHash('sha256')
    .update(event.type + ':' + event.orderId + ':' + (event.completedAt || event.paymentReference || event.status))
    .digest('hex');

  try {
    const ref = admin.firestore().collection('iimmpactCatalogWebhookEvents').doc(eventId);
    const record = {
      ...event,
      source: 'iimmpact-catalog-sdk',
      signatureVerified: true,
      receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
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
    console.error('IIMMPACT Catalog SDK webhook persistence failed', String(error?.message || error));
    return res.status(500).send('Could not accept webhook');
  }
});
