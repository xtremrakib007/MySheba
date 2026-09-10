import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
const REMIT_ROWS = [
  { key: 'BD_ACC', label: '🇧🇩 BDT ACC' }, { key: 'BD_CASH', label: '🇧🇩 BDT CASH' }, { key: 'NP', label: '🇳🇵 NPR' },
  { key: 'PK', label: '🇵🇰 PKR' }, { key: 'PH', label: '🇵🇭 PHP' }, { key: 'LK', label: '🇱🇰 LKR' },
  { key: 'IN', label: '🇮🇳 INR' }, { key: 'ID', label: '🇲🇨 IDR' }, { key: 'MM', label: '🇲🇲 MMK' },
];
export default function RatePopup() {
  const { ratePopupVisible, setRatePopupVisible, rates } = useApp();
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <Modal visible={ratePopupVisible} transparent animationType="slide" onRequestClose={() => setRatePopupVisible(false)}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setRatePopupVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}><Text style={styles.headerTitle}>💱 All Rates</Text><TouchableOpacity style={styles.closeBtn} onPress={() => setRatePopupVisible(false)}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View>
          <ScrollView style={{ maxHeight: 420 }}><View style={styles.section}>
            <Text style={styles.sectionTitle}>📱 Mobile Banking</Text>
            <View style={styles.row}><Text style={styles.text}>🇧🇩 BDT Rate</Text><Text style={styles.blueVal}>{rates.mobileBanking}</Text></View>
            <Text style={[styles.sectionTitle, { marginTop: 16 }]}>💸 Remittance Rates</Text>
            {REMIT_ROWS.map((r) => <View key={r.key} style={styles.row}><Text style={styles.text}>{r.label}</Text><Text style={styles.greenVal}>{rates[r.key]}</Text></View>)}
          </View></ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontWeight: '700', fontSize: 17, color: colors.text }, closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.text },
    section: { padding: 16, paddingBottom: 30 }, sectionTitle: { fontWeight: '600', fontSize: 14, color: colors.text }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }, text: { color: colors.text },
    blueVal: { fontWeight: '700', color: colors.secondary }, greenVal: { fontWeight: '700', color: colors.success },
  });
}
