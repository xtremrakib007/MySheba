// Shown when the home screen bell is tapped. Lists admin announcements
// addressed to this user ('all' or their own role) - see AppContext's
// myNotifications (client-side filter over the same 'announcements'
// collection Admin > Announcements writes to) and firestore.rules, which
// opens read access to any signed-in user for this collection.
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function NoticeCard({ item }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.bellIcon}>🔔</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
      </View>
      {!!item.body && <Text style={styles.cardBody}>{item.body}</Text>}
      <Text style={styles.cardDate}>{formatDate(item.createdAt)}</Text>
    </View>
  );
}

export default function NotificationsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, myNotifications, markNotificationsSeen } = useApp();

  // Mark everything as seen the moment this screen opens, so the home
  // screen's unread dot clears - matches how a phone's own notification
  // shade works.
  useEffect(() => {
    markNotificationsSeen();
  }, [markNotificationsSeen]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
      </LinearGradient>

      <FlatList
        data={myNotifications}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <NoticeCard item={item} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🔔</Text>
            <Text style={styles.emptyText}>No notifications yet.</Text>
          </View>
        }
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { fontSize: 13, color: '#999' },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
    bellIcon: { fontSize: 14 },
    cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    cardBody: { fontSize: 12, color: colors.textSecondary, marginBottom: 8, lineHeight: 17 },
    cardDate: { fontSize: 11, color: '#999' },
  });
}
