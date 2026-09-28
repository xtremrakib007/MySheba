import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';

// The rate for the service you are actually in, at the top of its flow.
//
// This replaces InfoBar, which sat on the home screen and showed every rate to
// everybody - including the customer opening Notepad. The rates belong where
// they are acted on, so Mobile Banking shows its own rate and Remittance shows
// its payout rates, and neither appears on a home screen any more.
//
// It also fixes a smaller thing. The flows did show rates, but only on the
// step that needed them: Mobile Banking on step 2, Remittance on steps 1 and
// 3. Someone on step 0 choosing a bank had nothing to check the rate against
// without backing out. This is rendered outside the step component, so it
// stays put for the whole flow.
//
// Tapping opens the full rate list. InfoBar was the only thing that opened
// RatePopup, so without this the popup and the "All Rates" sheet behind it
// would have become unreachable.
const REMIT_META = [
  { key: 'BD_ACC', cc: 'BD', label: 'BDT ACC' },
  { key: 'BD_CASH', cc: 'BD', label: 'BDT CASH' },
  { key: 'NP', cc: 'NP', label: 'NPR' },
  { key: 'PK', cc: 'PK', label: 'PKR' },
  { key: 'PH', cc: 'PH', label: 'PHP' },
  { key: 'LK', cc: 'LK', label: 'LKR' },
  { key: 'IN', cc: 'IN', label: 'INR' },
  { key: 'ID', cc: 'ID', label: 'IDR' },
  { key: 'MM', cc: 'MM', label: 'MMK' },
];

function formatAmount(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** @param {{ service: string }} props - the service key, e.g. 'remittance'. */
export default function ServiceRateBar({ service }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { rates, setRatePopupVisible } = useApp();

  const remitRow = useMemo(
    () => REMIT_META.map((m) => ({ ...m, val: rates?.[m.key] })).filter((m) => m.val != null),
    [rates],
  );

  if (service === 'mobilebanking') {
    const rate = rates?.mobileBanking;
    // No rate loaded means no bar, rather than a bar reading "BDT 0.00".
    if (rate == null) return null;
    return (
      <TouchableOpacity style={styles.bar} onPress={() => setRatePopupVisible(true)} activeOpacity={0.7}>
        <Text style={styles.label}>Mobile Banking Rate</Text>
        <Text style={styles.value}>MYR 1 = BDT {formatAmount(rate)}</Text>
      </TouchableOpacity>
    );
  }

  if (service === 'remittance') {
    if (!remitRow.length) return null;
    return (
      <TouchableOpacity style={styles.bar} onPress={() => setRatePopupVisible(true)} activeOpacity={0.7}>
        <Text style={styles.label}>Remittance Rates (per 1 MYR)</Text>
        <View style={styles.chipRow}>
          {remitRow.map((r) => (
            <View key={r.key} style={styles.chip}>
              <CountryFlag code={r.cc} size={15} style={styles.chipFlag} />
              <Text style={styles.chipText}>
                {r.label} <Text style={styles.chipVal}>{formatAmount(r.val)}</Text>
              </Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
  }

  return null;
}

function createStyles(colors) {
  return StyleSheet.create({
    bar: {
      backgroundColor: colors.inputBg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    label: { fontSize: 11, color: colors.textSecondary, marginBottom: 6 },
    value: { fontSize: 15, fontWeight: '700', color: colors.primary },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingVertical: 4,
      paddingHorizontal: 7,
    },
    chipFlag: { marginRight: 5 },
    chipText: { fontSize: 11, color: colors.textSecondary },
    chipVal: { fontWeight: '700', color: colors.text },
  });
}
