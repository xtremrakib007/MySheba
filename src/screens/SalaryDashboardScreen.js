import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { SummaryCard, PrimaryButton } from '../components/ui';
import { subscribeSalarySettings } from '../firebase/salarySettingsService';
import { subscribeSalaryRecord, recordId as buildRecordId } from '../firebase/salaryRecordService';
import { subscribeRecurringAllowances } from '../firebase/allowanceService';
import { subscribeRecurringDeductions } from '../firebase/deductionService';
import { listWorkLogEntriesInRange, dateKey } from '../firebase/workLogService';
import { calculateBasicPay, calculateOTForPeriod, deriveHourlyRate, calculateTakeHomePay, sumLineItems } from '../utils/salaryCalculationService';
import { OT_CALCULATION_METHODS, CURRENCY } from '../data/salaryConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

function monthRangeKeys(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month
  return { startKey: dateKey(start), endKey: dateKey(end) };
}

/**
 * Salary & OT home (PRD sections 2-3). Gates into SalarySettingsScreen's
 * first-run flow when no settings exist yet (PRD section 4), otherwise
 * shows the current month's live-estimated summary card plus quick
 * actions into the rest of the module (Calculator, Work Log, Monthly
 * Summary, History). The estimate itself is recomputed here (from
 * settings + this month's work log + recurring allowances/deductions)
 * rather than read from a saved salaryRecords doc, so it reflects today's
 * data even before the user has opened Monthly Summary to save an
 * official record for the month - see PRD section 3's example, which
 * shows this card before any explicit "calculate" action.
 */
export default function SalaryDashboardScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, setScreen, openCreatePayslip, openPayslipHistory } = useApp();

  const [settings, setSettings] = useState(undefined); // undefined = still loading, null = none saved yet
  const [workLogEntries, setWorkLogEntries] = useState([]);
  const [recurringAllowances, setRecurringAllowances] = useState([]);
  const [recurringDeductions, setRecurringDeductions] = useState([]);
  const [savedRecord, setSavedRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisRecordId = buildRecordId(year, month);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = subscribeSalarySettings(authUser.uid, (s) => {
      setSettings(s);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !settings) return undefined;
    const unsubAllow = subscribeRecurringAllowances(authUser.uid, setRecurringAllowances, () => {});
    const unsubDeduct = subscribeRecurringDeductions(authUser.uid, setRecurringDeductions, () => {});
    const unsubRecord = subscribeSalaryRecord(authUser.uid, thisRecordId, setSavedRecord, () => {});
    return () => {
      unsubAllow();
      unsubDeduct();
      unsubRecord();
    };
  }, [authUser, settings, thisRecordId]);

  useEffect(() => {
    if (!authUser || !settings) return;
    const { startKey, endKey } = monthRangeKeys(year, month);
    listWorkLogEntriesInRange(authUser.uid, startKey, endKey).then(setWorkLogEntries).catch(() => {});
  }, [authUser, settings, year, month]);

  const daysWorked = useMemo(() => workLogEntries.filter((e) => e.status === 'worked').length, [workLogEntries]);

  const estimate = useMemo(() => {
    if (!settings) return null;
    const hourlyRate = deriveHourlyRate(settings.basicSalary, settings.normalHoursPerDay, settings.workingDaysPerWeek);
    // Working days in the month - approximated from workingDaysPerWeek
    // (PRD section 4's only relevant setting), same "estimate, not a
    // payroll-calendar" spirit as deriveHourlyRate's monthlyHours.
    const workingDaysInMonth = Math.round((settings.workingDaysPerWeek || 6) * (52 / 12));
    const basicPay = calculateBasicPay(settings.basicSalary, workingDaysInMonth, daysWorked);
    const { otPay, otHours } = calculateOTForPeriod(workLogEntries, settings.otCalculationMethod, {
      hourlyRate,
      customOtRate: settings.customOtRate,
    });
    const allowances = sumLineItems(recurringAllowances);
    const deductions = sumLineItems(recurringDeductions);
    const breakdown = calculateTakeHomePay({ basicPay, otPay, allowances, deductions });
    return { ...breakdown, otHours, daysWorked, hourlyRate };
  }, [settings, workLogEntries, recurringAllowances, recurringDeductions, daysWorked]);

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // First-time setup gate (PRD section 4) - no settings doc yet.
  if (!settings) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Salary & OT</Text>
        </LinearGradient>
        <View style={[styles.body, styles.center]}>
          <Text style={styles.setupIcon}>💰</Text>
          <Text style={styles.setupTitle}>Let's set up your salary</Text>
          <Text style={styles.setupSubtitle}>
            Add your basic salary and working hours so MySheba can estimate your monthly pay and overtime.
          </Text>
          <PrimaryButton label="Get Started" onPress={() => setScreen('salarySettings')} style={styles.setupBtn} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salary & OT</Text>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setScreen('salarySettings')}>
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>

        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.mainCard}>
          <Text style={styles.mainCardLabel}>Estimated Salary</Text>
          <Text style={styles.mainCardValue}>{money(estimate.takeHomePay)}</Text>
          <Text style={styles.estimatedTag}>ESTIMATED</Text>
        </LinearGradient>

        <SummaryCard
          rows={[
            { label: 'Basic Salary', value: money(settings.basicSalary) },
            { label: 'Estimated OT', value: money(estimate.otPay) },
            { label: 'Allowances', value: money(estimate.allowances) },
            { label: 'Deductions', value: `- ${money(estimate.deductions)}` },
          ]}
          totalLabel="Estimated Take Home"
          totalValue={money(estimate.takeHomePay)}
        />
        <Text style={styles.disclaimer}>
          Estimated based on your saved settings and work log. Actual salary depends on your employment contract, approved OT and your employer's payroll rules.
        </Text>

        {savedRecord?.actualSalaryReceived != null && (
          <View style={styles.actualBanner}>
            <Text style={styles.actualBannerText}>
              Actual salary recorded for {monthLabel}: {money(savedRecord.actualSalaryReceived)}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionTile icon="🧮" label="Calculator" onPress={() => setScreen('salaryCalculator')} />
          <ActionTile icon="📋" label="Work Log" onPress={() => setScreen('salaryWorkLog')} />
          <ActionTile icon="📊" label="Reports" onPress={() => setScreen('salaryReports')} />
          <ActionTile icon="📈" label="Monthly Summary" onPress={() => setScreen('salaryMonthlySummary')} />
          <ActionTile icon="🕒" label="History" onPress={() => setScreen('salaryHistory')} />
          <ActionTile icon="🧾" label="Create Payslip" onPress={() => openCreatePayslip()} />
          <ActionTile icon="📑" label="Payslips" onPress={openPayslipHistory} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{estimate.daysWorked}</Text>
            <Text style={styles.statLabel}>Days Worked</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{estimate.otHours}h</Text>
            <Text style={styles.statLabel}>OT Hours</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{money(estimate.hourlyRate)}</Text>
            <Text style={styles.statLabel}>Hourly Rate</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ActionTile({ icon, label, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.actionTile} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    settingsBtn: { padding: 4 },
    settingsIcon: { fontSize: 18 },
    body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
    setupIcon: { fontSize: 48, marginBottom: 12 },
    setupTitle: { fontSize: 18, fontWeight: '700', color: colors.navy, marginBottom: 8, textAlign: 'center' },
    setupSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, paddingHorizontal: 12 },
    setupBtn: { width: '100%' },
    monthLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 },
    mainCard: { borderRadius: radius.xl, padding: 20, alignItems: 'center', marginBottom: 16 },
    mainCardLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginBottom: 6 },
    mainCardValue: { color: 'white', fontSize: 32, fontWeight: '800' },
    estimatedTag: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700', marginTop: 8, letterSpacing: 1 },
    disclaimer: { fontSize: 11, color: colors.textSecondary, marginTop: 10, marginBottom: 8, lineHeight: 16 },
    actualBanner: { backgroundColor: '#E8F5E9', borderRadius: radius.md, padding: 12, marginTop: 8, marginBottom: 8 },
    actualBannerText: { fontSize: 12, color: colors.navy, fontWeight: '600' },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 20, marginBottom: 10 },
    actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    actionTile: { width: '47%', backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
    actionIcon: { fontSize: 24, marginBottom: 6 },
    actionLabel: { fontSize: 12, fontWeight: '600', color: colors.navy },
    statsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    statBox: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
    statValue: { fontSize: 15, fontWeight: '700', color: colors.primary },
    statLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  });
}
