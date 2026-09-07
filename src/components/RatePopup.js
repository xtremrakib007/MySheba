import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";

// Mirrors #ratePopup - full rate sheet, bottom-sheet style modal.
// Values come live from Firestore (rates/current) via context.rates so
// changes an admin makes on the Admin > Rates tab show up immediately.
const REMIT_ROWS = [
  { key: 'BD_ACC', label: '🇧🇩 BDT ACC' },
  { key: 'BD_CASH', label: '🇧🇩 BDT CASH' },
  { key: 'NP', label: '🇳🇵 NPR' },
  { key: 'PK', label: '🇵🇰 PKR' },
  { key: 'PH', label: '🇵🇭 PHP' },
  { key: 'LK', label: '🇱🇰 LKR' },
  { key: 'IN', label: '🇮🇳 INR' },
  { key: 'ID', label: '🇲🇨 IDR' },
  { key: 'MM', label: '🇲🇲 MMK' },
];

export default function RatePopup() {
  const { ratePopupVisible, setRatePopupVisible, rates } = useApp();

  return (
    <Modal
      visible={ratePopupVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setRatePopupVisible(false)}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setRatePopupVisible(false)}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>💱 All Rates</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setRatePopupVisible(false)}>
              <Text>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📱 Mobile Banking</Text>
              <View style={styles.row}>
                <Text>🇧🇩 BDT Rate</Text>
                <Text style={styles.blueVal}>{rates.mobileBanking}</Text>
              </View>
              <Text style={[styles.sectionTitle, { marginTop: 16 }]}>💸 Remittance Rates</Text>
              {REMIT_ROWS.map((r) => (
                <View key={r.key} style={styles.row}>
                  <Text>{r.label}</Text>
                  <Text style={styles.greenVal}>{rates[r.key]}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerTitle: { fontWeight: '700', fontSize: 17 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  section: { padding: 16, paddingBottom: 30 },
  sectionTitle: { fontWeight: '600', fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  blueVal: { fontWeight: '700', color: '#1565C0' },
  greenVal: { fontWeight: '700', color: '#2E7D32' },
});
