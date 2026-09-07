import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage, LANGUAGES, LANGUAGE_LIST } from '../i18n/LanguageContext';
import AppModalHeader from './AppModalHeader';

// Settings > "Language" row. Mirrors DisplayModeModal's layout/behaviour
// exactly (same list-of-options-with-checkmark pattern) so the two pickers
// feel consistent to the user.
export default function LanguageModal({ visible, onClose }) {
  const { colors } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>{t('language.title')}</Text>
            <Text style={styles.subtitle}>{t('language.subtitle')}</Text>

            <View style={styles.list}>
              {LANGUAGE_LIST.map((key, idx) => {
                const opt = LANGUAGES[key];
                const isSelected = key === language;
                const isLast = idx === LANGUAGE_LIST.length - 1;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected, isLast && styles.optionRowLast]}
                    onPress={() => { setLanguage(key); onClose(); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionIcon}>{opt.flag}</Text>
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && { color: colors.primary, fontWeight: '700' }]}>{opt.nativeLabel}</Text>
                      <Text style={styles.optionSub}>{opt.label}</Text>
                    </View>
                    {isSelected && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>{t('common.done')}</Text>
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
