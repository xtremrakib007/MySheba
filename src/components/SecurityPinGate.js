import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';
import * as securityPinService from '../firebase/securityPinService';
import * as pinVault from '../firebase/pinVault';
import { isBiometricAvailable, authenticateWithBiometric } from '../firebase/biometricAuth';

// Rendered once at the App.js root. Reads pinGateRequest (set by
// AppContext.requireSecurityPin) and also auto-starts setup for an existing
// Google-authenticated profile that reached Home without a security PIN.
// This closes the old gap where an existing Google UID skipped onboarding.
export default function SecurityPinGate() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const {
    pinGateRequest,
    profile,
    authUser,
    requireSecurityPin,
    resolvePinGate,
    cancelPinGate,
    biometricEnabled,
  } = useApp();
  const visible = !!pinGateRequest;
  const isSetup = !profile?.securityPinSet;
  const autoPromptedRef = useRef(false);

  // Existing Google accounts created before PIN setup must not silently reach
  // an unprotected Home screen. Ask for the same server-side PIN setup gate
  // used by the rest of the app. The ref prevents a render loop while the
  // profile document is being updated after a successful setup.
  useEffect(() => {
    if (!authUser || !profile || profile.authProvider !== 'google' || profile.securityPinSet) {
      if (!profile?.securityPinSet) autoPromptedRef.current = false;
      return undefined;
    }
    if (pinGateRequest || autoPromptedRef.current) return undefined;
    autoPromptedRef.current = true;
    requireSecurityPin('Account Security PIN').catch(() => {
      // A cancelled gate may be requested again on the next explicit login.
      autoPromptedRef.current = false;
    });
    return undefined;
  }, [authUser, profile, pinGateRequest, requireSecurityPin]);

  const [step, setStep] = useState('enter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bioReady, setBioReady] = useState(false);
  // Enabled and supported, but this device is not holding the PIN yet - which
  // is every first gate after a sign-in, because logging out clears the vault.
  // Without a word here the fingerprint is simply absent and the only way to
  // find out it comes back is to type the PIN and notice next time.
  const [bioNeedsPin, setBioNeedsPin] = useState(false);
  const bioTriedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setStep('enter');
      setPin('');
      setConfirmPin('');
      setError('');
      setBusy(false);
      bioTriedRef.current = false;
    }
  }, [visible, pinGateRequest]);

  // Offer the fingerprint only when all three are true: the person opted in,
  // the hardware has something enrolled, and this device is actually holding
  // their PIN. Showing the button without a stored PIN would pass the
  // fingerprint and then still have nothing to send to the server.
  useEffect(() => {
    let cancelled = false;
    if (!visible || isSetup || biometricEnabled !== true || !authUser?.uid) {
      setBioReady(false);
      setBioNeedsPin(false);
      return () => { cancelled = true; };
    }
    (async () => {
      const [available, stored] = await Promise.all([
        isBiometricAvailable(),
        pinVault.hasPin(authUser.uid),
      ]);
      if (cancelled) return;
      setBioReady(available && stored);
      setBioNeedsPin(available && !stored);
    })();
    return () => { cancelled = true; };
  }, [visible, isSetup, biometricEnabled, authUser]);

  // Prompt once automatically, the same way App Lock does - having to tap a
  // button before the fingerprint sensor wakes up is the slower path, and this
  // gate can appear several times in one session.
  // Called through a ref, not directly. `if (!visible) return null` sits
  // between the hooks and the handlers, so unlockWithBiometric is only
  // initialised on renders that get past it - referencing it from up here
  // would be a temporal-dead-zone hazard the moment that stops holding.
  const bioRunRef = useRef(null);
  useEffect(() => {
    if (!bioReady || bioTriedRef.current) return;
    bioTriedRef.current = true;
    if (bioRunRef.current) bioRunRef.current();
  }, [bioReady]);

  if (!visible) return null;

  const isValidPin = (p) => /^\d{4,8}$/.test(p);
  const isMandatoryGoogleSetup = authUser && profile?.authProvider === 'google' && !profile?.securityPinSet;
  const onCancel = () => {
    // A Google account without a PIN must finish setup; allowing cancellation
    // would recreate the original bug where Home opens without protection.
    if (isMandatoryGoogleSetup || busy) return;
    cancelPinGate();
  };

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
      await securityPinService.setupSecurityPin(pin.trim());
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
      // The server said yes, so this PIN is safe to remember. Doing it here
      // rather than from the text field is the point: an unverified guess must
      // never be cached, or the fingerprint would replay a wrong PIN and burn
      // the account's attempt limit without anyone typing anything.
      if (biometricEnabled === true && authUser?.uid) {
        await pinVault.rememberPin(authUser.uid, pin.trim());
      }
      resolvePinGate();
    } catch (err) {
      setError(err?.message || 'Incorrect PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  const unlockWithBiometric = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const ok = await authenticateWithBiometric('Confirm to continue');
      if (!ok) return;
      const stored = await pinVault.readPin(authUser?.uid);
      if (!stored) { setBioReady(false); return; }
      // Still verified server side. The fingerprint proves who is holding the
      // phone; only the server can say the PIN is still correct, and it may
      // not be - it can be changed from another device, which leaves this copy
      // stale. A rejection means exactly that, so drop it and ask.
      await securityPinService.verifySecurityPin(stored);
      resolvePinGate();
    } catch (err) {
      await pinVault.forgetPin(authUser?.uid);
      setBioReady(false);
      setError('Your saved PIN is no longer valid. Please enter it again.');
    } finally {
      setBusy(false);
    }
  };

  bioRunRef.current = unlockWithBiometric;

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

            {!!bioReady && (
              <TouchableOpacity style={styles.bioBtn} onPress={unlockWithBiometric} disabled={busy}>
                <Text style={styles.bioText}>👆 Use Fingerprint / Face</Text>
              </TouchableOpacity>
            )}
            {!bioReady && !!bioNeedsPin && (
              <Text style={styles.bioHint}>Enter your PIN once here and your fingerprint will work from next time.</Text>
            )}

            <View style={styles.row}>
              <TouchableOpacity style={[styles.cancelBtn, isMandatoryGoogleSetup && styles.hiddenCancel]} onPress={onCancel} disabled={busy || isMandatoryGoogleSetup}>
                {!isMandatoryGoogleSetup && <Text style={styles.cancelText}>Cancel</Text>}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.okBtn, busy && styles.okBtnDisabled]}
                onPress={isSetup && step === 'confirm' ? onConfirmSave : onEnterNext}
                disabled={busy}
              >
                {busy ? <ActivityIndicator color="white" /> : <Text style={styles.okText}>{isSetup ? (step === 'enter' ? 'Next' : 'Confirm & Save') : 'Unlock'}</Text>}
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
    bioBtn: { marginTop: 14, paddingVertical: 8, alignItems: 'center' },
    bioText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    bioHint: { color: colors.textSecondary, fontSize: 11.5, lineHeight: 16, marginTop: 10, textAlign: 'center' },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    hiddenCancel: { borderWidth: 0 },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    okBtnDisabled: { opacity: 0.7 },
    okText: { color: 'white', fontWeight: '600' },
  });
}
