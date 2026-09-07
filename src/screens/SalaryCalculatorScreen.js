import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { SummaryCard } from '../components/ui';
import { getSalarySettings } from '../firebase/salarySettingsService';
import { calculateBasicPay, deriveHourlyRate, calculateOT } from '../utils/salaryCalculationService';
import { OT_TYPES, OT_TYPE_LABELS, OT_CALCULATION_METHODS, CURRENCY } from '../data/salaryConstants';

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Combines PRD sections 5 (Monthly Salary Calculator) and 6-8 (Overtime
 * Calculator + OT Rate Configuration) into one screen with two panels -
 * loads once from SalarySettingsScreen's saved figures, then lets the
 * user override the working-days/OT-hours inputs for a what-if
 * calculation without touching their saved settings. Nothing here writes
 * to Firestore; this is a scratch-pad, matching PRD section 5's "Show the
 * calculation clearly. Do not hide the calculation logic."
 */
export default function SalaryCalculatorScreen() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser } = useApp();

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);

  const [daysWorked, setDaysWorked] = useState('26');
  const [workingDays, setWorkingDays] = useState('26');

  const [otType, setOtType] = useState(OT_TYPES.NORMAL);
  const [otHours, setOtHours] = useState('');

  useEffect(() => {
    if (!authUser) return;
    getSalarySettings(authUser.uid)
      .then((s) => {
        setSettings(s);
        if (s) setWorkingDays(String(Math.round((s.workingDaysPerWeek || 6) * (52 / 12))));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authUser]);

  const hourlyRate = useMemo(() => {
    if (!settings) return 0;
    return deriveHourlyRate(settings.basicSalary, settings.normalHoursPerDay, settings.workingDaysPerWeek);
  }, [settings]);

  const basicPay = useMemo(() => {
    if (!settings) return 0;
    return calculateBasicPay(settings.basicSalary, workingDays, daysWorked);
  }, [settings, workingDays, daysWorked]);

  const otResult = useMemo(() => {
    if (!settings) return { otPay: 0, otRateApplied: 0 };
    return calculateOT(otHours, otType, settings.otCalculationMethod, {
      hourlyRate,
      customOtRate: settings.customOtRate,
    });
  }, [settings, otType, otHours, hourlyRate]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.screen}>
        <Header goBackOrHome={goBackOrHome} />
        <View style={[styles.body, styles.center]}>
          <Text style={styles.emptyText}>Set up your salary first to use the calculator.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header goBackOrHome={goBackOrHome} />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Monthly Salary Calculator</Text>
        <Text style={styles.label}>Basic Salary</Text>
        <View style={styles.readOnlyBox}><Text style={styles.readOnlyText}>{money(settings.basicSalary)}</Text></View>

        <Text style={styles.label}>Working Days (this period)</Text>
        <TextInput style={styles.input} value={workingDays} onChangeText={setWorkingDays} keyboardType="decimal-pad" />

        <Text style={styles.label}>Days Worked</Text>
        <TextInput style={styles.input} value={daysWorked} onChangeText={setDaysWorked} keyboardType="decimal-pad" />

        <SummaryCard
          title="Calculation"
          rows={[
            { label: `${money(settings.basicSalary)} ÷ ${workingDays || 0} days`, value: `${money(Number(settings.basicSalary) / (Number(workingDays) || 1))}/day` },
            { label: `× ${daysWorked || 0} days worked`, value: '' },
          ]}
          totalLabel="Estimated Basic Pay"
          totalValue={money(basicPay)}
        />

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Overtime Calculator</Text>
        <Text style={styles.label}>OT Type</Text>
        <View style={styles.chipWrap}>
          {Object.values(OT_TYPES).map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, otType === t && styles.chipActive]} onPress={() => setOtType(t)}>
              <Text style={[styles.chipText, otType === t && styles.chipTextActive]}>{OT_TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>OT Hours</Text>
        <TextInput style={styles.input} placeholder="0" value={otHours} onChangeText={setOtHours} keyboardType="decimal-pad" />

        <View style={styles.rateRow}>
          <Text style={styles.rateLabel}>OT Rate</Text>
          <Text style={styles.rateValue}>{money(otResult.otRateApplied)} / hour</Text>
        </View>
        <Text style={styles.methodNote}>
          {settings.otCalculationMethod === OT_CALCULATION_METHODS.CUSTOM
            ? 'Using your custom employer/contract rate.'
            : 'Using MySheba default estimate (not a verified statutory rate).'}
        </Text>

        <SummaryCard
          rows={[{ label: `${otHours || 0} hours × ${money(otResult.otRateApplied)}`, value: '' }]}
          totalLabel="Estimated OT Pay"
          totalValue={money(otResult.otPay)}
        />

        <Text style={styles.disclaimer}>
          These figures are estimates only. Your actual pay depends on your employment contract, payroll rules and approved OT.
        </Text>
      </ScrollView>
    </View>
  );
}

function Header({ goBackOrHome }) {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
      <HeaderDecor />
      <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
        <Text style={styles.backText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Salary & OT Calculator</Text>
    </LinearGradient>
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
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 10 },
    label: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 12, marginBottom: 6 },
    readOnlyBox: { backgroundColor: '#F1F3F4', borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
    readOnlyText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    rateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingVertical: 8 },
    rateLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    rateValue: { fontSize: 13, color: colors.navy, fontWeight: '700' },
    methodNote: { fontSize: 11, color: colors.textSecondary, marginBottom: 8 },
    disclaimer: { fontSize: 11, color: colors.textSecondary, marginTop: 16, lineHeight: 16, textAlign: 'center' },
  });
}
