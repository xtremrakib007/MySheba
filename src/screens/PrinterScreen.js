import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import * as Print from 'expo-print';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';

export default function PrinterScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();
  const [busy, setBusy] = useState(false);

  const openPrinter = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const html = `<html><body style="font-family:Arial;padding:20px;text-align:center">
        <h2>MySheba</h2><h3>Printer Test</h3><hr/>
        <p>Printer connection test successful.</p>
        <p>58mm / 80mm receipt printers can be selected through the Android print service when supported.</p>
        <p style="margin-top:24px">Thank you</p>
      </body></html>`;
      await Print.printAsync({ html });
    } catch (err) {
      showAlert('Printer', err?.message || 'No system printer is available. Install/enable a printer service and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Printer</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🖨️</Text>
          <Text style={styles.title}>Connect & Print</Text>
          <Text style={styles.subtitle}>Use the Android print service to select a Bluetooth, Wi-Fi or other supported printer.</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Printer connection</Text>
          <Text style={styles.cardText}>{Platform.OS === 'android'
            ? 'Tap below to open the system printer picker. If your printer is Bluetooth thermal, pair it in Android Bluetooth settings first and make sure a compatible print service is installed.'
            : 'Use the system print service available on this device.'}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={openPrinter} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? 'Opening printer…' : 'Select / Connect Printer'}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt printing</Text>
          <Text style={styles.cardText}>Transaction details now include a Print button. Collection PINs are included on the printed receipt when available.</Text>
        </View>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Important</Text>
          <Text style={styles.noteText}>Direct ESC/POS Bluetooth thermal-printer control requires a native printer module and a new Android build. This screen uses the existing Expo Print capability safely without adding an unverified native printer dependency.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 }, backText: { color: '#fff', fontSize: 20 },
    headerTitle: { color: '#fff', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    content: { padding: 16, paddingBottom: 32 },
    hero: { alignItems: 'center', paddingVertical: 22 },
    heroIcon: { fontSize: 46, marginBottom: 8 },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    subtitle: { marginTop: 6, textAlign: 'center', color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 12 },
    cardTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    cardText: { fontSize: 12, lineHeight: 18, color: colors.textSecondary, marginTop: 7 },
    primaryBtn: { marginTop: 14, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    note: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
    noteTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
    noteText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
  });
}
