const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const crypto = require('crypto');

const DIDIT_API = 'https://verification.didit.me/v3';
let db;
function getDb() { return db || (db = admin.firestore()); }

function requiredConfig() {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) throw new Error('Didit KYC is not configured. Set DIDIT_API_KEY and DIDIT_WORKFLOW_ID.');
  return { apiKey, workflowId };
}

function safeEqualHex(a, b) {
  if (!a || !b) return false;
  const aa = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function shortenFloats(value) {
  if (Array.isArray(value)) return value.map(shortenFloats);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shortenFloats(v)]));
  if (typeof value === 'number' && !Number.isInteger(value) && value % 1 === 0) return Math.trunc(value);
  return value;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => { out[key] = sortKeys(value[key]); return out; }, {});
  return value;
}

function verifyDiditSignature(body, signature, simpleSignature, timestamp, secret) {
  if (!secret || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;
  if (signature) {
    const canonical = JSON.stringify(sortKeys(shortenFloats(body)));
    const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    if (safeEqualHex(expected, signature)) return true;
  }
  if (simpleSignature) {
    const canonical = [body.timestamp || '', body.session_id || '', body.status || '', body.webhook_type || ''].join(':');
    const expected = crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
    if (safeEqualHex(expected, simpleSignature)) return true;
  }
  return false;
}

function decisionFeatureApproved(decision, arrayKey) {
  const list = Array.isArray(decision?.[arrayKey]) ? decision[arrayKey] : [];
  if (list.length === 0) return null;
  return list.every((item) => String(item?.status || '').toLowerCase() === 'approved');
}

function decisionHasLiveVerification(decision) {
  const checks = Array.isArray(decision?.liveness_checks) ? decision.liveness_checks : [];
  return checks.length > 0 && checks.every((item) => String(item?.status || '').toLowerCase() === 'approved');
}

function getDiditReferenceImage(decision) {
  const checks = Array.isArray(decision?.liveness_checks) ? decision.liveness_checks : [];
  return checks.find((item) => item?.reference_image)?.reference_image || '';
}

exports.createDiditKycSession = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Please sign in before starting KYC.');
  const uid = request.auth.uid;
  let cfg;
  try { cfg = requiredConfig(); } catch (err) { throw new HttpsError('failed-precondition', err.message); }

  if (request.data?.action === 'saveDetails') {
    const requestRef = getDb().collection('verificationRequests').doc(uid);
    const current = await requestRef.get();
    const existing = current.exists ? current.data() : {};
    if (existing.diditProvider !== 'didit' || existing.diditVerified !== true) throw new HttpsError('failed-precondition', 'Didit live verification must be approved before KYC details can be saved.');
    const k = request.data.kycData || {};
    await requestRef.set({
      name: request.data.name || existing.name || '',
      phone: request.data.phone || existing.phone || '',
      documentUrl: request.data.frontDocumentUrl || existing.documentUrl || '',
      frontDocumentUrl: request.data.frontDocumentUrl || existing.frontDocumentUrl || '',
      backDocumentUrl: request.data.backDocumentUrl || existing.backDocumentUrl || '',
      selfieUrl: request.data.selfieUrl || existing.selfieUrl || existing.diditReferenceImageUrl || '',
      frontImageUrl: request.data.frontDocumentUrl || existing.frontImageUrl || '',
      backImageUrl: request.data.backDocumentUrl || existing.backImageUrl || '',
      selfieImageUrl: request.data.selfieUrl || existing.selfieImageUrl || existing.diditReferenceImageUrl || '',
      documentType: k.documentType || existing.documentType || '',
      documentNumber: k.documentNumber || existing.documentNumber || '',
      nationality: k.nationality || existing.nationality || '',
      dateOfBirth: k.dateOfBirth || existing.dateOfBirth || '',
      gender: k.gender || existing.gender || '',
      occupation: k.occupation || existing.occupation || '',
      skilledLabour: k.skilledLabour || existing.skilledLabour || '',
      companyName: k.companyName || existing.companyName || '',
      employerName: k.employerName || existing.employerName || '',
      address: k.address || existing.address || '',
      passportPlaceOfIssue: k.passportPlaceOfIssue || existing.passportPlaceOfIssue || '',
      passportIssueDate: k.passportIssueDate || existing.passportIssueDate || '',
      passportExpiryDate: k.passportExpiryDate || existing.passportExpiryDate || '',
      sourceOfFunds: k.sourceOfFunds || existing.sourceOfFunds || '',
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { saved: true, status: 'approved' };
  }

  const userSnap = await getDb().collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  const name = String(user.name || user.displayName || '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  const expected = {};
  if (parts[0]) expected.first_name = parts[0];
  if (parts.length > 1) expected.last_name = parts.slice(1).join(' ');
  if (user.dateOfBirth) expected.date_of_birth = user.dateOfBirth;
  if (user.nationalityCode) expected.nationality = user.nationalityCode;
  if (user.countryCode) expected.id_country = user.countryCode;

  const payload = {
    workflow_id: cfg.workflowId,
    vendor_data: uid,
    callback: 'mysheba://kyc/complete',
    callback_method: 'both',
    language: 'en',
    metadata: { app: 'MySheba', uid },
    ...(Object.keys(expected).length ? { expected_details: expected } : {}),
  };

  const response = await fetch(`${DIDIT_API}/session/`, {
    method: 'POST',
    headers: { 'x-api-key': cfg.apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch (_) { data = { detail: text }; }
  if (!response.ok || !data.url || !data.session_id) {
    console.error('Didit create session failed', response.status, data);
    throw new HttpsError('failed-precondition', data.detail || data.message || 'Could not start live KYC verification.');
  }

  await getDb().collection('verificationRequests').doc(uid).set({
    uid,
    status: 'pending',
    diditProvider: 'didit',
    diditSessionId: data.session_id,
    diditWorkflowId: data.workflow_id || cfg.workflowId,
    diditStatus: data.status || 'Not Started',
    diditVerificationUrl: data.url,
    diditLiveLivenessRequired: true,
    diditUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { sessionId: data.session_id, url: data.url, status: data.status || 'Not Started' };
});

exports.diditKycWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.DIDIT_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'Webhook is not configured' });
  const body = req.body || {};
  const signature = req.get('X-Signature-V2');
  const simpleSignature = req.get('X-Signature-Simple');
  const timestamp = req.get('X-Timestamp');
  if (!verifyDiditSignature(body, signature, simpleSignature, timestamp, secret)) return res.status(401).json({ error: 'Invalid signature' });

  const eventId = body.event_id || `${body.session_id || 'unknown'}:${body.timestamp || Date.now()}:${body.webhook_type || ''}`;
  const eventRef = getDb().collection('diditWebhookEvents').doc(String(eventId));
  const existing = await eventRef.get();
  if (existing.exists) return res.status(200).json({ received: true, duplicate: true });
  await eventRef.set({ receivedAt: admin.firestore.FieldValue.serverTimestamp(), sessionId: body.session_id || '', status: body.status || '', webhookType: body.webhook_type || '' });

  const uid = body.vendor_data || body.metadata?.uid;
  if (!uid) return res.status(200).json({ received: true, ignored: 'missing vendor_data' });

  const requestRef = getDb().collection('verificationRequests').doc(uid);
  const current = await requestRef.get();
  const patch = {
    diditProvider: 'didit',
    diditSessionId: body.session_id || current.data()?.diditSessionId || '',
    diditWorkflowId: body.workflow_id || current.data()?.diditWorkflowId || '',
    diditStatus: body.status || 'In Progress',
    diditWebhookType: body.webhook_type || '',
    diditUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const decision = body.decision || {};
  const livenessApproved = decisionHasLiveVerification(decision);
  const faceMatchApproved = decisionFeatureApproved(decision, 'face_matches');
  const idApproved = decisionFeatureApproved(decision, 'id_verifications');
  if (body.status === 'Approved') {
    if (!livenessApproved || (faceMatchApproved === false) || (idApproved === false)) {
      patch.status = 'rejected';
      patch.note = 'Didit reported an incomplete or failed biometric/identity decision.';
      patch.diditVerified = false;
    } else {
      patch.status = 'approved';
      patch.diditVerified = true;
      patch.liveFaceVerified = true;
      patch.liveFaceMethod = 'didit_hosted_liveness';
      patch.diditReferenceImageUrl = getDiditReferenceImage(decision);
      patch.diditDecision = decision;
      patch.approvedAt = admin.firestore.FieldValue.serverTimestamp();
      await getDb().collection('users').doc(uid).set({ verified: true, verificationStatus: 'approved', verificationProvider: 'didit', verificationUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
  } else if (body.status === 'Declined') {
    patch.status = 'rejected';
    patch.diditVerified = false;
    patch.note = 'Didit live identity verification was declined.';
    patch.diditDecision = decision;
  } else if (body.status === 'In Review') {
    patch.status = 'pending';
    patch.diditDecision = decision;
  } else {
    patch.status = 'pending';
  }

  await requestRef.set(patch, { merge: true });
  return res.status(200).json({ received: true });
});