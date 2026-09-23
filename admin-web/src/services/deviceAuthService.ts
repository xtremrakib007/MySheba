// Admin-web device verification uses the same server-enforced device-session
// service as the mobile app. The client never writes trusted-device state.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { getOrCreateDeviceId, getDeviceLabel } from '../utils/deviceId';

export type OtpMethod = 'email' | 'sms';

interface DeviceSessionResult {
  requiresOtp?: boolean;
  reason?: string;
  email?: string;
  availableMfaMethods?: string[];
  sessionId?: string;
}

async function checkDeviceSession(data: Record<string, unknown> = {}): Promise<DeviceSessionResult> {
  const fn = httpsCallable<Record<string, unknown>, DeviceSessionResult>(functions, 'checkDeviceSession');
  const deviceId = getOrCreateDeviceId();
  const result = await fn({ deviceId, deviceLabel: getDeviceLabel(), ...data });
  return result.data;
}

export async function isDeviceTrusted(_uid: string, _deviceId: string): Promise<boolean> {
  const result = await checkDeviceSession();
  return result.requiresOtp !== true;
}

export interface RequestOtpResult {
  maskedDestination: string;
  method: OtpMethod;
}

export async function requestLoginOtp(method: OtpMethod = 'email'): Promise<RequestOtpResult> {
  if (method !== 'email') throw new Error('SMS verification is not available for the admin web console.');
  const result = await checkDeviceSession({ resendEmailChallenge: true });
  if (result.requiresOtp !== true || !result.email) throw new Error('This browser is already verified.');
  const email = result.email.trim().toLowerCase();
  const maskedDestination = email.replace(/^(.).+(@.+)$/, '$1***$2');
  return { maskedDestination, method: 'email' };
}

export async function verifyLoginOtp(code: string, _deviceId: string, _deviceLabel: string): Promise<void> {
  const result = await checkDeviceSession({ emailOtp: code.trim() });
  if (result.requiresOtp === true || !result.sessionId) throw new Error('Device verification was not completed.');
}
