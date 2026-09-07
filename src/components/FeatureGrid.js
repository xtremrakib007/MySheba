import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Same fixed-pixel-width grid approach as the customer ServiceGrid, so
// admin/dealer feature tiles line up identically across screen sizes.
// GRID_PADDING/COLUMN_GAP must stay in sync with the styles below.
const GRID_PADDING = 10;
const COLUMN_GAP = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;

function itemWidth(numColumns) {
  return (CONTAINER_WIDTH - COLUMN_GAP * (numColumns - 1)) / numColumns;
}

// items: [{ key, icon, bg, name, badge (optional number/string) }]
// activeKey: currently selected item key (highlights the tile)
// onPress(key): called when a tile is tapped
export default function FeatureGrid({ title, items, activeKey, onPress, numColumns = 4 }) {
  const {
    colors, isDark, gridStyle
  } = useTheme();

  const styles = createStyles(colors);
  const width = itemWidth(numColumns);

  return (
    <View>
      {!!title && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      )}
      <View style={styles.grid}>
        {items.map((it) => {
          const active = it.key === activeKey;
          if (gridStyle === 'classic') {
            return (
              <TouchableOpacity
                key={it.key}
                style={[styles.itemClassic, { width }, active && styles.itemClassicActive]}
                activeOpacity={0.7}
                onPress={() => onPress(it.key)}
              >
                {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{it.badge}</Text>
                  </View>
                )}
                <View style={[styles.iconWrap, { backgroundColor: it.bg || '#E3F2FD' }]}>
                  <Text style={styles.iconTextClassic}>{it.icon}</Text>
                </View>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>{it.name}</Text>
              </TouchableOpacity>
            );
          }
          if (gridStyle === 'soft') {
            return (
              <TouchableOpacity
                key={it.key}
                style={[styles.itemSoft, { width, backgroundColor: colors.card }, active && styles.itemSoftActive]}
                activeOpacity={0.7}
                onPress={() => onPress(it.key)}
              >
                {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{it.badge}</Text>
                  </View>
                )}
                <View style={[styles.badgeWrapSoft, { backgroundColor: it.bg || '#E3F2FD' }]}>
                  <Text style={styles.iconTextSoft}>{it.icon}</Text>
                </View>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>{it.name}</Text>
              </TouchableOpacity>
            );
          }
          if (gridStyle === 'minimal') {
            return (
              <TouchableOpacity
                key={it.key}
                style={[styles.itemMinimal, { width }]}
                activeOpacity={0.6}
                onPress={() => onPress(it.key)}
              >
                {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{it.badge}</Text>
                  </View>
                )}
                <View style={[styles.badgeWrapMinimal, { backgroundColor: it.bg || '#E3F2FD' }, active && styles.badgeWrapMinimalActive]}>
                  <Text style={styles.iconTextSoft}>{it.icon}</Text>
                </View>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>{it.name}</Text>
              </TouchableOpacity>
            );
          }
          return (
            <TouchableOpacity
              key={it.key}
              style={[styles.item, { width }, active && styles.itemActive]}
              activeOpacity={0.7}
              onPress={() => onPress(it.key)}
            >
              {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{it.badge}</Text>
                </View>
              )}
              <LinearGradient
                colors={isDark ? [colors.card, colors.card] : ['#FFFFFF', '#EAF3FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.itemGradient}
              >
                <Text style={styles.iconText}>{it.icon}</Text>
                <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>{it.name}</Text>
              </LinearGradient>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    sectionHead: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '600' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP },
    item: {
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1.5,
      borderColor: colors.secondary,
      marginBottom: 8,
    },
    itemActive: { borderColor: colors.primary, borderWidth: 2 },
    itemGradient: {
      paddingVertical: 16,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconText: { fontSize: 30, marginBottom: 8 },
    name: { fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.text },
    nameActive: { color: colors.primary },
    // Classic style (previous design) - plain card background, colored
    // icon circle, thin neutral border. Selectable via Settings > Grid Style.
    itemClassic: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      paddingVertical: 14,
      paddingHorizontal: 4,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E8E8E8',
      marginBottom: 8,
    },
    itemClassicActive: { borderColor: colors.primary, backgroundColor: '#EAF2FE' },
    iconWrap: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    iconTextClassic: { fontSize: 20 },
    // Soft style - flat colored icon badge on a plain shadowed card, no
    // border and no accent bar.
    itemSoft: {
      borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 4,
      alignItems: 'center', marginBottom: 8,
      shadowColor: '#0B2447', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    itemSoftActive: { shadowOpacity: 0.14, elevation: 3 },
    badgeWrapSoft: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    iconTextSoft: { fontSize: 21 },
    // Minimal style - no card, just a tinted icon badge and label floating
    // on the screen background.
    itemMinimal: { alignItems: 'center', marginBottom: 8, paddingVertical: 4 },
    badgeWrapMinimal: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    badgeWrapMinimalActive: { borderWidth: 2, borderColor: colors.primary },
    badge: {
      position: 'absolute',
      top: 6,
      right: 6,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
      zIndex: 1,
    },
    badgeText: { color: 'white', fontSize: 9, fontWeight: '700' },
  });
}
