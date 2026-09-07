import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import StarRow from '../components/StarRow';
import * as marketplaceReviewService from '../firebase/marketplaceReviewService';
import * as serviceReviewService from '../firebase/serviceReviewService';
import * as serviceProviderService from '../firebase/serviceProviderService';
import { fetchProfile } from '../firebase/authService';

// "My Reviews" (My Marketplace) - PRD section 11 / sitemap. Was previously
// a documented gap: reviews only surfaced one-at-a-time on a listing's or
// provider's own detail screen, with no place to see everything a user
// has written or received in one list.
//
// "Given" combines:
//   - marketplaceReviews where reviewerId == me   (Buy & Sell)
//   - serviceReviews where reviewerId == me       (Local Services)
// "Received" combines:
//   - marketplaceReviews where sellerId == me     (sellerId IS my uid)
//   - serviceReviews on any provider profile I own (providerId is an
//     auto-id, not my uid, so this first loads my provider ids via
//     subscribeMyProviders, then subscribes reviews for those ids)
//
// Target/reviewer display names aren't stored on marketplace reviews
// (only reviewerName is), so "Given" rows resolve the seller's name via
// fetchProfile / getProvider, cached in local state so repeat rows for
// the same target don't refetch.

function timeAgo(ts) {
  if (!ts || !ts.seconds) return '';
  const diffMs = Date.now() - ts.seconds * 1000;
  const days = Math.floor(diffMs / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

function ReviewCard({ title, subtitle, rating, comment, when, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.card} activeOpacity={onPress ? 0.75 : 1} onPress={onPress} disabled={!onPress}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text>}
        </View>
        <StarRow value={rating} size={14} />
      </View>
      {!!comment && <Text style={styles.cardComment} numberOfLines={3}>{comment}</Text>}
      <Text style={styles.cardWhen}>{timeAgo(when)}</Text>
    </TouchableOpacity>
  );
}

export default function MyReviewsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, openServiceProviderDetail } = useApp();
  const [tab, setTab] = useState('given'); // given | received
  const [loading, setLoading] = useState(true);

  const [givenMarketplace, setGivenMarketplace] = useState([]);
  const [givenService, setGivenService] = useState([]);
  const [receivedMarketplace, setReceivedMarketplace] = useState([]);
  const [receivedService, setReceivedService] = useState([]);
  const [myProviderIds, setMyProviderIds] = useState([]);
  const [nameCache, setNameCache] = useState({}); // uid/providerId -> display name

  const resolveName = useCallback(async (kind, id) => {
    const cacheKey = `${kind}:${id}`;
    try {
      if (kind === 'seller') {
        const profile = await fetchProfile(id);
        setNameCache((prev) => ({ ...prev, [cacheKey]: profile?.name || 'Seller' }));
      } else {
        const provider = await serviceProviderService.getProvider(id);
        setNameCache((prev) => ({ ...prev, [cacheKey]: provider?.name || 'Service' }));
      }
    } catch {
      setNameCache((prev) => ({ ...prev, [cacheKey]: kind === 'seller' ? 'Seller' : 'Service' }));
    }
  }, []);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub1 = marketplaceReviewService.subscribeMyReviews(authUser.uid, (list) => {
      setGivenMarketplace(list);
      setLoading(false);
    }, () => setLoading(false));
    const unsub2 = serviceReviewService.subscribeMyReviews(authUser.uid, setGivenService, () => {});
    const unsub3 = marketplaceReviewService.subscribeSellerReviews(authUser.uid, setReceivedMarketplace, () => {});
    const unsub4 = serviceProviderService.subscribeMyProviders(authUser.uid, (list) => {
      setMyProviderIds(list.map((p) => p.id));
    }, () => {});
    return () => { unsub1 && unsub1(); unsub2 && unsub2(); unsub3 && unsub3(); unsub4 && unsub4(); };
  }, [authUser]);

  useEffect(() => {
    return serviceReviewService.subscribeReviewsForProviders(myProviderIds, setReceivedService, () => {});
  }, [myProviderIds]);

  // Resolve display names for "given" rows as they arrive, one lookup per
  // unique target - a user reviewing many sellers/providers is still a
  // handful of extra reads, not worth a batched fetch.
  useEffect(() => {
    givenMarketplace.forEach((r) => {
      const key = `seller:${r.sellerId}`;
      if (nameCache[key] === undefined) resolveName('seller', r.sellerId);
    });
    givenService.forEach((r) => {
      const key = `service:${r.providerId}`;
      if (nameCache[key] === undefined) resolveName('service', r.providerId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [givenMarketplace, givenService]);

  const givenData = [
    ...givenMarketplace.map((r) => ({
      id: `m_${r.id}`,
      title: nameCache[`seller:${r.sellerId}`] || 'Loading…',
      subtitle: 'Buy & Sell',
      rating: r.rating,
      comment: r.comment,
      when: r.createdAt,
      // A seller review is on the seller, not one specific listing, so
      // there's nothing single to navigate to - row is list-only.
      onPress: undefined,
    })),
    ...givenService.map((r) => ({
      id: `s_${r.id}`,
      title: nameCache[`service:${r.providerId}`] || 'Loading…',
      subtitle: 'Local Service',
      rating: r.rating,
      comment: r.comment,
      when: r.createdAt,
      onPress: () => openServiceProviderDetail(r.providerId),
    })),
  ].sort((a, b) => (b.when?.seconds || 0) - (a.when?.seconds || 0));

  const receivedData = [
    ...receivedMarketplace.map((r) => ({
      id: `m_${r.id}`,
      title: r.reviewerName || 'A buyer',
      subtitle: 'Buy & Sell',
      rating: r.rating,
      comment: r.comment,
      when: r.createdAt,
    })),
    ...receivedService.map((r) => ({
      id: `s_${r.id}`,
      title: r.reviewerName || 'A customer',
      subtitle: 'Local Service',
      rating: r.rating,
      comment: r.comment,
      when: r.createdAt,
    })),
  ].sort((a, b) => (b.when?.seconds || 0) - (a.when?.seconds || 0));

  const data = tab === 'given' ? givenData : receivedData;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reviews</Text>
      </LinearGradient>

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'given' && styles.tabBtnActive]} onPress={() => setTab('given')}>
          <Text style={[styles.tabText, tab === 'given' && styles.tabTextActive]}>Given</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]} onPress={() => setTab('received')}>
          <Text style={[styles.tabText, tab === 'received' && styles.tabTextActive]}>Received</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ReviewCard
              title={item.title}
              subtitle={item.subtitle}
              rating={item.rating}
              comment={item.comment}
              when={item.when}
              onPress={item.onPress}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>⭐</Text>
              <Text style={styles.emptyText}>
                {tab === 'given' ? "You haven't reviewed anyone yet." : "No one has reviewed you yet."}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    tabs: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
    cardSubtitle: { fontSize: 11, color: '#999', marginTop: 1 },
    cardComment: { fontSize: 12, color: colors.text, marginTop: 8, lineHeight: 17 },
    cardWhen: { fontSize: 10, color: '#AAA', marginTop: 8 },
  });
}
