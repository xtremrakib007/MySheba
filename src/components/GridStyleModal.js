import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import AppModalHeader from './AppModalHeader';

// Settings > "Grid Style" row. Lets the user pick how the app's icon
// grids (Quick Services, Admin/Dealer Features, More, Marketplace hub)
// are drawn - see ServiceGrid.js/FeatureGrid.js/MoreFeaturesScreen.js/
// MarketplaceHubScreen.js, which all read ThemeContext's `gridStyle` and
// branch their tile rendering on it. Each row here shows a small live
// preview of that style using the app's own brand colors.
function BorderedPreview({ colors, isDark }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.previewTile}>
      <LinearGradient
        colors={isDark ? [colors.card, colors.card] : ['#FFFFFF', '#EAF3FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.previewBordered}
      >
        <Text style={styles.previewIcon}>📱</Text>
      </LinearGradient>
    </View>
  );
}

function ClassicPreview({ colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.previewTile}>
      <View style={[styles.previewClassic, { backgroundColor: '#E8F5E9' }]}>
        <View style={[styles.previewAccentBar, { backgroundColor: colors.primary }]} />
        <View style={[styles.previewIconWrap, { backgroundColor: colors.card }]}>
          <Text style={styles.previewIconSm}>📱</Text>
        </View>
      </View>
    </View>
  );
}

function SoftPreview({ colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.previewTile}>
      <View style={[styles.previewSoft, { backgroundColor: colors.card }]}>
        <View style={[styles.previewBadgeSoft, { backgroundColor: '#E8F5E9' }]}>
          <Text style={styles.previewIconSm}>📱</Text>
        </View>
      </View>
    </View>
  );
}

function MinimalPreview({ colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.previewTile}>
      <View style={styles.previewMinimal}>
        <View style={[styles.previewBadgeMinimal, { backgroundColor: '#E8F5E9' }]}>
          <Text style={styles.previewIconSm}>📱</Text>
        </View>
      </View>
    </View>
  );
}

const PREVIEWS = {
  bordered: BorderedPreview,
  classic: ClassicPreview,
  soft: SoftPreview,
  minimal: MinimalPreview,
};

export default function GridStyleModal({ visible, selected, onSelect, onClose }) {
  const {
    colors,
    isDark,
    gridStyles,
    gridStyleList,
  } = useTheme();

  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Grid Style</Text>
            <Text style={styles.subtitle}>Choose how icon grids look across the app.</Text>

            <View style={styles.optionList}>
              {gridStyleList.map((key) => {
                const isSelected = key === selected;
                const Preview = PREVIEWS[key] || BorderedPreview;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.optionRow, isSelected && { borderColor: colors.primary, backgroundColor: `${colors.primary}14` }]}
                    onPress={() => onSelect(key)}
                    activeOpacity={0.7}
                  >
                    <Preview colors={colors} isDark={isDark} />
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && { color: colors.primary, fontWeight: '700' }]}>
                        {gridStyles[key]?.label}
                      </Text>
                    </View>
                    {isSelected && <Text style={styles.check}>✓</Text>}
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
    optionList: { gap: 10 },
    optionRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 10, paddingHorizontal: 10,
      borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border,
    },
    optionTextWrap: { flex: 1 },
    optionLabel: { fontSize: 13, color: colors.text },
    check: { color: colors.primary, fontWeight: '700', fontSize: 16 },
    previewTile: { width: 44, height: 44 },
    previewBordered: {
      flex: 1, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.secondary,
      alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    previewIcon: { fontSize: 18 },
    previewClassic: {
      flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    previewAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
    previewIconWrap: { width: 24, height: 24, borderRadius: radius.sm || 6, alignItems: 'center', justifyContent: 'center' },
    previewIconSm: { fontSize: 12 },
    previewSoft: {
      flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      shadowColor: '#0B2447', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    previewBadgeSoft: { width: 26, height: 26, borderRadius: radius.sm || 6, alignItems: 'center', justifyContent: 'center' },
    previewMinimal: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    previewBadgeMinimal: { width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
    closeBtn: { marginTop: 20, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 14 },
  });
}
