import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Settings screen's "Change PIN" / "Set Up Security PIN" row. Unlike
// SecurityPinGate.js (which only ever verifies, or does first-time setup
// with no way to change an existing PIN) this always re-authenticates with
// the account's login password first - same "recent sign-in" pattern
// ChangePasswordModal uses - then calls AppContext.resetSecurityPin, which
// creates the PIN if none exists yet or overwrites the existing one. See
// functions/securityPinService.js's resetSecurityPin for why this doesn't
// need the OLD security PIN too: the login password re-auth already proves
// it's really the account owner, making this a genuine "forgot my PIN"
// reset as well as a deliberate change.
export default function ResetSecurityPinModal({ visible, hasExistingPin, onSubmit, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentPassword('');
      setNewPin('');
      setConfirmPin('');
      setError('');
      setSaving(false);
    }
  }, [visible]);

  const submit = async () => {
    setError('');
    if (!currentPassword) { setError('Enter your login password.'); return; }
    if (!/^\d{4,8}$/.test(newPin)) { setError('PIN must be 4-8 digits.'); return; }
    if (newPin !== confirmPin) { setError('PINs do not match.'); return; }

    setSaving(true);
    try {
      await onSubmit(currentPassword, newPin);
    } catch (err) {
      setError(err?.message || 'Could not save your security PIN. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>{hasExistingPin ? 'Change Security PIN' : 'Set Up Security PIN'}</Text>

            <Text style={styles.fieldLabel}>Login password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Your login password"
              editable={!saving}
              autoFocus
            />

            <Text style={styles.fieldLabel}>New PIN</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={8}
              value={newPin}
              onChangeText={setNewPin}
              placeholder="4-8 digits"
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>Confirm new PIN</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={8}
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder="Re-enter new PIN"
              editable={!saving}
            />

            {!!error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.okBtn, saving && styles.okBtnDisabled]} onPress={submit} disabled={saving}>
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.okText}>Save</Text>}
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
    title: { fontWeight: '600', fontSize: 15, marginBottom: 14 },
    fieldLabel: { fontSize: 12, color: '#666', marginBottom: 4, marginTop: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
    error: { color: colors.error, fontSize: 12, marginTop: 12 },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    okBtnDisabled: { opacity: 0.7 },
    okText: { color: 'white', fontWeight: '600' },
  });
}
