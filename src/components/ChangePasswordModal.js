import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Settings screen's "Change Password" flow. Re-authenticates with the
// current password (Firebase requires a recent sign-in before it will let
// an account change its own password) and then sets the new one - see
// authService.changePassword / AppContext.changePassword.
export default function ChangePasswordModal({ visible, onSubmit, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setError('');
      setSaving(false);
    }
  }, [visible]);

  const submit = async () => {
    setError('');
    if (!currentPin) { setError('Enter your current password.'); return; }
    if (newPin.length < 6 || newPin.length > 20) { setError('New password must be 6-20 characters.'); return; }
    if (newPin !== confirmPin) { setError('New passwords do not match.'); return; }

    setSaving(true);
    try {
      await onSubmit(currentPin, newPin);
    } catch (err) {
      setError(err?.message || 'Could not change your password. Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={saving ? undefined : onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Change Password</Text>

            <Text style={styles.fieldLabel}>Current password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={currentPin}
              onChangeText={setCurrentPin}
              placeholder="Current password"
              editable={!saving}
              autoFocus
            />

            <Text style={styles.fieldLabel}>New password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={newPin}
              onChangeText={setNewPin}
              placeholder="6-20 characters"
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmPin}
              onChangeText={setConfirmPin}
              placeholder="Re-enter new password"
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
