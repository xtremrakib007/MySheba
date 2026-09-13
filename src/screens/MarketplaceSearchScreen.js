// Marketplace "Search" (PRD section 4 / sitemap: Search Products, Search
// Rooms, Search Services, Search Users) - a single search bar that looks
// across every module at once, rather than each module's home screen only
// filtering its own feed (which is all that existed before this screen).
//
// Buy & Sell / Accommodation / Room Sharing / Local Services / Community
// all subscribe to their existing "active feed" functions (already capped
// client-side, same pattern every module's own home screen uses) and are
// filtered in-memory by the search term - no new index needed. "Users" is
// the one exception: it goes through the same searchUsers Cloud Function
// AddContactScreen/NewGroupScreen already use (a plain client query can't
// search across every account - see functions/userSearch.js), debounced
// the same way those two screens debounce it.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import BusinessBadge from '../components/BusinessBadge';
import * as marketplaceService from '../firebase/marketplaceService';
import * as accommodationService from '../firebase/accommodationService';
import * as roommateService from '../firebase/roommateService';
import * as serviceProviderService from '../firebase/serviceProviderService';
import * as communityService from '../firebase/communityService';
import * as contactsService from '../firebase/contactsService';

const TYPE_TABS = [
  { key: null, label: 'All', icon: '🔎' },
  { key: 'listing', label: 'Products', icon: '🛒' },
  { key: 'property', label: 'Accommodation', icon: '🏠' },
  { key: 'roommate', label: 'Rooms', icon: '👥' },
  { key: 'service', label: 'Services', icon: '🧰' },
  { key: 'community', label: 'Community', icon: '📢' },
  { key: 'user', label: 'Users', icon: '👤' },
];

function matches(term, ...fields) {
  if (!term) return true;
  return fields.some((f) => (f || '').toLowerCase().includes(term));
}

export default function MarketplaceSearchScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    goBackOrHome,
    openListingDetail, openPropertyDetail, openRoommateRequestDetail, openServiceProviderDetail, openCommunityPostDetail,
  } = useApp();

  const [term, setTerm] = useState('');
  const [type, setType] = useState(null);
  const [businessOnly, setBusinessOnly] = useState(false);

  const [listings, setListings] = useState([]);
  const [properties, setProperties] = useState([]);
  const [roommates, setRoommates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [posts, setPosts] = useState([]);

  const [users, setUsers] = useState([]);
  const [usersSearching, setUsersSearching] = useState(false);
  const userDebounceRef = useRef(null);

  useEffect(() => marketplaceService.subscribeActiveListings(setListings, () => {}), []);
  useEffect(() => accommodationService.subscribeActiveProperties(setProperties, () => {}), []);
  useEffect(() => roommateService.subscribeActiveRoommateRequests(setRoommates, () => {}), []);
  useEffect(() => serviceProviderService.subscribeActiveProviders(setProviders, () => {}), []);
  useEffect(() => communityService.subscribeActivePosts(setPosts, () => {}), []);

  useEffect(() => {
    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    const q = term.trim();
    if (q.length < 2) {
      setUsers([]);
      setUsersSearching(false);
      return undefined;
    }
    setUsersSearching(true);
    userDebounceRef.current = setTimeout(async () => {
      try {
        const list = await contactsService.searchUsers(q);
        setUsers(list);
      } catch (err) {
        setUsers([]);
      } finally {
        setUsersSearching(false);
      }
    }, 350);
    return () => clearTimeout(userDebounceRef.current);
  }, [term]);

  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    const out = [];

    if (!type || type === 'listing') {
      listings.filter((l) => l.status === 'active' && matches(t, l.title, l.description, l.location) && (!businessOnly || l.sellerIsBusiness))
        .forEach((l) => out.push({ kind: 'listing', id: l.id, title: l.title, subtitle: `MYR ${Number(l.price || 0).toFixed(2)}`, meta: l.location, icon: '🛒', isBusiness: l.sellerIsBusiness, data: l }));
    }
    if (!type || type === 'property') {
      properties.filter((p) => p.status === 'active' && matches(t, p.title, p.location, p.listingType) && (!businessOnly || p.ownerIsBusiness))
        .forEach((p) => out.push({ kind: 'property', id: p.id, title: p.title, subtitle: `MYR ${Number(p.monthlyRent || 0).toFixed(0)}/mo`, meta: p.location, icon: '🏠', isBusiness: p.ownerIsBusiness, data: p }));
    }
    if (!businessOnly && (!type || type === 'roommate')) {
      roommates.filter((r) => r.status === 'active' && matches(t, r.location, r.description, r.preferences))
        .forEach((r) => out.push({ kind: 'roommate', id: r.id, title: r.posterName || 'Roommate seeker', subtitle: `MYR ${Number(r.budget || 0).toFixed(0)} budget`, meta: r.location, icon: '👥', data: r }));
    }
    if (!type || type === 'service') {
      providers.filter((s) => s.status === 'active' && matches(t, s.name, s.description, s.category, s.serviceArea) && (!businessOnly || s.ownerIsBusiness))
        .forEach((s) => out.push({ kind: 'service', id: s.id, title: s.name, subtitle: s.category, meta: s.serviceArea, icon: '🧰', isBusiness: s.ownerIsBusiness, data: s }));
    }
    if (!businessOnly && (!type || type === 'community')) {
      posts.filter((p) => p.status === 'active' && matches(t, p.title, p.description, p.location))
        .forEach((p) => out.push({ kind: 'community', id: p.id, title: p.title, subtitle: p.type, meta: p.location, icon: '📢', data: p }));
    }
    if (!businessOnly && (!type || type === 'user')) {
      users.forEach((u) => out.push({ kind: 'user', id: u.uid, title: u.name || u.phone || 'User', subtitle: u.phone || '', meta: '', icon: '👤', data: u }));
    }

    return out;
  }, [type, term, listings, properties, roommates, providers, posts, users, businessOnly]);

  const openResult = (r) => {
    if (r.kind === 'listing') return openListingDetail(r.id);
    if (r.kind === 'property') return openPropertyDetail(r.id);
    if (r.kind === 'roommate') return openRoommateRequestDetail(r.id);
    if (r.kind === 'service') return openServiceProviderDetail(r.id);
    if (r.kind === 'community') return openCommunityPostDetail(r.id);
    if (r.kind === 'user') return openListingDetail(r.id);
  };

  const showEmpty = term.trim().length === 0 && !type && !businessOnly;
  const busy = type === 'user' && usersSearching;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search Marketplace</Text>
      </LinearGradient>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products, rooms, services, people..."
          placeholderTextColor="#9AA0A6"
          value={term}
          onChangeText={setTerm}
          autoFocus
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        data={TYPE_TABS}
        keyExtractor={(t) => t.key || 'all'}
        renderItem={({ item: t }) => {
          const active = t.key === type;
          return (
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setType(t.key)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.icon} {t.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <TouchableOpacity
        style={[styles.businessToggle, businessOnly && styles.businessToggleActive]}
        onPress={() => setBusinessOnly((v) => !v)}
      >
        <Text style={[styles.businessToggleText, businessOnly && styles.businessToggleTextActive]}>
          🏢 Businesses only
        </Text>
      </TouchableOpacity>

      {showEmpty ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🔎</Text>
          <Text style={styles.emptyText}>Search across Buy & Sell, Accommodation, Room Sharing, Services, Community and Users.</Text>
        </View>
      ) : busy ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.resultCard} activeOpacity={0.8} onPress={() => openResult(item)}>
              <View style={styles.resultIcon}><Text style={{ fontSize: 18 }}>{item.icon}</Text></View>
              <View style={styles.resultBody}>
                <Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.resultMeta} numberOfLines={1}>{[item.subtitle, item.meta].filter(Boolean).join(' · ')}</Text>
                <BusinessBadge isBusiness={item.isBusiness} size="sm" />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🗂️</Text>
              <Text style={styles.emptyText}>No results found. Try a different search term.</Text>
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 6, flex: 1 },
    searchRow: { padding: 12, backgroundColor: colors.card },
    searchInput: { backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    chipsRow: { backgroundColor: colors.card, paddingBottom: 10, flexGrow: 0 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    businessToggle: { alignSelf: 'flex-start', marginHorizontal: 12, marginBottom: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    businessToggleActive: { backgroundColor: '#EDE7F6', borderColor: '#5E35B1' },
    businessToggleText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    businessToggleTextActive: { color: '#5E35B1' },
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    resultCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
    resultIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    resultBody: { flex: 1 },
    resultTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    resultMeta: { fontSize: 11, color: colors.textSecondary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
  });
}
