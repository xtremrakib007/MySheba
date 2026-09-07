import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as directChatService from '../firebase/directChatService';
import * as chatLockService from '../firebase/chatLockService';

function formatWhen(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

const KIND_ICON = { direct: '💬', group: '👥', room: '🏠' };

/**
 * WhatsApp-style "Locked Chats" folder - only reachable via
 * AppContext.openLockedChats() (which already gated entry behind the
 * security PIN, see ChatHubScreen's lock row), so no PIN check happens
 * here on mount. Lists every direct/group/room thread the signed-in user
 * has personally locked (chatLockService.js), across all three kinds,
 * newest activity first. Tapping a row opens it in the normal ChatScreen -
 * chatVaultUnlocked is already true for the rest of this app session, so
 * openDirectChat/openGroupChat/openRoomChat won't re-prompt. Long-press (or
 * the lock icon) unlocks a thread, returning it to the normal Chat hub list.
 */
export default function LockedChatsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    authUser, goBackOrHome, lockedChatIds, myGroups, myRooms,
    openDirectChat, openGroupChat, openRoomChat, unlockChatThread,
  } = useApp();
  const [directChats, setDirectChats] = useState([]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = directChatService.subscribeMyChats(authUser.uid, (list) => setDirectChats(list), () => {});
    return unsub;
  }, [authUser]);

  const lockedSet = new Set(lockedChatIds);

  const rows = [
    ...directChats
      .filter((c) => lockedSet.has(chatLockService.lockKey('direct', c.id)))
      .map((c) => {
        const otherUid = (c.participants || []).find((uid) => uid !== authUser.uid);
        const name = (c.participantNames && c.participantNames[otherUid]) || 'User';
        return {
          kind: 'direct', id: c.id, name, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt,
          onPress: () => openDirectChat(c.id, name, otherUid),
        };
      }),
    ...myGroups
      .filter((g) => lockedSet.has(chatLockService.lockKey('group', g.id)))
      .map((g) => ({
        kind: 'group', id: g.id, name: g.name || 'Group Chat', lastMessage: g.lastMessage, lastMessageAt: g.lastMessageAt,
        onPress: () => openGroupChat(g.id, g.name),
      })),
    ...myRooms
      .filter((r) => lockedSet.has(chatLockService.lockKey('room', r.id)))
      .map((r) => ({
        kind: 'room', id: r.id, name: r.name || 'Room Chat', lastMessage: r.lastMessage, lastMessageAt: r.lastMessageAt,
        onPress: () => openRoomChat(r.id, r.name),
      })),
  ].sort((a, b) => (b.lastMessageAt?.seconds || 0) - (a.lastMessageAt?.seconds || 0));

  const confirmUnlock = (row) => {
    showAlert('Unlock this chat?', `${row.name} will show up in your regular chat list again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlock', onPress: () => unlockChatThread(row.kind, row.id).catch(() => {}) },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🔒 Locked Chats</Text>
        <View style={{ width: 30 }} />
      </LinearGradient>

      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.kind}:${item.id}`}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>🔒</Text>
            <Text style={styles.empty}>No locked chats yet</Text>
            <Text style={styles.emptySub}>Open a chat and use its menu to lock it - locked chats stay hidden here until you enter your security PIN.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={item.onPress} onLongPress={() => confirmUnlock(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.rowName} numberOfLines={1}>{KIND_ICON[item.kind]} {item.name}</Text>
                <Text style={styles.rowTime}>{formatWhen(item.lastMessageAt)}</Text>
              </View>
              <Text style={styles.rowPreview} numberOfLines={1}>{item.lastMessage || 'No messages yet'}</Text>
            </View>
            <TouchableOpacity style={styles.unlockBtn} onPress={() => confirmUnlock(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.unlockIcon}>🔓</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { flex: 1, color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    list: { paddingBottom: 20, flexGrow: 1 },
    emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30, gap: 10 },
    emptyIcon: { fontSize: 40 },
    empty: { textAlign: 'center', color: '#999', fontSize: 13, fontWeight: '600' },
    emptySub: { textAlign: 'center', color: '#aaa', fontSize: 12, lineHeight: 18 },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 16,
      backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
    },
    avatar: {
      width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 17 },
    rowBody: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    rowName: { fontSize: 14, fontWeight: '600', color: colors.text, flex: 1, marginRight: 8 },
    rowTime: { fontSize: 11, color: '#999' },
    rowPreview: { fontSize: 12, color: '#777', marginTop: 2 },
    unlockBtn: { padding: 6 },
    unlockIcon: { fontSize: 18 },
  });
}
