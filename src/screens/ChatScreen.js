import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, Video, ResizeMode } from 'expo-av';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as chatService from '../firebase/chatService';
import * as directChatService from '../firebase/directChatService';
import * as groupChatService from '../firebase/groupChatService';
import * as roomChatService from '../firebase/roomChatService';
import { uploadChatMedia } from '../firebase/mediaUpload';
import { logError } from '../firebase/logService';
import {
  findAction,
  parseActionCommand,
  resolveMentionUid,
  buildActionMessageText,
  QUICK_ACTION_KEYS,
} from '../utils/funActions';
import { parseModCommand, MOD_ACTION_LABEL, ADMIN_ONLY_MOD_COMMANDS } from '../utils/modCommands';
import AssignChatModal from '../components/AssignChatModal';
import VerifiedBadge from '../components/VerifiedBadge';
import * as authService from '../firebase/authService';

// Sender name color in a group/room chat's message bubbles, by role - so
// staff are recognizable at a glance in a mixed-role thread. A role with
// no entry here (customer, or a missing/older message with no senderRole
// stored yet) just keeps the default senderName color set in styles below.
const ROLE_ID_COLOR = {
  superadmin: '#E53935', // red
  admin: '#8E24AA', // purple
  dealer: '#EC407A', // pink
  dealer: '#FFB300', // amber
  reseller: '#FBC02D', // yellow
};

function formatTime(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${suffix}`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, '0');
  return `${m}:${r}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A single voice-note bubble - plays/pauses itself via expo-av. */
function VoiceBubble({ item, mine }) {
  const {
    colors
  } = useTheme();

  const voiceStyles = createVoiceStyles(colors);
  const [sound, setSound] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);

  useEffect(() => () => { if (sound) sound.unloadAsync(); }, [sound]);

  const toggle = async () => {
    if (playing && sound) {
      await sound.pauseAsync();
      setPlaying(false);
      return;
    }
    if (sound) {
      await sound.playAsync();
      setPlaying(true);
      return;
    }
    try {
      const { sound: s } = await Audio.Sound.createAsync(
        { uri: item.mediaUrl },
        { shouldPlay: true },
        (status) => {
          if (!status.isLoaded) return;
          setPosMs(status.positionMillis || 0);
          if (status.didJustFinish) { setPlaying(false); setPosMs(0); s.setPositionAsync(0); }
        }
      );
      setSound(s);
      setPlaying(true);
    } catch (e) {
      showAlert('MySheba', 'Could not play this voice message.');
    }
  };

  return (
    <TouchableOpacity style={voiceStyles.row} onPress={toggle} activeOpacity={0.8}>
      <Text style={voiceStyles.icon}>{playing ? '⏸' : '▶️'}</Text>
      <View style={voiceStyles.track}>
        <View style={[voiceStyles.trackFill, { width: item.duration ? `${Math.min(100, (posMs / 1000 / item.duration) * 100)}%` : '0%' }]} />
      </View>
      <Text style={[voiceStyles.duration, mine && voiceStyles.durationMine]}>
        {formatDuration(item.duration)}
      </Text>
    </TouchableOpacity>
  );
}

function createVoiceStyles(colors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', minWidth: 160, gap: 8, paddingVertical: 2 },
    icon: { fontSize: 18 },
    track: { flex: 1, height: 4, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 2, overflow: 'hidden' },
    trackFill: { height: 4, backgroundColor: colors.primary },
    duration: { fontSize: 11, color: '#666' },
    durationMine: { color: '#4b6b3d' },
  });
}

function secondsUntil(ts) {
  if (!ts || !ts.seconds) return 0;
  return Math.max(0, Math.round(ts.seconds - Date.now() / 1000));
}

/**
 * GameBot posts one of these for each round of Dice/LowCard/HighCard/
 * Cricket, tagging who's still active (`activeUids`) and when the 20s
 * window closes (`deadlineAt`). Only an active player who hasn't tapped
 * yet sees a live "Play (Ns)" button; it self-disables on tap or once the
 * deadline passes, so a stale button from an earlier round can't fire late.
 * Anyone who lets it expire is auto-played by the bot as before - the
 * button is a shortcut for typing `.play`, not a replacement for it.
 */
function GamePlayPrompt({ item, authUser, onPlay, mine }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [pressed, setPressed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(item.deadlineAt));

  useEffect(() => {
    const id = setInterval(() => setSecondsLeft(secondsUntil(item.deadlineAt)), 1000);
    return () => clearInterval(id);
  }, [item.deadlineAt]);

  const isActivePlayer = !!authUser?.uid && (item.activeUids || []).includes(authUser.uid);
  const expired = secondsLeft <= 0;
  const canPress = isActivePlayer && !pressed && !expired;

  const handlePress = () => {
    if (!canPress) return;
    setPressed(true);
    onPlay && onPlay();
  };

  return (
    <View>
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>
      {isActivePlayer && (
        <TouchableOpacity
          style={[styles.gamePlayBtn, !canPress && styles.gamePlayBtnDisabled]}
          onPress={handlePress}
          disabled={!canPress}
        >
          <Text style={styles.gamePlayBtnText}>
            {pressed ? '✅ Played' : expired ? "⏱ Time's up" : `▶️ Play (${secondsLeft}s)`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/** Renders whatever's inside one bubble based on message type. */
function MessageContent({ item, mine, onOpenImage, authUser, onPlay }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const type = item.type || 'text';

  if (type === 'game_play_prompt') {
    return <GamePlayPrompt item={item} authUser={authUser} onPlay={onPlay} mine={mine} />;
  }

  if (type === 'image') {
    return (
      <TouchableOpacity onPress={() => onOpenImage(item.mediaUrl)}>
        <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (type === 'video') {
    return (
      <View style={styles.videoWrap}>
        <Video
          source={{ uri: item.mediaUrl }}
          style={styles.mediaVideo}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
        />
      </View>
    );
  }

  if (type === 'voice') {
    return <VoiceBubble item={item} mine={mine} />;
  }

  if (type === 'document') {
    return (
      <TouchableOpacity
        style={styles.docRow}
        onPress={() => Linking.openURL(item.mediaUrl).catch(() => showAlert('MySheba', 'Could not open this file.'))}
      >
        <Text style={styles.docIcon}>📄</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.docName, mine && styles.docNameMine]} numberOfLines={1}>{item.mediaName || 'Document'}</Text>
          <Text style={styles.docSize}>{formatBytes(item.mediaSize)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.text}</Text>;
}

// One WhatsApp-style conversation thread - handles three thread types:
// a group thread, a direct 1:1 thread (any two accounts - the general
// "Chat" tab), and the customer <-> Support thread. `activeGroupId` (set
// via openGroupChat) and `activeDirectChatId` (set via openDirectChat)
// switch this screen into those modes; otherwise it's the original
// customer <-> Support thread.
export default function ChatScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    authUser, profile, activeChatId, activeChatName, activeChatReturnTo,
    activeDirectChatId, activeDirectChatName, activeDirectChatUid,
    activeGroupId, activeGroupName,
    activeRoomId, activeRoomName,
    setScreen, goBackOrHome, setChatHubTab,
    chatDraftText, setChatDraftText, startCall, startGroupCall,
    isChatLocked, lockChatThread, unlockChatThread,
    openContactProfile,
  } = useApp();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [groupMeta, setGroupMeta] = useState(null);
  const [roomMeta, setRoomMeta] = useState(null);
  const [chatMeta, setChatMeta] = useState(null);
  const [rulesModalOpen, setRulesModalOpen] = useState(false);
  // The other person's identity-verified status for a 1:1 direct chat, so
  // the header can show the same badge their profile shows - see
  // VerifiedBadge.js. Support/group/room threads don't have a single
  // "other person", so this stays null there.
  const [otherVerified, setOtherVerified] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const listRef = useRef(null);
  const recordTimerRef = useRef(null);

  const isRoom = !!activeRoomId;
  const isGroup = !isRoom && !!activeGroupId;
  const isDirect = !isRoom && !isGroup && !!activeDirectChatId;
  // Whether *I've* blocked the other side of this direct chat (PRD section
  // 11 "Block user") - blockedUids lives on my own profile doc, so this is
  // just a local read, no subscription needed. The other direction (them
  // having blocked me) is enforced silently server-side by firestore.rules
  // when I try to send - I don't get to see their blockedUids at all.
  const isBlocked = isDirect && (profile?.blockedUids || []).includes(activeDirectChatUid);
  const isStaff = profile && ['dealer', 'reseller', 'admin', 'superadmin'].includes(profile.role);
  const myRole = isStaff ? 'staff' : 'customer';
  const chatId = activeChatId || (authUser ? authUser.uid : null);
  const threadId = isRoom ? activeRoomId : isGroup ? activeGroupId : isDirect ? activeDirectChatId : chatId;
  const title = isRoom
    ? (roomMeta?.name || activeRoomName || 'Room')
    : isGroup
      ? (groupMeta?.name || activeGroupName || 'Group')
      : isDirect
        ? (activeDirectChatName || 'Chat')
        : (isStaff ? activeChatName || 'Customer' : 'Support');
  const subtitle = isRoom
    ? `${(roomMeta?.memberUids || []).length || ''} members`.trim()
    : isGroup
      ? `${(groupMeta?.memberUids || []).length || ''} members`.trim()
      : isDirect
        ? ''
        : (isStaff ? 'Customer' : 'We usually reply within minutes');
  const isRoomAdmin = isRoom && !!roomMeta && (roomMeta.adminUids || []).includes(authUser?.uid);
  const isRoomModerator = isRoom && !!roomMeta && (roomMeta.moderatorUids || []).includes(authUser?.uid);
  const isRoomStaff = isRoomAdmin || isRoomModerator;
  const isRoomMuted = isRoom && !!roomMeta && (roomMeta.mutedUids || []).includes(authUser?.uid);
  const isRoomAdminsOnlyBlocked = isRoom && !!roomMeta && !!roomMeta.adminsOnlyPost && !isRoomAdmin;
  const hasAgreedToRules = isRoom && !!roomMeta && (roomMeta.agreedUids || []).includes(authUser?.uid);
  const roomNeedsAgreement = isRoom && !!roomMeta && (roomMeta.rules || []).length > 0 && !hasAgreedToRules;

  useEffect(() => {
    if (!isDirect || !activeDirectChatUid) { setOtherVerified(false); return; }
    let cancelled = false;
    authService.fetchProfile(activeDirectChatUid)
      .then((p) => { if (!cancelled) setOtherVerified(!!p?.verified); })
      .catch(() => { if (!cancelled) setOtherVerified(false); });
    return () => { cancelled = true; };
  }, [isDirect, activeDirectChatUid]);

  useEffect(() => {
    if (!threadId) return undefined;

    if (isRoom) {
      const unsubMeta = roomChatService.subscribeRoomMeta(threadId, (m) => setRoomMeta(m), () => {});
      roomChatService.markRoomRead(threadId, authUser.uid).catch(() => {});
      const unsub = roomChatService.subscribeRoomMessages(
        threadId,
        (list) => { setMessages(list); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50); },
        () => {}
      );
      return () => { unsubMeta(); unsub(); };
    }

    if (isGroup) {
      const unsubMeta = groupChatService.subscribeGroupMeta(threadId, (m) => setGroupMeta(m), () => {});
      groupChatService.markGroupRead(threadId, authUser.uid).catch(() => {});
      const unsub = groupChatService.subscribeGroupMessages(
        threadId,
        (list) => { setMessages(list); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50); },
        () => {}
      );
      return () => { unsubMeta(); unsub(); };
    }

    if (isDirect) {
      if (chatDraftText) {
        setText(chatDraftText);
        setChatDraftText('');
      }
      directChatService.markRead(threadId, authUser.uid).catch(() => {});
      const unsub = directChatService.subscribeMessages(
        threadId,
        (list) => { setMessages(list); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50); },
        () => {}
      );
      return unsub;
    }

    chatService.ensureChat({
      uid: threadId,
      name: !isStaff ? profile?.name : activeChatName,
      phone: !isStaff ? profile?.phone : '',
    }).catch(() => {});
    chatService.markChatRead(threadId, myRole).catch(() => {});

    const unsubMeta = chatService.subscribeChatMeta(threadId, (m) => setChatMeta(m), () => {});
    const unsub = chatService.subscribeMessages(
      threadId,
      (list) => { setMessages(list); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50); },
      () => {}
    );
    return () => { unsubMeta(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, isRoom, isGroup, isDirect]);

  const onBack = () => {
    if (isRoom) { setChatHubTab('rooms'); setScreen('chatHub'); }
    else if (isGroup) { setChatHubTab('groups'); setScreen('chatHub'); }
    else if (isDirect) { setChatHubTab('direct'); setScreen('chatHub'); }
    else if (isStaff) setScreen(activeChatReturnTo || 'chatList');
    else goBackOrHome();
  };

  // The customer <-> Support thread only (not room/group/direct) - the
  // "Assign to" bar only makes sense here, and only for admin/superadmin
  // (matches AdminSupportScreen's own role gate, so this stays consistent
  // with who can already reach a support thread's "Messages" tab).
  const isSupportThread = !isRoom && !isGroup && !isDirect;
  const canAssign = isSupportThread && profile && ['admin', 'superadmin'].includes(profile.role);

  const handleAssign = async (staff) => {
    setAssignModalOpen(false);
    setAssigning(true);
    try {
      await chatService.assignChat(threadId, staff);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not assign this chat.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    setAssigning(true);
    try {
      await chatService.unassignChat(threadId);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not unassign this chat.');
    } finally {
      setAssigning(false);
    }
  };

  // Calling is wired up for 1:1 direct chats (single callee) and group
  // chats (rings every other member - see startGroupCall). Rooms are
  // deliberately excluded: they're open community spaces that can have far
  // more members than a "ring everyone" call model makes sense for.
  const canCall = (isDirect && !!activeDirectChatUid)
    || (isGroup && (groupMeta?.memberUids || []).filter((uid) => uid !== authUser?.uid).length > 0);

  // Block / Report conversation (PRD section 11 "Security") - only makes
  // sense on a 1:1 direct chat, same scope as calling above.
  const canModerate = isDirect && !!activeDirectChatUid;

  // Chat Lock (WhatsApp-style, see chatLockService.js / AppContext's
  // isChatLocked/lockChatThread/unlockChatThread) - available on any
  // direct/group/room thread, not the customer<->Support thread (that one
  // has no owner-side "lock" concept and is reachable from admin queues).
  const lockKind = isDirect ? 'direct' : isGroup ? 'group' : isRoom ? 'room' : null;
  const lockId = isDirect ? activeDirectChatId : isGroup ? activeGroupId : isRoom ? activeRoomId : null;
  const canLock = !!lockKind && !!lockId;
  const locked = canLock && isChatLocked(lockKind, lockId);
  const canShowMenu = canModerate || isGroup || isRoom;

  const toggleLock = () => {
    if (!canLock) return;
    if (locked) {
      showAlert('Unlock this chat?', `${title} will show up in your regular chat list again.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock', onPress: () => unlockChatThread(lockKind, lockId).catch(() => {}) },
      ]);
    } else {
      showAlert('Lock this chat?', `${title} will move to Locked Chats and need your security PIN to open.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Lock', onPress: () => lockChatThread(lockKind, lockId).catch(() => {}) },
      ]);
    }
  };

  const openReportConversation = () => {
    showAlert(
      'Report this conversation',
      'Why are you reporting it?',
      [
        ...directChatService.REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: async () => {
            try {
              await directChatService.reportConversation(threadId, authUser.uid, activeDirectChatUid, reason);
              showAlert('MySheba', "Thanks - our team will review this conversation.");
            } catch (err) {
              showAlert('MySheba', 'Could not submit your report right now.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const toggleBlock = () => {
    if (isBlocked) {
      showAlert('Unblock this user?', `${activeDirectChatName || 'This user'} will be able to message you again.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            try {
              await directChatService.unblockUser(authUser.uid, activeDirectChatUid);
            } catch (err) {
              showAlert('MySheba', 'Could not unblock this user right now.');
            }
          },
        },
      ]);
    } else {
      showAlert('Block this user?', `You won't receive messages from ${activeDirectChatName || 'this user'} anymore. You can unblock them anytime.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            try {
              await directChatService.blockUser(authUser.uid, activeDirectChatUid);
            } catch (err) {
              showAlert('MySheba', 'Could not block this user right now.');
            }
          },
        },
      ]);
    }
  };

  const openChatMenu = () => {
    showAlert('Conversation options', null, [
      ...(canModerate ? [
        { text: isBlocked ? 'Unblock user' : 'Block user', onPress: toggleBlock, style: isBlocked ? undefined : 'destructive' },
        { text: 'Report conversation', onPress: openReportConversation },
      ] : []),
      ...(canLock ? [{ text: locked ? '🔓 Unlock this chat' : '🔒 Lock this chat', onPress: toggleLock }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCall = async (type) => {
    try {
      if (isGroup) {
        if (!threadId) return;
        await startGroupCall(
          { uid: authUser.uid, name: profile?.name || '' },
          { id: threadId, name: groupMeta?.name || activeGroupName, memberUids: groupMeta?.memberUids, memberNames: groupMeta?.memberNames },
          type
        );
      } else {
        if (!activeDirectChatUid) return;
        await startCall(
          { uid: authUser.uid, name: profile?.name || '' },
          { uid: activeDirectChatUid, name: activeDirectChatName || 'User' },
          type
        );
      }
    } catch (err) {
      logError('ChatScreen.handleCall', err);
      showAlert('MySheba', 'Could not start the call. Please try again.');
    }
  };

  const sender = () => ({
    uid: authUser.uid,
    role: isDirect ? (profile?.role || '') : myRole,
    // The support thread's chatService.sendMessage relies on `role` above
    // being collapsed to 'staff'/'customer' (see myRole) - it drives
    // ticket-assignment logic there. Group/room chats have no use for that
    // collapsed value but do want the actual role for sender-name coloring
    // (see ROLE_ID_COLOR), so it travels separately instead of overloading
    // `role`.
    profileRole: profile?.role || '',
    name: profile?.name || '',
    customerName: !isStaff ? profile?.name : activeChatName,
  });

  // Matches a trailing "@partial" (no space yet) at the very end of the
  // composer text - e.g. "hey @sa" -> captures "sa". Used to drive the
  // mention autocomplete dropdown as the user types.
  const MENTION_TRAILING_RE = /(^|\s)@([^\s@]*)$/;

  // Up to 6 room/group members whose name starts with what's typed after
  // the trailing "@", excluding the current user. Room/group only - a DM
  // has just one other person, so autocomplete doesn't add anything there.
  const mentionSuggestions = useMemo(() => {
    if (!isRoom && !isGroup) return [];
    const match = text.match(MENTION_TRAILING_RE);
    if (!match) return [];
    const partial = match[2].toLowerCase();
    const memberNames = isRoom ? roomMeta?.memberNames : groupMeta?.memberNames;
    if (!memberNames) return [];
    return Object.entries(memberNames)
      .filter(([uid, name]) => uid !== authUser?.uid && (name || '').toLowerCase().startsWith(partial))
      .slice(0, 6)
      .map(([uid, name]) => ({ uid, name }));
  }, [text, isRoom, isGroup, roomMeta?.memberNames, groupMeta?.memberNames, authUser?.uid]);

  // Replaces the trailing "@partial" with "@FullName " (trailing space so
  // typing can continue straight into the rest of the message).
  const applyMentionSuggestion = (name) => {
    setText((current) => current.replace(MENTION_TRAILING_RE, (m, lead) => `${lead}@${name} `));
  };


  // Resolves an action command's target ("@Name", a raw userId, or, in a
  // 1:1 direct chat, no mention needed since there's only one other
  // person) into {uid, name}, or null if it can't be resolved (e.g. no
  // name match / a room or group command with no @mention or uid given).
  const resolveActionTarget = (parsedAction) => {
    const { mentionName, targetUid } = parsedAction;
    if (targetUid) {
      if (targetUid === authUser?.uid) return null;
      const memberNames = isRoom ? roomMeta?.memberNames : isGroup ? groupMeta?.memberNames : null;
      return { uid: targetUid, name: memberNames?.[targetUid] || 'User' };
    }
    if (isDirect) {
      if (!mentionName) return { uid: activeDirectChatUid, name: activeDirectChatName || 'them' };
      const lower = mentionName.toLowerCase();
      return (activeDirectChatName || '').toLowerCase() === lower
        ? { uid: activeDirectChatUid, name: activeDirectChatName }
        : null;
    }
    const memberNames = isRoom ? roomMeta?.memberNames : isGroup ? groupMeta?.memberNames : null;
    return resolveMentionUid(mentionName, memberNames, authUser?.uid);
  };

  const sendPlainText = async (value) => {
    if (isRoom) await roomChatService.sendRoomMessage(threadId, sender(), value);
    else if (isGroup) await groupChatService.sendGroupMessage(threadId, sender(), value);
    else if (isDirect) await directChatService.sendMessage(threadId, sender(), value);
    else await chatService.sendMessage(threadId, sender(), value);
  };

  // Sends a fun action (e.g. "slap") targeting `targetUid`/`targetName`.
  // Shared by the typed "/command @Name" path and the long-press quick
  // actions on another member's message bubble.
  const sendActionMessage = async (action, targetName) => {
    if (!threadId || sending) return;
    setSending(true);
    try {
      await sendPlainText(buildActionMessageText(action, profile?.name, targetName));
    } catch (err) {
      showAlert('MySheba', 'Message failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Resolves a mod command's target: "@Name" against current members
  // (same as resolveActionTarget), or a raw userId used directly - ban/
  // unban in particular need this since the target may not currently be
  // a member at all. For a uid we don't recognize from memberNames, we
  // look their profile up so the "🔨 X banned Y" announcement below shows
  // a real name instead of the raw id.
  const resolveModTarget = async (parsedMod) => {
    const { mentionName, targetUid } = parsedMod;
    if (mentionName) {
      return resolveMentionUid(mentionName, roomMeta?.memberNames, authUser?.uid);
    }
    if (targetUid) {
      if (targetUid === authUser?.uid) return null;
      const knownName = roomMeta?.memberNames?.[targetUid];
      if (knownName) return { uid: targetUid, name: knownName };
      try {
        const p = await authService.fetchProfile(targetUid);
        return { uid: targetUid, name: p?.name || 'User' };
      } catch (err) {
        return { uid: targetUid, name: 'User' };
      }
    }
    return null;
  };

  // Runs a moderation command (/kick /mute /unmute /ban /unban /mod
  // /unmod /admin /removeadmin) against an already-permission-checked
  // target, then posts a short announcement so the room can see who took
  // the action - same transparency GameBot's ledger gives for points.
  const runModCommand = async (cmd, target) => {
    try {
      if (cmd === 'kick') await roomChatService.removeRoomMember(threadId, target.uid);
      else if (cmd === 'mute') await roomChatService.muteRoomMember(threadId, target.uid);
      else if (cmd === 'unmute') await roomChatService.unmuteRoomMember(threadId, target.uid);
      else if (cmd === 'ban') await roomChatService.banRoomMember(threadId, target.uid);
      else if (cmd === 'unban') await roomChatService.unbanRoomMember(threadId, target.uid);
      else if (cmd === 'mod') await roomChatService.promoteToModerator(threadId, target.uid);
      else if (cmd === 'unmod') await roomChatService.demoteModerator(threadId, target.uid);
      else if (cmd === 'admin') await roomChatService.promoteToAdmin(threadId, target.uid);
      else if (cmd === 'removeadmin') await roomChatService.demoteAdmin(threadId, target.uid);
      await sendPlainText(`🔨 ${profile?.name || 'A moderator'} ${MOD_ACTION_LABEL[cmd]} ${target.name}.`);
    } catch (err) {
      showAlert('MySheba', `Could not /${cmd} that member.`);
    }
  };

  const sendText = async () => {
    const value = text;
    if (!value.trim() || !threadId || sending) return;

    const parsedMod = isRoom ? parseModCommand(value) : null;
    if (parsedMod) {
      if (!isRoomStaff) {
        showAlert('MySheba', `Only room admins/moderators can use /${parsedMod.cmd}.`);
        return;
      }
      if (ADMIN_ONLY_MOD_COMMANDS.includes(parsedMod.cmd) && !isRoomAdmin) {
        showAlert('MySheba', `Only room admins can use /${parsedMod.cmd}.`);
        return;
      }
      const target = await resolveModTarget(parsedMod);
      if (!target) {
        showAlert('MySheba', `Usage: /${parsedMod.cmd} @Name or /${parsedMod.cmd} <userId>`);
        return;
      }
      if (target.uid === roomMeta?.ownerUid) {
        showAlert('MySheba', `Can't ${parsedMod.cmd} the room owner.`);
        return;
      }
      if (!isRoomAdmin && (roomMeta?.adminUids || []).includes(target.uid)) {
        showAlert('MySheba', `Only an admin can /${parsedMod.cmd} another admin.`);
        return;
      }
      setText('');
      await runModCommand(parsedMod.cmd, target);
      return;
    }

    const parsedAction = (isRoom || isGroup || isDirect) ? parseActionCommand(value) : null;
    if (parsedAction) {
      // No @mention (or "all"/"everyone" typed) in a room or group means
      // "target the whole chat" - a DM only has one other person, so its
      // existing no-mention default (resolveActionTarget below) already
      // means the same thing and needs no special-casing here.
      if (parsedAction.isEveryone && !isDirect) {
        setText('');
        await sendActionMessage(parsedAction.action, 'everyone');
        return;
      }
      const target = resolveActionTarget(parsedAction);
      if (!target) {
        showAlert(
          'MySheba',
          isDirect
            ? `Couldn't send that.`
            : `Mention who: e.g. "/${parsedAction.action.key} @Name", or long-press their message and pick an action.`
        );
        return;
      }
      setText('');
      await sendActionMessage(parsedAction.action, target.name);
      return;
    }

    setText('');
    setSending(true);
    try {
      await sendPlainText(value);
    } catch (err) {
      setText(value);
      showAlert('MySheba', 'Message failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const sendMedia = async (media) => {
    setUploading(true);
    try {
      const chatType = isRoom ? 'room' : isGroup ? 'group' : isDirect ? 'direct' : 'support';
      const uploaded = await uploadChatMedia(chatType, threadId, media.uri, {
        name: media.name,
        mimeType: media.mimeType,
        kind: media.type,
        size: media.size,
      });
      const payload = { ...uploaded, type: media.type, duration: media.duration || 0 };
      if (isRoom) await roomChatService.sendRoomMediaMessage(threadId, sender(), payload);
      else if (isGroup) await groupChatService.sendGroupMediaMessage(threadId, sender(), payload);
      else if (isDirect) await directChatService.sendMediaMessage(threadId, sender(), payload);
      else await chatService.sendMediaMessage(threadId, sender(), payload);
    } catch (err) {
      showAlert('MySheba', 'Could not send that attachment. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const pickImageOrVideo = async () => {
    setAttachOpen(false);
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const isVideo = asset.type === 'video';
    await sendMedia({
      uri: asset.uri,
      type: isVideo ? 'video' : 'image',
      name: asset.fileName || undefined,
      mimeType: asset.mimeType,
      size: asset.fileSize,
      duration: isVideo ? Math.round((asset.duration || 0) / 1000) : 0,
    });
  };

  const pickDocument = async () => {
    setAttachOpen(false);
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await sendMedia({
      uri: asset.uri,
      type: 'document',
      name: asset.name,
      mimeType: asset.mimeType,
      size: asset.size,
    });
  };

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        showAlert('MySheba', 'Please allow microphone access to send a voice message.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      showAlert('MySheba', 'Could not start recording.');
    }
  };

  const stopRecording = async (send) => {
    if (!recording) return;
    clearInterval(recordTimerRef.current);
    const duration = recordSeconds;
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setRecordSeconds(0);
      if (send && uri) {
        await sendMedia({ uri, type: 'voice', mimeType: 'audio/m4a', duration });
      }
    } catch (err) {
      setRecording(null);
      setRecordSeconds(0);
    }
  };

  const showMicButton = !text.trim();

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerTapArea}
          disabled={!isDirect}
          onPress={() => isDirect && openContactProfile(activeDirectChatUid)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(title || '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headerTitleWrap}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
              {isDirect && <VerifiedBadge verified={otherVerified} size="sm" light />}
            </View>
            {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
        </TouchableOpacity>
        {canCall && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => handleCall('audio')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => handleCall('video')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>📹</Text>
            </TouchableOpacity>
          </View>
        )}
        {canShowMenu && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={openChatMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>⋮</Text>
            </TouchableOpacity>
          </View>
        )}
        {isGroup && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setScreen('groupSettings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        )}
        {isRoom && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setRulesModalOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>📜</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setScreen('roomSettings')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        )}
        {canAssign && (
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => setAssignModalOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.headerIconText}>🧑‍💼</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>

      {isBlocked && (
        <View style={styles.assignBar}>
          <Text style={styles.assignBarText} numberOfLines={1}>
            🚫 You've blocked {activeDirectChatName || 'this user'}
          </Text>
          <TouchableOpacity onPress={toggleBlock}>
            <Text style={styles.assignBarClear}>Unblock</Text>
          </TouchableOpacity>
        </View>
      )}

      {isSupportThread && isStaff && !!chatMeta?.assignedToName && (
        <View style={styles.assignBar}>
          <Text style={styles.assignBarText} numberOfLines={1}>
            🧑‍💼 Assigned to {chatMeta.assignedToName}
            {chatMeta.assignedToRole ? ` (${chatMeta.assignedToRole})` : ''}
          </Text>
          {canAssign && (
            <TouchableOpacity onPress={handleUnassign} disabled={assigning}>
              <Text style={styles.assignBarClear}>{assigning ? '…' : 'Clear'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isRoom || isGroup || isDirect ? 'No messages yet - say hi 👋' : isStaff ? 'No messages yet.' : 'Say hi to our support team \uD83D\uDC4B'}
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.senderId === authUser.uid;
          const showName = (isGroup || isRoom) && !mine;
          const roleColor = ROLE_ID_COLOR[item.senderRole];
          const canActOn = !mine && (isRoom || isGroup || isDirect) && item.senderId;
          const openQuickActions = () => {
            if (!canActOn) return;
            showAlert(
              item.senderName || 'Actions',
              'Send a quick action',
              [
                ...QUICK_ACTION_KEYS.map((key) => {
                  const action = findAction(key);
                  return {
                    text: `${action.emoji} ${action.key}`,
                    onPress: () => sendActionMessage(action, item.senderName || 'them'),
                  };
                }),
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          };
          return (
            <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
              <TouchableOpacity
                activeOpacity={canActOn ? 0.7 : 1}
                onLongPress={openQuickActions}
                delayLongPress={350}
                style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                {showName && (
                  <Text style={[styles.senderName, roleColor && { color: roleColor }]}>
                    {item.senderName || 'Member'}
                  </Text>
                )}
                <MessageContent
                  item={item}
                  mine={mine}
                  onOpenImage={setViewerUrl}
                  authUser={authUser}
                  onPlay={() => sendPlainText('.play')}
                />
                <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>{formatTime(item.createdAt)}</Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      {uploading && (
        <View style={styles.uploadingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.uploadingText}>Sending attachment…</Text>
        </View>
      )}

      {isRoom && roomNeedsAgreement ? (
        <View style={styles.rulesGateBar}>
          <Text style={styles.rulesGateText}>Please review and accept this room's rules before posting.</Text>
          <View style={styles.rulesGateActions}>
            <TouchableOpacity style={styles.rulesGateViewBtn} onPress={() => setRulesModalOpen(true)}>
              <Text style={styles.rulesGateViewBtnText}>View Rules</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rulesGateAgreeBtn}
              onPress={() => roomChatService.agreeToRules(activeRoomId, authUser.uid).catch(() => {})}
            >
              <Text style={styles.rulesGateAgreeBtnText}>I Agree</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : isRoom && isRoomMuted ? (
        <View style={styles.rulesGateBar}>
          <Text style={styles.rulesGateText}>An admin has muted you in this room. You can still read messages.</Text>
        </View>
      ) : isRoomAdminsOnlyBlocked ? (
        <View style={styles.rulesGateBar}>
          <Text style={styles.rulesGateText}>Only admins can post in this room. You can still read messages.</Text>
        </View>
      ) : isBlocked ? (
        <View style={styles.rulesGateBar}>
          <Text style={styles.rulesGateText}>You've blocked this user. Unblock them to send messages.</Text>
        </View>
      ) : recording ? (
        <View style={styles.recordingBar}>
          <Text style={styles.recordingDot}>🔴</Text>
          <Text style={styles.recordingText}>Recording… {formatDuration(recordSeconds)}</Text>
          <TouchableOpacity style={styles.recordingCancel} onPress={() => stopRecording(false)}>
            <Text style={styles.recordingCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.recordingSend} onPress={() => stopRecording(true)}>
            <Text style={styles.recordingSendText}>Send ➤</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {mentionSuggestions.length > 0 && (
            <View style={styles.mentionList}>
              {mentionSuggestions.map((m) => (
                <TouchableOpacity
                  key={m.uid}
                  style={styles.mentionRow}
                  onPress={() => applyMentionSuggestion(m.name)}
                >
                  <Text style={styles.mentionRowText}>@{m.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {attachOpen && (
            <View style={styles.attachMenu}>
              <TouchableOpacity style={styles.attachOption} onPress={pickImageOrVideo}>
                <Text style={styles.attachIcon}>🖼️</Text>
                <Text style={styles.attachLabel}>Photo / Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.attachOption} onPress={pickDocument}>
                <Text style={styles.attachIcon}>📄</Text>
                <Text style={styles.attachLabel}>Document</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.attachBtn} onPress={() => setAttachOpen((o) => !o)}>
              <Text style={styles.attachBtnText}>{attachOpen ? '✕' : '+'}</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Type a message"
              placeholderTextColor="#999"
              multiline
            />
            {showMicButton ? (
              <TouchableOpacity style={styles.sendBtn} onPress={startRecording}>
                <Text style={styles.sendBtnText}>🎤</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
                onPress={sendText}
                disabled={sending}
              >
                <Text style={styles.sendBtnText}>➤</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {!!viewerUrl && <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />}
        </TouchableOpacity>
      </Modal>

      {isRoom && (
        <Modal visible={rulesModalOpen} transparent animationType="fade" onRequestClose={() => setRulesModalOpen(false)}>
          <View style={styles.rulesModalBackdrop}>
            <View style={styles.rulesModalCard}>
              <Text style={styles.rulesModalTitle}>{roomMeta?.name || 'Room'} Rules</Text>
              {!!roomMeta?.description && <Text style={styles.rulesModalDesc}>{roomMeta.description}</Text>}
              {(roomMeta?.rules || []).length === 0 ? (
                <Text style={styles.rulesModalEmpty}>This room has no rules set yet.</Text>
              ) : (
                (roomMeta.rules || []).map((rule, index) => (
                  <Text key={index} style={styles.rulesModalItem}>{index + 1}. {rule}</Text>
                ))
              )}
              <TouchableOpacity style={styles.rulesModalClose} onPress={() => setRulesModalOpen(false)}>
                <Text style={styles.rulesModalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {canAssign && (
        <AssignChatModal
          visible={assignModalOpen}
          currentUid={chatMeta?.assignedToUid || ''}
          onSelect={handleAssign}
          onCancel={() => setAssignModalOpen(false)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#ECE5DD' },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 12, backgroundColor: colors.primary, overflow: 'hidden',
    },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    avatar: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.25)',
      alignItems: 'center', justifyContent: 'center', marginLeft: 4,
    },
    avatarText: { color: 'white', fontWeight: '700' },
    headerTapArea: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    headerTitleWrap: { flex: 1 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 10 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 15, flexShrink: 1 },
    headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginLeft: 10 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerIconBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    headerIconText: { fontSize: 16 },
    assignBar: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 6, paddingHorizontal: 14,
      backgroundColor: '#FFF3E0', borderBottomWidth: 1, borderBottomColor: '#FFE0B2',
    },
    assignBarText: { flex: 1, fontSize: 11, fontWeight: '600', color: '#E65100', marginRight: 8 },
    assignBarClear: { fontSize: 11, fontWeight: '700', color: colors.primary },
    list: { padding: 12, flexGrow: 1 },
    empty: { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 13 },
    bubbleRow: { flexDirection: 'row', marginBottom: 8 },
    rowMine: { justifyContent: 'flex-end' },
    rowTheirs: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '78%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.md },
    bubbleMine: { backgroundColor: '#DCF8C6', borderTopRightRadius: 2 },
    bubbleTheirs: { backgroundColor: 'white', borderTopLeftRadius: 2 },
    senderName: { fontSize: 11, fontWeight: '700', color: colors.primary, marginBottom: 2 },
    bubbleText: { fontSize: 14, color: colors.text },
    bubbleTextMine: { color: colors.text },
    bubbleTime: { fontSize: 10, color: '#999', alignSelf: 'flex-end', marginTop: 4 },
    bubbleTimeMine: { color: '#6b8f5a' },
    mediaImage: { width: 200, height: 200, borderRadius: radius.sm },
    videoWrap: { width: 220, height: 160, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: '#000' },
    mediaVideo: { width: '100%', height: '100%' },
    docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180, paddingVertical: 2 },
    docIcon: { fontSize: 26 },
    docName: { fontSize: 13, fontWeight: '600', color: colors.text },
    docNameMine: { color: colors.text },
    docSize: { fontSize: 11, color: '#888' },
    gamePlayBtn: {
      marginTop: 8, alignSelf: 'flex-start', backgroundColor: colors.primary,
      paddingVertical: 8, paddingHorizontal: 16, borderRadius: radius.pill,
    },
    gamePlayBtnDisabled: { backgroundColor: '#B0B0B0' },
    gamePlayBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
    mentionList: {
      backgroundColor: colors.card || '#fff', borderTopWidth: 1, borderColor: colors.border || '#eee',
      maxHeight: 220,
    },
    mentionRow: { paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: colors.border || '#f0f0f0' },
    mentionRowText: { fontSize: 14, fontWeight: '600', color: colors.text },
    uploadingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, backgroundColor: '#FFF8E1' },
    uploadingText: { fontSize: 12, color: '#8a6d00' },
    recordingBar: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      padding: 10, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    },
    recordingDot: { fontSize: 12 },
    recordingText: { flex: 1, fontSize: 13, color: colors.text },
    recordingCancel: { paddingVertical: 6, paddingHorizontal: 10 },
    recordingCancelText: { color: colors.error, fontSize: 13, fontWeight: '600' },
    recordingSend: { backgroundColor: colors.primary, paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill },
    recordingSendText: { color: 'white', fontSize: 13, fontWeight: '700' },
    attachMenu: {
      flexDirection: 'row', gap: 10, padding: 12,
      backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    },
    attachOption: { alignItems: 'center', gap: 4, backgroundColor: '#F5F5F5', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 16 },
    attachIcon: { fontSize: 22 },
    attachLabel: { fontSize: 11, color: colors.text, fontWeight: '600' },
    inputBar: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      padding: 8, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border,
    },
    attachBtn: {
      width: 38, height: 38, borderRadius: 19, backgroundColor: '#F0F0F0',
      alignItems: 'center', justifyContent: 'center', marginBottom: 2,
    },
    attachBtnText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
    input: {
      flex: 1, maxHeight: 100, backgroundColor: '#F5F5F5', borderRadius: radius.pill,
      paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text,
    },
    sendBtn: {
      width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.5 },
    sendBtnText: { color: 'white', fontSize: 18 },
    viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '80%' },
    rulesGateBar: {
      padding: 12, backgroundColor: '#FFF8E1', borderTopWidth: 1, borderTopColor: colors.border, gap: 8,
    },
    rulesGateText: { fontSize: 12, color: '#8a6d00' },
    rulesGateActions: { flexDirection: 'row', gap: 8 },
    rulesGateViewBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#EEE' },
    rulesGateViewBtnText: { fontSize: 12, fontWeight: '700', color: colors.text },
    rulesGateAgreeBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary },
    rulesGateAgreeBtnText: { fontSize: 12, fontWeight: '700', color: 'white' },
    rulesModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    rulesModalCard: { backgroundColor: 'white', borderRadius: radius.md, padding: 20, width: '100%', maxHeight: '80%' },
    rulesModalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
    rulesModalDesc: { fontSize: 12, color: '#777', marginBottom: 10 },
    rulesModalEmpty: { fontSize: 13, color: '#999' },
    rulesModalItem: { fontSize: 13, color: colors.text, marginBottom: 8, lineHeight: 19 },
    rulesModalClose: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.primary, borderRadius: radius.pill },
    rulesModalCloseText: { color: 'white', fontSize: 13, fontWeight: '700' },
  });
}
