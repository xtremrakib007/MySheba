// Local Services provider detail. Direct user-to-user messaging is retired;
// visitors use the service-request flow instead.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Dimensions, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import StarRow from '../components/StarRow';
import * as serviceProviderService from '../firebase/serviceProviderService';
import { REPORT_REASONS, ratingAvg } from '../firebase/serviceProviderService';
import * as serviceReviewService from '../firebase/serviceReviewService';
import * as serviceRequestService from '../firebase/serviceRequestService';
import * as businessProfileService from '../firebase/businessProfileService';
import BusinessBadge from '../components/BusinessBadge';
import MapPreview from '../components/MapPreview';

const SCREEN_WIDTH = Math.min(Dimensions.get('window').width, 480);

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ServiceProviderDetailScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, activeProviderId, authUser, profile, openBusinessProfile } = useApp();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewCommentModalOpen, setReviewCommentModalOpen] = useState(false);
  const [ownerBiz, setOwnerBiz] = useState(null);

  useEffect(() => {
    if (!activeProviderId) return undefined;
    return serviceProviderService.subscribeProvider(activeProviderId, (value) => {
      setProvider(value);
      setLoading(false);
    });
  }, [activeProviderId]);

  useEffect(() => {
    if (!provider?.ownerId) return undefined;
    return businessProfileService.subscribeBusinessProfile(provider.ownerId, setOwnerBiz, () => {});
  }, [provider?.ownerId]);

  useEffect(() => {
    if (!activeProviderId) return undefined;
    return serviceReviewService.subscribeProviderReviews(activeProviderId, setReviews);
  }, [activeProviderId]);

  useEffect(() => {
    if (!authUser || !activeProviderId) return;
    serviceReviewService.getMyReview(authUser.uid, activeProviderId).then((review) => {
      setMyReview(review);
      if (review) setReviewStars(review.rating);
    }).catch(() => {});
  }, [authUser, activeProviderId]);

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator size="large" color={colors.primary} /></View>;

  if (!provider) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyText}>This service is no longer available.</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goBackOrHome}><Text style={styles.backLinkText}>Go back</Text></TouchableOpacity>
      </View>
    );
  }

  const isOwner = authUser && provider.ownerId === authUser.uid;
  const avg = ratingAvg(provider);

  const sendRequest = async (message) => {
    setRequestModalOpen(false);
    if (!authUser || isOwner) return;
    setBusy(true);
    try {
      await serviceRequestService.createServiceRequest({ uid: authUser.uid, name: profile?.name }, provider, message);
      showAlert('Request sent', `${provider.name} will get back to you shortly.`);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not send your request right now.');
    } finally {
      setBusy(false);
    }
  };

  const submitReview = async (comment) => {
    setReviewCommentModalOpen(false);
    if (!authUser || reviewStars < 1 || isOwner) return;
    setBusy(true);
    try {
      await serviceReviewService.submitReview({ uid: authUser.uid, name: profile?.name }, provider.id, reviewStars, comment);
      const review = await serviceReviewService.getMyReview(authUser.uid, provider.id);
      setMyReview(review);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your review right now.');
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async () => {
    setBusy(true);
    try {
      await serviceProviderService.setProviderStatus(provider.id, provider.status === 'hidden' ? 'active' : 'hidden');
    } catch (err) {
      showAlert('MySheba', 'Could not update your service listing.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    showAlert('Delete this service listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        try {
          await serviceProviderService.deleteProvider(provider.id);
          goBackOrHome();
        } catch (err) {
          showAlert('MySheba', 'Could not delete your service listing.');
        } finally {
          setBusy(false);
        }
      } },
    ]);
  };

  const shareProvider = async () => {
    try {
      await Share.share({ message: `${provider.name}\n\n${provider.category}${provider.serviceArea ? `\n📍 ${provider.serviceArea}` : ''}\n\nCheck it out on MySheba!` });
    } catch (_) {}
  };

  const openReport = () => {
    if (!authUser) return;
    showAlert('Report this service', 'Why are you reporting it?', [
      ...REPORT_REASONS.map((reason) => ({
        text: reason,
        onPress: async () => {
          try {
            await serviceProviderService.reportProvider(provider.id, provider.name, authUser.uid, reason);
            showAlert('MySheba', 'Thanks - our team will review this listing.');
          } catch (_) {
            showAlert('MySheba', 'Could not submit your report right now.');
          }
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Service</Text>
        <TouchableOpacity style={styles.reportIconBtn} onPress={shareProvider}><Text style={styles.reportIcon}>↗️</Text></TouchableOpacity>
        {!isOwner && <TouchableOpacity style={styles.reportIconBtn} onPress={openReport}><Text style={styles.reportIcon}>🚩</Text></TouchableOpacity>}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.6 }}>
          {provider.photo ? <Image source={{ uri: provider.photo }} style={styles.photo} resizeMode="cover" /> : <View style={[styles.photo, styles.photoPlaceholder]}><Text style={{ fontSize: 44 }}>🧰</Text></View>}
        </View>

        <View style={styles.body}>
          {provider.status === 'hidden' && <View style={styles.hiddenBanner}><Text style={styles.hiddenBannerText}>This listing is currently HIDDEN</Text></View>}
          <Text style={styles.title}>{provider.name}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.metaTag}>{provider.category}</Text>
            <Text style={styles.ratingLine}>{avg ? `⭐ ${avg.toFixed(1)} (${provider.ratingCount} review${provider.ratingCount === 1 ? '' : 's'})` : 'No reviews yet'}</Text>
          </View>
          {(provider.priceMin || provider.priceMax) ? <Text style={styles.price}>MYR {Number(provider.priceMin || 0).toFixed(2)}{provider.priceMax ? ` – ${Number(provider.priceMax).toFixed(2)}` : ''}</Text> : null}
          {!!provider.serviceArea && <Text style={styles.metaLine}>📍 {provider.serviceArea}</Text>}
          <MapPreview latitude={provider.latitude} longitude={provider.longitude} address={provider.serviceArea} />
          {!!provider.availability && <Text style={styles.metaLine}>🕒 {provider.availability}</Text>}
          <Text style={styles.metaLine}>Posted {formatDate(provider.createdAt)}</Text>

          {!!provider.description && <><Text style={styles.sectionLabel}>Description</Text><Text style={styles.description}>{provider.description}</Text></>}

          <Text style={styles.sectionLabel}>Provider</Text>
          <TouchableOpacity style={styles.ownerRow} activeOpacity={ownerBiz?.isBusinessProfile ? 0.7 : 1} onPress={() => ownerBiz?.isBusinessProfile && openBusinessProfile(provider.ownerId)}>
            <View style={styles.ownerAvatar}><Text style={styles.ownerInitial}>{(provider.ownerName || '?').trim().charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.ownerName}>{provider.ownerName || 'Provider'}</Text><BusinessBadge isBusiness={ownerBiz?.isBusinessProfile} size="sm" /></View>
            {ownerBiz?.isBusinessProfile && <Text style={styles.chevron}>›</Text>}
          </TouchableOpacity>

          {isOwner ? (
            <View style={styles.ownerActions}>
              <TouchableOpacity style={[styles.actionBtn, styles.hideBtn]} onPress={toggleHidden} disabled={busy}><Text style={styles.actionBtnText}>{provider.status === 'hidden' ? 'Unhide Listing' : 'Hide Listing'}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} disabled={busy}><Text style={styles.actionBtnText}>Delete Listing</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buyerActions}>
              <TouchableOpacity style={styles.requestBtn} onPress={() => setRequestModalOpen(true)} disabled={busy}><Text style={styles.requestBtnText}>📩 Request Service</Text></TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionLabel}>Reviews</Text>
          {!isOwner && authUser && (
            <View style={styles.myReviewBox}>
              <Text style={styles.myReviewLabel}>{myReview ? 'Your review' : 'Leave a review'}</Text>
              <StarRow value={reviewStars} onChange={setReviewStars} />
              <TouchableOpacity style={styles.reviewSubmitBtn} disabled={reviewStars < 1 || busy} onPress={() => setReviewCommentModalOpen(true)}>
                <Text style={styles.reviewSubmitText}>{myReview ? 'Update Review' : 'Submit Review'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {reviews.length === 0 ? <Text style={styles.noReviews}>No reviews yet.</Text> : reviews.map((review) => (
            <View key={review.id} style={styles.reviewRow}>
              <View style={styles.reviewTopRow}><Text style={styles.reviewerName}>{review.reviewerName || 'A user'}</Text><StarRow value={review.rating} size={13} /></View>
              {!!review.comment && <Text style={styles.reviewComment}>{review.comment}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>

      <PromptModal visible={requestModalOpen} title={`Request "${provider.name}"`} placeholder="What do you need help with?" onCancel={() => setRequestModalOpen(false)} onSubmit={sendRequest} />
      <PromptModal visible={reviewCommentModalOpen} title={`Your review (${reviewStars} star${reviewStars === 1 ? '' : 's'})`} placeholder="Add a comment (optional)" onCancel={() => setReviewCommentModalOpen(false)} onSubmit={submitReview} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 }, backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    reportIconBtn: { padding: 4 }, reportIcon: { fontSize: 16 },
    photo: { width: '100%', height: '100%', backgroundColor: '#F1F3F4' }, photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    body: { padding: 16 }, hiddenBanner: { backgroundColor: '#FDECEA', borderRadius: radius.md, padding: 10, marginBottom: 12 }, hiddenBannerText: { color: colors.error, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 6 }, metaTag: { fontSize: 11, fontWeight: '700', color: colors.primaryDark, backgroundColor: '#F0F0FA', paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.sm }, ratingLine: { fontSize: 12, color: '#B45309', fontWeight: '600' },
    price: { fontSize: 16, fontWeight: '700', color: colors.primaryDark, marginBottom: 8 }, metaLine: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 6 }, description: { fontSize: 13, color: colors.text, lineHeight: 19 },
    ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, ownerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }, ownerInitial: { color: 'white', fontWeight: '700' }, ownerName: { fontSize: 13, fontWeight: '600', color: colors.text }, chevron: { fontSize: 18, color: '#CCC' },
    ownerActions: { gap: 10, marginTop: 18 }, buyerActions: { marginTop: 18 }, actionBtn: { paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' }, actionBtnText: { color: 'white', fontWeight: '700', fontSize: 12 }, hideBtn: { backgroundColor: colors.scrim }, deleteBtn: { backgroundColor: colors.error },
    requestBtn: { width: '100%', backgroundColor: colors.primaryDark, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' }, requestBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    myReviewBox: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 }, myReviewLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 6 }, reviewSubmitBtn: { marginTop: 10, backgroundColor: colors.primary, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14 }, reviewSubmitText: { color: 'white', fontWeight: '700', fontSize: 12 }, noReviews: { fontSize: 12, color: '#999' }, reviewRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border }, reviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, reviewerName: { fontSize: 12, fontWeight: '700', color: colors.text }, reviewComment: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 12 }, backLinkBtn: { paddingVertical: 8, paddingHorizontal: 16 }, backLinkText: { color: colors.primary, fontWeight: '700' },
  });
}