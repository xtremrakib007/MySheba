const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { Resend } = require('resend');

initializeApp();
const db = getFirestore();
const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const ALLOWED_ORIGIN = 'https://mysheba.top';
const DESTINATION_EMAIL = 'info@mysheba.top';
const FROM_EMAIL = 'MySheba Website <info@mysheba.top>';
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;

const SUBJECTS = new Map([
  ['general', 'General Inquiry'],
  ['recharge', 'Recharge Issue'],
  ['remittance', 'Remittance Issue'],
  ['ticket', 'Ticket Booking Issue'],
  ['account', 'Account / Login'],
  ['wallet', 'Wallet / Payment'],
  ['other', 'Other'],
  ['রিচার্জ', 'রিচার্জ সমস্যা'],
  ['রেমিট্যান্স', 'রেমিট্যান্স সমস্যা'],
  ['টিকিট', 'টিকিট বুকিং সমস্যা'],
  ['অ্যাকাউন্ট', 'অ্যাকাউন্ট / লগইন'],
  ['ওয়ালেট', 'ওয়ালেট / পেমেন্ট']
]);

function clean(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function getClientIp(req) {
  return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
}

function hashIdentifier(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function isRateLimited(identifier) {
  const key = hashIdentifier(identifier);
  const ref = db.collection('contactRateLimits').doc(key);
  const snap = await ref.get();
  const now = Date.now();

  if (!snap.exists) {
    await ref.set({ count: 1, windowStart: now, updatedAt: FieldValue.serverTimestamp() });
    return false;
  }

  const data = snap.data() || {};
  const windowStart = Number(data.windowStart || 0);
  const count = Number(data.count || 0);

  if (now - windowStart >= RATE_LIMIT_WINDOW_MS) {
    await ref.set({ count: 1, windowStart: now, updatedAt: FieldValue.serverTimestamp() });
    return false;
  }

  if (count >= MAX_REQUESTS_PER_HOUR) return true;

  await ref.update({ count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  return false;
}

function response(res, status, body) {
  return res.status(status).json(body);
}

// shared from the app's ListingDetail screen -> mysheba.top -> "Open in
// MySheba App" / Play Store). This project (mysheba2) owns the mysheba.top
// domain, but the actual preview page - with the real listing's photo/
// price/title in its Open Graph tags, plus the mysheba://listing/{id} deep
// link button - is rendered by the `listingPreview` function that lives in
// the *app's* Firebase project (satulink-solutions), since that's where the
// `listings` Firestore data actually is. Rather than duplicating that
// Firestore read (and needing a satulink-solutions service-account key in
// this project) or moving the mysheba.top domain, this just 302s the
// request over to the app project's own default Hosting URL, which applies
// that project's own `/listing/**` rewrite to `listingPreview`. A 302 (not
// 301) because this is meant to be a stopgap - if mysheba.top ever gets
// connected directly to the app project's Hosting instead (the longer-term
// fix), this redirect goes away rather than being a permanently-cached one.
//
// Known limitation: link-preview crawlers (Facebook/WhatsApp/etc.) do
// generally follow a 302 and read Open Graph tags off the final URL, so
// the shared-link preview card still works - but the browser address bar
// will show the satulink-solutions.web.app URL, not mysheba.top, once a
// person actually taps the link. Fully hiding that requires option 2
// (connecting the domain directly), not a redirect.
const APP_HOSTING_ORIGIN = 'https://satulink-solutions.web.app';

exports.listingRedirect = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 10,
  memory: '128MiB'
}, (req, res) => {
  // req.path is the original request path Hosting matched the rewrite
  // against, e.g. "/listing/abc123" or "/listing/abc123/" (trailingSlash
  // is on for this site's Hosting config).
  const match = /^\/listing\/([^/]+)\/?$/.exec(req.path || '');
  if (!match || !match[1]) {
    return res.redirect(302, APP_HOSTING_ORIGIN);
  }
  const id = encodeURIComponent(match[1]);
  return res.redirect(302, `${APP_HOSTING_ORIGIN}/listing/${id}`);
});

exports.submitContact = onRequest({
  region: 'asia-southeast1',
  timeoutSeconds: 15,
  memory: '256MiB',
  secrets: [RESEND_API_KEY],
  cors: [ALLOWED_ORIGIN]
}, async (req, res) => {
  if (req.method === 'OPTIONS') return response(res, 204, {});
  if (req.method !== 'POST') return response(res, 405, { ok: false, error: 'Method not allowed.' });

  const origin = req.get('origin');
  if (origin && origin !== ALLOWED_ORIGIN) {
    return response(res, 403, { ok: false, error: 'Origin not allowed.' });
  }

  const body = req.body || {};
  const honeypot = clean(body.website, 100);
  if (honeypot) return response(res, 200, { ok: true });

  const name = clean(body.name, 100);
  const email = clean(body.email, 254).toLowerCase();
  const phone = clean(body.phone, 40);
  const subject = clean(body.subject, 60);
  const message = clean(body.message, 4000);
  const language = clean(body.language, 10) === 'bn' ? 'bn' : 'en';

  const fieldErrors = {
    en: {
      name: 'Please enter your full name (at least 2 characters).',
      email: 'Please enter a valid email address.',
      subject: 'Please choose a subject.',
      message: 'Your message is too short (minimum 3 characters).'
    },
    bn: {
      name: 'অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন (কমপক্ষে ২ অক্ষর)।',
      email: 'অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা লিখুন।',
      subject: 'অনুগ্রহ করে একটি বিষয় নির্বাচন করুন।',
      message: 'আপনার মেসেজটি খুব ছোট (কমপক্ষে ৩ অক্ষর প্রয়োজন)।'
    }
  }[language];

  if (name.length < 2) return response(res, 400, { ok: false, error: fieldErrors.name, field: 'name' });
  if (!validEmail(email)) return response(res, 400, { ok: false, error: fieldErrors.email, field: 'email' });
  if (!SUBJECTS.has(subject)) return response(res, 400, { ok: false, error: fieldErrors.subject, field: 'subject' });
  if (message.length < 3) return response(res, 400, { ok: false, error: fieldErrors.message, field: 'message' });

  try {
    const ip = getClientIp(req);
    const [ipLimited, emailLimited] = await Promise.all([
      isRateLimited(`ip:${ip}`),
      isRateLimited(`email:${email}`)
    ]);

    if (ipLimited || emailLimited) {
      return response(res, 429, { ok: false, error: 'Too many messages. Please try again later.' });
    }

    const subjectLabel = SUBJECTS.get(subject);
    const messageRef = db.collection('contactMessages').doc();

    await messageRef.set({
      name,
      email,
      phone,
      subject,
      subjectLabel,
      message,
      language,
      status: 'new',
      emailStatus: 'pending',
      createdAt: FieldValue.serverTimestamp()
    });

    const resend = new Resend(RESEND_API_KEY.value());
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safePhone = escapeHtml(phone || 'Not provided');
    const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
    const safeSubject = escapeHtml(subjectLabel);

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [DESTINATION_EMAIL],
      replyTo: email,
      subject: `[MySheba Contact] ${subjectLabel}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#1f2937">
          <h2 style="color:#0d9488">New MySheba Contact Message</h2>
          <p><strong>From:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Phone:</strong> ${safePhone}</p>
          <p><strong>Subject:</strong> ${safeSubject}</p>
          <hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0">
          <p><strong>Message:</strong></p>
          <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px;line-height:1.6">${safeMessage}</div>
          <p style="color:#6b7280;font-size:12px;margin-top:20px">Message ID: ${messageRef.id}</p>
        </div>
      `
    });

    if (error) {
      await messageRef.update({ emailStatus: 'failed', emailError: clean(error.message || 'Resend error', 500) });
      return response(res, 502, { ok: false, error: 'Your message was saved, but email delivery failed. Please try again later.' });
    }

    await messageRef.update({ emailStatus: 'sent', resendId: data?.id || null, emailedAt: FieldValue.serverTimestamp() });
    return response(res, 200, { ok: true });
  } catch (error) {
    console.error('submitContact failed:', error);
    return response(res, 500, { ok: false, error: 'Unable to send your message right now. Please try again later.' });
  }
});
