// Legacy compatibility only. Voice/video calling is disabled.
export async function setCallerRingtone() { throw new Error('Voice and video calling is disabled.'); }
export async function removeCallerRingtone() { return undefined; }
export function subscribeCallerRingtones() { return () => {}; }
export function resolveCallerCallSettings(globalSettings) { return globalSettings || {}; }
