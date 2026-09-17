// Legacy compatibility shim: voice/video calling is disabled in MySheba.
export const RING_TIMEOUT_MS = 0;
export async function startCall() { throw new Error('Voice and video calling is disabled.'); }
export async function acceptCall() { throw new Error('Voice and video calling is disabled.'); }
export async function declineCall() { throw new Error('Voice and video calling is disabled.'); }
export async function endCall() { return undefined; }
export function subscribeIncomingCalls() { return () => {}; }
export function subscribeCall() { return () => {}; }
export async function fetchAgoraToken() { throw new Error('Voice and video calling is disabled.'); }
