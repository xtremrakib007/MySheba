import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as apiProviderService from '../firebase/apiProviderService';
import { radius, tileGrid } from '../theme/theme';
import { Tile } from '../components/ServiceGrid';

function keyFor(value) {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
}

function flattenCategories(groups) {
  const out = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const category of Array.isArray(group?.categories) ? group.categories : []) {
      const codes = Array.isArray(category?.product_codes) ? category.product_codes.map(String) : [];
      if (!codes.length) continue;
      out.push({
        id: String(category?.id || ''),
        key: keyFor(category?.name),
        name: String(category?.name || group?.name || 'Other'),
        group: String(group?.name || 'Marketplace'),
        iconUrl: category?.icon_url || group?.icon_url || '',
        productCodes: codes,
      });
    }
  }
  return out;
}

export default function IimmpactCatalogScreen() {
  const { goBackOrHome, setScreen } = useApp();
  const { colors, brandGradient } = useTheme();
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const styles = createStyles(colors);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await apiProviderService.getIimmpactFullCatalogForUser('MY');
        if (alive) setCatalog(data || {});
      } catch (e) {
        if (alive) setError(e?.message || 'IIMMPACT Marketplace is unavailable.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const products = catalog?.products || {};
  const categories = useMemo(() => flattenCategories(catalog?.tree?.groups), [catalog]);

  const categoryInfo = (category) => {
    const rows = category.productCodes
      .map((code) => products[String(code)])
      .filter((product) => product && product.is_active !== false);
    const first = rows[0];
    return {
      count: rows.length,
      imageUrl: category.iconUrl || first?.image_url || '',
      processing: [...new Set(rows.map((p) => String(p.processing_time || '').trim()).filter(Boolean))],
    };
  };

  const openCategory = (category) => {
    // Every category gets a real product/form screen. Existing homepage tiles
    // continue to use their native MySheba flows; Marketplace is the complete
    // IIMMPACT catalogue surface and therefore must not silently downgrade to a
    // read-only product list.
    setScreen('iimmpactCategory:' + encodeURIComponent(category.name));
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>MySheba Marketplace</Text>
          <Text style={styles.headerSub}>IIMMPACT full catalogue</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Marketplace</Text>
          <Text style={styles.subtitle}>
            Choose a category to browse the live IIMMPACT products. Every category opens a functional product form powered by the current catalog and Options API.
          </Text>
          {!!catalog?.last_updated && <Text style={styles.updated}>Catalog updated: {String(catalog.last_updated)}</Text>}
        </View>

        {loading && (
          <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.info}>Loading the live IIMMPACT catalogue…</Text></View>
        )}
        {!!error && !loading && <Text style={styles.error}>{error}</Text>}

        {!loading && !error && (
          <View style={styles.grid}>
            {categories.map((category) => (
              <Tile
                key={category.id || category.group + ':' + category.name}
                s={{
                  key: 'marketplace_' + String(category.key || category.id || 'category').toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
                  name: category.name,
                  icon: 'more',
                  imageUrl: categoryInfo(category).imageUrl,
                }}
                onPress={() => openCategory(category)}
              />
            ))}
          </View>
        )}

        {!loading && !error && !categories.length && (
          <Text style={styles.empty}>IIMMPACT returned no active marketplace categories for Malaysia.</Text>
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
