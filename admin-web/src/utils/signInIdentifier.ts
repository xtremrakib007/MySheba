/**
 * Signing in with the same credentials as the app.
 *
 * Staff accounts are ordinary Firebase Auth accounts, and the app reaches them
 * by turning a phone number into a synthetic email: +60 12-345 6789 becomes
 * 60123456789@mysheba.app. The password is the password either way, so the
 * account was always the same one - the web form just insisted on the address
 * nobody is ever told, and a staff member created through the app had no way to
 * guess it.
 *
 * So this mirrors src/firebase/authService.js exactly, including its fallback.
 * The two must agree: a phone that signs in on the phone and not on the web is
 * the bug this file exists to prevent, and there is no shared module to put it
 * in - the app is React Native and this is Vite, and neither builds the other.
 */

export const APP_EMAIL_DOMAIN = 'mysheba.app';
export const DEFAULT_DIAL = '+60';

/** Good enough to tell an address from a phone number, which is all it decides. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

/**
 * The app's toE164, character for character.
 *
 * Returns null instead of throwing: here it means "not a phone number", and the
 * caller has an email branch to fall back to.
 */
export function toE164(phone: string, dial: string): string | null {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/[^0-9]/g, '')}`;
  const digits = raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
  if (!digits || !dial) return null;
  return `${dial}${digits}`;
}

/**
 * Every address worth trying for what somebody typed, in order.
 *
 * More than one because the app has a legacy form: Malaysian accounts created
 * before the E.164 change are registered under their digits as typed, leading
 * zero and all. The app tries the current form, then that one, and only for
 * +60. Dropping the fallback here would lock those accounts out of the web
 * while they still worked on the phone.
 */
export function signInEmails(identifier: string, dial: string = DEFAULT_DIAL): string[] {
  const value = String(identifier || '').trim();
  if (!value) return [];
  if (looksLikeEmail(value)) return [value];

  const digits = value.replace(/[^0-9]/g, '');
  // Shorter than any real number: treat it as neither, so the caller reports a
  // bad identifier rather than sending nonsense to Firebase.
  if (digits.length < 8) return [];

  const out: string[] = [];
  const e164 = toE164(value, dial);
  if (e164) out.push(`${e164.replace(/[^0-9]/g, '')}@${APP_EMAIL_DOMAIN}`);
  if (dial === DEFAULT_DIAL) {
    const legacy = `${digits}@${APP_EMAIL_DOMAIN}`;
    if (!out.includes(legacy)) out.push(legacy);
  }
  return out;
}
