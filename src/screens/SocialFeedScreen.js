import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as socialFeedService from '../firebase/socialFeedService';

// Next Update PRD §3 - the actual Social Feed (Facebook-style text/media
// posts), reachable from any account regardless of which homepage layout
// they're on (ServiceGrid's Social Feed tile -> AppContext.openSocialFeed).
// SocialHomeScreen.js's feed section is a short preview of the same
// socialPosts data with a "See all" link straight into this screen - this
// is the full, filterable feed.
//
// "Provide global and country/region feed modes" (PRD §3): implemented as
// a client-side filter/rank over the one live subscription
// (socialFeedService.subscribeActivePosts), same approach
// SocialHomeScreen.js already uses for its own ranking - avoids a second
// Firestore query or needing a composite index for status+country.
export default function SocialFeedScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, openSocialPostDetail, openCreateSocialPost, profile } = useApp();

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState(profile?.country ? 'country' : 'global'); // 'global' | 'country'

  useEffect(() => {
    const unsub = socialFeedService.subscribeActivePosts(
      (all) => { setPosts(all); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  const visiblePosts = useMemo(() => {
    if (mode === 'country' && profile?.country) {
      return posts.filter((p) => p.country === profile.country);
    }
    return posts;
  }, [posts, mode, profile?.country]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Social Feed</Text>
        <TouchableOpacity style={styles.postBtn} onPress={openCreateSocialPost}>
          <Text style={styles.postBtnText}>+ Post</Text>
        </TouchableOpacity>
      </LinearGradient>

      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeChip, mode === 'global' && styles.modeChipActive]} onPress={() => setMode('global')}>
          <Text style={[styles.modeChipText, mode === 'global' && styles.modeChipTextActive]}>🌐 Global</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, mode === 'country' && styles.modeChipActive, !profile?.country && styles.modeChipDisabled]}
          onPress={() => profile?.country && setMode('country')}
        >
          <Text style={[styles.modeChipText, mode === 'country' && styles.modeChipTextActive]}>
            📍 {profile?.country || 'My Country'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 30 }} />
        ) : visiblePosts.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {mode === 'country'
                ? `No posts from ${profile?.country} yet - be the first to share something.`
                : 'No posts yet - be the first to share something.'}
            </Text>
          </View>
        ) : (
          visiblePosts.map((item) => (
            <PostCard key={item.id} item={item} colors={colors} onPress={() => openSocialPostDetail(item.id)} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function PostCard({ item, colors, onPress }) {
  const styles = createStyles(colors);
  const image = item.images && item.images.length > 0 ? item.images[0] : null;
  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={styles.authorAvatar}>
          <Text style={styles.authorInitial}>{(item.authorName || '?').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName}>{item.authorName || 'MySheba user'}</Text>
          {!!item.country && <Text style={styles.countryTag}>{item.country}</Text>}
        </View>
      </View>
      {!!item.text && <Text style={styles.postText} numberOfLines={4}>{item.text}</Text>}
      {!!image && <Image source={{ uri: image }} style={styles.postImage} resizeMode="cover" />}
      <Text style={styles.metaLine}>❤️ {item.likeCount || 0}  💬 {item.commentCount || 0}  ↗️ {item.shareCount || 0}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 6, flex: 1 },
    postBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    postBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },

    modeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
    modeChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    modeChipDisabled: { opacity: 0.5 },
    modeChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    modeChipTextActive: { color: 'white' },

    body: { padding: 14, paddingBottom: 30 },
    empty: { paddingVertical: 40, alignItems: 'center' },
    emptyText: { fontSize: 12, color: '#888', textAlign: 'center', paddingHorizontal: 20 },

    card: { backgroundColor: colors.card || 'white', borderRadius: radius.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border || '#eee' },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    authorAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    authorInitial: { color: 'white', fontWeight: '700' },
    authorName: { fontSize: 13, fontWeight: '600', color: colors.text },
    countryTag: { fontSize: 10, color: '#999', fontWeight: '600' },
    postText: { fontSize: 13, color: colors.text, lineHeight: 19, marginBottom: 8 },
    postImage: { width: '100%', height: 180, borderRadius: radius.md, marginBottom: 8, backgroundColor: '#F1F3F4' },
    metaLine: { fontSize: 11, color: '#999' },
  });
}
