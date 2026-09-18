import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

const CATEGORIES = [
  { key: 'electricity', label: 'Electricity', icon: '⚡' },
  { key: 'water', label: 'Water', icon: '💧' },
  { key: 'internet', label: 'Internet & Broadband', icon: '📡' },
  { key: 'tv', label: 'TV / Astro', icon: '📺' },
  { key: 'mobile', label: 'Postpaid Mobile', icon: '📱' },
  { key: 'utilities', label: 'Other Utilities', icon: '🏢' },
];

export default function BillPaymentScreen() {
  const { goBackOrHome } = useApp();
  const { colors } = useTheme();
  const [category, setCategory] = useState(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [amount, setAmount] = useState('');

  const selected = useMemo(() => CATEGORIES.find((item) => item.key === category), [category]);

  const submit = () => {
    if (!selected || !accountNumber.trim() || !amount.trim()) {
      Alert.alert('Bill Payment', 'Select a bill category and enter the account number and amount.');
      return;
    }
    Alert.alert('Coming Soon', 'This biller is not connected yet. Your payment will not be charged.');
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg || '#F7F8FA' }]}>
      <View style={[styles.header, { backgroundColor: colors.card || '#FFF', borderBottomColor: colors.border || '#E5E7EB' }]}>
        <TouchableOpacity onPress={goBackOrHome} accessibilityRole="button" accessibilityLabel="Back"><Text style={[styles.back, { color: colors.primary || '#1A73E8' }]}>‹</Text></TouchableOpacity>
        <Text style={[styles.title, { color: colors.text || '#111827' }]}>Bill Payment</Text>
        <View style={{ width: 30 }} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: colors.text || '#111827' }]}>Choose bill category</Text>
        <View style={styles.grid}>
          {CATEGORIES.map((item) => {
            const active = item.key === category;
            return <TouchableOpacity key={item.key} onPress={() => setCategory(item.key)} style={[styles.category, { backgroundColor: colors.card || '#FFF', borderColor: active ? (colors.primary || '#1A73E8') : (colors.border || '#E5E7EB') }]} accessibilityRole="button" accessibilityLabel={item.label}>
              <Text style={styles.icon}>{item.icon}</Text><Text style={[styles.label, { color: colors.text || '#111827' }]}>{item.label}</Text>
            </TouchableOpacity>;
          })}
        </View>
        {selected && <View style={[styles.form, { backgroundColor: colors.card || '#FFF', borderColor: colors.border || '#E5E7EB' }]}>
          <Text style={[styles.selected, { color: colors.primary || '#1A73E8' }]}>{selected.icon} {selected.label}</Text>
          <Text style={[styles.caption, { color: colors.muted || '#6B7280' }]}>Provider integration will be enabled after a supported biller is configured.</Text>
          <TextInput value={accountNumber} onChangeText={setAccountNumber} placeholder="Bill / account number" placeholderTextColor={colors.muted || '#9CA3AF'} style={[styles.input, { color: colors.text || '#111827', borderColor: colors.border || '#D1D5DB' }]} autoCapitalize="characters" />
          <TextInput value={amount} onChangeText={setAmount} placeholder="Amount (MYR)" placeholderTextColor={colors.muted || '#9CA3AF'} keyboardType="decimal-pad" style={[styles.input, { color: colors.text || '#111827', borderColor: colors.border || '#D1D5DB' }]} />
          <TouchableOpacity onPress={submit} style={[styles.button, { backgroundColor: colors.primary || '#1A73E8' }]}><Text style={styles.buttonText}>Continue</Text></TouchableOpacity>
        </View>}
        <View style={[styles.notice, { backgroundColor: `${colors.primary || '#1A73E8'}12` }]}><Text style={[styles.noticeText, { color: colors.text || '#111827' }]}>Secure bill payments will only be enabled when the provider, fees, validation and server-side settlement flow are configured.</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1 }, back: { fontSize: 36, lineHeight: 36 }, title: { fontSize: 18, fontWeight: '800' }, content: { padding: 16, paddingBottom: 40 }, heading: { fontSize: 18, fontWeight: '800', marginBottom: 12 }, grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }, category: { width: '48%', minHeight: 92, borderWidth: 1, borderRadius: 14, marginBottom: 10, alignItems: 'center', justifyContent: 'center', padding: 10 }, icon: { fontSize: 27, marginBottom: 5 }, label: { fontSize: 12, fontWeight: '700', textAlign: 'center' }, form: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 8 }, selected: { fontSize: 16, fontWeight: '800', marginBottom: 6 }, caption: { fontSize: 12, lineHeight: 17, marginBottom: 12 }, input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10, fontSize: 14 }, button: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' }, buttonText: { color: '#FFF', fontWeight: '800' }, notice: { padding: 12, borderRadius: 12, marginTop: 16 }, noticeText: { fontSize: 12, lineHeight: 17 },
});