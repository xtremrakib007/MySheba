import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

const EMPTY = { bankName: '', accountNumber: '', accountHolder: '' };

// Add/Edit form for one receiving bank account (Payments tab > Bank
// Accounts). `account` is null for "add new", or an existing entry
// (with `id`) for "edit". Mirrors BannerFormModal's shape/pattern but
// for a plain 3-field record instead of a full banner.
export default function BankAccountFormModal({ visible, account, onSubmit, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (visible) setForm(account ? { ...EMPTY, ...account } : EMPTY);
  }, [visible, account]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    if (!form.bankName.trim() || !form.accountNumber.trim() || !form.accountHolder.trim()) return;
    onSubmit({
      bankName: form.bankName.trim(),
      accountNumber: form.accountNumber.trim(),
      accountHolder: form.accountHolder.trim(),
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.heading}>{account ? 'Edit Bank Account' : 'New Bank Account'}</Text>

          <Text style={styles.label}>Bank Name</Text>
          <TextInput style={styles.input} placeholder="e.g. Maybank" value={form.bankName} onChangeText={(v) => set('bankName', v)} />

          <Text style={styles.label}>Account Number</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 1234 5678 9012"
            value={form.accountNumber}
            onChangeText={(v) => set('accountNumber', v)}
            keyboardType="default"
          />

          <Text style={styles.label}>Account Holder Name</Text>
          <TextInput style={styles.input} placeholder="e.g. MySheba Sdn Bhd" value={form.accountHolder} onChangeText={(v) => set('accountHolder', v)} />

          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.okBtn} onPress={save}>
              <Text style={styles.okText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '88%', maxWidth: 380 },
    heading: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okText: { color: 'white', fontWeight: '600' },
  });
}
