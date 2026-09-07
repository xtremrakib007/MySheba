import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, TextInput, ScrollView, KeyboardAvoidingView, Platform, Share, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as socialFeedService from '../firebase/socialFeedService';
import { REPORT_REASONS } from '../firebase/socialFeedService';

const SCREEN_WIDTH = Math.min(Dimensions.get('window').width, 480);

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// Next Update PRD §3 - post detail: like/react, comments, sharing,
// reporting. Structurally an exact mirror of CommunityPostDetailScreen.js
// (same interaction shapes were already right for this), pointed at
// socialFeedService and without the "type" header pill / "mark resolved"
// owner action Community posts have (a general post has no type to show
// and nothing to "resolve").
export default function SocialPostDetailScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, activeSocialPostId, authUser, profile } = useApp();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    if (!activeSocialPostId) return undefined;
    const unsub = socialFeedService.subscribePost(activeSocialPostId, (p) => {
      setPost(p);
      setLoading(false);
    });
    return unsub;
  }, [activeSocialPostId]);

  useEffect(() => {
    if (!activeSocialPostId) return undefined;
    const unsub = socialFeedService.subscribeComments(activeSocialPostId, setComments, () => {});
    return unsub;
  }, [activeSocialPostId]);

  useEffect(() => {
    if (!authUser || !activeSocialPostId) return;
    socialFeedService.isPostLiked(authUser.uid, activeSocialPostId).then(setLiked).catch(() => {});
  }, [authUser, activeSocialPostId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyText}>This post is no longer available.</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goBackOrHome}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = authUser && post.authorId === authUser.uid;
  const images = post.images && post.images.length > 0 ? post.images : [];

  const toggleLike = async () => {
    if (!authUser) return;
    setBusy(true);
    try {
      if (liked) {
        await socialFeedService.unlikePost(authUser.uid, post.id);
        setLiked(false);
      } else {
        await socialFeedService.likePost(authUser.uid, post.id);
        setLiked(true);
      }
    } catch (err) {
      showAlert('MySheba', 'Could not update your like right now.');
    } finally {
      setBusy(false);
    }
  };

  const sharePost = async () => {
    try {
      const result = await Share.share({ message: `${post.text || ''}${post.authorName ? `\n\n- ${post.authorName} on MySheba` : ''}` });
      // Only counts as a share if the person actually completed the
      // native share sheet (not dismissed) - `activityType` is iOS-only
      // and may be undefined even on a completed share there, so this
      // only excludes the one action type React Native guarantees means
      // "the sheet was closed with nothing sent".
      if (result.action !== Share.dismissedAction) {
        await socialFeedService.recordShare(post.id);
      }
    } catch (err) {
      // user cancelled the share sheet - nothing to do
    }
  };

  const sendComment = async () => {
    if (!commentText.trim() || !authUser) return;
    setSendingComment(true);
    try {
      await socialFeedService.addComment(post.id, { uid: authUser.uid, name: profile?.name }, commentText);
      setCommentText('');
    } catch (err) {
      showAlert('MySheba', 'Could not post your comment right now.');
    } finally {
      setSendingComment(false);
    }
  };

  const confirmDelete = () => {
    showAlert('Delete post?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await socialFeedService.deletePost(post.id);
            goBackOrHome();
          } catch (err) {
            showAlert('MySheba', 'Could not delete the post.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const openReport = () => {
    if (!authUser) return;
    showAlert(
      'Report this post',
      'Why are you reporting it?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: async () => {
            try {
              await socialFeedService.reportPost(post.id, post.text, authUser.uid, reason);
              showAlert('MySheba', "Thanks - our team will review this post.");
            } catch (err) {
              showAlert('MySheba', 'Could not submit your report right now.');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Post</Text>
        {!isOwner && (
          <TouchableOpacity style={styles.reportIconBtn} onPress={openReport}>
            <Text style={styles.reportIcon}>🚩</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {images.length > 0 && (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.65 }}>
            {images.map((uri, i) => (
              <Image key={i} source={{ uri }} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.65 }} resizeMode="cover" />
            ))}
          </ScrollView>
        )}

        <View style={styles.body}>
          <View style={styles.authorRow}>
            <View style={styles.authorAvatar}>
              <Text style={styles.authorInitial}>{(post.authorName || '?').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.authorName}>{post.authorName || 'MySheba user'}</Text>
              <Text style={styles.metaLine}>
                {formatDate(post.createdAt)}{!!post.country && ` · 📍 ${post.country}`}
              </Text>
            </View>
          </View>

          {!!post.text && <Text style={styles.description}>{post.text}</Text>}

          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, liked && styles.actionBtnActive]} onPress={toggleLike} disabled={busy}>
              <Text style={[styles.actionBtnText, liked && styles.actionBtnTextActive]}>{liked ? '❤️' : '🤍'} {post.likeCount || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={sharePost}>
              <Text style={styles.actionBtnText}>↗️ Share {post.shareCount ? `(${post.shareCount})` : ''}</Text>
            </TouchableOpacity>
          </View>

          {isOwner && (
            <View style={styles.ownerActions}>
              <TouchableOpacity style={[styles.ownerBtn, styles.deleteBtn]} onPress={confirmDelete} disabled={busy}>
                <Text style={styles.ownerBtnText}>Delete Post</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionLabel}>Comments ({comments.length})</Text>
          {comments.length === 0 ? (
            <Text style={styles.noComments}>No comments yet. Start the conversation!</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <View style={styles.commentAvatar}>
                  <Text style={styles.commentInitial}>{(c.authorName || '?').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.commentBody}>
                  <Text style={styles.commentAuthor}>{c.authorName || 'MySheba user'}</Text>
                  <Text style={styles.commentText}>{c.text}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {authUser && (
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Write a comment..."
            placeholderTextColor="#9AA0A6"
            value={commentText}
            onChangeText={setCommentText}
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={sendComment} disabled={sendingComment || !commentText.trim()}>
            {sendingComment ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.sendBtnText}>Send</Text>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    reportIconBtn: { padding: 4 },
    reportIcon: { fontSize: 16 },
    body: { padding: 16 },
    description: { fontSize: 14, color: colors.text, lineHeight: 20, marginTop: 10 },
    authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
    authorAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    authorInitial: { color: 'white', fontWeight: '700' },
    authorName: { fontSize: 14, fontWeight: '700', color: colors.text },
    metaLine: { fontSize: 11, color: colors.textSecondary },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
    actionBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    actionBtnActive: { backgroundColor: '#FDECEA', borderColor: colors.error },
    actionBtnText: { fontWeight: '700', fontSize: 13, color: colors.navy },
    actionBtnTextActive: { color: colors.error },
    ownerActions: { gap: 10, marginTop: 14 },
    ownerBtn: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    deleteBtn: { backgroundColor: colors.error },
    ownerBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 22, marginBottom: 10 },
    noComments: { fontSize: 12, color: colors.textSecondary },
    commentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    commentAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
    commentInitial: { color: 'white', fontWeight: '700', fontSize: 11 },
    commentBody: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 10 },
    commentAuthor: { fontSize: 11, fontWeight: '700', color: colors.text, marginBottom: 3 },
    commentText: { fontSize: 12, color: colors.text, lineHeight: 17 },
    commentInputRow: { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'flex-end' },
    commentInput: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: colors.text, maxHeight: 90 },
    sendBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10 },
    sendBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 12 },
    backLinkBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    backLinkText: { color: colors.primary, fontWeight: '700' },
  });
}
