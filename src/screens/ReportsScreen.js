import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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

function StatCard({ label, value, color }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function BreakdownRow({ label, count, amount }) {
  const {
    colors
  } = useTheme();

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

// Customer view: own orders, travel inquiries, and top-ups, aggregated -
// mirrors HistoryScreen's data sources but summarized instead of listed.
function CustomerReports({ authUser }) {
  const {
    colors
  } = useTheme();

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

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

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
        {breakdown.length === 0 ? (
          <Text style={styles.emptyText}>No completed orders yet.</Text>
        ) : (
          breakdown.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 && <View style={styles.divider} />}
              <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );
}

// Dealer view: processing performance from the same live transaction feed
// the Dealer dashboard uses (AppContext.dealerTxs).
function DealerReports({ dealerTxs }) {
  const {
    colors
  } = useTheme();

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
        {breakdown.length === 0 ? (
          <Text style={styles.emptyText}>No completed orders yet.</Text>
        ) : (
          breakdown.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 && <View style={styles.divider} />}
              <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );
}

// Admin/superadmin view: platform-wide numbers across transactions,
// inquiries, and top-up requests (AppContext already keeps these live
// while on the Admin dashboard or this Reports screen).
function AdminReports({ dealerTxs, inquiries, topups }) {
  const {
    colors
  } = useTheme();

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
        {breakdown.length === 0 ? (
          <Text style={styles.emptyText}>No completed orders yet.</Text>
        ) : (
          breakdown.map((b, i) => (
            <React.Fragment key={b.label}>
              {i > 0 && <View style={styles.divider} />}
              <BreakdownRow label={b.label} count={b.count} amount={b.amount} />
            </React.Fragment>
          ))
        )}
      </View>
    </>
  );
}

export default function ReportsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile, dealerTxs, inquiries, topups } = useApp();
  const role = profile ? profile.role : 'customer';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reports</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        {(role === 'dealer') && <DealerReports dealerTxs={dealerTxs} />}
        {(role === 'admin' || role === 'superadmin') && (
          <AdminReports dealerTxs={dealerTxs} inquiries={inquiries} topups={topups} />
        )}
        {role === 'customer' && <CustomerReports authUser={authUser} />}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: { flexBasis: '47%', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 11, color: '#999', marginTop: 4 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
    card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 14 },
    breakdownLabel: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '500' },
    breakdownCount: { fontSize: 11, color: '#999', marginRight: 10 },
    breakdownAmount: { fontSize: 13, fontWeight: '700', color: colors.primary },
    divider: { height: 1, backgroundColor: '#F0F0F0' },
    emptyText: { textAlign: 'center', color: '#999', fontSize: 12, paddingVertical: 20 },
  });
}
