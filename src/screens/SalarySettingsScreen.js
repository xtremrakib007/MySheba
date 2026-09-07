import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { getSalarySettings, saveSalarySettings } from '../firebase/salarySettingsService';
import { scheduleDailyOTReminder, cancelAllSalaryReminders } from '../firebase/salaryReminderService';
import { validateSalaryInputs } from '../utils/salaryCalculationService';
import { PAY_FREQUENCIES, PAY_FREQUENCY_LABELS, OT_CALCULATION_METHODS, OT_CALCULATION_METHOD_LABELS } from '../data/salaryConstants';

/**
 * Combined first-time setup (PRD section 4) and later-edit settings
 * screen (PRD section 9's SalarySettingsScreen) - same form either way,
 * just a different entry point (SalaryDashboardScreen routes here when no
 * settings exist yet, or via the dashboard's ⚙️ button once they do).
 */
export default function SalarySettingsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, setScreen } = useApp();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  const [basicSalary, setBasicSalary] = useState('');
  const [payFrequency, setPayFrequency] = useState(PAY_FREQUENCIES.MONTHLY);
  const [normalHoursPerDay, setNormalHoursPerDay] = useState('8');
  const [workingDaysPerWeek, setWorkingDaysPerWeek] = useState('6');
  const [restDay, setRestDay] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [otCalculationMethod, setOtCalculationMethod] = useState(OT_CALCULATION_METHODS.DEFAULT);
  const [customOtRate, setCustomOtRate] = useState('');
  const [remindersEnabled, setRemindersEnabled] = useState(true);

  useEffect(() => {
    if (!authUser) return;
    getSalarySettings(authUser.uid)
      .then((s) => {
        if (!s) {
          setIsFirstSetup(true);
        } else {
          setBasicSalary(String(s.basicSalary || ''));
          setPayFrequency(s.payFrequency);
          setNormalHoursPerDay(String(s.normalHoursPerDay || ''));
          setWorkingDaysPerWeek(String(s.workingDaysPerWeek || ''));
          setRestDay(s.restDay || '');
          setEmploymentType(s.employmentType || '');
          setOtCalculationMethod(s.otCalculationMethod);
          setCustomOtRate(s.customOtRate != null ? String(s.customOtRate) : '');
          setRemindersEnabled(s.remindersEnabled ?? true);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authUser]);

  const save = async () => {
    const errors = validateSalaryInputs({
      basicSalary,
      hoursWorked: normalHoursPerDay,
      ...(otCalculationMethod === OT_CALCULATION_METHODS.CUSTOM ? {} : {}),
    });
    // customOtRate needs its own > 0 check only when that method is
    // selected - validateSalaryInputs doesn't have a dedicated field for
    // it since it's conditional, so check it directly here.
    if (otCalculationMethod === OT_CALCULATION_METHODS.CUSTOM && !(Number(customOtRate) > 0)) {
      errors.push('Please enter your contract/employer OT rate.');
    }
    if (errors.length > 0) {
      showAlert('MySheba', errors[0]);
      return;
    }

    setSaving(true);
    try {
      await saveSalarySettings(authUser.uid, {
        basicSalary,
        payFrequency,
        normalHoursPerDay,
        workingDaysPerWeek,
        restDay: restDay.trim() || null,
        employmentType: employmentType.trim() || null,
        otCalculationMethod,
        customOtRate: otCalculationMethod === OT_CALCULATION_METHODS.CUSTOM ? customOtRate : null,
        remindersEnabled,
      });

      if (remindersEnabled) await scheduleDailyOTReminder();
      else await cancelAllSalaryReminders();

      if (isFirstSetup) {
        showAlert('MySheba', 'Your salary settings are saved!');
        setScreen('salaryDashboard');
      } else {
        showAlert('MySheba', 'Settings updated.');
        goBackOrHome();
      }
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save your settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
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
        <Text style={styles.headerTitle}>{isFirstSetup ? "Let's set up your salary" : 'Salary Settings'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Basic Salary (RM)</Text>
        <TextInput style={styles.input} placeholder="0.00" value={basicSalary} onChangeText={setBasicSalary} keyboardType="decimal-pad" />

        <Text style={styles.label}>Pay Frequency</Text>
        <View style={styles.chipWrap}>
          {Object.values(PAY_FREQUENCIES).map((f) => (
            <TouchableOpacity key={f} style={[styles.chip, payFrequency === f && styles.chipActive]} onPress={() => setPayFrequency(f)}>
              <Text style={[styles.chipText, payFrequency === f && styles.chipTextActive]}>{PAY_FREQUENCY_LABELS[f]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Normal Working Hours Per Day</Text>
        <TextInput style={styles.input} placeholder="8" value={normalHoursPerDay} onChangeText={setNormalHoursPerDay} keyboardType="decimal-pad" />

        <Text style={styles.label}>Normal Working Days Per Week</Text>
        <TextInput style={styles.input} placeholder="6" value={workingDaysPerWeek} onChangeText={setWorkingDaysPerWeek} keyboardType="decimal-pad" />

        <Text style={styles.label}>Rest Day (optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. Sunday" value={restDay} onChangeText={setRestDay} />

        <Text style={styles.label}>Employment Type (optional)</Text>
        <TextInput style={styles.input} placeholder="e.g. Full-time, Contract" value={employmentType} onChangeText={setEmploymentType} />

        <Text style={styles.label}>OT Calculation Method</Text>
        <Text style={styles.helperText}>
          MySheba's default is a general 1.5x/2x/3x estimate, not a verified statutory rate. If your contract or employer specifies an OT rate, use that instead for a more accurate estimate.
        </Text>
        <View style={styles.methodRow}>
          {Object.values(OT_CALCULATION_METHODS).map((m) => (
            <TouchableOpacity key={m} style={[styles.methodCard, otCalculationMethod === m && styles.methodCardActive]} onPress={() => setOtCalculationMethod(m)}>
              <Text style={[styles.methodText, otCalculationMethod === m && styles.methodTextActive]}>{OT_CALCULATION_METHOD_LABELS[m]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {otCalculationMethod === OT_CALCULATION_METHODS.CUSTOM && (
          <>
            <Text style={styles.label}>OT Rate (RM / hour)</Text>
            <TextInput style={styles.input} placeholder="0.00" value={customOtRate} onChangeText={setCustomOtRate} keyboardType="decimal-pad" />
          </>
        )}

        <View style={styles.reminderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.reminderTitle}>Reminders</Text>
            <Text style={styles.reminderSubtitle}>Daily work log nudges and monthly salary/payslip reminders.</Text>
          </View>
          <Switch value={remindersEnabled} onValueChange={setRemindersEnabled} trackColor={{ true: colors.primary }} />
        </View>

        <TouchableOpacity style={styles.submitBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>{isFirstSetup ? 'Save Salary Settings' : 'Save Changes'}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flexShrink: 1 },
    body: { padding: 16, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 14, marginBottom: 6 },
    helperText: { fontSize: 11, color: colors.textSecondary, marginBottom: 10, lineHeight: 16 },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    methodRow: { gap: 8 },
    methodCard: { padding: 12, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    methodCardActive: { borderColor: colors.primary, backgroundColor: '#EAF2FE' },
    methodText: { fontSize: 13, fontWeight: '600', color: colors.text },
    methodTextActive: { color: colors.primary },
    reminderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 20, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
    reminderTitle: { fontSize: 13, fontWeight: '700', color: colors.navy },
    reminderSubtitle: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    submitBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  });
}
