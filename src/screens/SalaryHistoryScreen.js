import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { SummaryCard } from '../components/ui';
import { subscribeSalaryHistory } from '../firebase/salaryRecordService';
import { computeIncomeStats, buildIncomeChartSeries } from '../utils/salaryStatsService';
import { formatDifferenceMessage } from '../utils/salaryCalculationService';
import { CURRENCY } from '../data/salaryConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Salary History (PRD section 18) plus Income Statistics (PRD section
 * 19), combined since stats are just an aggregate view over the same
 * history list this screen already loads - no separate screen or extra
 * read needed. "Tap a month to open full details" (PRD section 18) opens
 * a lightweight in-place modal breakdown rather than routing to a new
 * screen, since a saved SalaryRecord has everything MonthlySummaryScreen
 * shows for the *current* month already computed and stored on it - no
 * need to re-derive from work logs/allowances/deductions for a past,
 * already-saved month.
 */
export default function SalaryHistoryScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, openCreatePayslip } = useApp();

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openRecord, setOpenRecord] = useState(null);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = subscribeSalaryHistory(authUser.uid, (list) => {
      setRecords(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser]);

  const stats = useMemo(() => computeIncomeStats(records), [records]);
  const chartSeries = useMemo(() => buildIncomeChartSeries(records), [records]);
  const maxChartValue = useMemo(() => Math.max(1, ...chartSeries.map((p) => p.value)), [chartSeries]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salary History</Text>
      </LinearGradient>

      {loading ? (
        <View style={[styles.body, styles.center]}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : records.length === 0 ? (
        <View style={[styles.body, styles.center]}>
          <Text style={styles.emptyText}>No salary records saved yet. Save a month's estimate from Monthly Summary to start building your history.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.sectionTitle}>Income Statistics</Text>
          <View style={styles.statsGrid}>
            <StatBox label="Average Monthly" value={money(stats.averageMonthlySalary)} />
            <StatBox label="Average OT" value={money(stats.averageOT)} />
            <StatBox label="Total OT Hours" value={`${stats.totalOTHours}h`} />
            <StatBox label="Highest Month" value={money(stats.highestMonthlyIncome)} />
            <StatBox label="Lowest Month" value={money(stats.lowestMonthlyIncome)} />
            <StatBox label="Months Tracked" value={`${stats.monthCount}`} />
          </View>

          {chartSeries.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>Monthly Income</Text>
              <View style={styles.chartRow}>
                {chartSeries.map((p, i) => (
                  <View key={i} style={styles.chartBarWrap}>
                    <View style={[styles.chartBar, { height: Math.max(4, (p.value / maxChartValue) * 90) }]} />
                    <Text style={styles.chartLabel}>{p.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>History</Text>
          {records.map((r) => (
            <TouchableOpacity key={r.id} style={styles.historyRow} onPress={() => setOpenRecord(r)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyMonth}>{MONTH_NAMES[r.month - 1]} {r.year}</Text>
                <Text style={styles.historyDetail}>Estimated {money(r.estimatedTakeHome)}</Text>
                {r.actualSalaryReceived != null && <Text style={styles.historyDetail}>Received {money(r.actualSalaryReceived)}</Text>}
              </View>
              <Text style={styles.historyChevron}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <RecordDetailModal record={openRecord} onClose={() => setOpenRecord(null)} onUseForPayslip={openCreatePayslip} />
    </View>
  );
}

function StatBox({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function RecordDetailModal({ record, onClose, onUseForPayslip }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  if (!record) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{MONTH_NAMES[record.month - 1]} {record.year}</Text>

          <SummaryCard
            rows={[
              { label: 'Basic Pay', value: money(record.basicPay) },
              { label: 'Days Worked', value: `${record.daysWorked}` },
              { label: 'OT Hours', value: `${record.otHours}` },
              { label: 'Estimated OT', value: money(record.otPay) },
              { label: 'Allowances', value: money(record.allowances) },
              { label: 'Deductions', value: `- ${money(record.deductions)}` },
            ]}
            totalLabel="Estimated Take-Home"
            totalValue={money(record.estimatedTakeHome)}
          />

          {record.actualSalaryReceived != null && (
            <>
              <View style={styles.actualRow}>
                <Text style={styles.actualLabel}>Actual Salary Received</Text>
                <Text style={styles.actualValue}>{money(record.actualSalaryReceived)}</Text>
              </View>
              <Text style={styles.diffText}>{formatDifferenceMessage(record.difference)}</Text>
            </>
          )}

          {record.payslipFileReference && <Text style={styles.payslipNote}>✓ Payslip attached</Text>}

          <TouchableOpacity
            style={styles.useForPayslipBtn}
            onPress={() => {
              onClose();
              onUseForPayslip?.(record.id);
            }}
          >
            <Text style={styles.useForPayslipText}>Use for Payslip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 10, marginBottom: 10 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statBox: { width: '31%', backgroundColor: colors.card, borderRadius: radius.md, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
    statValue: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center' },
    statLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    chartRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120, paddingHorizontal: 4, marginBottom: 10 },
    chartBarWrap: { flex: 1, alignItems: 'center' },
    chartBar: { width: 14, backgroundColor: colors.primary, borderRadius: 4 },
    chartLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 6 },
    historyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8E8E8' },
    historyMonth: { fontSize: 14, fontWeight: '700', color: colors.navy },
    historyDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    historyChevron: { fontSize: 18, color: colors.textSecondary },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20, maxHeight: '85%' },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.navy, marginBottom: 14 },
    actualRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
    actualLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    actualValue: { fontSize: 13, color: colors.navy, fontWeight: '700' },
    diffText: { fontSize: 11, color: colors.textSecondary, marginTop: 6, lineHeight: 16 },
    payslipNote: { fontSize: 12, color: colors.success, fontWeight: '700', marginTop: 14 },
    useForPayslipBtn: { marginTop: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    useForPayslipText: { color: 'white', fontWeight: '700', fontSize: 13 },
    closeBtn: { marginTop: 20, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    closeBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
  });
}
