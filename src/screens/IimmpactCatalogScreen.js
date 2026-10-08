import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as apiProviderService from '../firebase/apiProviderService';
import { radius } from '../theme/theme';

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
            {categories.map((category) => {
              const info = categoryInfo(category);
              return (
                <TouchableOpacity key={category.id || category.group + ':' + category.name} style={styles.tile} onPress={() => openCategory(category)} activeOpacity={0.82}>
                  {info.imageUrl ? (
                    <Image source={{uri: info.imageUrl}} style={styles.logo} resizeMode="contain" />
                  ) : (
                    <View style={styles.logoFallback}><Text style={styles.logoText}>I</Text></View>
                  )}
                  <Text style={styles.category} numberOfLines={2}>{category.name}</Text>
                  <Text style={styles.group} numberOfLines={1}>{category.group}</Text>
                  <Text style={styles.meta}>{info.count} product{info.count === 1 ? '' : 's'}</Text>
                  <View style={styles.open}><Text style={styles.openText}>Browse & Buy</Text></View>
                </TouchableOpacity>
              );
            })}
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
    grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',rowGap:10},
    tile:{width:'31.5%',minHeight:170,backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:10,alignItems:'center'},
    logo:{width:48,height:42,marginBottom:6},logoFallback:{width:42,height:42,borderRadius:21,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginBottom:6},
    logoText:{color:colors.onPrimary,fontWeight:'900',fontSize:20},
    category:{fontSize:11.5,fontWeight:'900',textAlign:'center',color:colors.text,minHeight:30},
    group:{fontSize:9,color:colors.textSecondary,marginTop:2,maxWidth:'100%'},
    meta:{fontSize:9,color:colors.textSecondary,marginTop:5},
    open:{marginTop:'auto',backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:7,paddingHorizontal:9},
    openText:{color:colors.onPrimary,fontSize:9.5,fontWeight:'900'},empty:{color:colors.textSecondary,padding:16,textAlign:'center'},
  });
}
