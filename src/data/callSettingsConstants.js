// Shared between CallSettingsScreen.js, RingtonePickerScreen.js,
// IncomingCallModal.js, and callPush.js so all of them stay in sync on
// what a valid settings object looks like, what each vibration pattern
// preset actually is, and (below) how a per-caller override resolves down
// to one fixed Android notification channel.

export const DEFAULT_CALL_SETTINGS = {
  notificationsEnabled: true,
  ringtone: 'default', // 'default' | 'custom' - see RINGTONE_OPTIONS below
  customRingtoneUri: null, // set when ringtone === 'custom'
  customRingtoneName: null, // display name shown in the picker row
  vibrationEnabled: true,
  vibrationPattern: 'default', // key into VIBRATION_PATTERNS below
  volume: 1, // 0–1, foreground ring playback only (see note on VOLUME below)
};

/** Merges saved settings over the defaults so any field missing/added later
 * (e.g. an older profile saved before this feature existed) still has every
 * key filled in rather than `undefined`. */
export function withCallSettingsDefaults(saved) {
  return { ...DEFAULT_CALL_SETTINGS, ...(saved || {}) };
}

// Vibration.vibrate() pattern arrays: [wait, buzz, wait, buzz, ...] in ms.
// Also used to build each Android notification channel's vibrationPattern
// (Notifee expects the same [wait, vibrate, wait, vibrate...] shape).
export const VIBRATION_PATTERNS = {
  default: { label: 'Default', pattern: [0, 700, 400, 700, 400, 700] },
  long: { label: 'Long Pulse', pattern: [0, 1200, 500] },
  short: { label: 'Short Pulses', pattern: [0, 250, 150, 250, 150, 250, 150, 250] },
};

// 'classic' plays the same bundled file as 'default' (they're intentionally
// the same audio - see assets/sounds/ringtone.mp3) while 'soft' is its own
// file (assets/sounds/soft.mp3, registered as its own native raw resource
// via app.json's expo-notifications "sounds" entry alongside ringtone.mp3
// - both are required there for BACKGROUND_RINGTONE_KEYS below to be able
// to reference either one from a real Android channel). 'custom' opens the
// device file picker (expo-document-picker) and can only ever affect the
// in-app foreground ring (IncomingCallModal): Android notification
// channels can only play a bundled raw resource registered at build time,
// never an arbitrary content:// URI picked at runtime, so there's no
// background/killed-app equivalent for a custom file - not a gap to close
// later, a hard platform limit. That's called out in the screen's UI copy,
// not hidden.
export const RINGTONE_OPTIONS = [
  { key: 'default', label: 'MySheba Default', comingSoon: false },
  { key: 'classic', label: 'Classic', comingSoon: false },
  { key: 'soft', label: 'Soft', comingSoon: false },
  { key: 'custom', label: 'Custom', comingSoon: false },
];

// Only these ringtone keys can back a real Android notification channel
// (see the RINGTONE_OPTIONS comment above for why 'custom' can't). 'default'
// and 'classic' are collapsed to one entry since they're the same audio
// file - no point building two identical channels. Used by callPush.js to
// enumerate the fixed channel matrix and by resolveCallerChannelId below to
// fall back sanely if a caller's saved ringtone is 'custom' (background
// case only - foreground always honors 'custom' via IncomingCallModal).
export const BACKGROUND_RINGTONE_KEYS = ['default', 'soft'];

// Maps a BACKGROUND_RINGTONE_KEYS entry to the actual native raw resource
// name Notifee's channel `sound` field needs - i.e. the bundled file's
// basename WITHOUT extension, exactly as app.json's expo-notifications
// "sounds" entry names it once copied into android/app/src/main/res/raw/.
// This is NOT the same string as the ringtone key: the 'default' ringtone
// option plays assets/sounds/ringtone.mp3, so its native resource is
// 'ringtone', not 'default' - passing the bare key as the resource name
// (as if 'default'/'soft' were literal filenames) would reference a raw
// resource that doesn't exist. 'soft' happens to match its own key since
// assets/sounds/soft.mp3's basename genuinely is 'soft'.
export const BACKGROUND_RINGTONE_RESOURCE = {
  default: 'ringtone', // assets/sounds/ringtone.mp3 -> res/raw/ringtone
  soft: 'soft', // assets/sounds/soft.mp3 -> res/raw/soft
};

/** Firestore doc id -> callSettings-shaped patch key, one per caller, under
 * users/{uid}/callerRingtones/{callerUid}. See callerRingtoneService.js. */
export const CALLER_RINGTONE_COLLECTION = 'callerRingtones';

/**
 * Deterministic Android notification channel id for one (ringtone,
 * vibrationPattern) combination - the fixed matrix callPush.js creates
 * once (BACKGROUND_RINGTONE_KEYS.length * Object.keys(VIBRATION_PATTERNS).length
 * channels total, e.g. 2 * 3 = 6) and every call - global-default or
 * per-caller override alike - resolves down to one of. Kept here rather
 * than duplicated in callPush.js/callSettingsCache.js since both need the
 * exact same id for a given combination to hit the same channel.
 *
 * `ringtone` is coerced through BACKGROUND_RINGTONE_KEYS first ('classic'
 * -> 'default', 'custom' or anything unrecognized -> 'default') so this
 * never produces a channel id for a combination that wasn't actually
 * created - see callPush.js's ensureCallChannels.
 */
export function callChannelId(ringtone, vibrationPattern) {
  const bgRingtone = ringtone === 'soft' ? 'soft' : 'default';
  const vibKey = VIBRATION_PATTERNS[vibrationPattern] ? vibrationPattern : 'default';
  return `calls-${bgRingtone}-${vibKey}`;
}
