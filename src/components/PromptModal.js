import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import AppModalHeader from './AppModalHeader';

export default function PromptModal({ visible, title, placeholder, secure, maxLength, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [value, setValue] = useState('');
  useEffect(() => { if (visible) setValue(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <TextInput
              style={styles.input}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry={secure}
              maxLength={maxLength}
              keyboardType={secure ? 'number-pad' : 'default'}
              value={value}
              onChangeText={setValue}
              autoFocus
              selectionColor={colors.primary}
            />
            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.okBtn} onPress={() => onSubmit(value)}>
                <Text style={styles.okText}>OK</Text>
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
    box: { backgroundColor: colors.card, borderRadius: radius.lg, width: '85%', maxWidth: 340, overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 10, color: colors.text },
    input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, color: colors.text, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 14 },
    row: { flexDirection: 'row', gap: 10 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: colors.text, fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okText: { color: colors.onPrimary, fontWeight: '600' },
  });
}
