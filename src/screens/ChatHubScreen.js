import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as directChatService from '../firebase/directChatService';
import * as chatLockService from '../firebase/chatLockService';
import { showAlert } from '../utils/appAlert';

const ROOM_TYPE_LABEL = { open: 'Open · anyone can join', approval: 'Request to join' };

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

const TABS = [
  { key: 'direct', label: 'Direct' },
  { key: 'groups', label: 'Groups' },
  { key: 'rooms', label: 'Rooms' },
];

/**
 * Single entry point for every kind of chat the signed-in user has -
 * 1:1 direct threads, private groups, and community rooms - behind one
 * "Chat" tab in the bottom nav, switched with a segmented bar instead of
 * Groups living off in the sidebar. Row rendering/badges match the old
 * per-kind screens (DirectChatListScreen / GroupListScreen) so this is a
 * straight merge, not a redesign.
 */
export default function ChatHubScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    authUser, profile, goBackOrHome, setScreen,
    openDirectChat, openGroupChat, openRoomChat,
    myGroups, myRooms, discoverableRooms, joinDiscoverableRoom,
    chatHubTab, setChatHubTab,
    lockedChatIds, lockChatThread, openLockedChats,
  } = useApp();
  const [directChats, setDirectChats] = useState([]);
  const [joiningRoomId, setJoiningRoomId] = useState(null);
  const [requestedRoomIds, setRequestedRoomIds] = useState([]);
  const [roomSearch, setRoomSearch] = useState('');
  // Any signed-in account (including customers) can start a new group -
  // see GroupListScreen.js / NewGroupScreen.js for the matching change.
  const canCreateGroup = !!profile;
  const lockedSet = new Set(lockedChatIds);

  // Swipe left/right across the tab content to move between Direct / Groups /
  // Rooms, same as tapping the segmented bar. Only claims the gesture once a
  // swipe is clearly more horizontal than vertical, so scrolling the list
  // itself is untouched.
  const tabIndex = TABS.findIndex((t) => t.key === chatHubTab);
  const swipeTo = (dx) => {
    if (dx <= 0 && tabIndex < TABS.length - 1) {
      setChatHubTab(TABS[tabIndex + 1].key);
    } else if (dx > 0 && tabIndex > 0) {
      setChatHubTab(TABS[tabIndex - 1].key);
    }
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) =>
      Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_evt, gesture) => {
      if (Math.abs(gesture.dx) > 60) swipeTo(gesture.dx);
    },
  });

  const confirmLock = (kind, id, name) => {
    showAlert('Lock this chat?', `${name || 'This chat'} will move to Locked Chats and need your security PIN to open.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', onPress: () => lockChatThread(kind, id).catch(() => {}) },
    ]);
  };

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = directChatService.subscribeMyChats(authUser.uid, (list) => setDirectChats(list), () => {});
    return unsub;
  }, [authUser]);

  const visibleDirect = directChats.filter((c) => c.lastMessage && !lockedSet.has(chatLockService.lockKey('direct', c.id)));
  const visibleGroups = myGroups.filter((g) => !lockedSet.has(chatLockService.lockKey('group', g.id)));
  const visibleRooms = myRooms.filter((r) => !lockedSet.has(chatLockService.lockKey('room', r.id)));
  // Public rooms (open/approval) the user isn't a member of yet, so they
  // show up for everyone browsing the Rooms tab - not just after someone's
  // already been added. Already-requested 'approval' rooms are hidden once
  // tapped so the row doesn't just sit there inviting a second request.
  const visibleDiscoverable = discoverableRooms.filter((r) => !requestedRoomIds.includes(r.id));

  // Room search - filters both "My Rooms" and "Public rooms" by name (and
  // description, for public rooms, since that's the only other text a
  // non-member has to go on) as the user types. Client-side only, same as
  // how the other tabs don't hit Firestore per keystroke either.
  const roomSearchTerm = roomSearch.trim().toLowerCase();
  const searchedRooms = roomSearchTerm
    ? visibleRooms.filter((r) => (r.name || '').toLowerCase().includes(roomSearchTerm))
    : visibleRooms;
  const searchedDiscoverable = roomSearchTerm
    ? visibleDiscoverable.filter((r) =>
        (r.name || '').toLowerCase().includes(roomSearchTerm) ||
        (r.description || '').toLowerCase().includes(roomSearchTerm)
      )
    : visibleDiscoverable;

  const handleJoinDiscoverable = async (room) => {
    if (joiningRoomId) return;
    setJoiningRoomId(room.id);
    try {
      const result = await joinDiscoverableRoom(room);
      if (result === 'requested') {
        setRequestedRoomIds((prev) => [...prev, room.id]);
        showAlert('Request sent', `Your request to join "${room.name || 'this room'}" is waiting on an admin.`);
      }
    } catch (err) {
      showAlert('MySheba', 'Could not join the room. Please try again.');
    } finally {
      setJoiningRoomId(null);
    }
  };

  const newButton = () => {
    if (chatHubTab === 'direct') {
      return (
        <TouchableOpacity style={styles.newBtn} onPress={() => setScreen('addContact')}>
          <Text style={styles.newBtnText}>+ Add</Text>
        </TouchableOpacity>
      );
    }
    if (chatHubTab === 'groups' && canCreateGroup) {
      return (
        <TouchableOpacity style={styles.newBtn} onPress={() => setScreen('newGroup')}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      );
    }
    if (chatHubTab === 'rooms') {
      return (
        <TouchableOpacity style={styles.newBtn} onPress={() => setScreen('createRoom')}>
          <Text style={styles.newBtnText}>+ Create</Text>
        </TouchableOpacity>
      );
    }
    return <View style={{ width: 60 }} />;
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat</Text>
        {newButton()}
      </LinearGradient>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, chatHubTab === t.key && styles.tabActive]}
            onPress={() => setChatHubTab(t.key)}
          >
            <Text style={[styles.tabText, chatHubTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {lockedChatIds.length > 0 && (
        <TouchableOpacity style={styles.lockedRow} onPress={openLockedChats}>
          <View style={[styles.avatar, styles.lockedAvatar]}>
            <Text style={styles.avatarText}>🔒</Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowName}>Locked Chats</Text>
            <Text style={styles.rowPreview}>{lockedChatIds.length} chat{lockedChatIds.length === 1 ? '' : 's'} · Tap to unlock</Text>
          </View>
          <Text style={styles.lockedChevron}>›</Text>
        </TouchableOpacity>
      )}

      {chatHubTab === 'direct' && (
        <FlatList
          data={visibleDirect}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.empty}>No conversations yet</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setScreen('addContact')}>
                <Text style={styles.emptyBtnText}>Find someone to message</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => {
            const otherUid = (item.participants || []).find((uid) => uid !== authUser.uid);
            const name = (item.participantNames && item.participantNames[otherUid]) || 'User';
            const unread = (item.unreadCounts && item.unreadCounts[authUser.uid]) || 0;
            const mine = item.lastSenderId === authUser.uid;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => openDirectChat(item.id, name, otherUid)}
                onLongPress={() => confirmLock('direct', item.id, name)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{name.trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
                    <Text style={styles.rowTime}>{formatWhen(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>
                      {mine ? 'You: ' : ''}{item.lastMessage}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {chatHubTab === 'groups' && (
        <FlatList
          data={visibleGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.empty}>
                {canCreateGroup ? 'No groups yet. Tap "+ New" to start one.' : "No groups yet. You'll see them here once you're added to one."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const unread = (item.unreadCounts && authUser && item.unreadCounts[authUser.uid]) || 0;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => openGroupChat(item.id, item.name)}
                onLongPress={() => confirmLock('group', item.id, item.name)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.name || 'G').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name || 'Group Chat'}</Text>
                    <Text style={styles.rowTime}>{formatWhen(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>
                      {item.lastSenderName ? `${item.lastSenderName}: ` : ''}{item.lastMessage || 'No messages yet'}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {chatHubTab === 'rooms' && (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search rooms"
            placeholderTextColor="#9AA0A6"
            value={roomSearch}
            onChangeText={setRoomSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
        </View>
      )}

      {chatHubTab === 'rooms' && (
        <FlatList
          data={searchedRooms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={styles.empty}>
                {roomSearchTerm ? 'No rooms match your search.' : 'No rooms yet. Tap "+ Create" to start one, or join one below.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            searchedDiscoverable.length > 0 ? (
              <View>
                <Text style={styles.sectionHeader}>Public rooms</Text>
                {searchedDiscoverable.map((room) => (
                  <View key={room.id} style={styles.row}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{(room.name || 'R').trim().charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName} numberOfLines={1}>{room.name || 'Room Chat'}</Text>
                      <Text style={styles.rowPreview} numberOfLines={1}>
                        {room.description || ROOM_TYPE_LABEL[room.type] || 'Open · anyone can join'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.joinBtn}
                      disabled={joiningRoomId === room.id}
                      onPress={() => handleJoinDiscoverable(room)}
                    >
                      <Text style={styles.joinBtnText}>
                        {joiningRoomId === room.id ? '…' : room.type === 'approval' ? 'Request' : 'Join'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const unread = (item.unreadCounts && authUser && item.unreadCounts[authUser.uid]) || 0;
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => openRoomChat(item.id, item.name)}
                onLongPress={() => confirmLock('room', item.id, item.name)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(item.name || 'R').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name || 'Room Chat'}</Text>
                    <Text style={styles.rowTime}>{formatWhen(item.lastMessageAt)}</Text>
                  </View>
                  <View style={styles.rowTop}>
                    <Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>
                      {item.lastSenderName ? `${item.lastSenderName}: ` : ''}{item.lastMessage || 'No messages yet'}
                    </Text>
                    {unread > 0 && (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
      </View>
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
    newBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    newBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
    tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    searchRow: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4, backgroundColor: colors.card },
    searchInput: {
      backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: '#E5E5E5',
      paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: '#222',
    },
    list: { paddingBottom: 20, flexGrow: 1 },
    lockedRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 12, paddingHorizontal: 16,
      backgroundColor: '#FFF8E1', borderBottomWidth: 1, borderBottomColor: '#F0E6C8',
    },
    lockedAvatar: { backgroundColor: '#C9A227' },
    lockedChevron: { fontSize: 20, color: '#C9A227', fontWeight: '700' },
    emptyWrap: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 30, gap: 12 },
    emptyIcon: { fontSize: 40 },
    empty: { textAlign: 'center', color: '#999', fontSize: 13 },
    emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 10, paddingHorizontal: 18 },
    emptyBtnText: { color: 'white', fontSize: 13, fontWeight: '700' },
    sectionHeader: {
      fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase',
      paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6,
    },
    joinBtn: { backgroundColor: colors.primary, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 14 },
    joinBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
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
    rowPreview: { fontSize: 12, color: '#777', flex: 1, marginRight: 8 },
    rowPreviewUnread: { color: colors.text, fontWeight: '600' },
    badge: { backgroundColor: colors.success, borderRadius: radius.pill, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
    badgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
  });
}
