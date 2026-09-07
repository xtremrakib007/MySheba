import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from '../i18n/LanguageContext';
import InfoBar from '../components/InfoBar';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import HeaderDecor from '../components/HeaderDecor';
import SmartAd from '../components/SmartAd';
import * as communityService from '../firebase/communityService';
import { POST_TYPES } from '../firebase/communityService';
import * as socialFeedService from '../firebase/socialFeedService';
import { getHomepageModules } from '../firebase/homepageConfigService';

const FEED_PREVIEW_COUNT = 12;

// Next Update PRD §2 - "other supported countries should receive a
// social/community-first homepage while retaining access to services."
//
// This is CustomerHomeScreen's sibling for every country whose
// homepageConfig resolves to layout: 'social' (see getHomepageModules) -
// same header/InfoBar/ad-placement shape as CustomerHomeScreen so the
// screen still feels like MySheba, just reordered: the community feed
// leads, Services/BannerSlider follow rather than lead. Kept as its own
// file rather than a prop-branch inside CustomerHomeScreen.js for the same
// reason GamePointsGiftScreen was kept separate from GamePointsTransfer -
// the two layouts diverge enough in structure (a live feed list vs a
// service grid as the hero content) that one shared file would mean a lot
// of `layout === 'social' ? ... : ...` branching for very little reuse.
//
// PRD §3 (Facebook-style Social Feed - text/media posts, reactions,
// sharing) now has its own module (socialFeedService.js /
// SocialFeedScreen.js) and its own section below, independent from the
// pre-existing Community module (Jobs/Events/Lost&Found/Emergency/News -
// communityService.js, PRD section 9 in the *original* app, unrelated
// numbering to this PRD). Both can run at once: showCommunityFeed and
// showSocialFeed are separate toggles (homepageConfigService.js), so a
// superadmin can enable either, both, or neither per country.
export default function SocialHomeScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { t } = useLanguage();
  const {
    logout, openSidebar, setScreen, hasUnreadNotifications,
    profile, homepageConfig, openCommunityPostDetail,
    openSocialPostDetail, openSocialFeed,
  } = useApp();

  const modules = getHomepageModules(homepageConfig, profile?.country);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [socialPosts, setSocialPosts] = useState([]);
  const [loadingSocialPosts, setLoadingSocialPosts] = useState(true);

  useEffect(() => {
    if (!modules.showCommunityFeed) { setLoadingPosts(false); return undefined; }
    const unsub = communityService.subscribeActivePosts(
      (all) => {
        // Region-first, then global: a post tagged with the viewer's own
        // country sorts ahead of untagged/other-country posts, but nothing
        // is ever hidden - matches the PRD's "Content without a country/
        // region remains global and can be shown across regions."
        const mine = profile?.country;
        const ranked = [...all].sort((a, b) => {
          const aMine = mine && a.country === mine ? 0 : a.country ? 2 : 1;
          const bMine = mine && b.country === mine ? 0 : b.country ? 2 : 1;
          return aMine - bMine;
        });
        setPosts(ranked.slice(0, FEED_PREVIEW_COUNT));
        setLoadingPosts(false);
      },
      () => setLoadingPosts(false)
    );
    return unsub;
  }, [modules.showCommunityFeed, profile?.country]);

  // Same region-first ranking as the Community feed above, over
  // socialFeedService's live subscription instead.
  useEffect(() => {
    if (!modules.showSocialFeed) { setLoadingSocialPosts(false); return undefined; }
    const unsub = socialFeedService.subscribeActivePosts(
      (all) => {
        const mine = profile?.country;
        const ranked = [...all].sort((a, b) => {
          const aMine = mine && a.country === mine ? 0 : a.country ? 2 : 1;
          const bMine = mine && b.country === mine ? 0 : b.country ? 2 : 1;
          return aMine - bMine;
        });
        setSocialPosts(ranked.slice(0, FEED_PREVIEW_COUNT));
        setLoadingSocialPosts(false);
      },
      () => setLoadingSocialPosts(false)
    );
    return unsub;
  }, [modules.showSocialFeed, profile?.country]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}>
            <Text style={styles.menuIcon}>☰</Text>
          </TouchableOpacity>
          <View style={styles.logoBox}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" />
          </View>
          <View>
            <Text style={styles.brand}>MySheba</Text>
            <Text style={styles.tagline}>{t('login.welcomeBack')}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setScreen('notifications')}>
            <Text style={styles.bell}>🔔</Text>
            {hasUnreadNotifications && <View style={styles.bellDot} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Text style={styles.logoutText}>{t('settings.logout')}</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        <InfoBar />
        <SmartAd placement="HOME_TOP" feature="home" height={140} />

        {modules.showSocialFeed && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>📣 Social Feed</Text>
              <TouchableOpacity onPress={openSocialFeed}>
                <Text style={styles.sectionLink}>+ Post</Text>
              </TouchableOpacity>
            </View>

            {loadingSocialPosts ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
            ) : socialPosts.length === 0 ? (
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedText}>No posts yet - be the first to share something.</Text>
              </View>
            ) : (
              socialPosts.map((item) => (
                <SocialFeedCard key={item.id} item={item} colors={colors} onPress={() => openSocialPostDetail(item.id)} />
              ))
            )}

            <TouchableOpacity style={styles.seeAllBtn} onPress={openSocialFeed}>
              <Text style={styles.seeAllText}>See all posts →</Text>
            </TouchableOpacity>
          </View>
        )}

        {modules.showCommunityFeed && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🌐 Community</Text>
              <TouchableOpacity onPress={() => setScreen('communityCreatePost')}>
                <Text style={styles.sectionLink}>+ Post</Text>
              </TouchableOpacity>
            </View>

            {loadingPosts ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
            ) : posts.length === 0 ? (
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyFeedText}>No community posts yet - be the first to share something.</Text>
              </View>
            ) : (
              posts.map((item) => <FeedCard key={item.id} item={item} colors={colors} onPress={() => openCommunityPostDetail(item.id)} />)
            )}

            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setScreen('communityHome')}>
              <Text style={styles.seeAllText}>See all community posts →</Text>
            </TouchableOpacity>
          </View>
        )}

        <SmartAd placement="HOME_MIDDLE" feature="home" height={140} />
        {modules.showBanners && <BannerSlider />}

        {modules.showServices && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🧰 Services</Text>
            </View>
            <ServiceGrid />
          </View>
        )}

        <SmartAd placement="HOME_BOTTOM" feature="home" height={140} />
      </ScrollView>
    </View>
  );
}

function FeedCard({ item, colors, onPress }) {
  const type = POST_TYPES.find((t) => t.key === item.type);
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.feedCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.feedCardTop}>
        <Text style={styles.feedTypeTag}>{type ? `${type.icon} ${type.label}` : item.type}</Text>
        {!!item.country && <Text style={styles.feedRegionTag}>{item.country}</Text>}
      </View>
      <Text style={styles.feedTitle} numberOfLines={1}>{item.title}</Text>
      {!!item.description && <Text style={styles.feedDesc} numberOfLines={2}>{item.description}</Text>}
      <Text style={styles.feedMeta}>❤️ {item.likeCount || 0}  💬 {item.commentCount || 0}  · {item.authorName || 'MySheba user'}</Text>
    </TouchableOpacity>
  );
}

// Untyped Social Feed equivalent of FeedCard above - no type pill (a general
// post has no type), leads with the post text itself instead of a title.
function SocialFeedCard({ item, colors, onPress }) {
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.feedCard} activeOpacity={0.8} onPress={onPress}>
      <View style={styles.feedCardTop}>
        <Text style={styles.feedTypeTag}>{item.authorName || 'MySheba user'}</Text>
        {!!item.country && <Text style={styles.feedRegionTag}>{item.country}</Text>}
      </View>
      {!!item.text && <Text style={styles.feedDesc} numberOfLines={2}>{item.text}</Text>}
      <Text style={styles.feedMeta}>❤️ {item.likeCount || 0}  💬 {item.commentCount || 0}  ↗️ {item.shareCount || 0}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden' },
    logoArea: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    menuBtn: { padding: 4, marginRight: 2 },
    menuIcon: { color: 'white', fontSize: 20 },
    logoBox: { width: 34, height: 34, backgroundColor: 'white', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginRight: 10, overflow: 'hidden' },
    logoImage: { width: '100%', height: '100%' },
    brand: { color: 'white', fontWeight: '600' },
    tagline: { color: 'white', fontSize: 10, opacity: 0.8 },
    headerRight: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    bellBtn: { padding: 4, marginRight: 2 },
    bell: { color: 'white', fontSize: 16 },
    bellDot: { position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252', borderWidth: 1, borderColor: colors.primary },
    logoutBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.md },
    logoutText: { color: 'white', fontSize: 11 },

    section: { paddingHorizontal: 14, paddingTop: 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
    sectionLink: { fontSize: 13, fontWeight: '600', color: colors.primary },

    emptyFeed: { paddingVertical: 20, alignItems: 'center' },
    emptyFeedText: { fontSize: 12, color: '#888', textAlign: 'center' },

    seeAllBtn: { paddingVertical: 10, alignItems: 'center' },
    seeAllText: { fontSize: 12, fontWeight: '600', color: colors.primary },

    feedCard: { backgroundColor: colors.card || 'white', borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border || '#eee' },
    feedCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    feedTypeTag: { fontSize: 11, fontWeight: '600', color: colors.primary },
    feedRegionTag: { fontSize: 10, color: '#999', fontWeight: '600' },
    feedTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 2 },
    feedDesc: { fontSize: 12, color: '#777', marginBottom: 6, lineHeight: 16 },
    feedMeta: { fontSize: 11, color: '#999' },
  });
}
