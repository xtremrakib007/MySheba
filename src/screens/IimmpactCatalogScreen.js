import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { radius, tileGrid } from '../theme/theme';
import { Tile, useServiceAction } from '../components/ServiceGrid';
import { CUSTOMER_SERVICES } from '../components/serviceTiles';
import { catalogCategories, catalogTileKey, nativeTileFor } from '../components/iimmpactTiles';
import { useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';

const NATIVE_KEYS = CUSTOMER_SERVICES.map((tile) => tile.key);

export default function IimmpactCatalogScreen() {
  const { goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const handlePress = useServiceAction();
  const { catalog, loading, refreshing, error: loadError } = useIimmpactCatalog();
  // A failed refresh is not an error while a saved catalogue is on screen.
  const error = catalog ? '' : loadError;
  const styles = createStyles(colors);

  const categories = useMemo(() => catalogCategories(catalog), [catalog]);

  // Every category gets a real product/form screen. A category a native tile
  // already sells opens that tile, so Mobile Prepaid here is the same Mobile
  // Recharge flow as on the home screen rather than a second way to buy it.
  const openCategory = (category) => {
    const nativeKey = nativeTileFor(category, NATIVE_KEYS);
    const native = nativeKey && CUSTOMER_SERVICES.find((tile) => tile.key === nativeKey);
    if (native) return handlePress(native);
    return handlePress({ key: catalogTileKey(category.name), kind: 'iimmpactProducts', iimmpactCategory: category.name, name: category.name });
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>MySheba Marketplace</Text>
          <Text style={styles.headerSub}>MySheba catalogue</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Marketplace</Text>
          <Text style={styles.subtitle}>
            Browse every category in the MySheba catalogue. Purchases are submitted only after you review and confirm them.
          </Text>
          {!!catalog?.last_updated && <Text style={styles.updated}>Catalog updated: {String(catalog.last_updated)}</Text>}
          {refreshing && <Text style={styles.updated}>Refreshing catalogue in background…</Text>}
        </View>

        {loading && (
          <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.info}>Loading MySheba catalogue…</Text></View>
        )}
        {!!error && !loading && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && (
          <View style={styles.grid}>
            {categories.map((category) => (
              <Tile
                key={category.phrase}
                s={{
                  key: catalogTileKey(category.name),
                  name: category.name,
                  icon: 'more',
                  imageUrl: category.imageUrl,
                }}
                onPress={() => openCategory(category)}
              />
            ))}
          </View>
        )}

        {!loading && !error && !categories.length && (
          <Text style={styles.empty}>There are no categories in the MySheba catalogue right now.</Text>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen:{flex:1,backgroundColor:colors.bg},
    header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},
    back:{padding:4},backText:{color:'#fff',fontSize:22},
    headerCopy:{flex:1},headerTitle:{color:'#fff',fontSize:17,fontWeight:'800'},headerSub:{color:'#ffffffcc',fontSize:10,marginTop:2},
    content:{padding:14,paddingBottom:40},
    hero:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:16,marginBottom:14},
    title:{fontSize:21,fontWeight:'900',color:colors.text},subtitle:{fontSize:12,lineHeight:18,color:colors.textSecondary,marginTop:6},
    updated:{fontSize:9,color:colors.textSecondary,marginTop:8},
    state:{alignItems:'center',paddingVertical:22,gap:8},info:{color:colors.textSecondary,fontSize:11},
    error:{padding:12,color:colors.danger || colors.text},
    grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start',columnGap:tileGrid.gap},
    empty:{color:colors.textSecondary,padding:16,textAlign:'center'},
  });
}
