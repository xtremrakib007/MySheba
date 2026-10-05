/**
 * Approving a web sign-in from the phone, instead of typing a code from email.
 *
 * The browser asks, the phone is asked, and the person taps Approve. It is the
 * same second factor as the emailed code - proof of something the account owner
 * holds - but it does not depend on an inbox, and it tells the owner that a
 * sign-in is being attempted even when it is not them.
 *
 * That last part is why Reject exists and is recorded. An emailed code that
 * arrives unexpectedly is a warning somebody has to notice; a push that says
 * "Chrome on Windows, from this address, right now" is a warning with an
 * answer attached.
 *
 * Pure: no Firestore, no clock, no push. Everything that decides whether a
 * browser is let in is here, so it can be tested without any of that.
 */

// Short, because it is a live prompt on a phone somebody is holding. Long
// enough to find the phone, unlock it and read the question.
const APPROVAL_TTL_MS = 5 * 60 * 1000;
const STATUSES = ['pending', 'approved', 'rejected'];

function text(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * May this browser be let in on the strength of a phone approval?
 *
 * @param pending  the stored request, or null
 * @param args     { deviceId, approvalId, nowMs }
 * @returns {{ok:true} | {ok:false, reason:string, retryable:boolean}}
 *
 * `retryable` separates "wait, nobody has answered yet" - where the browser
 * should keep asking - from "this is over", where it must start again. A
 * browser that polls after a rejection would turn a refusal into a retry.
 */
function approvalDecision(pending, { deviceId, nowMs } = {}) {
  const device = text(deviceId, 100);
  if (!device) return { ok: false, reason: 'No device to approve.', retryable: false };
  if (!pending || typeof pending !== 'object') {
    return { ok: false, reason: 'Ask for approval again from this browser.', retryable: false };
  }

  // Tied to the exact browser that asked. Without this, an approval meant for
  // the owner's laptop would let in whichever browser polled next.
  if (text(pending.deviceId, 100) !== device) {
    return { ok: false, reason: 'Ask for approval again from this browser.', retryable: false };
  }

  const status = text(pending.status, 20);
  if (!STATUSES.includes(status)) {
    return { ok: false, reason: 'Ask for approval again from this browser.', retryable: false };
  }
  if (status === 'rejected') {
    return { ok: false, reason: 'That sign-in was rejected on your phone.', retryable: false };
  }

  const expiresAt = Number(pending.expiresAt);
  const now = Number(nowMs);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now)) {
    return { ok: false, reason: 'Ask for approval again from this browser.', retryable: false };
  }
  // Checked for BOTH statuses, and before approval is honoured: an approval
  // that sat unused for an hour is not evidence that somebody is at the phone
  // now.
  if (now >= expiresAt) {
    return { ok: false, reason: 'That request expired. Ask for approval again.', retryable: false };
  }

  if (status === 'pending') {
    return { ok: false, reason: 'Waiting for approval on your phone.', retryable: true };
  }

  return { ok: true, reason: '', retryable: false };
}

/**
 * May this phone answer this request?
 *
 * Separate from the decision above because they are asked by different people
 * at different moments - the browser asks "am I in yet", the phone asks "may I
 * answer this".
 */
function responseDecision(pending, { approvalId, nowMs } = {}) {
  const id = text(approvalId, 64);
  if (!id) return { ok: false, reason: 'That request is no longer valid.' };
  if (!pending || typeof pending !== 'object') return { ok: false, reason: 'That request is no longer valid.' };
  if (text(pending.approvalId, 64) !== id) return { ok: false, reason: 'That request is no longer valid.' };
  // Already answered. Not an error worth alarming anybody with, but it must not
  // flip a rejection into an approval on a second tap.
  if (text(pending.status, 20) !== 'pending') return { ok: false, reason: 'That request was already answered.' };
  const expiresAt = Number(pending.expiresAt);
  const now = Number(nowMs);
  if (!Number.isFinite(expiresAt) || !Number.isFinite(now) || now >= expiresAt) {
    return { ok: false, reason: 'That request expired.' };
  }
  return { ok: true, reason: '' };
}

/** What a new request looks like. The id and clock come from the caller. */
function newRequest({ deviceId, label, ip, approvalId, nowMs }) {
  const device = text(deviceId, 100);
  const id = text(approvalId, 64);
  const now = Number(nowMs);
  if (!device || !id || !Number.isFinite(now)) throw new Error('A sign-in request needs a device, an id and a time.');
  return {
    approvalId: id,
    deviceId: device,
    label: text(label, 120),
    ip: text(ip, 64),
    status: 'pending',
    requestedAt: now,
    expiresAt: now + APPROVAL_TTL_MS,
  };
}

module.exports = { APPROVAL_TTL_MS, STATUSES, approvalDecision, responseDecision, newRequest };
