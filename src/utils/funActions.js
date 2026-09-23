// Fun "action" commands any member can use in ANY chat (room, group, or
// direct message) - typing e.g. "/slap @Sam" sends a flavor-text message
// like "👋 Alex slaps Sam around a bit with a large trout!" instead of the
// raw command text. Leaving off the @mention (or typing "all"/"everyone")
// targets the whole chat instead of one person - e.g. "/slap" in a room
// sends "👋 Alex slaps everyone around a bit with a large trout!".
//
// Deliberately client-only: the sender's own client resolves the target
// and composes the final text, then sends it through the existing
// send*Message functions as an ordinary text message - no new Cloud
// Function, no schema change, same trust model this app already uses for
// every other client-authored message.
//
// Targeting supports both:
//   - typed "@Name" after the command (parseActionCommand + resolveMentionUid)
//   - long-press a message bubble and pick an action (ChatScreen wires this
//     directly to that message's senderId/senderName - see QUICK_ACTIONS)

export const FUN_ACTIONS = [
  { key: 'slap', emoji: '👋', verb: (a, b) => `${a} slaps ${b} around a bit with a large trout!` },
  { key: 'poke', emoji: '👉', verb: (a, b) => `${a} pokes ${b}.` },
  { key: 'pinch', emoji: '🤏', verb: (a, b) => `${a} pinches ${b}!` },
  { key: 'hug', emoji: '🤗', verb: (a, b) => `${a} hugs ${b}.` },
  { key: 'highfive', emoji: '🙌', verb: (a, b) => `${a} high-fives ${b}!` },
  { key: 'wave', emoji: '👋', verb: (a, b) => `${a} waves at ${b}.` },
  { key: 'boop', emoji: '👆', verb: (a, b) => `${a} boops ${b}'s nose.` },
  { key: 'tickle', emoji: '🪶', verb: (a, b) => `${a} tickles ${b}!` },
  { key: 'facepalm', emoji: '🤦', verb: (a, b) => `${a} facepalms at ${b}.` },
  { key: 'glare', emoji: '😑', verb: (a, b) => `${a} glares at ${b}.` },
  { key: 'wink', emoji: '😉', verb: (a, b) => `${a} winks at ${b}.` },
  { key: 'confetti', emoji: '🎉', verb: (a, b) => `${a} throws confetti on ${b}!` },
];

// Shown on long-press of a message bubble - kept short since the alert
// modal isn't scrollable. The full list above is reachable by typing.
export const QUICK_ACTION_KEYS = ['slap', 'poke', 'hug', 'highfive', 'wave'];

export function findAction(key) {
  return FUN_ACTIONS.find((a) => a.key === key) || null;
}

/**
 * Parses "/key rest..." from raw composer text. Returns null if `text`
 * isn't a recognized action command. `mentionName` is the text after an
 * "@" if present (untrimmed of case), otherwise null. `targetUid` is set
 * instead when a bare userId was typed with no "@" (e.g. "/slap abc123")
 * - lets the action target someone directly by id, same idea as
 * modCommands.js's raw-uid support. `isEveryone` is true when no target
 * was given at all, or "all"/"everyone" was typed instead of a name -
 * e.g. "/slap" or "/slap everyone" both mean "slap the whole chat", not
 * "slap nobody".
 */
export function parseActionCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const key = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  const action = findAction(key);
  if (!action) return null;
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  if (!rest || /^@?(everyone|all)$/i.test(rest)) {
    return { action, mentionName: null, targetUid: null, isEveryone: true };
  }
  const mentionMatch = rest.match(/^@(.+)$/);
  if (mentionMatch) {
    return { action, mentionName: mentionMatch[1].trim(), targetUid: null, isEveryone: false };
  }
  return { action, mentionName: null, targetUid: rest.split(/\s+/)[0], isEveryone: false };
}

/**
 * Resolves a typed "@Name" against a {uid: name} map (room/group
 * memberNames). Case-insensitive exact match on display name; excludes
 * the sender themselves. Returns { uid, name } or null.
 */
export function resolveMentionUid(mentionName, memberNames, selfUid) {
  if (!mentionName) return null;
  const lower = mentionName.toLowerCase();
  const entry = Object.entries(memberNames || {}).find(
    ([uid, name]) => uid !== selfUid && (name || '').toLowerCase() === lower
  );
  return entry ? { uid: entry[0], name: entry[1] } : null;
}

export function buildActionMessageText(action, selfName, targetName) {
  return `${action.emoji} ${action.verb(selfName || 'Someone', targetName)}`;
}
