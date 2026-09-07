// Deterministic mapping from a Firebase Auth uid (a long alphanumeric
// string) to the small positive integer Agora's RTC engine wants as a
// channel uid.
//
// 1:1 calls don't need this - callService/CallScreen just join with uid 0
// ("let Agora assign one") since there's only ever one other person in the
// channel, so whichever numeric uid shows up in onUserJoined is
// unambiguously "the other person". Group calls can have several other
// members, so every client needs to join with a numeric uid it can also
// independently compute for every *other* invited member ahead of time -
// that's the only way to turn a raw onUserJoined(uid) event back into
// "which group member is this" (see the reverse map built from this in
// CallScreen.js). The actual channel access control is still the Agora
// token minted server-side in functions/agoraToken.js - this is just a
// lookup key, not anything security-sensitive, so a simple, dependency-free
// hash (FNV-1a) is enough.
export function agoraUidFor(firebaseUid) {
  if (!firebaseUid) return 1;
  let hash = 0x811c9dc5;
  for (let i = 0; i < firebaseUid.length; i++) {
    hash ^= firebaseUid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Agora uids must satisfy 0 < uid < 2^32 - 0 is reserved (it means "let
  // the SDK assign one"), so nudge the rare accidental-0 result to 1.
  const uid = hash >>> 0;
  return uid === 0 ? 1 : uid;
}

/** Builds {agoraUid: firebaseUid} for a list of group-call participants, so
 * CallScreen can turn each remote video tile / connection event back into
 * a name via participantNames[map[agoraUid]]. */
export function buildAgoraUidMap(firebaseUids) {
  const map = {};
  (firebaseUids || []).forEach((uid) => { map[agoraUidFor(uid)] = uid; });
  return map;
}
