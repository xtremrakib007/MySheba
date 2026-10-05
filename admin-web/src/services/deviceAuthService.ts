// Admin-web device verification, matching the mobile app's contract exactly.
// Both call the same `checkDeviceSession` callable, and the client never writes
// trusted-device state - the server decides.
//
// Two rules are copied from src/firebase/authService.js deliberately, because
// getting either wrong is what broke sign-in on the app:
//
//  1. ONE call per step. checkDeviceSession SENDS the email challenge as part
//     of answering "is this device trusted?". Asking that question and then
//     calling it again to request a code sends two codes, and only the last one
//     verifies - which reads to the person as "the code doesn't work".
//
//  2. An answer of "no" blocks. No answer at all does not. A cold start, a
//     misconfigured deploy or Cloud Functions having a bad afternoon must not
//     lock an admin out of the console; that exact failure locked every user
//     out of the app for ten days.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { getOrCreateDeviceId, getDeviceLabel } from '../utils/deviceId';

export interface DeviceSessionResult {
  requiresOtp?: boolean;
  reason?: string;
  email?: string;
  phone?: string;
  availableMfaMethods?: string[];
  /**
   * Whether the server says it actually sent the email challenge. An older
   * deployed copy of checkDeviceSession does not report this at all, which is
   * why an absent value must not be read as "no code was sent".
   */
  emailChallengeSent?: boolean;
  /**
   * Whether the phone was asked to approve this sign-in. Same caveat as
   * emailChallengeSent: an older deployed copy does not report it, and an
   * absent value must not be shown as "check your phone" when nothing was sent.
   */
  appApprovalSent?: boolean;
  sessionId?: string;
}

// Mirrors UNREACHABLE_CODES in src/firebase/deviceSessionService.js.
// functions/unauthenticated belongs here because the callable framework returns
// it when the callable itself is misconfigured - App Check enforced against a
// client that sends no token, say. Firebase Auth accepted these credentials
// moments earlier, so it cannot mean the sign-in was invalid.
const UNREACHABLE_CODES = [
  'functions/unavailable',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/cancelled',
  'functions/unauthenticated',
  'functions/aborted',
];

export function isDeviceCheckUnreachable(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code || '').toLowerCase();
  if (UNREACHABLE_CODES.includes(code)) return true;
  const raw = `${code} ${String(err?.message || '')}`.toLowerCase();
  return ['network', 'failed to fetch', 'timeout', 'timed out'].some((hint) => raw.includes(hint));
}

async function callCheckDeviceSession(data: Record<string, unknown> = {}): Promise<DeviceSessionResult> {
  const fn = httpsCallable<Record<string, unknown>, DeviceSessionResult>(functions, 'checkDeviceSession');
  // platform: 'web' puts this session in the browser slot, so signing in here
  // no longer ends the one on the phone. The app sends nothing and is treated
  // as mobile - see functions/sessionSlots.js.
  const result = await fn({ platform: 'web', deviceId: getOrCreateDeviceId(), deviceLabel: getDeviceLabel(), ...data });
  return result.data;
}

/**
 * The single call made right after a successful password sign-in. Its result
 * says whether this browser is trusted and, when it is not, carries the
 * destination of the challenge it just sent.
 */
export function startDeviceSession(): Promise<DeviceSessionResult> {
  return callCheckDeviceSession();
}

/**
 * Ask whether the phone has approved yet.
 *
 * The same call as startDeviceSession - the server decides, and a live request
 * is reused rather than re-sent, so asking repeatedly does not buzz the phone
 * again (functions/deviceSessionService.js, requestAppApproval).
 */
export function pollDeviceSession(): Promise<DeviceSessionResult> {
  return callCheckDeviceSession();
}

/** Send another email challenge for a browser already awaiting one. */
export function resendEmailChallenge(): Promise<DeviceSessionResult> {
  return callCheckDeviceSession({ resendEmailChallenge: true });
}

/** Submit the emailed code. Resolves only once the browser is trusted. */
export async function verifyEmailChallenge(code: string): Promise<DeviceSessionResult> {
  const result = await callCheckDeviceSession({ emailOtp: code.trim() });
  if (result.requiresOtp === true || !result.sessionId) {
    throw new Error('That code did not work. Request a new one and try again.');
  }
  return result;
}

/** `a***@example.com` - enough to recognise the inbox, not to read it off a screen. */
export function maskEmail(email: string | undefined | null): string | null {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return null;
  return value.replace(/^(.).+(@.+)$/, '$1***$2');
}
