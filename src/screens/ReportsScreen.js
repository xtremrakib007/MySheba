import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as transactionService from '../firebase/transactionService';
import * as inquiryService from '../firebase/inquiryService';
import * as topupService from '../firebase/topupService';

function fmt(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value) {
  if (!value) return '—';
  const d = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function StatCard({ label, value, color }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BreakdownRow({ label, count, amount }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={styles.breakdownCount}>{count} order{count === 1 ? '' : 's'}</Text>
      <Text style={styles.breakdownAmount}>MYR {fmt(amount)}</Text>
    </View>
  );
}

/** Groups completed, non-rejected transactions by their `service` label, summing totals. */
function groupByService(transactions) {
  const map = {};
  transactions
    .filter((t) => t.status === 'completed' && !t.rejected)
    .forEach((t) => {
      const key = t.service || 'Other';
      if (!map[key]) map[key] = { count: 0, amount: 0 };
      map[key].count += 1;
      map[key].amount += Number(t.total || 0);
    });
  return Object.entries(map).map(([label, v]) => ({ label, ...v })).sort((a, b) => b.amount - a.amount);
}

function staffKey(tx) {
  return tx.claimedBy || 'unassigned';
}

function StaffOrderHistory({ transactions }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [staffNames, setStaffNames] = useState({});

  const completed = useMemo(
    () => transactions
      .filter((t) => t.status === 'completed' && !t.rejected && t.claimedBy)
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)),
    [transactions]
  );

  const staff = useMemo(() => {
    const map = {};
    completed.forEach((tx) => {
      const key = staffKey(tx);
      if (!map[key]) map[key] = { uid: key, role: tx.claimedByRole || 'staff', orders: [] };
      map[key].orders.push(tx);
      if (tx.claimedByRole) map[key].role = tx.claimedByRole;
    });
    return Object.values(map).sort((a, b) => b.orders.length - a.orders.length);
  }, [completed]);

  useEffect(() => {
    let alive = true;
    const uids = staff.map((s) => s.uid).filter(Boolean);
    if (!uids.length) { setStaffNames({}); return undefined; }
    Promise.all(uids.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (!snap.exists()) return [uid, ''];
        const d = snap.data() || {};
        return [uid, d.name || d.fullName || d.displayName || d.phone || ''];
      } catch (_) {
        return [uid, ''];
      }
    })).then((entries) => {
      if (alive) setStaffNames(Object.fromEntries(entries));
    });
    return () => { alive = false; };
  }, [staff]);

  return (
    <>
      <Text style={styles.sectionTitle}>Staff Order History</Text>
      <Text style={styles.helperText}>
        Every completed order is grouped by the staff member who accepted it. Admin and superadmin can audit the accepted/completed workload user-wise.
      </Text>
      {staff.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No completed staff orders yet.</Text>
        </View>
      ) : staff.map((person) => {
        const displayName = staffNames[person.uid] || person.uid;
        const total = person.orders.reduce((sum, tx) => sum + Number(tx.total || 0), 0);
        return (
          <View key={person.uid} style={styles.staffCard}>
            <View style={styles.staffHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.staffName}>{displayName}</Text>
                <Text style={styles.staffMeta}>{person.role} • {person.uid}</Text>
              </View>
              <View style={styles.staffTotals}>
                <Text style={styles.staffOrderCount}>{person.orders.length}</Text>
                <Text style={styles.staffMeta}>orders</Text>
              </View>
            </View>
            <View style={styles.staffSummary}>
              <Text style={styles.staffSummaryText}>Completed value</Text>
              <Text style={styles.staffSummaryValue}>MYR {fmt(total)}</Text>
            </View>
            {person.orders.map((tx) => (
              <View key={tx.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyService}>{tx.service || 'Order'} • {tx.id.slice(0, 10)}</Text>
                  <Text style={styles.historyMeta}>Accepted by: {displayName}</Text>
                  <Text style={styles.historyMeta}>Completed by: {displayName}</Text>
                  <Text style={styles.historyMeta}>Completed: {formatDate(tx.updatedAt || tx.createdAt)}</Text>
                </View>
                <Text style={styles.historyAmount}>MYR {fmt(tx.total || tx.amount)}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </>
  );
}

// Customer view: own orders, travel inquiries, and top-ups, aggregated -
// mirrors HistoryScreen's data sources but summarized instead of listed.
function CustomerReports({ authUser }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [transactions, setTransactions] = useState([]);
  const [inquiries, setInquiries] = useState([]);
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) { setLoading(false); return undefined; }
    setLoading(true);
    let a = false, b = false, c = false;
    const done = () => { if (a && b && c) setLoading(false); };
    const u1 = transactionService.subscribeMyTransactions(authUser.uid, (l) => { setTransactions(l); a = true; done(); }, () => { a = true; done(); });
    const u2 = inquiryService.subscribeMyInquiries(authUser.uid, (l) => { setInquiries(l); b = true; done(); }, () => { b = true; done(); });
    const u3 = topupService.subscribeMyTopups(authUser.uid, (l) => { setTopups(l); c = true; done(); }, () => { c = true; done(); });
    return () => { u1(); u2(); u3(); };
  }, [authUser]);

  const completed = transactions.filter((t) => t.status === 'completed' && !t.rejected);
  const totalSpent = completed.reduce((sum, t) => sum + Number(t.total || 0), 0);
  const pendingCount = transactions.filter((t) => t.status === 'pending' || t.status === 'processing').length;
  const approvedTopups = topups.filter((t) => t.status === 'approved').reduce((s, t) => s + Number(t.amount || 0), 0);
  const breakdown = useMemo(() => groupByService(transactions), [transactions]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <>
      <View style={styles.statsGrid}>
        <StatCard label="Total Orders" value={transactions.length} />
        <StatCard label="Completed" value={completed.length} color={colors.success} />
        <StatCard label="Pending" value={pendingCount} color={colors.warning} />
        <StatCard label="Travel Inquiries" value={inquiries.length} />
      </View>
      <Text style={styles.sectionTitle}>Spending Summary</Text>
      <View style={styles.card}>
        <BreakdownRow label="Total Spent (Completed)" count={completed.length} amount={totalSpent} />
        <View style={styles.divider} />
        <BreakdownRow label="Total Topped Up (Approved)" count={topups.filter((t) => t.status === 'approved').length} amount={approvedTopups} />
      </View>
      <Text style={styles.sectionTitle}>By Service</Text>
      <View style={styles.card}>
        {breakdown.length === 0 ? <Text style={styles.emptyText}>No completed orders yet.</Text> : breakdown.map((b, i) => (
          <React.Fragment key={b.label}>
            {i > 0 && <View style={styles.divider} />}
            <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

// Dealer view: processing performance from the same live transaction feed
// the Dealer dashboard uses (AppContext.dealerTxs).
function DealerReports({ dealerTxs }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const pending = dealerTxs.filter((t) => t.status === 'pending').length;
  const processing = dealerTxs.filter((t) => t.status === 'processing').length;
  const completed = dealerTxs.filter((t) => t.status === 'completed' && !t.rejected);
  const rejected = dealerTxs.filter((t) => t.status === 'completed' && t.rejected).length;
  const totalHandled = completed.reduce((s, t) => s + Number(t.total || 0), 0);
  const breakdown = useMemo(() => groupByService(dealerTxs), [dealerTxs]);

  return (
    <>
      <View style={styles.statsGrid}>
        <StatCard label="Pending" value={pending} color={colors.warning} />
        <StatCard label="Processing" value={processing} color={colors.primary} />
        <StatCard label="Completed" value={completed.length} color={colors.success} />
        <StatCard label="Rejected" value={rejected} color={colors.error} />
      </View>
      <Text style={styles.sectionTitle}>Volume Summary</Text>
      <View style={styles.card}>
        <BreakdownRow label="Total Processed (Completed)" count={completed.length} amount={totalHandled} />
      </View>
      <Text style={styles.sectionTitle}>By Service</Text>
      <View style={styles.card}>
        {breakdown.length === 0 ? <Text style={styles.emptyText}>No completed orders yet.</Text> : breakdown.map((b, i) => (
          <React.Fragment key={b.label}>
            {i > 0 && <View style={styles.divider} />}
            <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
          </React.Fragment>
        ))}
      </View>
    </>
  );
}

// Admin/superadmin view: platform-wide numbers across transactions,
// inquiries, and top-up requests (AppContext already keeps these live
// while on the Admin dashboard or this Reports screen).
function AdminReports({ dealerTxs, inquiries, topups }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const completed = dealerTxs.filter((t) => t.status === 'completed' && !t.rejected);
  const totalRevenue = completed.reduce((s, t) => s + Number(t.total || 0), 0);
  const openInquiries = inquiries.filter((i) => i.status !== 'closed').length;
  const pendingTopups = topups.filter((t) => t.status === 'pending').length;
  const approvedTopupsTotal = topups.filter((t) => t.status === 'approved').reduce((s, t) => s + Number(t.amount || 0), 0);
  const breakdown = useMemo(() => groupByService(dealerTxs), [dealerTxs]);

  return (
    <>
      <View style={styles.statsGrid}>
        <StatCard label="Total Orders" value={dealerTxs.length} />
        <StatCard label="Revenue (Completed)" value={`MYR ${fmt(totalRevenue)}`} color={colors.success} />
        <StatCard label="Open Inquiries" value={openInquiries} color={colors.warning} />
        <StatCard label="Pending Top-Ups" value={pendingTopups} color={colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>Platform Summary</Text>
      <View style={styles.card}>
        <BreakdownRow label="Total Travel Inquiries" count={inquiries.length} amount={0} />
        <View style={styles.divider} />
        <BreakdownRow label="Total Top-Ups (Approved)" count={topups.filter((t) => t.status === 'approved').length} amount={approvedTopupsTotal} />
      </View>
      <Text style={styles.sectionTitle}>By Service</Text>
      <View style={styles.card}>
        {breakdown.length === 0 ? <Text style={styles.emptyText}>No completed orders yet.</Text> : breakdown.map((b, i) => (
          <React.Fragment key={b.label}>
            {i > 0 && <View style={styles.divider} />}
            <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
          </React.Fragment>
        ))}
      </View>
      <StaffOrderHistory transactions={dealerTxs} />
    </>
  );
}

export default function ReportsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile, dealerTxs, inquiries, topups } = useApp();
  const role = profile ? profile.role : 'customer';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reports</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {role === 'dealer' && <DealerReports dealerTxs={dealerTxs} />}
        {(role === 'admin' || role === 'superadmin') && <AdminReports dealerTxs={dealerTxs} inquiries={inquiries} topups={topups} />}
        {role === 'customer' && <CustomerReports authUser={authUser} />}
      </ScrollView>
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: { flexBasis: '47%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 11, color: '#999', marginTop: 4 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
    helperText: { fontSize: 11, color: '#888', lineHeight: 16, marginBottom: 8 },
    card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
    breakdownLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
    breakdownCount: { fontSize: 11, color: '#999', marginRight: 10 },
    breakdownAmount: { fontSize: 13, fontWeight: '700', color: colors.primary },
    divider: { height: 1, backgroundColor: '#F0F0F0' },
    emptyText: { textAlign: 'center', color: '#999', fontSize: 12, paddingVertical: 20 },
    staffCard: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
    staffHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
    staffName: { fontSize: 14, fontWeight: '700', color: colors.text },
    staffMeta: { fontSize: 10, color: '#888', marginTop: 3 },
    staffTotals: { alignItems: 'center', minWidth: 48 },
    staffOrderCount: { fontSize: 18, fontWeight: '800', color: colors.primary },
    staffSummary: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 9, backgroundColor: colors.bg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    staffSummaryText: { fontSize: 11, color: '#888' },
    staffSummaryValue: { fontSize: 12, fontWeight: '700', color: colors.primary },
    historyRow: { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    historyService: { fontSize: 12, fontWeight: '700', color: colors.text },
    historyMeta: { fontSize: 10, color: '#888', marginTop: 3 },
    historyAmount: { fontSize: 12, fontWeight: '700', color: colors.primary, alignSelf: 'center' },
  });
}
