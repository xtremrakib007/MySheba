import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import * as securityPinService from '../firebase/securityPinService';
import * as deviceSessionService from '../firebase/deviceSessionService';
import { isBiometricAvailable, authenticateWithBiometric } from '../firebase/biometricAuth';

export default function AppLockScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { appLocked, unlockApp, logout, biometricEnabled } = useApp();

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const autoPromptedRef = useRef(false);

  useEffect(() => {
    if (!appLocked) {
      setPin('');
      setError('');
      setBusy(false);
      autoPromptedRef.current = false;
      return;
    }
    if (biometricEnabled === true) {
      isBiometricAvailable().then(setBiometricReady);
    } else {
      setBiometricReady(false);
    }
  }, [appLocked, biometricEnabled]);

  useEffect(() => {
    if (appLocked && biometricReady && !autoPromptedRef.current) {
      autoPromptedRef.current = true;
      tryBiometric();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLocked, biometricReady]);

  if (!appLocked) return null;

  const validateSessionBeforeUnlock = async () => {
    const valid = await deviceSessionService.validateActiveSession();
    if (!valid) {
      setPin('');
      setError('This device session has expired or was replaced. Please sign in again.');
      await deviceSessionService.clearLocalSessionId().catch(() => {});
      await logout();
      return false;
    }
    return true;
  };

  const tryBiometric = async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const ok = await authenticateWithBiometric('Unlock MySheba');
      if (!ok) return;
      await validateSessionBeforeUnlock();
      if (await deviceSessionService.validateActiveSession()) unlockApp();
    } catch (err) {
      setError(err?.message || 'Could not verify this device session.');
    } finally {
      setBusy(false);
    }
  };

  const isValidPin = (p) => /^\d{4,8}$/.test(p);

  const onUnlock = async () => {
    setError('');
    if (!isValidPin(pin)) { setError('Enter your PIN.'); return; }
    setBusy(true);
    try {
      await securityPinService.verifySecurityPin(pin);
      const valid = await validateSessionBeforeUnlock();
      if (valid) unlockApp();
    } catch (err) {
      setError(err?.message || 'Incorrect PIN.');
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={appLocked} animationType="fade" onRequestClose={() => {}}>
      <View style={styles.screen}>
        <View style={styles.content}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="cover" />
          <Text style={styles.title}>MySheba is Locked</Text>
          <Text style={styles.subtitle}>Enter your security PIN to continue.</Text>

          <TextInput
            style={styles.input}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={8}
            value={pin}
            onChangeText={setPin}
            placeholder="PIN"
            editable={!busy}
            autoFocus={!biometricReady}
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={[styles.unlockBtn, busy && styles.unlockBtnDisabled]} onPress={onUnlock} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.unlockText}>Unlock</Text>}
          </TouchableOpacity>

          {biometricReady && (
            <TouchableOpacity style={styles.bioBtn} onPress={tryBiometric} disabled={busy}>
              <Text style={styles.bioText}>👆 Use Fingerprint / Face</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.logoutLink} onPress={logout} disabled={busy}>
            <Text style={styles.logoutText}>Forgot PIN? Log out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    content: { width: '85%', maxWidth: 340, alignItems: 'center' },
    logo: { width: 72, height: 72, borderRadius: 18, marginBottom: 18 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
    subtitle: { fontSize: 13, color: '#888', marginBottom: 24, textAlign: 'center' },
    input: {
      width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
      paddingVertical: 12, paddingHorizontal: 12, fontSize: 20, letterSpacing: 6, textAlign: 'center',
      color: colors.text,
    },
    error: { color: colors.error, fontSize: 12, marginTop: 12, textAlign: 'center' },
    unlockBtn: {
      width: '100%', backgroundColor: colors.primary, borderRadius: radius.md,
      paddingVertical: 13, alignItems: 'center', marginTop: 18,
    },
    unlockBtnDisabled: { opacity: 0.7 },
    unlockText: { color: 'white', fontWeight: '700', fontSize: 15 },
    bioBtn: { marginTop: 16, paddingVertical: 8 },
    bioText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    logoutLink: { marginTop: 26, paddingVertical: 8 },
    logoutText: { color: '#999', fontSize: 12 },
  });
}
