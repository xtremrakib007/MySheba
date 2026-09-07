// Admin/superadmin > Chat Reports - the screen that was missing for
// directChatService.reportConversation. Reports were already being written
// to Firestore and pinging admin/superadmin the moment someone filed one
// (functions/index.js onDirectChatReportCreated) - this is just the first
// screen to actually show them. See directChatModerationService.js for why
// this can't show the reported conversation's messages themselves (admin
// isn't a participant, and firestore.rules keeps it that way on purpose).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { subscribeChatReports, setChatReportStatus } from '../firebase/directChatModerationService';
import { subscribeAllUsers, suspendUser } from '../firebase/userManagementService';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

function fmtDate(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function ReportCard({ report, usersByUid, myUid, canSuspend, onChanged, onInvestigate }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [busy, setBusy] = useState(false);
  const reporter = usersByUid[report.reporterId];
  const reported = usersByUid[report.reportedUid];

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged(); }
    catch (e) { showAlert('Something went wrong', e.message || 'Please try again.'); }
    finally { setBusy(false); }
  };

  const dismiss = () => run(() => setChatReportStatus(report.id, 'resolved', myUid));
  const reopen = () => run(() => setChatReportStatus(report.id, 'open', myUid));
  const suspend = () => showAlert(
    'Suspend this account?',
    `${reported?.name || report.reportedUid} will no longer be able to sign in.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Suspend', style: 'destructive', onPress: () => run(() => suspendUser({ targetUid: report.reportedUid, suspended: true })) },
    ]
  );

  return (
    <View style={[styles.card, report.status === 'resolved' && styles.cardResolved]}>
      <View style={styles.cardTopRow}>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{report.status === 'resolved' ? 'Resolved' : 'Open'}</Text>
        </View>
        <Text style={styles.date}>{fmtDate(report.createdAt)}</Text>
      </View>

      <View style={styles.identityRow}>
        <Text style={styles.identityLabel}>Reported</Text>
        <Text style={styles.identityValue}>
          {reported ? `${reported.name || 'User'}${reported.phone ? ` · ${reported.phone}` : ''}` : report.reportedUid}
          {reported?.suspended ? '  🚫 Suspended' : ''}
        </Text>
      </View>
      <View style={styles.identityRow}>
        <Text style={styles.identityLabel}>Reported by</Text>
        <Text style={styles.identityValue}>{reporter ? (reporter.name || 'User') : report.reporterId}</Text>
      </View>

      <Text style={styles.reason}>🚩 {report.reason || 'No reason given'}</Text>

      {busy ? (
        <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />
      ) : (
        <View style={styles.actionsRow}>
          {report.status === 'resolved' ? (
            <TouchableOpacity style={styles.actionBtn} onPress={reopen}>
              <Text style={styles.actionBtnText}>Reopen</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={dismiss}>
              <Text style={styles.actionBtnText}>Dismiss</Text>
            </TouchableOpacity>
          )}
          {canSuspend && !reported?.suspended && (
            <TouchableOpacity style={[styles.actionBtn, styles.suspendBtn]} onPress={suspend}>
              <Text style={[styles.actionBtnText, styles.suspendBtnText]}>Suspend User</Text>
            </TouchableOpacity>
          )}
          {canSuspend && report.status !== 'resolved' && (
            <TouchableOpacity style={[styles.actionBtn, styles.investigateBtn]} onPress={() => onInvestigate(report)}>
              <Text style={[styles.actionBtnText, styles.investigateBtnText]}>🔍 Investigate</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function ChatReportsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, goBackOrHome, openInvestigateChat } = useApp();
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');

  useEffect(() => {
    const unsub = subscribeChatReports(
      (list) => { setReports(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => subscribeAllUsers(setUsers, () => {}), []);

  const usersByUid = useMemo(() => {
    const map = {};
    users.forEach((u) => { map[u.id] = u; });
    return map;
  }, [users]);

  const visible = reports.filter((r) => {
    if (tab === 'all') return true;
    if (tab === 'open') return r.status !== 'resolved';
    return r.status === 'resolved';
  });

  const canSuspend = profile?.role === 'superadmin';

  const investigate = (report) => {
    const reported = usersByUid[report.reportedUid];
    const reporter = usersByUid[report.reporterId];
    openInvestigateChat(report.chatId, {
      id: report.id,
      reportedUid: report.reportedUid,
      reportedName: reported?.name || report.reportedUid,
      reporterName: reporter?.name || report.reporterId,
    });
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat Reports</Text>
      </LinearGradient>

      <View style={styles.tabsRow}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {visible.length === 0 ? (
            <Text style={styles.empty}>No {tab === 'all' ? '' : tab} reports</Text>
          ) : (
            visible.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                usersByUid={usersByUid}
                myUid={authUser?.uid}
                canSuspend={canSuspend}
                onChanged={() => {}}
                onInvestigate={investigate}
              />
            ))
          )}
        </ScrollView>
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
    tabsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
    tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: 12, fontWeight: '600', color: colors.text },
    tabTextActive: { color: 'white' },
    list: { padding: 16, paddingBottom: 30 },
    empty: { textAlign: 'center', color: '#999', paddingVertical: 40, fontSize: 13 },
    card: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      padding: 14, marginBottom: 12,
    },
    cardResolved: { opacity: 0.6 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    statusPill: { backgroundColor: '#FDECEA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
    statusPillText: { fontSize: 11, fontWeight: '700', color: colors.error },
    date: { fontSize: 11, color: '#999' },
    identityRow: { flexDirection: 'row', marginBottom: 3 },
    identityLabel: { width: 88, fontSize: 12, color: '#999' },
    identityValue: { flex: 1, fontSize: 12, color: colors.text, fontWeight: '500' },
    reason: { fontSize: 13, color: colors.text, marginTop: 8, marginBottom: 4 },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    actionBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center', backgroundColor: '#F0F0F0' },
    actionBtnText: { fontSize: 12, fontWeight: '700', color: colors.text },
    suspendBtn: { backgroundColor: '#FDECEA' },
    suspendBtnText: { color: colors.error },
    investigateBtn: { backgroundColor: '#EAF2FF' },
    investigateBtnText: { color: colors.primary },
  });
}
