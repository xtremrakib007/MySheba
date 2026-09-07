import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Shown right after a real Firestore write - no fake "simulate dealer/admin"
// steps. For real orders (kind 'dealer') this renders as a receipt with a
// "Processing" status badge, since the order now sits in a dealer's queue
// awaiting action. The actual status progression (accept -> processing ->
// completed) happens on the Dealer/Admin dashboards via transactionService
// and is reflected live wherever the customer later checks their order
// (History screen, subscribeMyTransactions) - this receipt is just the
// point-of-submit confirmation, not a second source of truth for status.
export default function ResultModal() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { resultModal, closeResult, goHome, submitService, submitting } = useApp();
  const { visible, kind, txId, service, details, amount, total, createdAt } = resultModal;

  if (!visible) return null;

  const finishAndHome = () => { closeResult(); goHome(); };

  // Resubmits the exact same order: currentService/serviceData in
  // AppContext are only cleared by startService() (picking a new service
  // from Home), never on submit - so they're still exactly what was just
  // sent here. submitService() re-runs createTransaction with that same
  // data and calls openResult() again, which refreshes this modal in
  // place with a new Ref/Date rather than closing and reopening it.
  // Travel inquiries don't have a "processing order" concept the same
  // way (see the isTravel branch below), so this is dealer-kind only.
  const sendAgain = () => { submitService(); };

  const isTravel = kind === 'travel';
  const title = isTravel ? 'Inquiry Sent!' : 'Receipt';
  const body = isTravel
    ? `${service} inquiry sent to admin. We'll contact you shortly to confirm price and availability.`
    : `Your order has been received and is now processing. You'll be notified once it's ready.`;

  const dateStr = createdAt
    ? new Date(createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeResult}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.icon}>✅</Text>
            <Text style={[styles.title, { color: colors.success }]}>{title}</Text>
            <Text style={styles.body}>{body}</Text>

            {!isTravel && (
              <View style={styles.statusBadge}>
                <Text style={styles.statusDot}>🔄</Text>
                <Text style={styles.statusText}>Processing</Text>
              </View>
            )}

            {!isTravel && (
              <View style={styles.receipt}>
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Service</Text>
                  <Text style={styles.rowValue}>{service}</Text>
                </View>
                {!!details && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Details</Text>
                    <Text style={[styles.rowValue, { flexShrink: 1, textAlign: 'right' }]}>{details}</Text>
                  </View>
                )}
                {!!amount && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Amount</Text>
                    <Text style={styles.rowValue}>{amount}</Text>
                  </View>
                )}
                {!!total && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Total</Text>
                    <Text style={[styles.rowValue, { fontWeight: '700' }]}>{total}</Text>
                  </View>
                )}
                {!!dateStr && (
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>Date</Text>
                    <Text style={styles.rowValue}>{dateStr}</Text>
                  </View>
                )}
              </View>
            )}

            {!!txId && (
              <View style={styles.txId}><Text style={styles.txIdText}>Ref: {txId}</Text></View>
            )}
            <View style={styles.btnRow}>
              {!isTravel && (
                <TouchableOpacity
                  style={[styles.btn, styles.btnOutline, submitting && styles.btnDisabled]}
                  onPress={sendAgain}
                  disabled={submitting}
                >
                  <Text style={[styles.btnText, styles.btnOutlineText]}>{submitting ? 'Sending…' : 'Send Again'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={finishAndHome}>
                <Text style={styles.btnText}>Return to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.xl, width: '90%', maxWidth: 380, overflow: 'hidden' },
    content: { padding: 24, alignItems: 'center' },
    icon: { fontSize: 60, marginBottom: 12 },
    title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    body: { color: '#666', textAlign: 'center', marginBottom: 8 },
    txId: { backgroundColor: '#F5F5F5', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, marginBottom: 14, marginTop: 4 },
    txIdText: { fontFamily: 'monospace', fontSize: 11 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E3F2FD', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 16, marginBottom: 14 },
    statusDot: { fontSize: 13 },
    statusText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    receipt: { width: '100%', borderWidth: 1, borderColor: '#EEE', borderRadius: 12, padding: 14, marginBottom: 14, backgroundColor: '#FAFAFA' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 5 },
    rowLabel: { color: '#888', fontSize: 13 },
    rowValue: { color: '#222', fontSize: 13, fontWeight: '600' },
    btnRow: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 },
    btn: { flex: 1, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
    btnPrimary: { backgroundColor: colors.primary },
    btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
    btnOutlineText: { color: colors.primary },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  });
}
