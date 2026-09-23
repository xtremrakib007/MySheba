// Persistent device identity for the MySheba Admin Web login lock.
//
// This is a per-BROWSER id, not a per-machine id — clearing site data or
// using a different browser/profile creates a new "device" that needs OTP
// verification again. That's the same trade-off every "remember this
// browser" flow makes (bank portals, Google, etc.) and is the right one
// here: we can't fingerprint a real device from a web page, and trying to
// (canvas/WebGL fingerprinting) is exactly the kind of thing that should
// stay out of an internal admin tool.
//
// Deliberately NOT sessionStorage — this must survive tab close/reopen so
// a trusted browser stays trusted.

const STORAGE_KEY = 'mysheba_admin_device_id';

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Secure browser randomness is unavailable; cannot create a device ID.');
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = createDeviceId();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

// Best-effort, human-readable label shown in "new device" emails and any
// future trusted-devices management screen (e.g. "Chrome on macOS"). Not
// used for any security decision — only the stored deviceId is.
export function getDeviceLabel(): string {
  const ua = navigator.userAgent;

  let browser = 'Unknown browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `${browser} on ${os}`;
}
