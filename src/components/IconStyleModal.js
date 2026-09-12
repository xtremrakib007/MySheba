import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import AppModalHeader from './AppModalHeader';

const PREVIEW = { classic: '📱', modern: '🌐', filled: '💳', outline: '◇', playful: '🎮', compact: '•', business: '💼', colorful: '🌈', thin: '⌁', bold: '⚡' };

export default function IconStyleModal({ visible, selected, onSelect, onClose }) {
  const { colors, isDark, iconStyles, iconStyleList } = useTheme();
  const styles = createStyles(colors, isDark);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}><View style={styles.box}><AppModalHeader /><View style={styles.content}>
        <Text style={styles.title}>Service Icon Style</Text>
        <Text style={styles.subtitle}>Choose from 10 icon styles. Service meaning stays the same; country flags, operator logos and mobile-banking/provider branding are never replaced.</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {iconStyleList.map((key) => {
            const chosen = key === selected;
            return <TouchableOpacity key={key} style={[styles.row, chosen && styles.selected]} onPress={() => onSelect(key)} activeOpacity={0.78} accessibilityRole="radio" accessibilityState={{ selected: chosen }}>
              <View style={[styles.preview, chosen && styles.previewSelected]}><Text style={styles.previewIcon}>{PREVIEW[key]}</Text></View>
              <View style={styles.textWrap}><Text style={[styles.label, chosen && styles.selectedLabel]}>{iconStyles[key].label}</Text><Text style={styles.description}>{iconStyles[key].description}</Text></View>
              <View style={[styles.radio, chosen && styles.radioSelected]}>{chosen && <View style={styles.dot} />}</View>
            </TouchableOpacity>;
          })}
        </ScrollView>
        <TouchableOpacity style={styles.close} onPress={onClose} activeOpacity={0.8}><Text style={styles.closeText}>Done</Text></TouchableOpacity>
      </View></View></View>
    </Modal>
  );
}
function createStyles(colors, isDark) { return StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  box: { backgroundColor: colors.bg, borderRadius: radius.xl, width: '92%', maxWidth: 420, maxHeight: '88%', overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#FFFFFF22' : '#00000012' },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  title: { fontWeight: '800', fontSize: 18, color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 5, marginBottom: 12, lineHeight: 17 },
  scroll: { maxHeight: 500 }, list: { gap: 9, paddingBottom: 2 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 9, borderRadius: radius.md, borderWidth: 1, borderColor: isDark ? '#FFFFFF25' : '#00000020', backgroundColor: colors.card },
  selected: { borderColor: colors.primary, backgroundColor: `${colors.primary}14`, borderWidth: 2 },
  preview: { width: 56, height: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#FFFFFF12' : '#F4F7FA', borderWidth: 1, borderColor: isDark ? '#FFFFFF20' : '#00000012' },
  previewSelected: { borderColor: colors.primary }, previewIcon: { fontSize: 25 }, textWrap: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, fontWeight: '750', color: colors.text }, selectedLabel: { color: colors.primary }, description: { marginTop: 3, fontSize: 11, lineHeight: 15, color: colors.textSecondary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: colors.primary }, dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  close: { marginTop: 14, paddingVertical: 13, minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
}); }
