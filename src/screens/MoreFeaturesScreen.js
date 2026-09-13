import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { MORE_SERVICES, useServiceAction, Tile, GRID_PADDING, COLUMN_GAP } from '../components/ServiceGrid';

// This screen's grid reuses ServiceGrid's own Tile component (and its
// GRID_PADDING/COLUMN_GAP) instead of a separate copy, so every role sees
// the exact same tile look - bordered *and* classic - as the home screen,
// with no risk of the two drifting apart again.
export default function MoreFeaturesScreen() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, webViewBusy } = useApp();
  const handlePress = useServiceAction();

  // Game Points and Gifts are no longer customer-facing features.
  const customerMoreServices = MORE_SERVICES.filter(
    (s) => s.kind !== 'gamePoints' && s.kind !== 'gamePointsGift'
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <TouchableOpacity style={styles.closeBtn} onPress={goBackOrHome} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}>
        <View style={styles.grid}>
          {customerMoreServices.map((s) => (
            <Tile
              key={s.key}
              s={s}
              disabled={s.kind === 'webview' && webViewBusy}
              onPress={() => handlePress(s)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.card },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingTop: 22, paddingBottom: 22, paddingHorizontal: 20,
      backgroundColor: colors.card,
    },
    headerTitle: { color: colors.navy, fontWeight: '800', fontSize: 26 },
    closeBtn: {
      position: 'absolute', right: 20, top: 18,
      width: 32, height: 32, borderRadius: radius.pill,
      backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center',
    },
    closeText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    // Uses ServiceGrid's own GRID_PADDING/COLUMN_GAP (not local values) so
    // the tiles it renders via the shared Tile component line up exactly
    // with the sizing Tile computes internally.
    grid: {
      flexDirection: 'row', flexWrap: 'wrap',
      paddingHorizontal: GRID_PADDING, gap: COLUMN_GAP,
    },
  });
}
