import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import { DateField, SummaryCard, PrimaryButton } from '../components/ui';
import { subscribeSalarySettings } from '../firebase/salarySettingsService';
import { listWorkLogEntriesInRange, dateKey } from '../firebase/workLogService';
import { calculateBasicPay, calculateOTForPeriod, deriveHourlyRate } from '../utils/salaryCalculationService';
import { CURRENCY, WORK_DAY_STATUS } from '../data/salaryConstants';
import { generateReportPdf, shareReportPdf, printReportPdf } from '../utils/salaryReportPdfService';

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

function statusLabel(status) {
  if (status === WORK_DAY_STATUS.WORKED) return 'Worked';
  if (status === WORK_DAY_STATUS.REST_DAY) return 'Rest Day';
  if (status === WORK_DAY_STATUS.LEAVE) return 'Leave';
  return '-';
}

function displayDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function firstOfMonthKey() {
  const d = new Date();
  return dateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

/**
 * Salary & OT Reports - pick a date range, see the work-log totals over
 * that range (days worked, normal/OT hours, estimated basic/OT/gross
 * pay), and export/share the same breakdown as a PDF via
 * salaryReportPdfService. Separate from Monthly Summary (which is
 * always the calendar month + saves an official SalaryRecord) - this is
 * a read-only, any-date-range report for handing to someone else or
 * keeping for your own records.
 */
export default function SalaryReportsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser } = useApp();

  const [settings, setSettings] = useState(null);
  const [startKey, setStartKey] = useState(firstOfMonthKey());
  const [endKey, setEndKey] = useState(dateKey(new Date()));
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false); // generating/sharing/printing

  useEffect(() => {
    if (!authUser) return undefined;
    return subscribeSalarySettings(authUser.uid, setSettings, () => {});
  }, [authUser]);

  useEffect(() => {
    if (!authUser || !startKey || !endKey) return;
    if (startKey > endKey) return;
    setLoading(true);
    listWorkLogEntriesInRange(authUser.uid, startKey, endKey)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [authUser, startKey, endKey]);

  const totals = useMemo(() => {
    const daysWorked = entries.filter((e) => e.status === WORK_DAY_STATUS.WORKED).length;
    const normalHours = round2(entries.reduce((s, e) => s + (Number(e.hoursWorked) || 0), 0));
    const otHoursSum = round2(entries.reduce((s, e) => s + (Number(e.otHours) || 0), 0));

    if (!settings) {
      return { daysWorked, normalHours, otHours: otHoursSum, basicPay: 0, otPay: 0, grossPay: 0 };
    }

    const hourlyRate = deriveHourlyRate(settings.basicSalary, settings.normalHoursPerDay, settings.workingDaysPerWeek);
    // Working days across the picked range, approximated the same way
    // the dashboard approximates a month (PRD-consistent "estimate, not
    // a payroll calendar" - see calculateBasicPay's doc comment).
    const totalCalendarDays = Math.round((new Date(`${endKey}T00:00:00`) - new Date(`${startKey}T00:00:00`)) / 86400000) + 1;
    const workingDaysInRange = Math.max(1, Math.round(totalCalendarDays * ((settings.workingDaysPerWeek || 6) / 7)));
    const basicPay = calculateBasicPay(settings.basicSalary, workingDaysInRange, daysWorked);
    const { otPay, otHours } = calculateOTForPeriod(entries, settings.otCalculationMethod, {
      hourlyRate,
      customOtRate: settings.customOtRate,
    });
    const grossPay = round2(basicPay + otPay);
    return { daysWorked, normalHours, otHours, basicPay, otPay, grossPay };
  }, [entries, settings, startKey, endKey]);

  const startLabel = displayDate(startKey);
  const endLabel = displayDate(endKey);

  const buildReport = () => ({
    startLabel,
    endLabel,
    entries: entries.map((e) => ({
      displayDate: displayDate(e.date),
      status: e.status,
      startTime: e.startTime,
      endTime: e.endTime,
      hoursWorked: e.hoursWorked,
      otHours: e.otHours,
    })),
    totals,
  });

  const handleExport = async () => {
    if (startKey > endKey) {
      showAlert('MySheba', 'The start date must be before the end date.');
      return;
    }
    setWorking(true);
    try {
      const file = await generateReportPdf(buildReport());
      await shareReportPdf(file.uri);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not export this report.');
    } finally {
      setWorking(false);
    }
  };

  const handlePrint = async () => {
    setWorking(true);
    try {
      const file = await generateReportPdf(buildReport());
      await printReportPdf(file.uri);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not print this report.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Salary & OT Report</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.sectionTitle}>Date Range</Text>
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>From</Text>
            <DateField placeholder="Start date" value={startKey} onChange={setStartKey} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dateLabel}>To</Text>
            <DateField placeholder="End date" value={endKey} onChange={setEndKey} />
          </View>
        </View>

        <View style={styles.presetRow}>
          <PresetChip label="This Month" onPress={() => { setStartKey(firstOfMonthKey()); setEndKey(dateKey(new Date())); }} />
          <PresetChip
            label="Last 7 Days"
            onPress={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 6);
              setStartKey(dateKey(start));
              setEndKey(dateKey(end));
            }}
          />
          <PresetChip
            label="Last 30 Days"
            onPress={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 29);
              setStartKey(dateKey(start));
              setEndKey(dateKey(end));
            }}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <>
            <SummaryCard
              title="Summary"
              rows={[
                { label: 'Days Worked', value: String(totals.daysWorked) },
                { label: 'Total Normal Hours', value: `${totals.normalHours}h` },
                { label: 'Total OT Hours', value: `${totals.otHours}h` },
                { label: 'Estimated Basic Pay', value: money(totals.basicPay) },
                { label: 'Estimated OT Pay', value: money(totals.otPay) },
              ]}
              totalLabel="Estimated Gross Pay"
              totalValue={money(totals.grossPay)}
            />
            {!settings && <Text style={styles.disclaimer}>Set up Salary & OT settings to see estimated pay figures here.</Text>}

            <Text style={styles.sectionTitle}>Daily Entries ({entries.length})</Text>
            {entries.length === 0 ? (
              <Text style={styles.emptyText}>No work log entries in this range.</Text>
            ) : (
              entries.map((e) => (
                <View key={e.id} style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryDate}>{displayDate(e.date)}</Text>
                    <Text style={styles.entryDetail}>
                      {statusLabel(e.status)}
                      {e.startTime && e.endTime ? ` · ${e.startTime} - ${e.endTime}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.entryHours}>{e.hoursWorked || 0}h{e.otHours ? ` +${e.otHours}h OT` : ''}</Text>
                </View>
              ))
            )}

            <View style={styles.actionsRow}>
              <PrimaryButton label={working ? 'Working…' : '📄 Export & Share PDF'} onPress={handleExport} disabled={working} style={{ flex: 1 }} />
            </View>
            <TouchableOpacity style={styles.printLink} onPress={handlePrint} disabled={working}>
              <Text style={styles.printLinkText}>🖨️ Print</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PresetChip({ label, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.chip} onPress={onPress}>
      <Text style={styles.chipText}>{label}</Text>
    </TouchableOpacity>
  );
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    body: { padding: 16, paddingBottom: 40 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 10 },
    dateRow: { flexDirection: 'row', gap: 10 },
    dateLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
    presetRow: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
    disclaimer: { fontSize: 11, color: colors.textSecondary, marginTop: 8, lineHeight: 16 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 20 },
    entryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8E8E8' },
    entryDate: { fontSize: 13, fontWeight: '700', color: colors.navy },
    entryDetail: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    entryHours: { fontSize: 12, fontWeight: '700', color: colors.primary },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
    printLink: { alignItems: 'center', marginTop: 14 },
    printLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  });
}
