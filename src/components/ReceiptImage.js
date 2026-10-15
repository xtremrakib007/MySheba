import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// Every MySheba receipt as a picture, for Share.
//
// Print keeps the HTML document (utils/receiptHtml.js); Share sends this card
// as a PNG, which is what people forward on WhatsApp - a text block or a PDF
// is not a receipt to them. Both are built from the same [label, value] rows,
// so the photo and the printout say the same thing.
//
// The card is rendered off-screen (ReceiptCapture) and captured with
// react-native-view-shot. A build without that native module (an older binary
// that received this code as an OTA update) cannot capture, so it falls back
// to sharing the same receipt as a PDF rather than failing.

export const ReceiptCard = forwardRef(function ReceiptCard({ subtitle, rows = [], highlight, footer }, ref) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '');
  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <Text style={styles.brand}>MySheba</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {!!highlight?.value && (
        <View style={styles.highlight}>
          <Text style={styles.highlightLabel}>{highlight.label}</Text>
          <Text style={styles.highlightValue}>{String(highlight.value)}</Text>
        </View>
      )}
      {shown.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{String(value)}</Text>
        </View>
      ))}
      <Text style={styles.footer}>{footer || 'Please keep this receipt for your records.'}</Text>
    </View>
  );
});

/** The card, laid out but off-screen, so it can be captured without being seen. */
export const ReceiptCapture = forwardRef(function ReceiptCapture(props, ref) {
  return (
    <View pointerEvents="none" style={styles.offscreen}>
      <ReceiptCard ref={ref} {...props} />
    </View>
  );
});

const safeName = (name) => String(name || 'receipt').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60);

/**
 * Share a receipt as a photo; fall back to a PDF of `html` when this build
 * cannot capture views.
 */
export async function shareReceiptImage(cardRef, { fileName, html }) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  let shot = null;
  try {
    // Required lazily: a binary without the native module must still load
    // this file and reach the PDF fallback below.
    const { captureRef } = require('react-native-view-shot');
    shot = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile' });
  } catch (_) {
    shot = null;
  }
  if (shot) {
    const uri = `${FileSystem.cacheDirectory}${safeName(fileName)}.png`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.copyAsync({ from: shot, to: uri });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share receipt' });
    return;
  }
  const { uri: pdf } = await Print.printToFileAsync({ html, base64: false });
  const dest = `${FileSystem.cacheDirectory}${safeName(fileName)}.pdf`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: pdf, to: dest });
  await Sharing.shareAsync(dest, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share receipt' });
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -5000, top: 0, width: 380 },
  card: { width: 380, backgroundColor: '#ffffff', padding: 22, borderRadius: 4 },
  brand: { fontSize: 24, fontWeight: '900', textAlign: 'center', color: '#0b2447' },
  subtitle: { fontSize: 13, textAlign: 'center', color: '#667085', marginTop: 2, marginBottom: 14 },
  highlight: { borderWidth: 2, borderColor: '#0B8A94', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  highlightLabel: { fontSize: 11, fontWeight: '800', color: '#0B8A94' },
  highlightValue: { fontSize: 26, fontWeight: '900', color: '#111827', marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  label: { fontSize: 13, color: '#667085', fontWeight: '600', width: '40%' },
  value: { fontSize: 13, color: '#111827', fontWeight: '700', flex: 1, textAlign: 'right' },
  footer: { fontSize: 11, color: '#667085', textAlign: 'center', marginTop: 16 },
});
