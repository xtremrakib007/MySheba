import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { SummaryCard } from '../components/ui';
import DocumentUpload from '../components/DocumentUpload';
import { getSalarySettings } from '../firebase/salarySettingsService';
import { listWorkLogEntriesInRange, dateKey } from '../firebase/workLogService';
import { subscribeAllowances, addAllowance, deleteAllowance } from '../firebase/allowanceService';
import { subscribeDeductions, addDeduction, deleteDeduction } from '../firebase/deductionService';
import { recordId as buildRecordId, subscribeSalaryRecord, saveSalaryEstimate, recordActualSalary, attachPayslip } from '../firebase/salaryRecordService';
import { uploadPayslip, validatePayslipFile } from '../firebase/salaryStorageService';
import { scheduleSalaryRecordReminder, schedulePayslipReminder } from '../firebase/salaryReminderService';
import {
  calculateBasicPay,
  calculateOTForPeriod,
  deriveHourlyRate,
  calculateTakeHomePay,
  calculateDifference,
  formatDifferenceMessage,
  sumLineItems,
  validateSalaryInputs,
} from '../utils/salaryCalculationService';
import { CURRENCY, RECURRENCE_TYPES } from '../data/salaryConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Combines PRD sections 10 (Deductions), 11 (Take-Home breakdown), 14
 * (Monthly Summary), 15 (Actual Salary Received) and 16 (Payslip
 * Recording) into one end-of-month flow (PRD section 34's "Daily -> End
 * of month" UX flow lists these as one sequence: Monthly Summary -> Add
 * Allowances -> Add Deductions -> Enter Actual Salary -> Upload Payslip
 * -> Save). Allowances live on their own screen's data (AllowanceScreen
 * isn't a separate route here - see App.js note - Add Allowance opens
 * inline via the modal below) but this is where they're actually applied
 * to a month's numbers.
 *
 * Always shows the current month; there's no month picker here on
 * purpose - reviewing a *past* month's saved summary is what
 * SalaryHistoryScreen's "tap a month" is for (PRD section 18), which
 * reuses this same component in read mostly-only fashion via
 * SalaryDashboardScreen -> setScreen('salaryMonthlySummary') always
 * targeting the current year/month. A future "edit a past month" need
 * would extend this screen to accept a year/month param rather than
 * duplicating it.
 */
export default function MonthlySummaryScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser } = useApp();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisRecordId = buildRecordId(year, month);
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  const [workLogEntries, setWorkLogEntries] = useState([]);
  const [allowances, setAllowances] = useState([]);
  const [deductions, setDeductions] = useState([]);
  const [record, setRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const [actualSalary, setActualSalary] = useState('');
  const [addingType, setAddingType] = useState(null); // 'allowance' | 'deduction' | null
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    getSalarySettings(authUser.uid).then(setSettings).catch(() => {});
    const start = dateKey(new Date(year, month - 1, 1));
    const end = dateKey(new Date(year, month, 0));
    listWorkLogEntriesInRange(authUser.uid, start, end)
      .then((entries) => {
        setWorkLogEntries(entries);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authUser, year, month]);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsubA = subscribeAllowances(authUser.uid, setAllowances, () => {});
    const unsubD = subscribeDeductions(authUser.uid, setDeductions, () => {});
    const unsubR = subscribeSalaryRecord(authUser.uid, thisRecordId, (r) => {
      setRecord(r);
      if (r?.actualSalaryReceived != null) setActualSalary(String(r.actualSalaryReceived));
    }, () => {});
    return () => { unsubA(); unsubD(); unsubR(); };
  }, [authUser, thisRecordId]);

  const daysWorked = useMemo(() => workLogEntries.filter((e) => e.status === 'worked').length, [workLogEntries]);

  const breakdown = useMemo(() => {
    if (!settings) return null;
    const hourlyRate = deriveHourlyRate(settings.basicSalary, settings.normalHoursPerDay, settings.workingDaysPerWeek);
    const workingDaysInMonth = Math.round((settings.workingDaysPerWeek || 6) * (52 / 12));
    const basicPay = calculateBasicPay(settings.basicSalary, workingDaysInMonth, daysWorked);
    const { otPay, otHours } = calculateOTForPeriod(workLogEntries, settings.otCalculationMethod, {
      hourlyRate,
      customOtRate: settings.customOtRate,
    });
    const allowancesTotal = sumLineItems(allowances);
    const deductionsTotal = sumLineItems(deductions);
    const result = calculateTakeHomePay({ basicPay, otPay, allowances: allowancesTotal, deductions: deductionsTotal });
    return { ...result, otHours };
  }, [settings, workLogEntries, allowances, deductions, daysWorked]);

  const difference = record?.actualSalaryReceived != null ? calculateDifference(breakdown?.takeHomePay, record.actualSalaryReceived) : null;

  const saveEstimate = async () => {
    if (!settings || !breakdown) return;
    setSaving(true);
    try {
      await saveSalaryEstimate(authUser.uid, thisRecordId, {
        year,
        month,
        breakdown,
        otCalculationMethod: settings.otCalculationMethod,
        otCalculationVersion: 'v1',
        daysWorked,
        otHours: breakdown.otHours,
      });
      showAlert('MySheba', 'This month\'s estimate is saved.');

      // Schedule next month's "have you received your salary" +
      // "upload your payslip" nudges a few days into the following month
      // (PRD section 21) - only if the user hasn't already turned
      // reminders off in settings.
      if (settings.remindersEnabled) {
        const nextMonthStart = new Date(year, month, 3); // 3rd of next month
        await scheduleSalaryRecordReminder(monthLabel, nextMonthStart.getTime());
        await schedulePayslipReminder(monthLabel, nextMonthStart.getTime());
      }
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save this month\'s estimate.');
    } finally {
      setSaving(false);
    }
  };

  const saveActual = async () => {
    const errors = validateSalaryInputs({ actualSalary });
    if (errors.length > 0) return showAlert('MySheba', errors[0]);
    setSaving(true);
    try {
      const diff = calculateDifference(breakdown.takeHomePay, actualSalary);
      await recordActualSalary(authUser.uid, thisRecordId, actualSalary, diff);
      showAlert('MySheba', 'Actual salary recorded.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save actual salary.');
    } finally {
      setSaving(false);
    }
  };

  const handlePayslipPicked = async (files) => {
    const file = files[0];
    const check = validatePayslipFile(file);
    if (!check.valid) return showAlert('MySheba', check.reason);
    setUploading(true);
    try {
      const fileRef = await uploadPayslip(authUser.uid, thisRecordId, file);
      await attachPayslip(authUser.uid, thisRecordId, fileRef);
      showAlert('MySheba', 'Payslip attached.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not upload payslip.');
    } finally {
      setUploading(false);
    }
  };

  if (loading || !settings) {
    return (
      <View style={[styles.screen, styles.center]}>
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : <Text style={styles.emptyText}>Set up your salary first.</Text>}
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
        <Text style={styles.headerTitle}>Monthly Summary</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.monthLabel}>{monthLabel}</Text>

        <SummaryCard
          rows={[
            { label: 'Basic Salary', value: money(breakdown.basicPay) },
            { label: 'Days Worked', value: `${daysWorked}` },
            { label: 'OT Hours', value: `${breakdown.otHours}` },
            { label: 'Estimated OT', value: money(breakdown.otPay) },
            { label: 'Allowances', value: money(breakdown.allowances) },
            { label: 'Deductions', value: `- ${money(breakdown.deductions)}` },
          ]}
          totalLabel="Estimated Take-Home"
          totalValue={money(breakdown.takeHomePay)}
        />

        <TouchableOpacity style={styles.saveEstimateBtn} onPress={saveEstimate} disabled={saving}>
          {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveEstimateBtnText}>Save This Month's Estimate</Text>}
        </TouchableOpacity>

        <SectionHeader title="Allowances" onAdd={() => setAddingType('allowance')} />
        {allowances.length === 0 ? (
          <Text style={styles.emptySmall}>No allowances added yet.</Text>
        ) : (
          allowances.map((a) => (
            <LineItemRow key={a.id} name={a.name} amount={a.amount} recurring={a.recurrence === RECURRENCE_TYPES.RECURRING} onDelete={() => deleteAllowance(authUser.uid, a.id)} />
          ))
        )}

        <SectionHeader title="Deductions" onAdd={() => setAddingType('deduction')} />
        {deductions.length === 0 ? (
          <Text style={styles.emptySmall}>No deductions added yet.</Text>
        ) : (
          deductions.map((d) => (
            <LineItemRow key={d.id} name={d.name} amount={d.amount} recurring={d.recurrence === RECURRENCE_TYPES.RECURRING} onDelete={() => deleteDeduction(authUser.uid, d.id)} />
          ))
        )}

        <Text style={styles.sectionTitle}>Actual Salary Received</Text>
        <TextInput style={styles.input} placeholder="0.00" value={actualSalary} onChangeText={setActualSalary} keyboardType="decimal-pad" />
        <TouchableOpacity style={styles.secondaryBtn} onPress={saveActual} disabled={saving}>
          <Text style={styles.secondaryBtnText}>Save Actual Salary</Text>
        </TouchableOpacity>

        {difference !== null && (
          <View style={[styles.diffBanner, difference < 0 && styles.diffBannerWarn]}>
            <Text style={styles.diffBannerText}>{formatDifferenceMessage(difference)}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Payslip</Text>
        {record?.payslipFileReference ? (
          <View style={styles.payslipAttached}>
            <Text style={styles.payslipAttachedText}>✓ Payslip attached</Text>
          </View>
        ) : uploading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : (
          <DocumentUpload onFilesPicked={handlePayslipPicked} />
        )}
      </ScrollView>

      <AddLineItemModal
        type={addingType}
        onClose={() => setAddingType(null)}
        onSave={async (name, amount, recurrence) => {
          if (addingType === 'allowance') await addAllowance(authUser.uid, { name, amount, recurrence });
          else await addDeduction(authUser.uid, { name, amount, recurrence });
          setAddingType(null);
        }}
      />
    </View>
  );
}

function SectionHeader({ title, onAdd }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.sectionHeaderRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <TouchableOpacity onPress={onAdd}><Text style={styles.addLink}>+ Add {title.slice(0, -1)}</Text></TouchableOpacity>
    </View>
  );
}

function LineItemRow({ name, amount, recurring, onDelete }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.lineItemRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.lineItemName}>{name}</Text>
        <Text style={styles.lineItemTag}>{recurring ? 'Recurring' : 'One-time'}</Text>
      </View>
      <Text style={styles.lineItemAmount}>{money(amount)}</Text>
      <TouchableOpacity onPress={onDelete} style={styles.lineItemDelete}>
        <Text style={styles.lineItemDeleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function AddLineItemModal({ type, onClose, onSave }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [recurrence, setRecurrence] = useState(RECURRENCE_TYPES.RECURRING);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName('');
    setAmount('');
    setRecurrence(RECURRENCE_TYPES.RECURRING);
  }, [type]);

  if (!type) return null;

  const submit = async () => {
    const errors = validateSalaryInputs(type === 'allowance' ? { allowanceAmount: amount } : { deductionAmount: amount });
    if (!name.trim()) return showAlert('MySheba', 'Please enter a name.');
    if (!(Number(amount) > 0)) return showAlert('MySheba', `Please enter an amount greater than 0.`);
    if (errors.length > 0) return showAlert('MySheba', errors[0]);
    setSaving(true);
    try {
      await onSave(name, amount, recurrence);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Add {type === 'allowance' ? 'Allowance' : 'Deduction'}</Text>

          <Text style={styles.modalLabel}>Name</Text>
          <TextInput style={styles.input} placeholder={type === 'allowance' ? 'e.g. Housing Allowance' : 'e.g. EPF'} value={name} onChangeText={setName} />

          <Text style={styles.modalLabel}>Amount (RM)</Text>
          <TextInput style={styles.input} placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

          <Text style={styles.modalLabel}>Type</Text>
          <View style={styles.chipWrap}>
            {[[RECURRENCE_TYPES.RECURRING, 'Recurring'], [RECURRENCE_TYPES.ONE_TIME, 'One-time']].map(([val, label]) => (
              <TouchableOpacity key={val} style={[styles.chip, recurrence === val && styles.chipActive]} onPress={() => setRecurrence(val)}>
                <Text style={[styles.chipText, recurrence === val && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={submit} disabled={saving}>
              {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>
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
    body: { padding: 16, paddingBottom: 40 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    emptySmall: { fontSize: 12, color: colors.textSecondary, marginBottom: 10 },
    monthLabel: { fontSize: 13, fontWeight: '700', color: colors.textSecondary, marginBottom: 10 },
    saveEstimateBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 10, marginBottom: 8 },
    saveEstimateBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 8 },
    sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.navy, marginTop: 24, marginBottom: 8 },
    addLink: { fontSize: 12, fontWeight: '700', color: colors.primary },
    lineItemRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#E8E8E8' },
    lineItemName: { fontSize: 13, fontWeight: '600', color: colors.text },
    lineItemTag: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    lineItemAmount: { fontSize: 13, fontWeight: '700', color: colors.navy, marginRight: 12 },
    lineItemDelete: { padding: 4 },
    lineItemDeleteText: { color: colors.error, fontSize: 14 },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    secondaryBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
    secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    diffBanner: { backgroundColor: '#E8F5E9', borderRadius: radius.md, padding: 12, marginTop: 10 },
    diffBannerWarn: { backgroundColor: '#FFF3E0' },
    diffBannerText: { fontSize: 12, color: colors.navy, lineHeight: 17 },
    payslipAttached: { backgroundColor: '#E8F5E9', borderRadius: radius.md, padding: 14, alignItems: 'center' },
    payslipAttachedText: { color: colors.success, fontWeight: '700', fontSize: 13 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: 20 },
    modalTitle: { fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 14 },
    modalLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 12, marginBottom: 6 },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  });
}
