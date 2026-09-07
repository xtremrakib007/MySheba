import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// Shown once per fresh sign-in (see AppContext.js's showBiometricPrompt
// effect - fires when biometricEnabled is null, i.e. this device has never
// been asked, AND the OS actually has biometrics enrolled). "Enable" turns
// on both biometric unlock AND App Lock (via setBiometricEnabled(true) in
// AppContext, which runs the same PIN-must-exist gate App Lock's own
// toggle does). "Not Now" just dismisses for this login - see
// dismissBiometricPrompt in AppContext.js for why that's NOT the same as a
// permanent decline: logout always resets this back to "never asked" for
// the next sign-in, any account, per the person's own stated rule.
export default function BiometricOptInPrompt() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { showBiometricPrompt, dismissBiometricPrompt } = useApp();
  const [busy, setBusy] = useState(false);

  if (!showBiometricPrompt) return null;

  const onEnable = async () => {
    setBusy(true);
    try {
      await dismissBiometricPrompt(true);
    } finally {
      setBusy(false);
    }
  };

  const onNotNow = async () => {
    setBusy(true);
    try {
      await dismissBiometricPrompt(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={showBiometricPrompt} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>👆</Text>
          <Text style={styles.title}>Enable Fingerprint / Face Unlock?</Text>
          <Text style={styles.subtitle}>
            Unlock MySheba faster next time using your fingerprint or face, instead of typing your PIN every time.
          </Text>

          <TouchableOpacity style={styles.enableBtn} onPress={onEnable} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.enableText}>Enable</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.notNowBtn} onPress={onNotNow} disabled={busy}>
            <Text style={styles.notNowText}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: '100%', maxWidth: 360, backgroundColor: colors.bg, borderRadius: radius.lg, padding: 24, alignItems: 'center' },
    icon: { fontSize: 36, marginBottom: 10 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8, textAlign: 'center' },
    subtitle: { fontSize: 13, color: '#888', textAlign: 'center', marginBottom: 20, lineHeight: 18 },
    enableBtn: { width: '100%', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    enableText: { color: 'white', fontWeight: '700', fontSize: 15 },
    notNowBtn: { marginTop: 14, paddingVertical: 8 },
    notNowText: { color: '#999', fontSize: 13, fontWeight: '600' },
  });
}
