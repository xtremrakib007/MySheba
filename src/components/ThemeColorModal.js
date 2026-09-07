import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Settings > "Theme Color" row. Lets the user pick one of the accent
// palettes defined in theme/theme.js (accentThemes) - each swatch here
// shows that accent's light-mode primary color regardless of the app's
// current light/dark setting, since it's meant to identify the color
// choice itself, not preview it under the active mode. The actual
// primary/primaryDark/secondary swap (and its dark-mode equivalents)
// happens in ThemeContext via setAccent, which is passed in as onSelect.
export default function ThemeColorModal({ visible, selected, onSelect, onClose }) {
  const {
    colors,
    accentThemes,
    accentList
  } = useTheme();

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Theme Color</Text>
            <Text style={styles.subtitle}>Choose an accent color for buttons, headers, and highlights.</Text>

            <View style={styles.grid}>
              {accentList.map((key) => {
                const theme = accentThemes[key];
                const isSelected = key === selected;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.swatchCard, isSelected && { borderColor: theme.swatch, backgroundColor: `${theme.swatch}14` }]}
                    onPress={() => onSelect(key)}
                    activeOpacity={0.7}
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
                    <Text style={[styles.swatchLabel, isSelected && { color: theme.swatch, fontWeight: '700' }]} numberOfLines={1}>
                      {theme.label}
                    </Text>
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
    subtitle: { fontSize: 12, color: '#888', marginTop: 4, marginBottom: 16, lineHeight: 17 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
    swatchCard: {
      width: '31%',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    swatchCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    check: { color: 'white', fontWeight: '700', fontSize: 16 },
    swatchLabel: { fontSize: 11, color: colors.text, textAlign: 'center' },
    closeBtn: { marginTop: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 14 },
  });
}
