import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { auth } from '../firebase/config';
import * as authService from '../firebase/authService';
import * as topupService from '../firebase/topupService';

// Superadmin: Add Money = record a real bank deposit.
//
// The superadmin's wallet is where money enters MySheba - every other credit
// is a transfer down from it - so a deposit names the bank, the bank's own
// reference and a receipt, and each reference can be used once. The server
// (functions/superadminDepositService.js) checks all of that, plus a sign-in
// from the last 15 minutes, which is what the password box is for.
const MAX = 50000;

export default function SuperadminDepositModal({ visible, onClose }) {
  const [amount, setAmount] = useState('');
  const [bankName, setBankName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [receiptUri, setReceiptUri] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);
  // One id per form: a retry after a lost reply is the same deposit.
  const [requestId, setRequestId] = useState(() => topupService.newDepositRequestId());
  // The receipt is uploaded once and reused if the save is retried.
  const [receiptUrl, setReceiptUrl] = useState('');

  const reset = () => {
    setAmount(''); setBankName(''); setRefNo(''); setNote(''); setReceiptUri(''); setReceiptUrl('');
    setNeedPin(false); setPin(''); setMessage(''); setDone(null); setBusy(false);
    setRequestId(topupService.newDepositRequestId());
  };
  const close = () => { if (busy) return; reset(); onClose?.(); };

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets?.[0]) { setReceiptUri(result.assets[0].uri); setReceiptUrl(''); }
  };

  const value = Number(amount);
  const valid = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && value > 0 && value <= MAX
    && bankName.trim() && /[A-Za-z0-9]{3,}/.test(refNo) && receiptUri;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true); setMessage('');
    try {
      if (needPin) {
        await authService.reauthenticate(pin);
        await auth.currentUser?.getIdToken(true);
      }
      const uid = auth.currentUser?.uid;
      let url = receiptUrl;
      if (!url) { url = await topupService.uploadReceipt(receiptUri, uid); setReceiptUrl(url); }
      const out = await topupService.recordSuperadminDeposit({ amount: amount.trim(), bankName, refNo, note, receiptUrl: url }, requestId);
      setDone(out);
    } catch (e) {
      const msg = String(e?.message || 'Could not record this deposit.');
      if (/recent authentication/i.test(msg)) {
        setNeedPin(true);
        setMessage('For your security, enter the password you sign in with (not your transaction PIN) and tap Record again.');
      } else {
        setMessage(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>🏦 Record bank deposit</Text>
            {done ? (
              <View>
                <Text style={styles.success}>
                  {done.duplicate ? 'This deposit was already recorded.' : `MYR ${Number(done.amount).toFixed(2)} added to your wallet.`}
                </Text>
                <Text style={styles.hint}>It is in your History as a deposit, with the bank reference and receipt.</Text>
                <TouchableOpacity style={styles.primary} onPress={close}><Text style={styles.primaryText}>Done</Text></TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={styles.hint}>
                  Money enters MySheba here: record money you have actually deposited into the business bank account.
                  Each bank reference can be recorded once. Up to MYR {MAX.toLocaleString('en-MY')} per deposit.
                </Text>
                <Text style={styles.label}>Amount (MYR)</Text>
                <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
                <Text style={styles.label}>Bank</Text>
                <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="e.g. Maybank" />
                <Text style={styles.label}>Bank reference number</Text>
                <TextInput style={styles.input} value={refNo} onChangeText={setRefNo} autoCapitalize="characters" placeholder="As shown on the receipt" />
                <Text style={styles.label}>Note (optional)</Text>
                <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="e.g. Capital injection" />
                <TouchableOpacity style={styles.receiptBtn} onPress={pickReceipt}>
                  <Text style={styles.receiptText}>{receiptUri ? 'Change receipt' : '📎 Attach bank receipt'}</Text>
                </TouchableOpacity>
                {!!receiptUri && <Image source={{ uri: receiptUri }} style={styles.preview} resizeMode="contain" />}
                {!!needPin && (
                  <TextInput style={styles.input} value={pin} onChangeText={setPin} placeholder="Your login password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" />
                )}
                {!!message && <Text style={styles.message}>{message}</Text>}
                <TouchableOpacity style={[styles.primary, (!valid || busy) && styles.dim]} onPress={submit} disabled={!valid || busy}>
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Record deposit</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={close} disabled={busy}><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, maxHeight: '90%' },
  title: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#d6dde5', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 2 },
  receiptBtn: { borderWidth: 1, borderColor: '#0E7A79', borderStyle: 'dashed', borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 12 },
  receiptText: { color: '#0E7A79', fontWeight: '800' },
  preview: { width: '100%', height: 160, marginTop: 8, borderRadius: 8, backgroundColor: '#f3f5f8' },
  message: { fontSize: 12.5, color: '#b3261e', marginTop: 10 },
  success: { fontSize: 15, fontWeight: '800', color: '#1b7f3b', marginVertical: 10 },
  primary: { backgroundColor: '#0E7A79', borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dim: { opacity: 0.5 },
  cancel: { textAlign: 'center', color: '#4a5a6a', fontWeight: '700', paddingVertical: 12 },
});
