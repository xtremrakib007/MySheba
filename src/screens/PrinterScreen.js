import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import * as Print from 'expo-print';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import { printTestPage } from '../utils/printService';
import { thermalPrintingAvailable, listPairedPrinters, getThermalPrinter, saveThermalPrinter, forgetThermalPrinter } from '../utils/bluetoothPrinter';

export default function PrinterScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();
  const [busy, setBusy] = useState(false);
  // Bluetooth thermal printer (utils/bluetoothPrinter.js): the chosen one, and
  // the paired list while choosing.
  const [thermal, setThermal] = useState(null);
  const [paired, setPaired] = useState(null);
  const [thermalBusy, setThermalBusy] = useState('');
  const canThermal = thermalPrintingAvailable();
  useEffect(() => { getThermalPrinter().then(setThermal); }, []);

  const choosePrinter = async () => {
    setThermalBusy('list');
    try {
      const list = await listPairedPrinters();
      setPaired(list);
      if (!list.length) showAlert('Printer', 'No paired Bluetooth devices. Turn the printer on, pair it in Android Settings > Bluetooth (PIN is usually 0000 or 1234), then try again.');
    } catch (err) { showAlert('Printer', err?.message || 'Could not read paired Bluetooth devices.'); }
    finally { setThermalBusy(''); }
  };
  const pick = async (device, paper = thermal?.paper || 58) => {
    const next = { ...device, paper };
    await saveThermalPrinter(next);
    setThermal(next); setPaired(null);
  };
  const testThermal = async () => {
    setThermalBusy('test');
    try { await printTestPage(); }
    catch (err) { showAlert('Printer', err?.message || 'Could not print.'); }
    finally { setThermalBusy(''); }
  };
  const forget = async () => { await forgetThermalPrinter(); setThermal(null); };

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
          <Text style={styles.cardTitle}>Bluetooth thermal printer (58 / 80 mm)</Text>
          {!canThermal ? (
            <Text style={styles.cardText}>Update MySheba from the Play Store to print straight to a Bluetooth receipt printer such as the PrinterMax M58.</Text>
          ) : (
            <>
              <Text style={styles.cardText}>
                {thermal
                  ? `Every Print button prints on ${thermal.name} (${thermal.paper} mm), without the Android print dialog.`
                  : 'Pair the printer in Android Settings > Bluetooth first (PIN is usually 0000 or 1234), then choose it here. Receipts then print on it with one tap.'}
              </Text>
              {!!thermal && (
                <View style={styles.chipRow}>
                  {[58, 80].map((mm) => (
                    <TouchableOpacity key={mm} onPress={() => pick(thermal, mm)} style={[styles.chip, thermal.paper === mm && styles.chipActive]}>
                      <Text style={[styles.chipText, thermal.paper === mm && styles.chipTextActive]}>{mm} mm paper</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={choosePrinter} disabled={!!thermalBusy}>
                <Text style={styles.primaryText}>{thermalBusy === 'list' ? 'Reading paired printers…' : thermal ? 'Change printer' : 'Choose Bluetooth printer'}</Text>
              </TouchableOpacity>
              {!!paired && paired.map((d) => (
                <TouchableOpacity key={d.address} style={styles.device} onPress={() => pick(d)}>
                  <Text style={styles.deviceName}>{d.name}</Text>
                  <Text style={styles.deviceAddr}>{d.address}</Text>
                </TouchableOpacity>
              ))}
              {!!thermal && (
                <View style={styles.chipRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={testThermal} disabled={!!thermalBusy}>
                    <Text style={styles.secondaryText}>{thermalBusy === 'test' ? 'Printing…' : 'Print test slip'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={forget} disabled={!!thermalBusy}>
                    <Text style={styles.secondaryText}>Use Android printing instead</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Receipt printing</Text>
          <Text style={styles.cardText}>Transaction details now include a Print button. Collection PINs are included on the printed receipt when available.</Text>
        </View>
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Important</Text>
          <Text style={styles.noteText}>A chosen Bluetooth thermal printer prints receipts in plain English letters and numbers; Bengali or other scripts on a receipt print as "?". For full-page receipts, use "Use Android printing instead".</Text>
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
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill || 999, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    device: { marginTop: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    deviceName: { fontSize: 14, fontWeight: '800', color: colors.text },
    deviceAddr: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    secondaryBtn: { borderWidth: 1.5, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14 },
    secondaryText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    note: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
    noteTitle: { color: colors.primaryDark, fontSize: 12, fontWeight: '800' },
    noteText: { color: colors.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 5 },
  });
}
