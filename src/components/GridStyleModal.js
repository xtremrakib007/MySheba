import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import AppModalHeader from './AppModalHeader';

const PREVIEW_META = {
  bordered: { icon: '▣', accent: '#1A73E8' },
  classic: { icon: '▤', accent: '#43A047' },
  soft: { icon: '●', accent: '#00A99D' },
  minimal: { icon: '○', accent: '#7C4DFF' },
  glass: { icon: '◈', accent: '#00C2FF' },
  threeD: { icon: '◆', accent: '#FF9F43' },
  gradient: { icon: '✦', accent: '#7C4DFF' },
  neon: { icon: '⚡', accent: '#26D0C4' },
  bento: { icon: '▦', accent: '#F5576C' },
  adaptive: { icon: '★', accent: '#0FB981' },
};

export default function GridStyleModal({ visible, selected, onSelect, onClose }) {
  const { colors, isDark, gridStyles, gridStyleList } = useTheme();
  const styles = createStyles(colors, isDark);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Grid Style</Text>
            <Text style={styles.subtitle}>Choose any design. Your services and actions stay exactly the same.</Text>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.optionList} showsVerticalScrollIndicator={false}>
              {gridStyleList.map((key) => {
                const isSelected = key === selected;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.optionRow, isSelected && styles.selectedRow]}
                    onPress={() => onSelect(key)}
                    activeOpacity={0.78}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${gridStyles[key]?.label || key}. ${gridStyles[key]?.description || ''}`}
                  >
                    <Preview keyName={key} colors={colors} isDark={isDark} />
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && styles.selectedLabel]} numberOfLines={1}>
                        {gridStyles[key]?.label || key}
                      </Text>
                      <Text style={styles.description} numberOfLines={2}>
                        {gridStyles[key]?.description || ''}
                      </Text>
                    </View>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {!!isSelected && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Preview({ keyName, colors, isDark }) {
  const meta = PREVIEW_META[keyName] || PREVIEW_META.bordered;
  const darkBg = isDark ? '#11161A' : '#F4F7FA';
  const iconColor = isDark ? '#FFFFFF' : '#111111';
  if (keyName === 'gradient') {
    return <LinearGradient colors={[colors.secondary, colors.primary, colors.gold]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={previewStyle.wrap}><Text style={previewStyle.iconLight}>{meta.icon}</Text></LinearGradient>;
  }
  if (keyName === 'neon') {
    return <View style={[previewStyle.wrap, { backgroundColor: '#080A0C', borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.45, shadowRadius: 6, elevation: 4 }]}><Text style={[previewStyle.iconLight, { color: colors.primary }]}>{meta.icon}</Text></View>;
  }
  if (keyName === 'glass') {
    return <View style={[previewStyle.wrap, { backgroundColor: isDark ? '#FFFFFF12' : '#FFFFFFDD', borderColor: isDark ? '#FFFFFF40' : '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}25` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
  }
  if (keyName === 'threeD') {
    return <View style={[previewStyle.wrap, { backgroundColor: colors.card, borderColor: `${meta.accent}77`, shadowColor: '#000', shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 0, elevation: 4 }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}22` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
  }
  if (keyName === 'bento') {
    return <View style={[previewStyle.bento, { backgroundColor: colors.card, borderColor: `${meta.accent}66` }]}><View style={[previewStyle.bentoBig, { backgroundColor: `${meta.accent}22` }]} /><View style={previewStyle.bentoSmallRow}><View style={[previewStyle.bentoSmall, { backgroundColor: darkBg }]} /><View style={[previewStyle.bentoSmall, { backgroundColor: darkBg }]} /></View></View>;
  }
  if (keyName === 'adaptive') {
    return <View style={[previewStyle.wrap, { backgroundColor: colors.card, borderColor: `${meta.accent}66` }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}30` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View><View style={[previewStyle.adaptiveLine, { backgroundColor: meta.accent }]} /></View>;
  }
  if (keyName === 'classic') {
    return <View style={[previewStyle.wrap, { backgroundColor: colors.card, borderColor: `${meta.accent}55` }]}><View style={[previewStyle.topBar, { backgroundColor: meta.accent }]} /><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}22` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
  }
  if (keyName === 'soft') {
    return <View style={[previewStyle.wrap, { backgroundColor: isDark ? '#101010' : '#F7FAFC', borderColor: 'transparent' }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}20` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
  }
  if (keyName === 'minimal') {
    return <View style={[previewStyle.wrap, { backgroundColor: 'transparent', borderColor: 'transparent' }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}20`, borderRadius: 999 }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
  }
  return <View style={[previewStyle.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[previewStyle.iconCircle, { backgroundColor: `${meta.accent}20` }]}><Text style={[previewStyle.icon, { color: iconColor }]}>{meta.icon}</Text></View></View>;
}

const previewStyle = StyleSheet.create({
  wrap: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  iconCircle: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18, fontWeight: '700' },
  iconLight: { fontSize: 22, color: '#FFFFFF', fontWeight: '800' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  adaptiveLine: { position: 'absolute', left: 7, right: 7, bottom: 6, height: 3, borderRadius: 2 },
  bento: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, padding: 5 },
  bentoBig: { flex: 1, borderRadius: 7, marginBottom: 4 },
  bentoSmallRow: { height: 10, flexDirection: 'row', gap: 4 },
  bentoSmall: { flex: 1, borderRadius: 4 },
});

function createStyles(colors, isDark) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
    box: { backgroundColor: colors.bg, borderRadius: radius.xl, width: '92%', maxWidth: 420, maxHeight: '88%', overflow: 'hidden', borderWidth: 1, borderColor: isDark ? '#FFFFFF22' : '#00000012' },
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
    title: { fontWeight: '800', fontSize: 18, color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 5, marginBottom: 12, lineHeight: 17 },
    scroll: { maxHeight: 500 },
    optionList: { gap: 9, paddingBottom: 2 },
    optionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 9, borderRadius: radius.md, borderWidth: 1, borderColor: isDark ? '#FFFFFF25' : '#00000020', backgroundColor: colors.card },
    selectedRow: { borderColor: colors.primary, backgroundColor: `${colors.primary}14`, borderWidth: 2 },
    optionTextWrap: { flex: 1, minWidth: 0 },
    optionLabel: { fontSize: 13, fontWeight: '750', color: colors.text },
    selectedLabel: { color: colors.primary },
    description: { marginTop: 3, fontSize: 11, lineHeight: 15, color: colors.textSecondary },
    radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
    radioSelected: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    closeBtn: { marginTop: 14, paddingVertical: 13, minHeight: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    closeText: { color: colors.onPrimary, fontWeight: '800', fontSize: 14 },
  });
}
