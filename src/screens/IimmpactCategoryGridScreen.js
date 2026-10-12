import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { radius, tileGrid } from '../theme/theme';
import { Tile } from '../components/ServiceGrid';

const norm = (value) => String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

function collectGroupCategories(groups, products) {
  return (Array.isArray(groups) ? groups : []).flatMap((group) =>
    (Array.isArray(group?.categories) ? group.categories : []).map((category) => {
      const codes = Array.isArray(category?.product_codes) ? category.product_codes.map(String) : [];
      const active = codes.map((code) => products?.[code]).filter((p) => p && p.is_active !== false);
      return {
        id: String(category?.id || category?.name || ''),
        name: String(category?.name || group?.name || 'Other'),
        group: String(group?.name || 'Marketplace'),
        codes,
        imageUrl: category?.icon_url || group?.icon_url || active[0]?.image_url || '',
        count: active.length,
      };
    }).filter((category) => category.count > 0)
  );
}

export default function IimmpactCategoryGridScreen({ category }) {
  let title = String(category || '').trim();
  try { title = decodeURIComponent(title); } catch (_) {}
  const { goBackOrHome, setScreen } = useApp();
  const { colors, brandGradient } = useTheme();
  const { catalog, loading, error: loadError } = useIimmpactCatalog();
  const error = catalog ? '' : loadError;
  const styles = makeStyles(colors);

  const products = catalog?.products || {};
  const groups = Array.isArray(catalog?.tree?.groups) ? catalog.tree.groups : [];
  const categories = useMemo(() => collectGroupCategories(groups, products), [catalog]);
  const subcategories = useMemo(() => {
    const wanted = norm(title);
    if (!wanted) return [];
    const exactGroup = categories.filter((item) => norm(item.group) === wanted);
    if (exactGroup.length) return exactGroup;
    const exactName = categories.filter((item) => norm(item.name) === wanted);
    if (exactName.length) return exactName;
    const groupMatches = categories.filter((item) => norm(item.group) === wanted || norm(item.group).includes(wanted) || wanted.includes(norm(item.group)));
    if (groupMatches.length) return groupMatches;
    // Some provider catalogues publish the tile's label as a category rather
    // than as a parent group. In that case the matching category is still
    // presented as a native tile and opens its product grid.
    return categories.filter((item) => norm(item.name) === wanted || norm(item.name).includes(wanted) || wanted.includes(norm(item.name)));
  }, [categories, title]);

  const openSubcategory = (item) => setScreen('iimmpactCategory:' + encodeURIComponent(item.name));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>{title || 'MySheba Services'}</Text>
          <Text style={styles.headerSub}>Choose a service</Text>
        </View>
      </LinearGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Select a subcategory below.</Text>
        </View>
        {loading && <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.info}>Loading service subcategories…</Text></View>}
        {!!error && !loading && <Text style={styles.info}>{error}</Text>}
        {!loading && subcategories.length > 0 && (
          <View style={styles.grid}>
            {subcategories.map((item) => (
              <Tile key={item.id || item.group + ':' + item.name} s={{
                key: 'iimmpact_sub_' + norm(item.name).replace(/ /g, '_'),
                name: item.name,
                icon: 'more',
                imageUrl: item.imageUrl,
              }} onPress={() => openSubcategory(item)} />
            ))}
          </View>
        )}
        {!loading && !subcategories.length && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No matching subcategories found</Text>
            <Text style={styles.info}>There are no products under this tile right now. Open the full catalogue to browse every category.</Text>
            <TouchableOpacity style={styles.button} onPress={() => setScreen('iimmpactCatalog')}><Text style={styles.buttonText}>Open full catalogue</Text></TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function makeStyles(c) {
  return StyleSheet.create({
    screen:{flex:1,backgroundColor:c.bg},
    header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},
    back:{padding:4},backText:{color:'#fff',fontSize:22},
    headerCopy:{flex:1},headerTitle:{color:'#fff',fontSize:17,fontWeight:'800'},headerSub:{color:'#ffffffcc',fontSize:10,marginTop:2},
    content:{padding:14,paddingBottom:40},
    hero:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:radius.lg,padding:16,marginBottom:14},
    title:{fontSize:20,fontWeight:'900',color:c.text},subtitle:{fontSize:12,lineHeight:18,color:c.textSecondary,marginTop:6},
    state:{alignItems:'center',paddingVertical:22,gap:8},info:{color:c.textSecondary,fontSize:11,lineHeight:17},
    grid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start',columnGap:tileGrid.gap,rowGap:10},
    emptyCard:{padding:16,backgroundColor:c.card,borderRadius:radius.lg,borderWidth:1,borderColor:c.border,gap:10},
    emptyTitle:{fontSize:15,fontWeight:'900',color:c.text},
    button:{backgroundColor:c.primary,borderRadius:radius.md,padding:12,alignItems:'center'},
    buttonText:{color:c.onPrimary,fontWeight:'800'},
  });
}
