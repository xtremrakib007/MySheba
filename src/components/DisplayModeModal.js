import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Settings > "Display Mode" row. Replaces the old plain Dark Mode Switch
// with a 3-way picker, since a Switch can't represent Light/Dark/System.
// 'system' mode follows the device's Appearance setting live (see
// ThemeContext) rather than a one-time guess - selecting it here means the
// app will keep tracking the OS setting going forward, including changes
// made while the app stays open.
export const DISPLAY_OPTIONS = [
  { key: 'light', icon: '☀️', label: 'Light', sub: 'Always use light theme' },
  { key: 'dark', icon: '🌙', label: 'Dark', sub: 'Always use dark theme' },
  { key: 'system', icon: '📱', label: 'System Default', sub: 'Match your device setting' },
];

export default function DisplayModeModal({ visible, selected, onSelect, onClose }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Display Mode</Text>
            <Text style={styles.subtitle}>Choose how MySheba should look.</Text>

            <View style={styles.list}>
              {DISPLAY_OPTIONS.map((opt, idx) => {
                const isSelected = opt.key === selected;
                const isLast = idx === DISPLAY_OPTIONS.length - 1;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected, isLast && styles.optionRowLast]}
                    onPress={() => onSelect(opt.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionIcon}>{opt.icon}</Text>
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && { color: colors.primary, fontWeight: '700' }]}>{opt.label}</Text>
                      <Text style={styles.optionSub}>{opt.sub}</Text>
                    </View>
                    {isSelected && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Done</Text>
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
    box: { backgroundColor: 'white', borderRadius: radius.lg, width: '88%', maxWidth: 380, overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, color: colors.text },
    subtitle: { fontSize: 12, color: '#888', marginTop: 4, marginBottom: 14, lineHeight: 17 },
    list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden' },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionRowLast: { borderBottomWidth: 0 },
    optionRowSelected: { backgroundColor: `${colors.primary}14` },
    optionIcon: { fontSize: 18, width: 22, textAlign: 'center' },
    optionTextWrap: { flex: 1 },
    optionLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
    optionSub: { fontSize: 11, color: '#999', marginTop: 2 },
    check: { fontSize: 16, fontWeight: '700' },
    closeBtn: { marginTop: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 14 },
  });
}
