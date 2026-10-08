import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as apiProviderService from '../firebase/apiProviderService';
import { radius } from '../theme/theme';

const SERVICE_BY_CATEGORY = {
  recharge: 'recharge', telecom: 'recharge', 'mobile reload': 'recharge', 'mobile pin': 'rechargePin',
  internet: 'internet', data: 'internet', entertainment: 'entertainment', gaming: 'entertainment',
  electricity: 'billpayment', water: 'billpayment', 'water bill': 'billpayment',
  bill: 'billpayment', 'bill payment': 'billpayment', jompay: 'billpayment',
  esim: 'esim',
};

function keyFor(v) { return String(v || '').trim().toLowerCase().replace(/&/g, 'and'); }
function flattenGroups(groups, out = []) {
  for (const group of Array.isArray(groups) ? groups : []) {
    const groupName = group?.name || '';
    for (const category of Array.isArray(group?.categories) ? group.categories : []) {
      out.push({
        key: keyFor(category?.name),
        name: category?.name || groupName || 'Other',
        group: groupName,
        productCodes: Array.isArray(category?.product_codes) ? category.product_codes.map(String) : [],
      });
    }
  }
  return out;
}

export default function IimmpactCatalogScreen() {
  const { goBackOrHome, startService } = useApp();
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
        if (alive) setError(e?.message || 'IIMMPACT catalog is unavailable.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const products = catalog?.products || {};
  const categories = useMemo(() => flattenGroups(catalog?.tree?.groups), [catalog]);
  const productByCode = (code) => products[String(code)] || null;

  const openCategory = (category) => {
    const target = SERVICE_BY_CATEGORY[category.key] || SERVICE_BY_CATEGORY[category.name.toLowerCase()];
    if (target === 'rechargePin') return startService('rechargePin');
    if (target) return startService(target);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>IIMMPACT Marketplace</Text>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>Live IIMMPACT Catalog</Text>
          <Text style={styles.subtitle}>Categories and products are read from the provider catalog. MySheba does not hard-code the available brands or denominations.</Text>
        </View>
        {loading && <Text style={styles.info}>Loading live catalog…</Text>}
        {!!error && !loading && <Text style={styles.error}>{error}</Text>}
        {!loading && !error && categories.map((category) => {
          const target = SERVICE_BY_CATEGORY[category.key] || SERVICE_BY_CATEGORY[category.name.toLowerCase()];
          const activeProducts = category.productCodes.map(productByCode).filter(p => p && p.is_active !== false);
          return (
            <View key={category.group + ':' + category.name} style={styles.section}>
              <View style={styles.sectionHead}>
                <View><Text style={styles.category}>{category.name}</Text><Text style={styles.group}>{category.group}</Text></View>
                {!!target && <TouchableOpacity onPress={() => openCategory(category)} style={styles.open}><Text style={styles.openText}>Open</Text></TouchableOpacity>}
              </View>
              <View style={styles.grid}>
                {activeProducts.map((p) => (
                  <View key={p.code} style={styles.product}>
                    {p.image_url ? <Image source={{uri:p.image_url}} style={styles.logo} resizeMode="contain" /> : <View style={styles.badge}><Text style={styles.badgeText}>I</Text></View>}
                    <Text style={styles.productName} numberOfLines={3}>{p.name || p.code}</Text>
                    <Text style={styles.code}>{p.code}</Text>
                  </View>
                ))}
              </View>
              {!activeProducts.length && <Text style={styles.empty}>No active products returned.</Text>}
            </View>
          );
        })}
        {!loading && !error && !categories.length && <Text style={styles.empty}>The configured IIMMPACT account returned no catalog categories for this service/country.</Text>}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},back:{padding:4},backText:{color:'#fff',fontSize:22},headerTitle:{color:'#fff',fontSize:17,fontWeight:'800'},
  content:{padding:14,paddingBottom:40},hero:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:16,marginBottom:14},title:{fontSize:21,fontWeight:'800',color:colors.text},subtitle:{fontSize:12,lineHeight:18,color:colors.textSecondary,marginTop:6},
  section:{backgroundColor:colors.card,borderWidth:1,borderColor:colors.border,borderRadius:radius.lg,padding:12,marginBottom:12},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:10},category:{fontSize:15,fontWeight:'800',color:colors.text},group:{fontSize:10,color:colors.textSecondary,marginTop:2},open:{backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:7,paddingHorizontal:13},openText:{color:colors.onPrimary,fontWeight:'800',fontSize:11},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:8},product:{width:'31%',minHeight:88,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,alignItems:'center',justifyContent:'center',padding:7},logo:{width:42,height:32,marginBottom:5},badge:{width:32,height:32,borderRadius:16,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center',marginBottom:5},badgeText:{color:colors.onPrimary,fontWeight:'900'},productName:{fontSize:9.5,fontWeight:'700',textAlign:'center',color:colors.text},code:{fontSize:8,color:colors.textSecondary,marginTop:3},info:{padding:12,color:colors.textSecondary},error:{padding:12,color:colors.danger || colors.text},empty:{fontSize:11,color:colors.textSecondary,paddingVertical:8}
});}
