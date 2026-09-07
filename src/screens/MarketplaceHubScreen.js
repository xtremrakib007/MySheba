// Unified Marketplace hub. Landing page is a grid of the five modules
// (Buy & Sell / Accommodation / Room Sharing / Services / Community);
// tapping a tile opens that module full-screen (its own search bar,
// category/filter row, and list), like navigating into a separate page -
// the grid isn't shown alongside it. The header's back arrow returns to
// the grid first, then leaves the section on a second tap.
//
// All five old screen keys ('marketplaceHome', 'accommodationHome',
// 'roomSharingHome', 'servicesHome', 'communityHome') route here - see
// App.js. Only 'marketplaceHome' (the single generic "Marketplace" tile
// elsewhere in the app) lands on the grid; the other four are
// back-navigation targets from a screen that was already inside that
// module (e.g. "My Listings"), so those open straight into that module's
// content.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, FlatList, Image, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import BusinessBadge from '../components/BusinessBadge';
import SmartAd from '../components/SmartAd';
import { DateField } from '../components/ui';
import * as marketplaceService from '../firebase/marketplaceService';
import { isFeatured } from '../firebase/marketplaceService';
import * as recommendationService from '../firebase/recommendationService';
import * as accommodationService from '../firebase/accommodationService';
import { LISTING_TYPES } from '../firebase/accommodationService';
import * as roommateService from '../firebase/roommateService';
import * as serviceProviderService from '../firebase/serviceProviderService';
import { ratingAvg } from '../firebase/serviceProviderService';
import * as communityService from '../firebase/communityService';
import { POST_TYPES } from '../firebase/communityService';
import { filterByDistance, formatDistance } from '../utils/geo';

const NEARBY_RADIUS_KM = 50;

const NUM_COLUMNS = 2;
const GRID_PADDING = 12;
const COLUMN_GAP = 10;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CONTAINER_WIDTH = Math.min(SCREEN_WIDTH, 480) - GRID_PADDING * 2;
const CARD_WIDTH = (CONTAINER_WIDTH - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

// Module switcher grid (top of page). Matches ServiceGrid.js/FeatureGrid.js
// layout: bordered, gradient-backed tile + icon + label, wraps so every
// module is visible at once. Tapping a tile only changes local state - it
// never navigates - so the matching section renders right underneath it.
const MODULES = [
  { key: 'buy', screenKey: 'marketplaceHome', icon: '🛒', label: 'Buy & Sell', bg: '#E8F5E9', accent: '#2E7D32', title: 'Marketplace' },
  { key: 'accommodation', screenKey: 'accommodationHome', icon: '🏠', label: 'Accommodation', bg: '#FFF3E0', accent: '#EF6C00', title: 'Accommodation' },
  { key: 'roomSharing', screenKey: 'roomSharingHome', icon: '👥', label: 'Room Sharing', bg: '#E3F2FD', accent: '#1565C0', title: 'Room Sharing' },
  { key: 'services', screenKey: 'servicesHome', icon: '🧰', label: 'Services', bg: '#FFEBEE', accent: '#C62828', title: 'Local Services' },
  { key: 'community', screenKey: 'communityHome', icon: '📢', label: 'Community', bg: '#F3E5F5', accent: '#6A1B9A', title: 'Community' },
];
const MODULE_GRID_COLUMNS = 4;
const MODULE_GRID_PADDING = 10;
const MODULE_GRID_GAP = 8;
const MODULE_TILE_WIDTH = (CONTAINER_WIDTH - MODULE_GRID_GAP * (MODULE_GRID_COLUMNS - 1)) / MODULE_GRID_COLUMNS;

// Maps the old per-screen route keys to a module, so navigating to
// e.g. 'accommodationHome' from elsewhere in the app opens the hub
// with the Accommodation tile already active.
function moduleForScreenKey(screenKey) {
  return MODULES.find((m) => m.screenKey === screenKey)?.key || 'buy';
}

function ModuleTabCard({ item, active, onPress }) {
  const {
    colors, isDark, gridStyle
  } = useTheme();

  const styles = createStyles(colors);

  if (gridStyle === 'classic') {
    return (
      <TouchableOpacity
        style={[styles.moduleTabClassic, { width: MODULE_TILE_WIDTH, backgroundColor: colors.card }, active && styles.moduleTabClassicActive]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <View style={[styles.moduleAccentBar, { backgroundColor: item.accent }]} />
        <View style={[styles.moduleIconWrapClassic, { backgroundColor: active ? item.accent : item.bg }]}>
          <Text style={styles.moduleIconTextClassic}>{item.icon}</Text>
        </View>
        <Text style={[styles.moduleTabLabel, { color: active ? item.accent : colors.text }]} numberOfLines={2}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  }

  if (gridStyle === 'soft') {
    return (
      <TouchableOpacity
        style={[styles.moduleTabSoft, { width: MODULE_TILE_WIDTH, backgroundColor: colors.card }, active && styles.moduleTabSoftActive]}
        activeOpacity={0.8}
        onPress={onPress}
      >
        <View style={[styles.moduleBadgeWrapSoft, { backgroundColor: active ? item.accent : item.bg }]}>
          <Text style={styles.moduleIconTextClassic}>{item.icon}</Text>
        </View>
        <Text style={[styles.moduleTabLabel, { color: active ? item.accent : colors.text }]} numberOfLines={2}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  }

  if (gridStyle === 'minimal') {
    return (
      <TouchableOpacity
        style={[styles.moduleTabMinimal, { width: MODULE_TILE_WIDTH }]}
        activeOpacity={0.6}
        onPress={onPress}
      >
        <View style={[styles.moduleBadgeWrapMinimal, { backgroundColor: active ? item.accent : item.bg }]}>
          <Text style={styles.moduleIconTextClassic}>{item.icon}</Text>
        </View>
        <Text style={[styles.moduleTabLabel, { color: active ? item.accent : colors.text }]} numberOfLines={2}>
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.moduleTab, { width: MODULE_TILE_WIDTH }, active && styles.moduleTabActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <LinearGradient
        colors={isDark ? [colors.card, colors.card] : ['#FFFFFF', '#EAF3FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.moduleTabGradient}
      >
        <Text style={styles.moduleIconText}>{item.icon}</Text>
        <Text style={[styles.moduleTabLabel, { color: active ? colors.secondary : colors.text }]} numberOfLines={2}>
          {item.label}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

/* ---------------------------- Buy & Sell ---------------------------- */

function ListingCard({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const image = item.images && item.images[0];
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={{ fontSize: 26 }}>📦</Text>
          </View>
        )}
        {item.status === 'sold' && (
          <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>
        )}
        {item.status !== 'sold' && isFeatured(item) && (
          <View style={styles.featuredBadge}><Text style={styles.featuredBadgeText}>⭐ FEATURED</Text></View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>MYR {Number(item.price || 0).toFixed(2)}{item.negotiable ? ' (Neg.)' : ''}</Text>
        {!!item.location && (
          <Text style={styles.cardLocation} numberOfLines={1}>
            📍 {item.location}{item._distanceKm != null ? ` · ${formatDistance(item._distanceKm)}` : ''}
          </Text>
        )}
        <BusinessBadge isBusiness={item.sellerIsBusiness} size="sm" />
      </View>
    </TouchableOpacity>
  );
}

function BuySellSection() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { openListingDetail, setScreen, openMarketplaceSearch, authUser, marketplaceCategories } = useApp();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState(null);
  const [viewSignals, setViewSignals] = useState([]);
  const [saved, setSaved] = useState([]);
  const [nearbyOn, setNearbyOn] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const unsub = marketplaceService.subscribeActiveListings(
      (list) => { setListings(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!authUser) { setViewSignals([]); return undefined; }
    return recommendationService.subscribeViewSignals(authUser.uid, setViewSignals);
  }, [authUser]);

  useEffect(() => {
    if (!authUser) { setSaved([]); return undefined; }
    return marketplaceService.subscribeMySaved(authUser.uid, setSaved, () => setSaved([]));
  }, [authUser]);

  const recommended = useMemo(() => {
    if (!authUser) return [];
    const listingsById = {};
    for (const l of listings) listingsById[l.id] = l;
    const myListingIds = listings.filter((l) => l.sellerId === authUser.uid).map((l) => l.id);
    const weights = recommendationService.buildCategoryAffinity(viewSignals, saved, listingsById);
    return recommendationService.rankRecommendations(listings, weights, myListingIds);
  }, [listings, viewSignals, saved, authUser]);

  const showRecommended = recommended.length > 0 && !searchText.trim() && !category;

  const featured = useMemo(
    () => listings.filter((l) => l.status === 'active' && isFeatured(l)),
    [listings]
  );
  const showFeatured = featured.length > 0 && !searchText.trim() && !category;

  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    let list = listings
      .filter((l) => l.status === 'active')
      .filter((l) => !category || l.category === category)
      .filter((l) => !term || (l.title || '').toLowerCase().includes(term) || (l.description || '').toLowerCase().includes(term));
    if (nearbyOn && userCoords) {
      list = filterByDistance(list, userCoords, NEARBY_RADIUS_KM);
    }
    return list;
  }, [listings, searchText, category, nearbyOn, userCoords]);

  const toggleNearby = async () => {
    if (nearbyOn) { setNearbyOn(false); return; }
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords([pos.coords.latitude, pos.coords.longitude]);
      setNearbyOn(true);
    } finally {
      setLocating(false);
    }
  };

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={openMarketplaceSearch}>
          <Text style={styles.actionBtnGhostText}>🔎 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setScreen('marketplaceCreateListing')}>
          <Text style={styles.actionBtnPrimaryText}>+ Sell</Text>
        </TouchableOpacity>
      </View>

      <SmartAd placement="BUY_SELL_TOP" feature="buy_sell" height={100} style={{ marginBottom: 8 }} />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor="#9AA0A6"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={[styles.pillBtn, nearbyOn && styles.nearbyBtnActive]} onPress={toggleNearby} disabled={locating}>
          <Text style={[styles.pillBtnText, nearbyOn && styles.nearbyBtnTextActive]}>
            {locating ? '...' : nearbyOn ? '📍 Nearby ✓' : '📍 Nearby'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={() => setScreen('marketplaceMyListings')}>
          <Text style={styles.pillBtnText}>My Listings</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        data={['All', ...marketplaceCategories]}
        keyExtractor={(c) => c}
        renderItem={({ item: c }) => {
          const active = c === 'All' ? !category : category === c;
          return (
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(c === 'All' ? null : c)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {showFeatured && (
        <View style={styles.rowSection}>
          <Text style={styles.rowSectionTitle}>⭐ Featured Listings</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rowSectionContent}
            data={featured}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ListingCard item={item} onPress={() => openListingDetail(item.id)} />}
          />
        </View>
      )}

      {showRecommended && (
        <View style={styles.rowSection}>
          <Text style={styles.rowSectionTitle}>✨ Recommended for You</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rowSectionContent}
            data={recommended}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ListingCard item={item} onPress={() => openListingDetail(item.id)} />}
          />
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={styles.grid}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🛒</Text>
              <Text style={styles.emptyText}>No listings yet. Be the first to sell something!</Text>
            </View>
          ) : filtered.map((item, i) => (
            <View key={item.id} style={{ marginRight: i % NUM_COLUMNS === 0 ? COLUMN_GAP : 0 }}>
              <ListingCard item={item} onPress={() => openListingDetail(item.id)} />
            </View>
          ))}
        </View>
      )}

      <SmartAd placement="BUY_SELL_BOTTOM" feature="buy_sell" height={100} style={{ marginTop: 8 }} />
    </View>
  );
}

/* --------------------------- Accommodation --------------------------- */

function PropertyCard({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const image = item.images && item.images[0];
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
            <Text style={{ fontSize: 26 }}>🏠</Text>
          </View>
        )}
        {item.status === 'rented' && (
          <View style={styles.rentedBadge}><Text style={styles.soldBadgeText}>RENTED</Text></View>
        )}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.cardPrice}>MYR {Number(item.monthlyRent || 0).toFixed(2)}/mo</Text>
        {!!item.location && (
          <Text style={styles.cardLocation} numberOfLines={1}>
            📍 {item.location}{item._distanceKm != null ? ` · ${formatDistance(item._distanceKm)}` : ''}
          </Text>
        )}
        <BusinessBadge isBusiness={item.ownerIsBusiness} size="sm" />
      </View>
    </TouchableOpacity>
  );
}

function AccommodationSection() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { openPropertyDetail, setScreen, openMarketplaceSearch } = useApp();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [listingType, setListingType] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [availableBy, setAvailableBy] = useState('');
  const [nearbyOn, setNearbyOn] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const unsub = accommodationService.subscribeActiveProperties(
      (list) => { setProperties(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const hasActiveFilters = !!(minPrice || maxPrice || availableBy);
  const clearFilters = () => { setMinPrice(''); setMaxPrice(''); setAvailableBy(''); };

  const toggleNearby = async () => {
    if (nearbyOn) { setNearbyOn(false); return; }
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords([pos.coords.latitude, pos.coords.longitude]);
      setNearbyOn(true);
    } finally {
      setLocating(false);
    }
  };

  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const min = parseFloat(minPrice);
    const max = parseFloat(maxPrice);
    const byDate = availableBy ? new Date(`${availableBy}T00:00:00`) : null;
    let list = properties
      .filter((p) => p.status === 'active')
      .filter((p) => !listingType || p.listingType === listingType)
      .filter((p) => !term || (p.title || '').toLowerCase().includes(term) || (p.location || '').toLowerCase().includes(term))
      .filter((p) => !Number.isFinite(min) || Number(p.monthlyRent || 0) >= min)
      .filter((p) => !Number.isFinite(max) || Number(p.monthlyRent || 0) <= max)
      .filter((p) => {
        if (!byDate) return true;
        if (!p.availableDate || !/^\d{4}-\d{2}-\d{2}$/.test(p.availableDate)) return true;
        return new Date(`${p.availableDate}T00:00:00`) <= byDate;
      });
    if (nearbyOn && userCoords) {
      list = filterByDistance(list, userCoords, NEARBY_RADIUS_KM);
    }
    return list;
  }, [properties, searchText, listingType, minPrice, maxPrice, availableBy, nearbyOn, userCoords]);

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={() => setShowFilters((v) => !v)}>
          <Text style={styles.actionBtnGhostText}>{hasActiveFilters ? '🎚️● Filters' : '🎚️ Filters'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={openMarketplaceSearch}>
          <Text style={styles.actionBtnGhostText}>🔎 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setScreen('accommodationCreateProperty')}>
          <Text style={styles.actionBtnPrimaryText}>+ List</Text>
        </TouchableOpacity>
      </View>

      <SmartAd placement="ACCOMMODATION_TOP" feature="accommodation" height={100} style={{ marginBottom: 8 }} />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search rooms, apartments..."
          placeholderTextColor="#9AA0A6"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={[styles.pillBtn, nearbyOn && styles.nearbyBtnActive]} onPress={toggleNearby} disabled={locating}>
          <Text style={[styles.pillBtnText, nearbyOn && styles.nearbyBtnTextActive]}>
            {locating ? '...' : nearbyOn ? '📍 Nearby ✓' : '📍 Nearby'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={() => setScreen('accommodationMyProperties')}>
          <Text style={styles.pillBtnText}>My Listings</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        data={['All', ...LISTING_TYPES]}
        keyExtractor={(c) => c}
        renderItem={({ item: c }) => {
          const active = c === 'All' ? !listingType : listingType === c;
          return (
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setListingType(c === 'All' ? null : c)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {showFilters && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Price range (MYR/month)</Text>
          <View style={styles.filterRow}>
            <TextInput style={styles.filterInput} placeholder="Min" placeholderTextColor="#9AA0A6" keyboardType="decimal-pad" value={minPrice} onChangeText={setMinPrice} />
            <TextInput style={styles.filterInput} placeholder="Max" placeholderTextColor="#9AA0A6" keyboardType="decimal-pad" value={maxPrice} onChangeText={setMaxPrice} />
          </View>
          <Text style={styles.filterLabel}>Available by</Text>
          <DateField placeholder="Any date" value={availableBy} onChange={setAvailableBy} minimumDate={new Date()} />
          {hasActiveFilters && (
            <TouchableOpacity onPress={clearFilters}>
              <Text style={styles.filterClear}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={styles.grid}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🏠</Text>
              <Text style={styles.emptyText}>No listings yet. Be the first to list a place!</Text>
            </View>
          ) : filtered.map((item, i) => (
            <View key={item.id} style={{ marginRight: i % NUM_COLUMNS === 0 ? COLUMN_GAP : 0 }}>
              <PropertyCard item={item} onPress={() => openPropertyDetail(item.id)} />
            </View>
          ))}
        </View>
      )}

      <SmartAd placement="ACCOMMODATION_BOTTOM" feature="accommodation" height={100} style={{ marginTop: 8 }} />
    </View>
  );
}

/* ---------------------------- Room Sharing ---------------------------- */

function RequestCard({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{(item.posterName || '?').trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{item.posterName || 'Roommate seeker'}</Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          📍 {item.location || 'Anywhere'} · MYR {Number(item.budget || 0).toFixed(0)} budget · {item.numberOfPeople} {item.numberOfPeople === 1 ? 'person' : 'people'}
        </Text>
        {!!item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}
      </View>
    </TouchableOpacity>
  );
}

function RoomSharingSection() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { openRoommateRequestDetail, setScreen, openMarketplaceSearch } = useApp();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    const unsub = roommateService.subscribeActiveRoommateRequests(
      (list) => { setRequests(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    return requests
      .filter((r) => r.status === 'active')
      .filter((r) => !term || (r.location || '').toLowerCase().includes(term) || (r.description || '').toLowerCase().includes(term) || (r.preferences || '').toLowerCase().includes(term));
  }, [requests, searchText]);

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={openMarketplaceSearch}>
          <Text style={styles.actionBtnGhostText}>🔎 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setScreen('roomSharingCreateRequest')}>
          <Text style={styles.actionBtnPrimaryText}>+ Post</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by area or preferences..."
          placeholderTextColor="#9AA0A6"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={styles.pillBtn} onPress={() => setScreen('roomSharingMyRequests')}>
          <Text style={styles.pillBtnText}>My Requests</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>👥</Text>
              <Text style={styles.emptyText}>No roommate requests yet. Be the first to post one!</Text>
            </View>
          ) : filtered.map((item) => (
            <RequestCard key={item.id} item={item} onPress={() => openRoommateRequestDetail(item.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

/* ------------------------------ Services ------------------------------ */

function ProviderCard({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const avg = ratingAvg(item);
  return (
    <TouchableOpacity style={styles.listCard} activeOpacity={0.8} onPress={onPress}>
      {item.photo ? (
        <Image source={{ uri: item.photo }} style={styles.avatarImg} resizeMode="cover" />
      ) : (
        <View style={[styles.avatarImg, styles.avatarImgPlaceholder]}>
          <Text style={{ fontSize: 20 }}>🧰</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name || 'Service'}</Text>
        <View style={styles.cardMetaRow}>
          <Text style={styles.cardCategory}>{item.category}</Text>
          <Text style={styles.cardRating}>{avg ? `⭐ ${avg.toFixed(1)}` : 'No reviews yet'}</Text>
        </View>
        {(item.priceMin || item.priceMax) ? (
          <Text style={styles.cardPrice2}>
            MYR {Number(item.priceMin || 0).toFixed(0)}{item.priceMax ? ` – ${Number(item.priceMax).toFixed(0)}` : ''}
          </Text>
        ) : null}
        {!!item.serviceArea && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            📍 {item.serviceArea}{item._distanceKm != null ? ` · ${formatDistance(item._distanceKm)}` : ''}
          </Text>
        )}
        <BusinessBadge isBusiness={item.ownerIsBusiness} size="sm" />
      </View>
    </TouchableOpacity>
  );
}

function ServicesSection() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { setScreen, openServiceProviderDetail, openMarketplaceSearch, serviceCategories } = useApp();
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState(null);
  const [nearbyOn, setNearbyOn] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const unsub = serviceProviderService.subscribeActiveProviders(
      (list) => { setProviders(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const toggleNearby = async () => {
    if (nearbyOn) { setNearbyOn(false); return; }
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords([pos.coords.latitude, pos.coords.longitude]);
      setNearbyOn(true);
    } finally {
      setLocating(false);
    }
  };

  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    let list = providers
      .filter((p) => p.status === 'active')
      .filter((p) => !category || p.category === category)
      .filter((p) => !term || (p.name || '').toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term) || (p.serviceArea || '').toLowerCase().includes(term));
    if (nearbyOn && userCoords) {
      list = filterByDistance(list, userCoords, NEARBY_RADIUS_KM);
    }
    return list;
  }, [providers, searchText, category, nearbyOn, userCoords]);

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={openMarketplaceSearch}>
          <Text style={styles.actionBtnGhostText}>🔎 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setScreen('servicesCreateProvider')}>
          <Text style={styles.actionBtnPrimaryText}>+ List</Text>
        </TouchableOpacity>
      </View>

      <SmartAd placement="SERVICES_TOP" feature="services" height={100} style={{ marginBottom: 8 }} />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search services..."
          placeholderTextColor="#9AA0A6"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={[styles.pillBtn, nearbyOn && styles.nearbyBtnActive]} onPress={toggleNearby} disabled={locating}>
          <Text style={[styles.pillBtnText, nearbyOn && styles.nearbyBtnTextActive]}>
            {locating ? '...' : nearbyOn ? '📍 Nearby ✓' : '📍 Nearby'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={() => setScreen('servicesMyServices')}>
          <Text style={styles.pillBtnText}>My Services</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        data={['All', ...serviceCategories]}
        keyExtractor={(c) => c}
        renderItem={({ item: c }) => {
          const active = c === 'All' ? !category : category === c;
          return (
            <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={() => setCategory(c === 'All' ? null : c)}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🧰</Text>
              <Text style={styles.emptyText}>No services yet. Be the first to list one!</Text>
            </View>
          ) : filtered.map((item) => (
            <ProviderCard key={item.id} item={item} onPress={() => openServiceProviderDetail(item.id)} />
          ))}
        </View>
      )}

      <SmartAd placement="SERVICES_BOTTOM" feature="services" height={100} style={{ marginTop: 8 }} />
    </View>
  );
}

/* ------------------------------ Community ------------------------------ */

function PostCard({ item, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const type = POST_TYPES.find((t) => t.key === item.type);
  return (
    <TouchableOpacity style={styles.postCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>{type ? `${type.icon} ${type.label}` : item.type}</Text>
        </View>
        {item.status === 'closed' && (
          <View style={styles.closedBadge}><Text style={styles.closedBadgeText}>RESOLVED</Text></View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
      {!!item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}
      <View style={styles.cardFooter}>
        {!!item.location && (
          <Text style={styles.cardMeta} numberOfLines={1}>
            📍 {item.location}{item._distanceKm != null ? ` · ${formatDistance(item._distanceKm)}` : ''}
          </Text>
        )}
        <Text style={styles.cardMeta}>❤️ {item.likeCount || 0}  💬 {item.commentCount || 0}</Text>
      </View>
    </TouchableOpacity>
  );
}

function CommunitySection() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { setScreen, openCommunityPostDetail, openMarketplaceSearch } = useApp();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [type, setType] = useState(null);
  const [nearbyOn, setNearbyOn] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const unsub = communityService.subscribeActivePosts(
      (list) => { setPosts(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const toggleNearby = async () => {
    if (nearbyOn) { setNearbyOn(false); return; }
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) return;
      const pos = await Location.getCurrentPositionAsync({});
      setUserCoords([pos.coords.latitude, pos.coords.longitude]);
      setNearbyOn(true);
    } finally {
      setLocating(false);
    }
  };

  const filtered = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    let list = posts
      .filter((p) => p.status === 'active')
      .filter((p) => !type || p.type === type)
      .filter((p) => !term || (p.title || '').toLowerCase().includes(term) || (p.description || '').toLowerCase().includes(term) || (p.location || '').toLowerCase().includes(term));
    if (nearbyOn && userCoords) {
      list = filterByDistance(list, userCoords, NEARBY_RADIUS_KM);
    }
    return list;
  }, [posts, searchText, type, nearbyOn, userCoords]);

  // PHASE 4 - MySheba Advertisement System. "Jobs" (POST_TYPES key
  // 'job' - see communityService.js) is a filtered view within this same
  // Community section, not its own screen - so it gets the ad system's
  // own JOBS_TOP/BOTTOM placement only while that filter chip is active,
  // and falls back to the Community placement otherwise. Neither touches
  // this section's own filtering/search behavior - purely which SmartAd
  // slot is shown above/below the list.
  const adSlot = type === 'job'
    ? { feature: 'jobs', top: 'JOBS_TOP', bottom: 'JOBS_BOTTOM' }
    : { feature: 'community', top: 'COMMUNITY_TOP', bottom: 'COMMUNITY_BOTTOM' };

  return (
    <View>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtnGhost} onPress={openMarketplaceSearch}>
          <Text style={styles.actionBtnGhostText}>🔎 Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={() => setScreen('communityCreatePost')}>
          <Text style={styles.actionBtnPrimaryText}>+ Post</Text>
        </TouchableOpacity>
      </View>

      <SmartAd placement={adSlot.top} feature={adSlot.feature} height={100} style={{ marginBottom: 8 }} />

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search jobs, events, posts..."
          placeholderTextColor="#9AA0A6"
          value={searchText}
          onChangeText={setSearchText}
        />
        <TouchableOpacity style={[styles.pillBtn, nearbyOn && styles.nearbyBtnActive]} onPress={toggleNearby} disabled={locating}>
          <Text style={[styles.pillBtnText, nearbyOn && styles.nearbyBtnTextActive]}>
            {locating ? '...' : nearbyOn ? '📍 Nearby ✓' : '📍 Nearby'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pillBtn} onPress={() => setScreen('communityMyPosts')}>
          <Text style={styles.pillBtnText}>My Posts</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsRow}
        contentContainerStyle={{ paddingHorizontal: 12 }}
        data={[{ key: null, label: 'All', icon: '🗂️' }, ...POST_TYPES]}
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

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <View style={styles.list}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📢</Text>
              <Text style={styles.emptyText}>No community posts yet. Be the first to share one!</Text>
            </View>
          ) : filtered.map((item) => (
            <PostCard key={item.id} item={item} onPress={() => openCommunityPostDetail(item.id)} />
          ))}
        </View>
      )}

      <SmartAd placement={adSlot.bottom} feature={adSlot.feature} height={100} style={{ marginTop: 8 }} />
    </View>
  );
}

/* -------------------------------- Hub -------------------------------- */

export default function MarketplaceHubScreen({ screen }) {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();
  const [module, setModule] = useState(() => moduleForScreenKey(screen));
  // The module grid is the hub's own "directory" page - each tile should
  // open like a separate screen, not sit stacked above content that's
  // always visible. Only the generic 'marketplaceHome' entry point (the
  // single "Marketplace" tile elsewhere in the app - see
  // AppContext.openMarketplace) lands on the bare grid; every other entry
  // key ('accommodationHome' etc.) is a back-navigation target from a
  // screen that was already inside that specific module (e.g. "My
  // Listings" returning here), so those should drop straight back into
  // that module's content instead of the grid.
  const [viewingModule, setViewingModule] = useState(() => screen !== 'marketplaceHome');

  // If something elsewhere in the app navigates to a specific module's
  // route key (e.g. a "My Listings" screen's back button targets
  // 'accommodationHome'), jump this hub's active tile to match.
  useEffect(() => {
    setModule(moduleForScreenKey(screen));
    setViewingModule(screen !== 'marketplaceHome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const active = MODULES.find((m) => m.key === module) || MODULES[0];

  const openModule = (key) => {
    setModule(key);
    setViewingModule(true);
  };

  // Inside a module, the header's back arrow returns to the grid of
  // tiles first (mirrors a real "back" out of a sub-page) rather than
  // leaving the whole Marketplace section in one tap; from the grid
  // itself, back leaves as normal.
  const onHeaderBack = () => {
    if (viewingModule) setViewingModule(false);
    else goBackOrHome();
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={onHeaderBack}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{viewingModule ? active.title : 'Marketplace'}</Text>
      </LinearGradient>

      {!viewingModule ? (
        <View style={styles.sectionRow}>
          <View style={styles.moduleGrid}>
            {MODULES.map((m) => (
              <ModuleTabCard key={m.key} item={m} active={false} onPress={() => openModule(m.key)} />
            ))}
          </View>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ paddingBottom: 30 }}
          data={[1]}
          keyExtractor={() => 'hub'}
          renderItem={() => (
            <View style={styles.moduleContent}>
              {module === 'buy' && <BuySellSection />}
              {module === 'accommodation' && <AccommodationSection />}
              {module === 'roomSharing' && <RoomSharingSection />}
              {module === 'services' && <ServicesSection />}
              {module === 'community' && <CommunitySection />}
            </View>
          )}
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

    sectionRow: { backgroundColor: colors.card, paddingTop: 12, paddingBottom: 4 },
    moduleGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: MODULE_GRID_PADDING, gap: MODULE_GRID_GAP },
    moduleTab: {
      borderRadius: radius.lg, marginBottom: MODULE_GRID_GAP, overflow: 'hidden',
      borderWidth: 1.5, borderColor: colors.secondary,
    },
    moduleTabActive: { borderColor: colors.primary, borderWidth: 2 },
    moduleTabGradient: { paddingVertical: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    moduleIconText: { fontSize: 30, marginBottom: 8 },
    moduleTabLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
    // Classic style (previous design) - colored tile background, top
    // accent bar, white icon circle. Selectable via Settings > Grid Style.
    moduleTabClassic: {
      borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 4,
      alignItems: 'center', marginBottom: MODULE_GRID_GAP, overflow: 'hidden',
      shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2,
    },
    moduleTabClassicActive: { borderWidth: 1.5, borderColor: colors.border },
    moduleAccentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
    moduleIconWrapClassic: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6, marginTop: 2 },
    moduleIconTextClassic: { fontSize: 20 },
    // Soft style - flat colored icon badge on a plain shadowed card, no
    // border and no accent bar.
    moduleTabSoft: {
      borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 4,
      alignItems: 'center', marginBottom: MODULE_GRID_GAP,
      shadowColor: '#0B2447', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    moduleTabSoftActive: { shadowOpacity: 0.14, elevation: 3 },
    moduleBadgeWrapSoft: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
    // Minimal style - no card, just a tinted icon badge and label floating
    // on the screen background.
    moduleTabMinimal: { alignItems: 'center', marginBottom: MODULE_GRID_GAP, paddingVertical: 4 },
    moduleBadgeWrapMinimal: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },

    moduleContent: { backgroundColor: colors.bg },

    actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
    actionBtnGhost: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    actionBtnGhostText: { fontSize: 12, fontWeight: '700', color: colors.primaryDark },
    actionBtnPrimary: { marginLeft: 'auto', paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.primary },
    actionBtnPrimaryText: { fontSize: 12, fontWeight: '700', color: 'white' },

    searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
    searchInput: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text },
    pillBtn: { justifyContent: 'center', paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    nearbyBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    nearbyBtnTextActive: { color: 'white' },
    pillBtnText: { fontSize: 11, fontWeight: '600', color: colors.primary },

    chipsRow: { flexGrow: 0, paddingBottom: 10 },
    chip: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, marginRight: 8, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },

    filterPanel: { paddingHorizontal: 12, paddingBottom: 12 },
    filterLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, marginTop: 4 },
    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
    filterInput: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text },
    filterClear: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 10, textAlign: 'right' },

    rowSection: { paddingTop: 4, paddingBottom: 10 },
    rowSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text, paddingHorizontal: 12, marginBottom: 8 },
    rowSectionContent: { paddingHorizontal: 12, gap: 10 },

    grid: { paddingHorizontal: GRID_PADDING, paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap' },
    card: { width: CARD_WIDTH, backgroundColor: colors.card, borderRadius: radius.lg, marginBottom: COLUMN_GAP, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    cardImageWrap: { width: '100%', aspectRatio: 1, backgroundColor: '#F1F3F4' },
    cardImage: { width: '100%', height: '100%' },
    cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.error, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm },
    soldBadgeText: { color: 'white', fontSize: 10, fontWeight: '700' },
    rentedBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.error, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm },
    featuredBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.warning, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm },
    featuredBadgeText: { color: colors.navy, fontSize: 10, fontWeight: '700' },
    cardBody: { padding: 10, flex: 1 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    cardPrice: { fontSize: 13, fontWeight: '700', color: colors.primaryDark, marginBottom: 2 },
    cardPrice2: { fontSize: 12, fontWeight: '700', color: colors.primaryDark, marginBottom: 2 },
    cardLocation: { fontSize: 11, color: colors.textSecondary },

    list: { paddingHorizontal: 16, paddingBottom: 10 },
    listCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
    avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { color: 'white', fontWeight: '700', fontSize: 16 },
    avatarImg: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: '#F1F3F4' },
    avatarImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    cardName: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
    cardCategory: { fontSize: 10, fontWeight: '700', color: colors.primaryDark, backgroundColor: '#F0F0FA', paddingVertical: 2, paddingHorizontal: 7, borderRadius: radius.sm },
    cardRating: { fontSize: 11, color: '#B45309', fontWeight: '600' },
    cardMeta: { fontSize: 11, color: colors.textSecondary },
    cardDesc: { fontSize: 12, color: colors.text, lineHeight: 17 },

    postCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 12, marginBottom: 10 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    typeTag: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
    typeTagText: { fontSize: 10, fontWeight: '700', color: colors.primaryDark },
    closedBadge: { backgroundColor: '#F1F3F4', borderRadius: radius.sm, paddingVertical: 3, paddingHorizontal: 8 },
    closedBadgeText: { fontSize: 9, fontWeight: '700', color: colors.textSecondary },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingHorizontal: 30, width: '100%' },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
  });
}
