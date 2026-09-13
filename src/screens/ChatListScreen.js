import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as chatService from '../firebase/chatService';

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

// Staff-side inbox: every customer conversation, WhatsApp-list style -
// avatar initial, name, last message preview, timestamp, and an unread
// badge. Tapping a row opens that thread in ChatScreen.
export default function ChatListScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openChat, setScreen } = useApp();
  const [chats, setChats] = useState([]);

  useEffect(() => {
    const unsub = chatService.subscribeAllChats((list) => setChats(list), () => {});
    return unsub;
  }, []);

  const visible = chats.filter((c) => c.lastMessage);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chats</Text>
      </LinearGradient>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No conversations yet</Text>}
        renderItem={({ item }) => {
          const name = item.customerName || item.customerPhone || 'Customer';
          const unread = item.unreadForStaff || 0;
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => openChat(item.id, name)}
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
                    {item.lastSenderRole === 'staff' ? 'You: ' : ''}{item.lastMessage}
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
    list: { paddingBottom: 20 },
    empty: { textAlign: 'center', color: '#999', paddingVertical: 40 },
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