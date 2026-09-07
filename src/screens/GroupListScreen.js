import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

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

// Every group thread the signed-in user is a member of - customers, dealers,
// and admins all land here the same way. Any signed-in account can start a
// new group (member picking searches every account via a Cloud Function -
// see src/screens/NewGroupScreen.js), and anyone already added to a group
// can open and use it.
export default function GroupListScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, setScreen, openGroupChat, myGroups, profile, authUser } = useApp();
  const canCreateGroup = !!profile;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Groups</Text>
        {canCreateGroup && (
          <TouchableOpacity style={styles.newBtn} onPress={() => setScreen('newGroup')}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <FlatList
        data={myGroups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.empty}>
              {canCreateGroup ? 'No groups yet. Tap "+ New" to start one.' : "No groups yet. You'll see them here once you're added to one."}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const unread = (item.unreadCounts && authUser && item.unreadCounts[authUser.uid]) || 0;
          return (
            <TouchableOpacity style={styles.row} onPress={() => openGroupChat(item.id, item.name)}>
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
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { flex: 1, color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    newBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    newBtnText: { color: 'white', fontSize: 12, fontWeight: '700' },
    list: { paddingBottom: 20, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    empty: { textAlign: 'center', color: '#999', fontSize: 13 },
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
