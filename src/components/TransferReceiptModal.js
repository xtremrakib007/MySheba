import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { receiptDocument, receiptRows, highlightBlock } from '../utils/receiptHtml';
import { printHtml } from '../utils/printService';
import { showAlert } from '../utils/appAlert';

// A wallet transfer's receipt, shown the moment the server accepts it: the
// same receipt layout orders and top-ups print (utils/receiptHtml.js), with
// Print and Share (as a PDF file, so it can go to WhatsApp, email or Drive).

const money = (amount, currency) => `${currency || 'MYR'} ${Number(amount || 0).toFixed(2)}`;

export function transferReceiptHtml(r) {
  const received = r.recipientAmount && r.recipientCurrency && r.recipientCurrency !== r.currency;
  return receiptDocument({
    subtitle: 'Wallet Transfer Receipt',
    rowsHtml: receiptRows([
      ['Transfer ID', r.transferId || ''],
      ['Status', 'COMPLETED'],
      ['Date', r.at ? new Date(r.at).toLocaleString() : ''],
      ['From', r.senderName || ''],
      ['To', r.recipientName || ''],
      ['Recipient phone', r.recipientPhone || ''],
      ['Amount sent', money(r.amount, r.currency)],
      ['Amount received', received ? money(r.recipientAmount, r.recipientCurrency) : ''],
      ['Note', r.note || ''],
    ]),
    blocks: [highlightBlock('AMOUNT', money(r.amount, r.currency))],
  });
}

export default function TransferReceiptModal({ receipt, onClose }) {
  const [busy, setBusy] = useState('');
  if (!receipt) return null;

  const print = async () => {
    setBusy('print');
    try { await printHtml(transferReceiptHtml(receipt)); }
    catch (err) { showAlert('Printer', err?.message || 'Printing is not available on this device.'); }
    finally { setBusy(''); }
  };

  const share = async () => {
    setBusy('share');
    try {
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const { uri } = await Print.printToFileAsync({ html: transferReceiptHtml(receipt), base64: false });
      // A readable file name instead of expo-print's random one.
      const dest = `${FileSystem.cacheDirectory}MySheba-transfer-${String(receipt.transferId || Date.now()).slice(0, 12)}.pdf`;
      await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share receipt' });
    } catch (err) {
      showAlert('Share', err?.message || 'Could not share this receipt.');
    } finally { setBusy(''); }
  };

  const rows = [
    ['Amount sent', money(receipt.amount, receipt.currency)],
    receipt.recipientAmount && receipt.recipientCurrency && receipt.recipientCurrency !== receipt.currency
      ? ['Amount received', money(receipt.recipientAmount, receipt.recipientCurrency)] : null,
    ['To', receipt.recipientName],
    ['Recipient phone', receipt.recipientPhone],
    ['Note', receipt.note],
    ['Date', receipt.at ? new Date(receipt.at).toLocaleString() : ''],
    ['Transfer ID', receipt.transferId],
  ].filter((row) => row && row[1]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.tick}>✓</Text>
          <Text style={styles.title}>Transfer successful</Text>
          <Text style={styles.amount}>{money(receipt.amount, receipt.currency)}</Text>
          <ScrollView style={styles.rows}>
            {rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value} selectable>{String(value)}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.action} onPress={print} disabled={!!busy}>
              {busy === 'print' ? <ActivityIndicator /> : <Text style={styles.actionText}>🖨 Print</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={share} disabled={!!busy}>
              {busy === 'share' ? <ActivityIndicator /> : <Text style={styles.actionText}>↗ Share</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.done} onPress={onClose}><Text style={styles.doneText}>Done</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 20, maxHeight: '90%' },
  tick: { alignSelf: 'center', fontSize: 30, color: '#1b7f3b', fontWeight: '900' },
  title: { textAlign: 'center', fontSize: 17, fontWeight: '800', marginTop: 4 },
  amount: { textAlign: 'center', fontSize: 26, fontWeight: '900', color: '#4b2bb0', marginVertical: 8 },
  rows: { marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#f0f2f5' },
  label: { fontSize: 13, opacity: 0.65 },
  value: { fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  action: { flex: 1, borderWidth: 1.5, borderColor: '#4b2bb0', borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  actionText: { color: '#4b2bb0', fontWeight: '800' },
  done: { backgroundColor: '#4b2bb0', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
