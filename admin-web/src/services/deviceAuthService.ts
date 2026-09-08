// Device-lock + OTP verification for MySheba Admin Web login.
//
// This gates the ADMIN WEB CONSOLE's own login (LoginPage / AuthContext) -
// it is a separate concern from the mobile app's single-active-device
// enforcement already covered by superadminService.ts's Device Sessions
// (users/{uid}.activeDeviceId, functions/deviceSessionService.js).
// Unlike that one, this is a multi-trusted-device model: an admin can have
// several browsers trusted at once; only a NEW/unrecognized browser has to
// clear an OTP challenge.
//
// Data model (server-managed only - see functions-to-add/loginDeviceAuth.js
// and the firestore.rules snippet in the same folder):
//   users/{uid}/trustedDevices/{deviceId}  - { label, trustedAt, lastUsedAt }
//   users/{uid}/loginOtp/current           - { codeHash, method, expiresAt, attempts }
//
// trustedDevices is only ever written by the verifyLoginOtp Cloud Function,
// never directly by the client - otherwise a browser could just mark
// itself trusted without ever clearing an OTP. The client only reads it.

import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

export type OtpMethod = 'email' | 'sms';

export async function isDeviceTrusted(uid: string, deviceId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', uid, 'trustedDevices', deviceId));
  return snap.exists();
}

export interface RequestOtpResult {
  // e.g. "j***@satulink.com" or "+601****5678" - for display only, never
  // the full destination. Computed server-side so the client never needs
  // the full email/phone to show this.
  maskedDestination: string;
  method: OtpMethod;
}

// Defaults to email per product decision - SMS is offered as an explicit
// alternative in the UI, not a fallback, since not every admin account is
// guaranteed to have a phone number on file.
export async function requestLoginOtp(method: OtpMethod = 'email'): Promise<RequestOtpResult> {
  const fn = httpsCallable<{ method: OtpMethod }, RequestOtpResult>(functions, 'requestLoginOtp');
  const res = await fn({ method });
  return res.data;
}

export async function verifyLoginOtp(
  code: string,
  deviceId: string,
  deviceLabel: string
): Promise<void> {
  const fn = httpsCallable<{ code: string; deviceId: string; deviceLabel: string }, { success: true }>(
    functions,
    'verifyLoginOtp'
  );
  await fn({ code: code.trim(), deviceId, deviceLabel });
}
