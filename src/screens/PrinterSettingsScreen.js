import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import {
  canSelectPrinter,
  clearDefaultPrinter,
  getDefaultPrinter,
  printTestPage,
  selectDefaultPrinter,
} from '../utils/printService';

// Settings > Printer. Receipts, payslips and salary reports all print through
// the device's own print stack, so any printer the phone can already reach -
// Wi-Fi, Bluetooth or USB via Android's print services, AirPrint on iOS -
// works here with no extra setup. iOS additionally lets the app remember one
// printer and send straight to it; Android always shows its print dialog.
export default function PrinterSettingsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();

  const [printer, setPrinter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setPrinter(await getDefaultPrinter());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onChoose = async () => {
    setBusy('choose');
    try {
      const chosen = await selectDefaultPrinter();
      if (chosen?.url) {
        setPrinter({ name: chosen.name || 'Printer', url: chosen.url });
        showAlert('Printer saved', `${chosen.name || 'This printer'} will be used for printing from MySheba.`);
      }
    } catch (e) {
      // A cancelled picker is not an error worth shouting about.
      if (e?.message && !/cancel/i.test(e.message)) showAlert('MySheba', e.message);
    } finally {
      setBusy('');
    }
  };

  const onClear = async () => {
    setBusy('clear');
    await clearDefaultPrinter();
    setPrinter(null);
    setBusy('');
  };

  const onTest = async () => {
    setBusy('test');
    try {
      await printTestPage();
    } catch (e) {
      showAlert('MySheba', e?.message || 'Could not start printing. Check that a printer is set up on this device.');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🖨️ Printer</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}>
        <Text style={styles.hint}>
          Receipts, recharge PIN slips, payslips and salary reports print through this
          device. Any printer your phone can already reach works - Wi-Fi, Bluetooth or
          USB on Android, AirPrint on iPhone.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Default printer</Text>
              <Text style={styles.cardValue}>
                {printer ? printer.name : canSelectPrinter ? 'Not set' : 'Chosen in the print dialog'}
              </Text>
              <Text style={styles.cardSub}>
                {canSelectPrinter
                  ? printer
                    ? 'Printing goes straight to this printer.'
                    : 'Pick a printer once and MySheba will use it every time.'
                  : 'Android asks which printer to use each time you print, and remembers your last choice there.'}
              </Text>
            </View>

            {canSelectPrinter && (
              <TouchableOpacity style={styles.primaryBtn} disabled={busy === 'choose'} onPress={onChoose}>
                {busy === 'choose'
                  ? <ActivityIndicator size="small" color="white" />
                  : <Text style={styles.primaryBtnText}>{printer ? 'Change printer' : 'Choose printer'}</Text>}
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.secondaryBtn} disabled={busy === 'test'} onPress={onTest}>
              {busy === 'test'
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Text style={styles.secondaryBtnText}>Print a test page</Text>}
            </TouchableOpacity>

            {!!printer && (
              <TouchableOpacity style={styles.clearBtn} disabled={busy === 'clear'} onPress={onClear}>
                <Text style={styles.clearBtnText}>Forget this printer</Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 17 },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1,
      borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md,
    },
    cardLabel: { fontSize: 10, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' },
    cardValue: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 6 },
    cardSub: { fontSize: 11, color: colors.textSecondary, marginTop: 6, lineHeight: 16 },
    primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginBottom: spacing.sm },
    primaryBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    secondaryBtn: {
      borderRadius: radius.md, paddingVertical: 13, alignItems: 'center',
      borderWidth: 1, borderColor: colors.primary, marginBottom: spacing.sm,
    },
    secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    clearBtn: { paddingVertical: 12, alignItems: 'center' },
    clearBtnText: { color: colors.error, fontWeight: '700', fontSize: 12 },
  });
}
