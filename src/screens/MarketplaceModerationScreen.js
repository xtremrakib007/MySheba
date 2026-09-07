// Marketplace Admin Panel > "Manage reports" + "Ban users" (PRD section
// 13). Admin/superadmin only (gated in Sidebar.js, same pattern as
// UserManagementScreen). Shows every report filed against a Buy & Sell
// listing, Accommodation property, or Room Sharing request
// (marketplaceModerationService.subscribeAllReports), and lets the admin:
//   - Dismiss a report (the post is fine - marks it resolved, doesn't
//     touch the post)
//   - Hide / Restore the underlying post
//   - Delete the underlying post outright
//   - Ban (or unban) the person who posted it from Marketplace
//
// Auto-hiding past a report-count threshold already happens server-side
// (functions/index.js) before an admin ever looks at this screen - this
// is the human review layer on top of that, for everything the automatic
// threshold doesn't catch (or catches wrongly).
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import BusinessBadge from '../components/BusinessBadge';
import { REPORT_KINDS, subscribeAllReports, setReportStatus } from '../firebase/marketplaceModerationService';
import { setMarketplaceBan } from '../firebase/userManagementService';

const TABS = [{ key: 'all', label: 'All' }, ...Object.entries(REPORT_KINDS).map(([key, cfg]) => ({ key, label: cfg.label }))];

const ACTIVE_LABEL = { active: 'Active', sold: 'Sold', rented: 'Rented', closed: 'Filled', hidden: 'Hidden' };

function fmtDate(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Fetches (once, not live - moderation doesn't need live target updates)
// the post a report points at, so the card can show its current status
// and owner even though the report doc itself only stores a title
// snapshot from when it was filed.
function useTarget(kind, targetId) {
  const [target, setTarget] = useState(undefined); // undefined = loading, null = deleted
  useEffect(() => {
    let cancelled = false;
    setTarget(undefined);
    REPORT_KINDS[kind].getTarget(targetId).then((t) => { if (!cancelled) setTarget(t); }).catch(() => { if (!cancelled) setTarget(null); });
    return () => { cancelled = true; };
  }, [kind, targetId]);
  return target;
}

function ReportCard({ report, onChanged, onBan, myUid }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const cfg = REPORT_KINDS[report.kind];
  const targetId = report[cfg.targetIdField];
  const target = useTarget(report.kind, targetId);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try { await fn(); onChanged(); }
    catch (e) { showAlert('Something went wrong', e.message || 'Please try again.'); }
    finally { setBusy(false); }
  };

  const dismiss = () => run(() => setReportStatus(report.kind, report.id, 'resolved', myUid));
  const reopen = () => run(() => setReportStatus(report.kind, report.id, 'open', myUid));
  const hide = () => run(() => cfg.setStatus(targetId, 'hidden'));
  const restore = () => run(() => cfg.setStatus(targetId, 'active'));
  const remove = () => showAlert('Delete this post?', 'This permanently removes it. This cannot be undone.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => run(() => cfg.deleteTarget(targetId)) },
  ]);

  const targetStatus = target && target.status;
  const targetTitle = (target && target.title) || report[cfg.targetTitleField] || '(untitled)';
  const ownerId = target && target[cfg.ownerField];

  return (
    <View style={[styles.card, report.status === 'resolved' && styles.cardResolved]}>
      <View style={styles.cardTopRow}>
        <View style={styles.kindPill}><Text style={styles.kindPillText}>{cfg.label}</Text></View>
        {targetStatus && (
          <View style={[styles.statusPill, targetStatus === 'hidden' && styles.statusPillHidden]}>
            <Text style={[styles.statusPillText, targetStatus === 'hidden' && styles.statusPillTextHidden]}>
              {ACTIVE_LABEL[targetStatus] || targetStatus}
            </Text>
          </View>
        )}
        {target === null && <View style={styles.statusPill}><Text style={styles.statusPillText}>Deleted</Text></View>}
        <Text style={styles.date}>{fmtDate(report.createdAt)}</Text>
      </View>

      <Text style={styles.title} numberOfLines={2}>{targetTitle}</Text>
      {!!cfg.businessField && <BusinessBadge isBusiness={target && target[cfg.businessField]} size="sm" />}
      <Text style={styles.reason}>🚩 {report.reason}</Text>
      {!!report.note && <Text style={styles.note} numberOfLines={3}>“{report.note}”</Text>}

      {busy ? (
        <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />
      ) : (
        <View style={styles.actionsRow}>
          {report.status === 'resolved' ? (
            <TouchableOpacity style={styles.actionBtn} onPress={reopen}><Text style={styles.actionText}>Reopen</Text></TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={dismiss}><Text style={styles.actionText}>Dismiss</Text></TouchableOpacity>
          )}
          {targetStatus && targetStatus !== 'hidden' && (
            <TouchableOpacity style={styles.actionBtn} onPress={hide}><Text style={styles.actionText}>Hide post</Text></TouchableOpacity>
          )}
          {targetStatus === 'hidden' && (
            <TouchableOpacity style={styles.actionBtn} onPress={restore}><Text style={styles.actionText}>Restore</Text></TouchableOpacity>
          )}
          {target !== null && (
            <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={remove}><Text style={[styles.actionText, styles.dangerText]}>Delete</Text></TouchableOpacity>
          )}
          {!!ownerId && (
            <TouchableOpacity style={[styles.actionBtn, styles.banBtn]} onPress={() => onBan(ownerId)}>
              <Text style={[styles.actionText, styles.banText]}>Ban poster</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

export default function MarketplaceModerationScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser } = useApp();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [showResolved, setShowResolved] = useState(false);
  const [banTarget, setBanTarget] = useState(null); // uid awaiting a ban reason

  useEffect(() => {
    const unsub = subscribeAllReports((list) => { setReports(list); setLoading(false); }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    return reports
      .filter((r) => tab === 'all' || r.kind === tab)
      .filter((r) => showResolved || r.status !== 'resolved');
  }, [reports, tab, showResolved]);

  const openCount = reports.filter((r) => r.status !== 'resolved').length;

  const submitBan = async (reason) => {
    const uid = banTarget;
    setBanTarget(null);
    try {
      await setMarketplaceBan({ targetUid: uid, banned: true, reason });
      showAlert('User banned', 'They can no longer post new Marketplace listings.');
    } catch (e) {
      showAlert('Could not ban user', e.message || 'Please try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Marketplace Moderation</Text>
        <View style={styles.openBadge}><Text style={styles.openBadgeText}>{openCount} open</Text></View>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow} contentContainerStyle={{ paddingHorizontal: 12 }}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.toggleRow} onPress={() => setShowResolved((v) => !v)}>
        <Text style={styles.toggleText}>{showResolved ? '☑' : '☐'} Show dismissed reports</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {filtered.length === 0 ? (
            <Text style={styles.emptyText}>No reports here. 🎉</Text>
          ) : (
            filtered.map((r) => (
              <ReportCard
                key={`${r.kind}_${r.id}`}
                report={r}
                myUid={authUser?.uid}
                onChanged={() => {}}
                onBan={(uid) => setBanTarget(uid)}
              />
            ))
          )}
        </ScrollView>
      )}

      <PromptModal
        visible={!!banTarget}
        title="Ban this user from Marketplace?"
        placeholder="Reason (optional)"
        onCancel={() => setBanTarget(null)}
        onSubmit={submitBan}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    backText: { color: 'white', fontSize: 18 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700', flex: 1, marginLeft: 10 },
    openBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm },
    openBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
    tabsRow: { flexGrow: 0, marginTop: 12 },
    tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#fff', marginRight: 8, borderWidth: 1, borderColor: colors.border },
    tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tabText: { fontSize: 13, color: '#555', fontWeight: '600' },
    tabTextActive: { color: 'white' },
    toggleRow: { paddingHorizontal: 16, paddingVertical: 8 },
    toggleText: { fontSize: 13, color: '#666' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    list: { padding: 12, paddingBottom: 32 },
    emptyText: { textAlign: 'center', color: '#888', marginTop: 40 },
    card: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    cardResolved: { opacity: 0.6 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    kindPill: { backgroundColor: '#F0F0FA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
    kindPillText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    statusPill: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, marginLeft: 6 },
    statusPillText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
    statusPillHidden: { backgroundColor: '#FFEBEE' },
    statusPillTextHidden: { color: '#C62828' },
    date: { marginLeft: 'auto', fontSize: 11, color: '#999' },
    title: { fontSize: 15, fontWeight: '700', color: '#222', marginBottom: 4 },
    reason: { fontSize: 13, color: '#B45309', fontWeight: '600', marginBottom: 2 },
    note: { fontSize: 13, color: '#666', fontStyle: 'italic' },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
    actionText: { fontSize: 12, fontWeight: '700', color: '#333' },
    dangerBtn: { borderColor: '#C62828' },
    dangerText: { color: '#C62828' },
    banBtn: { borderColor: '#B45309' },
    banText: { color: '#B45309' },
  });
}
