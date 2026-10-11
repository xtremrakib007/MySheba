import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// The full-page "Confirm ..." review, drawn the way ConfirmTransactionScreen
// draws it: details card, price breakdown, wallet before/after, and Edit /
// Confirm along the bottom. ConfirmTransactionScreen reads the service wizard's
// state from context; this takes everything as props, so a flow that is not a
// wizard service (PIN Generator) can show the same page instead of a dialog.
//
// `details` and `prices` are [label, value] pairs, drawn in order. A value of
// null or '' leaves its row out.
export const formatMoney = (value, currency = 'MYR') => {
  const n = Number(value);
  return Number.isFinite(n) ? `${currency} ${n.toFixed(2)}` : 'Not provided';
};

export default function ConfirmReview({ title, details = [], prices = [], totalLabel = 'Total wallet deduction', total, note, onEdit, onConfirm, busy }) {
  const { colors } = useTheme();
  const border = colors.border || '#E4E7EC';
  const rows = (list) => list
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([label, value]) => (
      <View key={label} style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text selectable style={[styles.value, { color: colors.text }]}>{String(value)}</Text>
      </View>
    ));
  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={onEdit} style={styles.back} disabled={busy}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Review all details before submitting</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction details</Text>
          {rows(details)}
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Price breakdown</Text>
          {rows(prices)}
          <View style={[styles.totalRow, { borderTopColor: border }]}>
            <Text style={[styles.totalLabel, { color: colors.text }]}>{totalLabel}</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>{total}</Text>
          </View>
        </View>
        {!!note && <Text style={styles.note}>{note}</Text>}
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: border }]}>
        <TouchableOpacity style={[styles.cancel, { borderColor: colors.primary }]} onPress={onEdit} disabled={busy}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>Edit details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.confirm, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]} onPress={onConfirm} disabled={busy}>
          <Text style={styles.confirmText}>{busy ? 'Submitting…' : 'Confirm and Submit'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Kept identical to ConfirmTransactionScreen's, so the two pages read as one.
const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  backText: { color: '#fff', fontSize: 32, lineHeight: 34 },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  subtitle: { color: '#fff', opacity: 0.86, fontSize: 12, marginTop: 2 },
  content: { padding: 14, paddingBottom: 24, gap: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E7EC' },
  label: { flex: 1, color: '#667085', fontSize: 12 },
  value: { flex: 1.2, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
  totalLabel: { flex: 1, fontWeight: '800', fontSize: 13 },
  totalValue: { fontSize: 17, fontWeight: '900' },
  note: { fontSize: 11, color: '#667085', lineHeight: 16, paddingHorizontal: 3 },
  footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1 },
  cancel: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 10 },
  cancelText: { fontWeight: '800', fontSize: 13 },
  confirm: { flex: 1.5, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
