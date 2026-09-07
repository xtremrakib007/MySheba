// Superadmin-only, read-only view of a reported direct chat's messages.
// Reached from ChatReportsScreen's "Investigate" button, which only shows
// while the report is 'open'. Firestore only lets this succeed while
// directChats/{chatId}.underInvestigation is true (set/cleared by Cloud
// Functions in response to the report - see functions/index.js and
// directChatModerationService.js's header comment for the full flow).
//
// Deliberately has no message box, call button, or block/report action -
// this is a moderation tool for someone who isn't a participant, not a
// second way to use the chat.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { subscribeInvestigationMessages } from '../firebase/directChatModerationService';

function formatTime(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function InvestigateChatScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, activeInvestigateChatId, activeInvestigateReport } = useApp();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!activeInvestigateChatId) return undefined;
    setLoading(true);
    setError(null);
    const unsub = subscribeInvestigationMessages(
      activeInvestigateChatId,
      profile?.role,
      (list) => { setMessages(list); setLoading(false); },
      (e) => { setError(e?.message || 'Could not load this conversation. The report may have been resolved.'); setLoading(false); }
    );
    return unsub;
  }, [activeInvestigateChatId, profile?.role]);

  const reportedUid = activeInvestigateReport?.reportedUid;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Investigate Conversation</Text>
          {!!activeInvestigateReport?.reportedName && (
            <Text style={styles.headerSubtitle}>Reported: {activeInvestigateReport.reportedName}</Text>
          )}
        </View>
      </LinearGradient>

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          🔒 You're viewing this conversation because there's an open report against it. Access ends automatically once the report is resolved.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.empty}>No messages in this conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => {
            const fromReported = reportedUid && item.senderId === reportedUid;
            return (
              <View style={[styles.bubble, fromReported && styles.bubbleFlagged]}>
                <View style={styles.bubbleTopRow}>
                  <Text style={styles.senderName}>{item.senderName || 'User'}</Text>
                  {fromReported && <Text style={styles.flagTag}>reported</Text>}
                </View>
                <Text style={styles.bubbleText}>{item.text || (item.type ? `[${item.type}]` : '')}</Text>
                <Text style={styles.bubbleTime}>{formatTime(item.createdAt)}</Text>
              </View>
            );
          }}
        />
      )}
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
    headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginLeft: 10, marginTop: 1 },
    notice: { backgroundColor: '#FFF6E5', paddingHorizontal: 14, paddingVertical: 10 },
    noticeText: { fontSize: 11, color: '#8A6100', lineHeight: 16 },
    list: { padding: 16, paddingBottom: 30 },
    centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
    empty: { color: '#999', fontSize: 13, textAlign: 'center' },
    errorText: { color: colors.error, fontSize: 13, textAlign: 'center' },
    bubble: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      padding: 10, marginBottom: 10,
    },
    bubbleFlagged: { borderColor: colors.error },
    bubbleTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
    senderName: { fontSize: 11, fontWeight: '700', color: colors.primary },
    flagTag: { fontSize: 9, fontWeight: '700', color: colors.error, backgroundColor: '#FDECEA', paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
    bubbleText: { fontSize: 14, color: colors.text },
    bubbleTime: { fontSize: 10, color: '#999', marginTop: 4, textAlign: 'right' },
  });
}
