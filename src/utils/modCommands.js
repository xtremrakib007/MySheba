// Room moderation slash-commands. Targeted commands act on a member;
// /lock and /unlock act on the current room itself and therefore do not
// require a target. Permission checks happen in ChatScreen/server rules.
export const MOD_COMMANDS = [
  'kick', 'mute', 'unmute', 'ban', 'unban',
  'lock', 'unlock',
  'mod', 'unmod', 'admin', 'removeadmin',
];

// Role changes and room lock/unlock are admin-only. Moderators may use the
// member moderation commands, but may not change room-wide access or roles.
export const ADMIN_ONLY_MOD_COMMANDS = [
  'lock', 'unlock',
  'mod', 'unmod', 'admin', 'removeadmin',
];

export const MOD_ACTION_LABEL = {
  kick: 'kicked',
  mute: 'muted',
  unmute: 'unmuted',
  ban: 'banned',
  unban: 'unbanned',
  lock: 'locked the room',
  unlock: 'unlocked the room',
  mod: 'made a moderator',
  unmod: 'removed as a moderator',
  admin: 'made an admin',
  removeadmin: 'removed as admin',
};

/**
 * Parses a moderation slash command. Targeted commands accept
 * "/cmd @Name" or "/cmd userId". Room-wide /lock and /unlock accept no
 * target; an optional extra argument is ignored by the caller only after
 * validating the command.
 */
export function parseModCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('/')) return null;
  const spaceIdx = trimmed.indexOf(' ');
  const cmd = (spaceIdx === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIdx)).toLowerCase();
  if (!MOD_COMMANDS.includes(cmd)) return null;

  const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  if (cmd === 'lock' || cmd === 'unlock') {
    return { cmd, mentionName: null, targetUid: null, hasExtraArgs: !!rest };
  }
  if (!rest) return { cmd, mentionName: null, targetUid: null };
  const mentionMatch = rest.match(/^@(.+)$/);
  if (mentionMatch) return { cmd, mentionName: mentionMatch[1].trim(), targetUid: null };
  return { cmd, mentionName: null, targetUid: rest.split(/\s+/)[0] };
}
