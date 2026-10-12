import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { radius, tileGrid } from '../theme/theme';
import { Tile, useServiceAction } from '../components/ServiceGrid';
import { providerGroup, SUCCESS_TOPUP } from '../components/providerGrids';
import { useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { getOperatorBrand } from '../data/operatorBrand';

// One provider group opened from the home screen: IIMMPACT's categories in
// that group, or a Success TopUp service's operators and bill types, each as
// the same native tile the rest of the app uses.
export default function ProviderGroupScreen({ provider, groupKey }) {
  const { goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const handlePress = useServiceAction();
  const isIimmpact = provider !== SUCCESS_TOPUP;
  const { catalog, loading, error } = useIimmpactCatalog({ enabled: isIimmpact });
  const styles = makeStyles(colors);

  const group = useMemo(
    () => providerGroup({ provider, groupKey, catalog }),
    [provider, groupKey, catalog],
  );
  const tiles = (group?.tiles || []).map((tile) => {
    if (!tile.operator) return tile;
    const brand = getOperatorBrand(tile.operator);
    return brand.logo ? { ...tile, logo: brand.logo } : tile;
  });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back} accessibilityRole="button" accessibilityLabel="Back"><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{group?.name || 'Services'}</Text>
          <Text style={styles.headerSub}>{isIimmpact ? 'Choose a category' : 'Choose an operator or bill'}</Text>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>
        {isIimmpact && loading && !catalog && (
          <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.info}>Loading MySheba catalogue…</Text></View>
        )}
        {!!group && (
          <View style={styles.gridCanvas}>
            <View style={styles.grid}>
              {tiles.map((tile) => <Tile key={tile.key} s={tile} onPress={() => handlePress(tile)} />)}
            </View>
          </View>
        )}
        {!group && !(isIimmpact && loading) && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing to show here right now</Text>
            <Text style={styles.info}>{error || 'This group has no products available at the moment. Please try again later.'}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, overflow: 'hidden' },
    back: { padding: 4 },
    backText: { color: '#fff', fontSize: 22 },
    headerCopy: { flex: 1 },
    headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
    headerSub: { color: '#ffffffcc', fontSize: 10, marginTop: 2 },
    content: { padding: 14, paddingBottom: 40 },
    gridCanvas: { marginHorizontal: 4, padding: 10, borderRadius: 18, backgroundColor: c.canvasBg || c.surface },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', columnGap: tileGrid.gap },
    state: { alignItems: 'center', paddingVertical: 22, gap: 8 },
    info: { color: c.textSecondary, fontSize: 11, lineHeight: 17 },
    emptyCard: { padding: 16, backgroundColor: c.card, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, gap: 10 },
    emptyTitle: { fontSize: 15, fontWeight: '900', color: c.text },
  });
}
