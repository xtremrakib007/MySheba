import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const GRID_PADDING = 10;
const COLUMN_GAP = 8;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;
function itemWidth(numColumns) { return (CONTAINER_WIDTH - COLUMN_GAP * (numColumns - 1)) / numColumns; }

export default function FeatureGrid({ title, items, activeKey, onPress, numColumns = 4 }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const width = itemWidth(numColumns);
  return (
    <View>
      {!!title && <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{title}</Text></View>}
      <View style={styles.grid}>
        {items.map((it) => {
          const active = it.key === activeKey;
          return (
            <TouchableOpacity
              key={it.key}
              style={[styles.item, { width, backgroundColor: colors.card }, active && styles.itemActive]}
              activeOpacity={0.7}
              onPress={() => onPress(it.key)}
            >
              {it.badge !== undefined && it.badge !== null && it.badge !== '' && (
                <View style={styles.badge}><Text style={styles.badgeText}>{String(it.badge)}</Text></View>
              )}
              <View style={[styles.iconWrap, { backgroundColor: it.bg || '#E3F2FD' }]}>
                <Text style={styles.iconText}>{it.icon}</Text>
              </View>
              <Text style={[styles.name, active && styles.nameActive]} numberOfLines={2}>{String(it.name || '')}</Text>
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
    sectionTitle: { fontSize: 15, fontWeight: '600', color: colors.navy },
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP },
    item: {
      height: 92,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 10,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    itemActive: { borderColor: colors.primary, borderWidth: 2 },
    iconWrap: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    iconText: { fontSize: 27 },
    name: { fontSize: 11, fontWeight: '700', textAlign: 'center', color: colors.text, lineHeight: 14 },
    nameActive: { color: colors.primary },
    badge: { position: 'absolute', top: 5, right: 5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, zIndex: 2 },
    badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  });
}
