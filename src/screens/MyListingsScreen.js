import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as marketplaceService from '../firebase/marketplaceService';
import { isFeatured } from '../firebase/marketplaceService';

function getStatusStyle(colors) {
  return {
    active: { label: 'Active', color: colors.success, bg: '#E8F5E9' },
    sold: { label: 'Sold', color: colors.textSecondary, bg: '#F1F3F4' },
    hidden: { label: 'Under Review', color: colors.error, bg: '#FDECEA' },
  };
}

function Row({ image, title, price, badge, featured, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={onPress}>
      {image ? (
        <Image source={{ uri: image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}><Text style={{ fontSize: 20 }}>📦</Text></View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.cardPrice}>MYR {Number(price || 0).toFixed(2)}</Text>
      </View>
      <View style={styles.badgeCol}>
        {featured && (
          <View style={[styles.badge, { backgroundColor: '#FFF8E1' }]}>
            <Text style={[styles.badgeText, { color: '#B45309' }]}>⭐ Featured</Text>
          </View>
        )}
        {badge && (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function MyListingsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const STATUS_STYLE = getStatusStyle(colors);
  const styles = createStyles(colors);
  const { goBackOrHome, openListingDetail, authUser, setScreen } = useApp();
  const [tab, setTab] = useState('mine'); // mine | saved
  const [mine, setMine] = useState([]);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = marketplaceService.subscribeMyListings(authUser.uid, (list) => {
      setMine(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) return undefined;
    return marketplaceService.subscribeMySaved(authUser.uid, setSaved, () => {});
  }, [authUser]);

  const data = tab === 'mine' ? mine : saved;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Marketplace</Text>
        <TouchableOpacity style={styles.reviewsLink} onPress={() => setScreen('marketplaceMyReviews')}>
          <Text style={styles.reviewsLinkText}>⭐ My Reviews</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'mine' && styles.tabBtnActive]} onPress={() => setTab('mine')}>
          <Text style={[styles.tabText, tab === 'mine' && styles.tabTextActive]}>My Listings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'saved' && styles.tabBtnActive]} onPress={() => setTab('saved')}>
          <Text style={[styles.tabText, tab === 'saved' && styles.tabTextActive]}>Saved Items</Text>
        </TouchableOpacity>
      </View>

      {loading && tab === 'mine' ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) =>
            tab === 'mine' ? (
              <Row
                image={item.images && item.images[0]}
                title={item.title}
                price={item.price}
                badge={STATUS_STYLE[item.status] || null}
                featured={isFeatured(item)}
                onPress={() => openListingDetail(item.id)}
              />
            ) : (
              <Row
                image={item.image}
                title={item.title}
                price={item.price}
                onPress={() => openListingDetail(item.listingId)}
              />
            )
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>{tab === 'mine' ? '🛍️' : '⭐'}</Text>
              <Text style={styles.emptyText}>
                {tab === 'mine' ? "You haven't listed anything yet." : "You haven't saved any items yet."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    reviewsLink: { paddingVertical: 4, paddingHorizontal: 8 },
    reviewsLinkText: { color: 'white', fontSize: 12, fontWeight: '600' },
    tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10, marginBottom: 10, gap: 10 },
    thumb: { width: 54, height: 54, borderRadius: radius.sm, backgroundColor: '#F1F3F4' },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    cardPrice: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
    badgeCol: { gap: 4, alignItems: 'flex-end' },
    badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm },
    badgeText: { fontSize: 10, fontWeight: '700' },
  });
}
