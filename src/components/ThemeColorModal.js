import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import AppModalHeader from './AppModalHeader';

// Settings > Theme Color. The selected accent is persisted by ThemeContext
// and is used by the rest of the app through colors.primary/secondary.
export default function ThemeColorModal({ visible, selected, onSelect, onClose }) {
  const { colors, accentThemes, accentList } = useTheme();
  const styles = createStyles(colors);
  const selectedTheme = accentThemes[selected] || accentThemes.teal;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />

          <View style={styles.content}>
            <Text style={styles.title}>Front Color</Text>
            <Text style={styles.subtitle}>
              Choose the main app color. It updates buttons, headers, icons, highlights and supported cards while keeping text readable in Light and Dark mode.
            </Text>

            <View style={styles.preview}>
              {selectedTheme.gradientSwatch ? (
                <LinearGradient
                  colors={selectedTheme.gradientSwatch}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.previewHeader}
                >
                  <Text style={styles.previewHeaderText}>MySheba</Text>
                  <Text style={styles.previewHeaderSub}>Front color preview</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.previewHeader, { backgroundColor: selectedTheme.swatch }]}>
                  <Text style={styles.previewHeaderText}>MySheba</Text>
                  <Text style={styles.previewHeaderSub}>Front color preview</Text>
                </View>
              )}
              <View style={styles.previewBody}>
                <View style={styles.previewRow}>
                  <View style={[styles.previewIcon, { backgroundColor: selectedTheme.swatch }]}>
                    <Text style={styles.previewIconText}>✓</Text>
                  </View>
                  <View style={styles.previewCopy}>
                    <Text style={styles.previewTitle}>Selected theme</Text>
                    <Text style={styles.previewSub}>{selectedTheme.label}</Text>
                  </View>
                  <View style={[styles.previewButton, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.previewButtonText, { color: colors.onPrimary }]}>Action</Text>
                  </View>
                </View>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Available colors</Text>
            <View style={styles.grid}>
              {accentList.map((key) => {
                const theme = accentThemes[key];
                const isSelected = key === selected;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.swatchCard,
                      isSelected && {
                        borderColor: theme.swatch,
                        backgroundColor: `${theme.swatch}14`,
                      },
                    ]}
                    onPress={() => onSelect(key)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${theme.label}${isSelected ? ', selected' : ''}`}
                  >
                    {theme.gradientSwatch ? (
                      <LinearGradient
                        colors={theme.gradientSwatch}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.swatchCircle}
                      >
                        {isSelected && <Text style={styles.check}>✓</Text>}
                      </LinearGradient>
                    ) : (
                      <View style={[styles.swatchCircle, { backgroundColor: theme.swatch }]}>
                        {isSelected && <Text style={styles.check}>✓</Text>}
                      </View>
                    )}
                    <Text
                      style={[styles.swatchLabel, isSelected && { color: theme.swatch, fontWeight: '700' }]}
                      numberOfLines={1}
                    >
                      {theme.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={[styles.closeText, { color: colors.onPrimary }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    box: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      width: '100%',
      maxWidth: 400,
      maxHeight: '92%',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
    },
    content: { padding: 20 },
    title: { fontWeight: '700', fontSize: 18, color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 5, marginBottom: 16, lineHeight: 18 },
    preview: {
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18,
    },
    previewHeader: { minHeight: 72, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
    previewHeaderText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
    previewHeaderSub: { color: '#FFFFFF', opacity: 0.9, fontSize: 11, marginTop: 2 },
    previewBody: { backgroundColor: colors.surface, padding: 12 },
    previewRow: { flexDirection: 'row', alignItems: 'center' },
    previewIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    previewIconText: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
    previewCopy: { flex: 1, marginHorizontal: 10 },
    previewTitle: { color: colors.text, fontWeight: '700', fontSize: 12 },
    previewSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
    previewButton: { borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8 },
    previewButtonText: { fontWeight: '700', fontSize: 11 },
    sectionLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
    swatchCard: {
      width: '31.5%',
      minHeight: 82,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    swatchCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
    check: { color: '#FFFFFF', fontWeight: '800', fontSize: 17 },
    swatchLabel: { fontSize: 10.5, color: colors.text, textAlign: 'center' },
    closeBtn: { marginTop: 18, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { fontWeight: '700', fontSize: 14 },
  });
}
