import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';
import * as securityPinService from '../firebase/securityPinService';

// Rendered once at the App.js root, same as RatePopup/ResultModal. Reads
// pinGateRequest (set by AppContext.requireSecurityPin - see the screens
// that call it on entry: MyDocumentsScreen, TransferPointsScreen,
// NotepadScreen) and shows either a first-time "set + confirm" flow
// (profile.securityPinSet is false) or a single "enter your PIN" verify
// step (it's true already). Actual hashing/verification happens
// server-side in functions/securityPinService.js - this only ever sees
// the plain digits long enough to hand them to that callable.
export default function SecurityPinGate() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { pinGateRequest, profile, resolvePinGate, cancelPinGate } = useApp();
  const visible = !!pinGateRequest;
  const isSetup = !profile?.securityPinSet;

  const [step, setStep] = useState('enter'); // 'enter' | 'confirm' (setup only)
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setStep('enter');
      setPin('');
      setConfirmPin('');
      setError('');
      setBusy(false);
    }
  }, [visible, pinGateRequest]);

  if (!visible) return null;

  const isValidPin = (p) => /^\d{4,8}$/.test(p);

  const onCancel = () => { if (!busy) cancelPinGate(); };

  const onEnterNext = () => {
    setError('');
    if (!isValidPin(pin)) { setError('PIN must be 4-8 digits.'); return; }
    if (isSetup) {
      setStep('confirm');
      return;
    }
    doVerify();
  };

  const onConfirmSave = async () => {
    setError('');
    if (confirmPin !== pin) { setError('PINs do not match.'); setConfirmPin(''); return; }
    setBusy(true);
    try {
      await securityPinService.setupSecurityPin(pin);
      resolvePinGate();
    } catch (err) {
      setError(err?.message || 'Could not set up your security PIN. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doVerify = async () => {
    setBusy(true);
    try {
      await securityPinService.verifySecurityPin(pin);
      resolvePinGate();
    } catch (err) {
      setError(err?.message || 'Incorrect PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = pinGateRequest?.actionLabel;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>
              {isSetup ? (step === 'enter' ? 'Set Up Security PIN' : 'Confirm Your PIN') : 'Enter Security PIN'}
            </Text>
            <Text style={styles.subtitle}>
              {isSetup
                ? step === 'enter'
                  ? `Choose a 4-8 digit PIN to protect${actionLabel ? ` ${actionLabel}` : ' sensitive actions'} in MySheba.`
                  : 'Re-enter the same PIN to confirm.'
                : `Enter your security PIN to continue${actionLabel ? ` with ${actionLabel}` : ''}.`}
            </Text>

            {isSetup && step === 'confirm' ? (
              <TextInput
                style={styles.input}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                value={confirmPin}
                onChangeText={setConfirmPin}
                placeholder="Confirm PIN"
                editable={!busy}
                autoFocus
              />
            ) : (
              <TextInput
                style={styles.input}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={8}
                value={pin}
                onChangeText={setPin}
                placeholder="4-8 digit PIN"
                editable={!busy}
                autoFocus
              />
            )}

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.okBtn, busy && styles.okBtnDisabled]}
                onPress={isSetup && step === 'confirm' ? onConfirmSave : onEnterNext}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.okText}>
                    {isSetup ? (step === 'enter' ? 'Next' : 'Confirm & Save') : 'Unlock'}
                  </Text>
                )}
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
    box: { backgroundColor: 'white', borderRadius: radius.lg, width: '85%', maxWidth: 360, overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 6 },
    subtitle: { fontSize: 12, color: '#666', marginBottom: 14 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 18, letterSpacing: 4, textAlign: 'center' },
    error: { color: colors.error, fontSize: 12, marginTop: 12 },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    okBtnDisabled: { opacity: 0.7 },
    okText: { color: 'white', fontWeight: '600' },
  });
}
