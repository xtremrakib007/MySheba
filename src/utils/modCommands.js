// Room moderation slash-commands: /kick /mute /unmute /ban /unban /mod
// /unmod /admin /removeadmin @Name (or a raw userId instead of @Name -
// see parseModCommand). Room-only (mirrors the room data model's
// adminUids/moderatorUids/mutedUids/bannedUids - groups and direct chats
// have no such concept). Permission and target checks happen in
// ChatScreen where roomMeta is available; this module only does text
// parsing, reusing the same targeting idea as funActions.js's
// resolveMentionUid.

export const MOD_COMMANDS = [
  'kick', 'mute', 'unmute', 'ban', 'unban', 'mod', 'unmod', 'admin', 'removeadmin',
];

// Role changes are admin-only, even for moderators (mirrors
// RoomSettingsScreen's promote/demote buttons, which only ever show for
// isAdmin). Everything else in MOD_COMMANDS is available to any staff
// member (admin or moderator).
export const ADMIN_ONLY_MOD_COMMANDS = ['mod', 'unmod', 'admin', 'removeadmin'];

export const MOD_ACTION_LABEL = {
  kick: 'kicked',
  mute: 'muted',
  unmute: 'unmuted',
  ban: 'banned',
  unban: 'unbanned',
  mod: 'made a moderator',
  unmod: 'removed as a moderator',
  admin: 'made an admin',
  removeadmin: 'removed as admin',
};

/**
 * Parses "/cmd @Name" or "/cmd userId" from raw composer text. Returns
 * null if `text` isn't a recognized moderation command. Exactly one of
 * `mentionName` (matched against current members by display name) or
 * `targetUid` (used as-is, no membership required) is set - the latter
 * lets staff act on someone who isn't currently a member, e.g. banning a
 * uid directly instead of a name that only resolves for present members.
 */
export function parseModCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  if (!MOD_COMMANDS.includes(cmd)) return null;
  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  if (!rest) return { cmd, mentionName: null, targetUid: null };
  const mentionMatch = rest.match(/^@(.+)$/);
  if (mentionMatch) return { cmd, mentionName: mentionMatch[1].trim(), targetUid: null };
  return { cmd, mentionName: null, targetUid: rest.split(/\s+/)[0] };
}
