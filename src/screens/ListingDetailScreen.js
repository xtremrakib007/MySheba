import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import StarRow from '../components/StarRow';
import ShareListingSheet from '../components/ShareListingSheet';
import * as marketplaceService from '../firebase/marketplaceService';
import { REPORT_REASONS, isFeatured } from '../firebase/marketplaceService';
import * as marketplaceReviewService from '../firebase/marketplaceReviewService';
import { ratingAvg } from '../firebase/marketplaceReviewService';
import * as businessProfileService from '../firebase/businessProfileService';
import { recordView } from '../firebase/recommendationService';
import VerifiedBadge from '../components/VerifiedBadge';
import BusinessBadge from '../components/BusinessBadge';
import MapPreview from '../components/MapPreview';
import * as settingsService from '../firebase/settingsService';

function formatUntil(ms) {
  return new Date(ms).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

const SCREEN_WIDTH = Math.min(Dimensions.get('window').width, 480);

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function ListingDetailScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, activeListingId, authUser, profile, setScreen, pricing, openBusinessProfile } = useApp();
  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellerStats, setSellerStats] = useState(null);
  const [sellerBiz, setSellerBiz] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [myReview, setMyReview] = useState(null);
  const [reviewStars, setReviewStars] = useState(0);
  const [reviewCommentModalOpen, setReviewCommentModalOpen] = useState(false);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);

  useEffect(() => {
    if (!activeListingId) return undefined;
    const unsub = marketplaceService.subscribeListing(activeListingId, (l) => {
      setListing(l);
      setLoading(false);
    });
    return unsub;
  }, [activeListingId]);

  useEffect(() => {
    if (!authUser || !listing?.category) return;
    recordView(authUser.uid, listing.category);
  }, [authUser, listing?.id, listing?.category]);

  useEffect(() => {
    if (!authUser || !activeListingId) return;
    marketplaceService.isListingSaved(authUser.uid, activeListingId).then(setSaved).catch(() => {});
  }, [authUser, activeListingId]);

  useEffect(() => {
    if (!listing?.sellerId) return undefined;
    const unsub = marketplaceReviewService.subscribeSellerStats(listing.sellerId, setSellerStats, () => {});
    return unsub;
  }, [listing?.sellerId]);

  useEffect(() => {
    if (!listing?.sellerId) return undefined;
    const unsub = businessProfileService.subscribeBusinessProfile(listing.sellerId, setSellerBiz, () => {});
    return unsub;
  }, [listing?.sellerId]);

  useEffect(() => {
    if (!listing?.sellerId) return undefined;
    const unsub = marketplaceReviewService.subscribeSellerReviews(listing.sellerId, setReviews, () => {});
    return unsub;
  }, [listing?.sellerId]);

  useEffect(() => {
    if (!authUser || !listing?.sellerId) return;
    marketplaceReviewService.getMyReview(authUser.uid, listing.sellerId).then((r) => {
      setMyReview(r);
      if (r) setReviewStars(r.rating);
    }).catch(() => {});
  }, [authUser, listing?.sellerId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.emptyText}>This listing is no longer available.</Text>
        <TouchableOpacity style={styles.backLinkBtn} onPress={goBackOrHome}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isOwner = authUser && listing.sellerId === authUser.uid;
  const images = listing.images && listing.images.length > 0 ? listing.images : [null];
  const avg = ratingAvg(sellerStats);

  const toggleSave = async () => {
    if (!authUser) return;
    setBusy(true);
    try {
      if (saved) {
        await marketplaceService.unsaveListing(authUser.uid, listing.id);
        setSaved(false);
      } else {
        await marketplaceService.saveListing(authUser.uid, listing);
        setSaved(true);
      }
    } catch (err) {
      showAlert('MySheba', 'Could not update saved items right now.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSold = async () => {
    setBusy(true);
    try {
      await marketplaceService.setListingStatus(listing.id, listing.status === 'sold' ? 'active' : 'sold');
    } catch (err) {
      showAlert('MySheba', 'Could not update the listing.');
    } finally {
      setBusy(false);
    }
  };

  const boostNow = () => {
    const cost = Number(settingsService.priceForRole(pricing, 'listingBoostCost', profile?.role)) || 0;
    const days = Number(pricing?.listingBoostDurationDays) || 7;
    const balance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
    const already = isFeatured(listing);
    showAlert(
      already ? 'Extend boost?' : 'Boost this listing?',
      `${already ? 'Extend the feature period' : 'Feature it at the top of Marketplace'} for ${days} day${days === 1 ? '' : 's'} for ${cost} pts. Your balance: ${balance} pts.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Boost',
          onPress: async () => {
            setBusy(true);
            try {
              await marketplaceService.boostListing(listing.id);
              showAlert('MySheba', 'Your listing is now featured!');
            } catch (err) {
              showAlert('MySheba', err.message || 'Could not boost this listing right now.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const confirmDelete = () => {
    showAlert('Delete listing?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await marketplaceService.deleteListing(listing.id);
            goBackOrHome();
          } catch (err) {
            showAlert('MySheba', 'Could not delete the listing.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const submitReview = async (comment) => {
    setReviewCommentModalOpen(false);
    if (!authUser || reviewStars < 1) return;
    setBusy(true);
    try {
      await marketplaceReviewService.submitReview({ uid: authUser.uid, name: profile?.name }, listing.sellerId, reviewStars, comment);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your review right now.');
    } finally {
      setBusy(false);
    }
  };

  const shareListing = () => setShareSheetOpen(true);

  const openReport = () => {
    if (!authUser) return;
    showAlert(
      'Report this listing',
      'Why are you reporting it?',
      [
        ...REPORT_REASONS.map((reason) => ({
          text: reason,
          onPress: async () => {
            try {
              await marketplaceService.reportListing(listing.id, listing.title, authUser.uid, reason);
              showAlert('MySheba', 'Thanks - our team will review this listing.');
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
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Listing</Text>
        <TouchableOpacity style={styles.reportIconBtn} onPress={shareListing}>
          <Text style={styles.reportIcon}>↗️</Text>
        </TouchableOpacity>
        {!isOwner && (
          <TouchableOpacity style={styles.reportIconBtn} onPress={openReport}>
            <Text style={styles.reportIcon}>🚩</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
          {images.map((uri, i) => (
            <View key={i} style={{ width: SCREEN_WIDTH, height: SCREEN_WIDTH }}>
              {uri ? (
                <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}><Text style={{ fontSize: 44 }}>📦</Text></View>
              )}
            </View>
          ))}
        </ScrollView>

        <View style={styles.body}>
          {listing.status === 'sold' && (
            <View style={styles.soldBanner}><Text style={styles.soldBannerText}>This item has been marked as SOLD</Text></View>
          )}
          {listing.status !== 'sold' && isFeatured(listing) && (
            <View style={styles.featuredBanner}>
              <Text style={styles.featuredBannerText}>
                ⭐ Featured until {formatUntil(listing.featuredUntil.seconds * 1000)}
              </Text>
            </View>
          )}
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>MYR {Number(listing.price || 0).toFixed(2)}{listing.negotiable ? '  ·  Negotiable' : ''}</Text>

          <View style={styles.metaRow}>
            <Text style={styles.metaTag}>{listing.category}</Text>
            <Text style={styles.metaTag}>{listing.condition}</Text>
          </View>

          {!!listing.location && <Text style={styles.metaLine}>📍 {listing.location}</Text>}
          <MapPreview latitude={listing.latitude} longitude={listing.longitude} address={listing.location} />
          <Text style={styles.metaLine}>Posted {formatDate(listing.createdAt)}</Text>

          {!!listing.description && (
            <>
              <Text style={styles.sectionLabel}>Description</Text>
              <Text style={styles.description}>{listing.description}</Text>
            </>
          )}

          <Text style={styles.sectionLabel}>Seller</Text>
          <TouchableOpacity
            style={styles.sellerRow}
            activeOpacity={sellerBiz?.isBusinessProfile ? 0.7 : 1}
            onPress={() => sellerBiz?.isBusinessProfile && openBusinessProfile(listing.sellerId)}
          >
            <View style={styles.sellerAvatar}>
              <Text style={styles.sellerInitial}>{(listing.sellerName || '?').trim().charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{listing.sellerName || 'Seller'}</Text>
              <VerifiedBadge verified={listing.sellerVerified} size="sm" />
              <BusinessBadge isBusiness={sellerBiz?.isBusinessProfile} size="sm" />
              <Text style={styles.ratingLine}>{avg ? `⭐ ${avg.toFixed(1)} (${sellerStats.ratingCount} review${sellerStats.ratingCount === 1 ? '' : 's'})` : 'No reviews yet'}</Text>
            </View>
            {sellerBiz?.isBusinessProfile && <Text style={styles.chevron}>›</Text>}
          </TouchableOpacity>

          {isOwner ? (
            <View style={styles.ownerActions}>
              {listing.status !== 'sold' && (
                <TouchableOpacity style={[styles.actionBtn, styles.boostBtn]} onPress={boostNow} disabled={busy}>
                  <Text style={styles.actionBtnText}>
                    {isFeatured(listing) ? '⭐ Extend Boost' : `🚀 Boost Listing (${settingsService.priceForRole(pricing, 'listingBoostCost', profile?.role) ?? 5} pts)`}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, styles.soldBtn]} onPress={toggleSold} disabled={busy}>
                <Text style={styles.actionBtnText}>{listing.status === 'sold' ? 'Mark as Active' : 'Mark as Sold'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} disabled={busy}>
                <Text style={styles.actionBtnText}>Delete Listing</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.buyerActions}>
              <TouchableOpacity style={styles.saveBtn} onPress={toggleSave} disabled={busy}>
                <Text style={styles.saveBtnText}>{saved ? '★ Saved' : '☆ Save'}</Text>
              </TouchableOpacity>
            </View>
          )}

          <Text style={styles.sectionLabel}>Seller Reviews</Text>
          {!isOwner && authUser && (
            <View style={styles.myReviewBox}>
              <Text style={styles.myReviewLabel}>{myReview ? 'Your review' : 'Rate this seller'}</Text>
              <StarRow value={reviewStars} onChange={setReviewStars} />
              <TouchableOpacity
                style={styles.reviewSubmitBtn}
                disabled={reviewStars < 1 || busy}
                onPress={() => setReviewCommentModalOpen(true)}
              >
                <Text style={styles.reviewSubmitText}>{myReview ? 'Update Review' : 'Submit Review'}</Text>
              </TouchableOpacity>
            </View>
          )}
          {reviews.length === 0 ? (
            <Text style={styles.noReviews}>No reviews yet.</Text>
          ) : (
            reviews.map((r) => (
              <View key={r.id} style={styles.reviewRow}>
                <View style={styles.reviewTopRow}>
                  <Text style={styles.reviewerName}>{r.reviewerName || 'A user'}</Text>
                  <StarRow value={r.rating} size={13} />
                </View>
                {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <PromptModal
        visible={reviewCommentModalOpen}
        title={`Your review (${reviewStars} star${reviewStars === 1 ? '' : 's'})`}
        placeholder="Add a comment (optional)"
        onCancel={() => setReviewCommentModalOpen(false)}
        onSubmit={submitReview}
      />

      <ShareListingSheet
        visible={shareSheetOpen}
        listing={listing}
        onClose={() => setShareSheetOpen(false)}
      />
    </View>
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
    photo: { width: '100%', height: '100%', backgroundColor: '#F1F3F4' },
    photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    body: { padding: 16 },
    soldBanner: { backgroundColor: '#FDECEA', borderRadius: radius.md, padding: 10, marginBottom: 12 },
    soldBannerText: { color: colors.error, fontWeight: '700', fontSize: 12, textAlign: 'center' },
    featuredBanner: { backgroundColor: '#FFF8E1', borderRadius: radius.md, padding: 10, marginBottom: 12 },
    featuredBannerText: { color: '#B45309', fontWeight: '700', fontSize: 12, textAlign: 'center' },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 4 },
    price: { fontSize: 17, fontWeight: '700', color: colors.primaryDark, marginBottom: 10 },
    metaRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    metaTag: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    metaLine: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    sectionLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 16, marginBottom: 6 },
    description: { fontSize: 13, color: colors.text, lineHeight: 19 },
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    chevron: { fontSize: 18, color: '#CCC' },
    sellerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    sellerInitial: { color: 'white', fontWeight: '700' },
    sellerName: { fontSize: 13, fontWeight: '600', color: colors.text },
    ratingLine: { fontSize: 11, color: '#B45309', fontWeight: '600', marginTop: 2 },
    myReviewBox: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
    myReviewLabel: { fontSize: 12, fontWeight: '700', color: colors.navy, marginBottom: 6 },
    reviewSubmitBtn: { marginTop: 10, backgroundColor: colors.primary, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 14 },
    reviewSubmitText: { color: 'white', fontWeight: '700', fontSize: 12 },
    noReviews: { fontSize: 12, color: '#999' },
    reviewRow: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
    reviewTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reviewerName: { fontSize: 12, fontWeight: '700', color: colors.text },
    reviewComment: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    buyerActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    saveBtn: { flex: 1, paddingVertical: 13, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    saveBtnText: { color: colors.navy, fontWeight: '700', fontSize: 13 },
    ownerActions: { gap: 10, marginTop: 22 },
    actionBtn: { borderRadius: radius.md, paddingVertical: 13, alignItems: 'center' },
    boostBtn: { backgroundColor: colors.warning },
    soldBtn: { backgroundColor: colors.secondary },
    deleteBtn: { backgroundColor: colors.error },
    actionBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 12 },
    backLinkBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    backLinkText: { color: colors.primary, fontWeight: '700' },
  });
}