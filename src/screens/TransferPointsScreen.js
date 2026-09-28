import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { findWalletRecipient, walletTransfer } from '../firebase/walletTransferService';
import * as pinVault from '../firebase/pinVault';
import { isBiometricAvailable, authenticateWithBiometric } from '../firebase/biometricAuth';
import LegacyTransferPointsScreen from './LegacyTransferPointsScreen';

const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'KHR', 'MMK']);
function walletCurrency(profile) {
  return String(profile?.walletCurrency || profile?.walletBalanceCurrency || 'MYR').toUpperCase();
}
function currencyDigits(currency) {
  return ZERO_DECIMAL_CURRENCIES.has(String(currency || '').toUpperCase()) ? 0 : 2;
}
function fmt(n, currency = 'MYR') {
  const digits = currencyDigits(currency);
  return `${currency} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export default function TransferPointsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, profile, authUser, biometricEnabled } = useApp();
  const currency = walletCurrency(profile);
  const digits = currencyDigits(currency);
  const balance = Number(profile?.walletBalance || profile?.balance || 0);
  const isCustomer = !profile?.role || profile.role === 'customer';

  const unlocked = true;
  const [recipientQuery, setRecipientQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [securityPin, setSecurityPin] = useState('');
  // Offered only when all three hold: opted in, hardware enrolled, and a PIN
  // actually stored for this account on this device. Without the stored PIN
  // the fingerprint would pass and there would still be nothing to send.
  const [bioReady, setBioReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (!confirmVisible || biometricEnabled !== true || !authUser?.uid) {
      setBioReady(false);
      return () => { cancelled = true; };
    }
    (async () => {
      const [available, stored] = await Promise.all([
        isBiometricAvailable(),
        pinVault.hasPin(authUser.uid),
      ]);
      if (!cancelled) setBioReady(available && stored);
    })();
    return () => { cancelled = true; };
  }, [confirmVisible, biometricEnabled, authUser]);

  const review = async () => {
    const query = recipientQuery.trim();
    const value = Number(amount);
    if (!query) return showAlert('Wallet Transfer', 'Enter the recipient phone number or Customer ID.');
    const minimum = digits === 0 ? 1 : 0.01;
    if (!Number.isFinite(value) || value < minimum || (digits === 0 && !Number.isInteger(value))) return showAlert('Wallet Transfer', digits === 0 ? `Enter a whole-number ${currency} amount.` : `Enter a valid ${currency} amount.`);
    if (value > balance) return showAlert('Wallet Transfer', 'Insufficient wallet balance.');

    setReviewing(true);
    try {
      const found = await findWalletRecipient(query);
      setRecipient(found);
      setConfirmVisible(true);
    } catch (err) {
      showAlert('Wallet Transfer', err.message || 'Could not find that MySheba account.');
    } finally {
      setReviewing(false);
    }
  };

  // The transfer itself is what verifies the PIN - walletTransfer sends the
  // digits and the server scrypt-compares them. So a fingerprint here is not a
  // substitute for the check, it is a way of producing the digits without
  // typing them. The server still decides.
  const confirmWithBiometric = async () => {
    if (busy) return;
    const ok = await authenticateWithBiometric('Confirm this transfer');
    if (!ok) return;
    const stored = await pinVault.readPin(authUser?.uid);
    if (!stored) {
      setBioReady(false);
      return showAlert('Wallet Transfer', 'No saved PIN on this device. Please enter your PIN.');
    }
    return confirmTransfer(stored);
  };

  const confirmTransfer = async (pinOverride) => {
    if (!recipient || busy) return;
    const pinToSend = pinOverride || securityPin;
    if (!/^\d{4,8}$/.test(pinToSend)) return showAlert('Wallet Transfer', 'Enter your 4-8 digit security PIN.');
    const value = Number(amount);
    const minimum = digits === 0 ? 1 : 0.01;
    if (!Number.isFinite(value) || value < minimum || value > balance || (digits === 0 && !Number.isInteger(value))) {
      return showAlert('Wallet Transfer', 'Please check the transfer amount.');
    }

    setBusy(true);
    try {
      const result = await walletTransfer({ recipient: recipient.uid, amount: value, note, securityPin: pinToSend });
      // Accepted by the server, so it is safe to remember. A typed PIN that
      // just moved money is exactly the one the fingerprint should replay.
      if (biometricEnabled === true && authUser?.uid && !pinOverride) {
        await pinVault.rememberPin(authUser.uid, pinToSend);
      }
      setConfirmVisible(false);
      setRecipient(null);
      setRecipientQuery('');
      setAmount('');
      setNote('');
      setSecurityPin('');
      showAlert('Transfer Successful', `${fmt(result.amount, result.currency || currency)} sent to ${result.recipient?.name || 'the recipient'}.`);
    } catch (err) {
      // A stored PIN the server rejects is a stale one - the PIN was changed
      // on another device and this copy is wrong. Drop it rather than let the
      // fingerprint keep replaying it into the account's attempt limit.
      if (pinOverride) {
        await pinVault.forgetPin(authUser?.uid);
        setBioReady(false);
      }
      showAlert('Wallet Transfer', err.message || 'Could not complete the transfer.');
    } finally {
      setBusy(false);
    }
  };

  if (!isCustomer) return <LegacyTransferPointsScreen />;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet Transfer</Text>
      </LinearGradient>

      {!unlocked ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Wallet Balance</Text>
            <Text style={styles.balanceValue}>{fmt(balance, currency)}</Text>
            <Text style={styles.currency}>{currency} wallet</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Send Money</Text>
            <Text style={styles.helper}>Transfer money directly to another verified MySheba customer. The recipient receives their wallet currency using the server-side exchange rate.</Text>

            <Text style={styles.label}>Recipient</Text>
            <TextInput
              style={styles.input}
              placeholder="Phone number or Customer ID"
              placeholderTextColor="#9CA3AF"
              value={recipientQuery}
              onChangeText={(v) => { setRecipientQuery(v); setRecipient(null); }}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.myrPrefix}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                placeholder={digits === 0 ? "0" : "0.00"}
                placeholderTextColor="#9CA3AF"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.noteInput]}
              placeholder="What is this transfer for?"
              placeholderTextColor="#9CA3AF"
              value={note}
              onChangeText={setNote}
              maxLength={120}
            />

            <View style={styles.limitRow}>
              <Text style={styles.limitText}>Minimum {digits === 0 ? `1 ${currency}` : `0.01 ${currency}`}</Text>
              <Text style={styles.limitText}>Maximum {currency} equivalent of MYR 10,000</Text>
            </View>

            <TouchableOpacity style={styles.reviewButton} onPress={review} disabled={reviewing}>
              <Text style={styles.reviewButtonText}>{reviewing ? 'Checking…' : 'Review Transfer'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.securityCard}>
            <Text style={styles.securityTitle}>🔒 Secure wallet transfer</Text>
            <Text style={styles.securityText}>Your balance is changed only by the secure server transaction after the transfer is confirmed.</Text>
          </View>
        </ScrollView>
      )}

      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => !busy && setConfirmVisible(false)}>
        <View style={styles.backdrop}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Confirm Transfer</Text>
            <Text style={styles.confirmAmount}>{fmt(amount, currency)}</Text>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>To</Text><Text style={styles.summaryValue}>{recipient?.name || 'MySheba Customer'}</Text></View>
            {!!recipient?.walletCurrency && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Recipient wallet</Text><Text style={styles.summaryValue}>{recipient.walletCurrency}</Text></View>}
            {!!recipient?.customerId && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Customer ID</Text><Text style={styles.summaryValue}>{recipient.customerId}</Text></View>}
            {!!recipient?.phoneMasked && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Phone</Text><Text style={styles.summaryValue}>{recipient.phoneMasked}</Text></View>}
            {!!note.trim() && <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Note</Text><Text style={styles.summaryValue}>{note.trim()}</Text></View>}
            <Text style={styles.pinLabel}>Security PIN</Text>
            <TextInput
              style={styles.pinInput}
              placeholder="4-8 digit PIN"
              placeholderTextColor="#9CA3AF"
              value={securityPin}
              onChangeText={setSecurityPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              editable={!busy}
            />
            {!!bioReady && (
              <TouchableOpacity style={styles.bioBtn} onPress={confirmWithBiometric} disabled={busy}>
                <Text style={styles.bioText}>👆 Confirm with Fingerprint / Face</Text>
              </TouchableOpacity>
            )}
            <View style={styles.divider} />
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Balance after</Text><Text style={styles.summaryValue}>{fmt(balance - Number(amount || 0), currency)}</Text></View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setConfirmVisible(false)} disabled={busy}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              {/* Arrow-wrapped: confirmTransfer now takes an optional PIN, and
                  passing it straight to onPress would hand it the press event
                  as that argument. */}
              <TouchableOpacity style={styles.confirmButton} onPress={() => confirmTransfer()} disabled={busy}><Text style={styles.confirmText}>{busy ? 'Sending…' : 'Confirm & Send'}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: '#FFFFFF', fontSize: 22 },
    headerTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18, marginLeft: 8 },
    content: { padding: 16, paddingBottom: 40 },
    balanceCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: 20, marginBottom: 16 },
    balanceLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 13 },
    balanceValue: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', marginTop: 5 },
    currency: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 4 },
    card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: colors.border },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
    helper: { color: colors.muted || '#6B7280', fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 16 },
    label: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 8 },
    input: { height: 52, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingHorizontal: 14, color: colors.text, fontSize: 14, backgroundColor: '#FFFFFF' },
    amountRow: { height: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.primary, borderRadius: 14, backgroundColor: '#FFFFFF', paddingHorizontal: 14 },
    myrPrefix: { color: colors.primary, fontWeight: '800', fontSize: 15, marginRight: 10 },
    amountInput: { flex: 1, color: colors.text, fontSize: 20, fontWeight: '700', paddingVertical: 0 },
    noteInput: { height: 70, paddingTop: 14, textAlignVertical: 'top' },
    limitRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    limitText: { color: colors.muted || '#6B7280', fontSize: 10 },
    reviewButton: { marginTop: 18, height: 52, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    reviewButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
    securityCard: { marginTop: 14, padding: 15, borderRadius: 14, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
    securityTitle: { fontSize: 13, fontWeight: '800', color: '#166534' },
    securityText: { fontSize: 11, lineHeight: 17, color: '#166534', marginTop: 4 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.48)', justifyContent: 'center', padding: 20 },
    confirmCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 },
    confirmTitle: { color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' },
    confirmAmount: { color: colors.primary, fontSize: 28, fontWeight: '900', textAlign: 'center', marginVertical: 14 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, paddingVertical: 7 },
    summaryLabel: { color: colors.muted || '#6B7280', fontSize: 12 },
    summaryValue: { color: colors.text, fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
    pinLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 12, marginBottom: 7 },
    pinInput: { height: 50, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 13, paddingHorizontal: 14, color: colors.text, fontSize: 18, letterSpacing: 4, textAlign: 'center', backgroundColor: '#FFFFFF' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 7 },
    bioBtn: { marginTop: 12, paddingVertical: 8, alignItems: 'center' },
    bioText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    cancelButton: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 13 },
    cancelText: { color: colors.muted || '#6B7280', fontWeight: '700' },
    confirmButton: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: 13 },
    confirmText: { color: '#FFFFFF', fontWeight: '800' },
  });
}
