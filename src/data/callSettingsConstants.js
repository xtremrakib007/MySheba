// Legacy compatibility only. Voice/video calling is disabled.
export const DEFAULT_CALL_SETTINGS = { notificationsEnabled: false, ringtone: 'default', customRingtoneUri: null, customRingtoneName: null, vibrationEnabled: false, vibrationPattern: 'default', volume: 0 };
export function withCallSettingsDefaults(saved) { return { ...DEFAULT_CALL_SETTINGS, ...(saved || {}), notificationsEnabled: false }; }
export const VIBRATION_PATTERNS = {};
export const RINGTONE_OPTIONS = [];
