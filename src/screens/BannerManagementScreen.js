import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AdBannerPreview from '../components/AdBannerPreview';
import BannerAdFormModal from '../components/BannerAdFormModal';
import { FEATURE_ID_LIST, FEATURE_LABELS } from '../constants/adFeatures';
import { PLACEMENT_LABELS } from '../constants/adPlacements';
import { AD_STATUS_LABELS, BANNER_STATUS_FILTERS, CLICK_ACTION_TYPES } from '../constants/adEnums';
import * as adService from '../firebase/adService';

// PHASE 3 - MySheba Advertisement System - Super Admin Banner Management.
//
// Super Admin-only screen (same gating shape as AdFeatureControlsScreen.js
// - profile.role === 'superadmin', enforced again server-side by
// firestore.rules' isSuperadmin() write check on advertisements/ and by
// storage.rules' role check on ads/banners/, so this screen's gate is a UX
// convenience, not the actual security boundary).
//
// This is a NEW banner system (adType 'banner' Advertisement docs, per
// src/types/ads.ts) - entirely separate from the pre-existing home page
// banner slider (banners/{id} - see src/firebase/bannerService.js,
// src/components/BannerSlider.js, AdminHomeScreen's "Banners" tab). That
// older system keeps working exactly as before; nothing here touches it.

const STATUS_TONES = {
  active: 'on',
  scheduled: 'info',
  paused: 'warn',
  draft: 'off',
  expired: 'off',
  rejected: 'error',
  pending_approval: 'warn',
  approved: 'info',
  archived: 'off',
};

function fmtDate(dateLike) {
  if (!dateLike) return '—';
  const ms = typeof dateLike.toMillis === 'function' ? dateLike.toMillis() : typeof dateLike.seconds === 'number' ? dateLike.seconds * 1000 : null;
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function BannerCard({ ad, onEdit, onDelete, onActivate, onDeactivate, onPause, onArchive, busy }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const effectiveStatus = adService.getEffectiveAdStatus(ad);
  const tone = STATUS_TONES[effectiveStatus] || 'off';
  const featureId = ad.targetFeatures && ad.targetFeatures[0];
  const placementId = ad.placements && ad.placements[0];
  const hasUrl = ad.clickAction && ad.clickAction.type === CLICK_ACTION_TYPES.URL && !!ad.clickAction.value;

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => onEdit(ad)} activeOpacity={0.8}>
        <AdBannerPreview ad={ad} height={110} style={styles.cardImage} />
      </TouchableOpacity>

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.name} numberOfLines={1}>{ad.name || 'Untitled banner'}</Text>
          <View style={[styles.statusBadge, styles[`statusBadge_${tone}`]]}>
            <Text style={[styles.statusBadgeText, styles[`statusBadgeText_${tone}`]]}>{AD_STATUS_LABELS[effectiveStatus] || effectiveStatus}</Text>
          </View>
        </View>

        {!!ad.advertiserName && <Text style={styles.meta}>🏢 {ad.advertiserName}</Text>}
        <Text style={styles.meta}>
          {featureId ? FEATURE_LABELS[featureId] : '—'}
          {placementId ? ` · ${PLACEMENT_LABELS[placementId]}` : ''}
        </Text>
        <Text style={styles.meta}>{fmtDate(ad.startAt)} → {fmtDate(ad.endAt)}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaSmall}>{hasUrl ? '🔗 Has link' : '🚫 No link'}</Text>
          <Text style={styles.metaSmall}>Priority {ad.priority ?? 0}</Text>
          <Text style={styles.metaSmall}>Weight {ad.weight ?? 1}</Text>
        </View>

        {busy ? (
          <View style={styles.actionsRow}><ActivityIndicator size="small" color={colors.primary} /></View>
        ) : (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(ad)}>
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
            {(effectiveStatus === 'active' || effectiveStatus === 'scheduled') ? (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onPause(ad)}>
                <Text style={styles.actionBtnText}>Pause</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onActivate(ad)}>
                <Text style={styles.actionBtnText}>Activate</Text>
              </TouchableOpacity>
            )}
            {effectiveStatus !== 'draft' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onDeactivate(ad)}>
                <Text style={styles.actionBtnText}>Deactivate</Text>
              </TouchableOpacity>
            )}
            {effectiveStatus !== 'archived' && (
              <TouchableOpacity style={styles.actionBtn} onPress={() => onArchive(ad)}>
                <Text style={styles.actionBtnText}>Archive</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(ad)}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export default function BannerManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [banners, setBanners] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [featureFilter, setFeatureFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    return adService.subscribeBannerAdvertisements(setBanners, () => setBanners([]));
  }, [isSuperadmin]);

  const filtered = useMemo(() => {
    const list = banners || [];
    return list.filter((ad) => {
      const matchesStatus = statusFilter === 'all' || adService.getEffectiveAdStatus(ad) === statusFilter;
      const matchesFeature = featureFilter === 'all' || (ad.targetFeatures && ad.targetFeatures[0] === featureFilter);
      return matchesStatus && matchesFeature;
    });
  }, [banners, statusFilter, featureFilter]);

  const openCreate = () => { setEditingBanner(null); setFormVisible(true); };
  const openEdit = (ad) => { setEditingBanner(ad); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingBanner(null); };

  const submitForm = async (payload) => {
    if (editingBanner) {
      await adService.updateAdvertisement(editingBanner.id, payload);
    } else {
      await adService.createAdvertisement(payload);
    }
    closeForm();
  };

  const runAction = async (ad, action, label) => {
    if (busyId) return;
    setBusyId(ad.id);
    try {
      await action();
    } catch (e) {
      showAlert('MySheba', e.message || `Could not ${label.toLowerCase()} this banner.`);
    } finally {
      setBusyId(null);
    }
  };

  const onActivate = (ad) => runAction(ad, () => adService.activateAdvertisement(ad), 'activate');
  const onDeactivate = (ad) => runAction(ad, () => adService.deactivateAdvertisement(ad.id), 'deactivate');
  const onPause = (ad) => runAction(ad, () => adService.pauseAdvertisement(ad.id), 'pause');
  const onArchive = (ad) => runAction(ad, () => adService.archiveAdvertisement(ad.id), 'archive');

  const onDelete = (ad) => {
    showAlert(
      'Delete Banner',
      `Delete "${ad.name || 'this banner'}"? This also removes its uploaded image. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            runAction(
              ad,
              async () => {
                await adService.deleteAdvertisement(ad.id);
                await adService.deleteBannerCreative({
                  imageStoragePath: ad.imageStoragePath,
                  thumbnailStoragePath: ad.thumbnailStoragePath,
                });
              },
              'delete'
            ),
        },
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
        <Text style={styles.headerTitle}>📢 Banner Management</Text>
        {isSuperadmin && (
          <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can manage banners.</Text>
        </View>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
            {BANNER_STATUS_FILTERS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
            <TouchableOpacity
              style={[styles.filterChip, featureFilter === 'all' && styles.filterChipActive]}
              onPress={() => setFeatureFilter('all')}
            >
              <Text style={[styles.filterChipText, featureFilter === 'all' && styles.filterChipTextActive]}>All Features</Text>
            </TouchableOpacity>
            {FEATURE_ID_LIST.map((id) => (
              <TouchableOpacity
                key={id}
                style={[styles.filterChip, featureFilter === id && styles.filterChipActive]}
                onPress={() => setFeatureFilter(id)}
              >
                <Text style={[styles.filterChipText, featureFilter === id && styles.filterChipTextActive]}>{FEATURE_LABELS[id]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {banners === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
              {filtered.length === 0 ? (
                <View style={styles.center}>
                  <Text style={{ fontSize: 36, marginBottom: 8 }}>🖼️</Text>
                  <Text style={styles.emptyText}>No banners match this filter.</Text>
                </View>
              ) : (
                filtered.map((ad) => (
                  <BannerCard
                    key={ad.id}
                    ad={ad}
                    busy={busyId === ad.id}
                    onEdit={openEdit}
                    onDelete={onDelete}
                    onActivate={onActivate}
                    onDeactivate={onDeactivate}
                    onPause={onPause}
                    onArchive={onArchive}
                  />
                ))
              )}
            </ScrollView>
          )}
        </>
      )}

      <BannerAdFormModal visible={formVisible} banner={editingBanner} onSubmit={submitForm} onCancel={closeForm} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 4, flex: 1 },
    addBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill },
    addBtnText: { color: 'white', fontWeight: '700', fontSize: 12 },
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    filterBar: { flexGrow: 0, marginTop: spacing.sm },
    filterBarContent: { paddingHorizontal: spacing.md, gap: 8, paddingBottom: 6 },
    filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 11.5, fontWeight: '600', color: colors.text },
    filterChipTextActive: { color: 'white' },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden', marginBottom: 12,
    },
    cardImage: { width: '100%', borderRadius: 0 },
    cardBody: { padding: 12 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    name: { fontSize: 14.5, fontWeight: '700', color: colors.text, flex: 1 },
    meta: { fontSize: 11.5, color: colors.textSecondary, marginBottom: 2 },
    metaRow: { flexDirection: 'row', gap: 12, marginTop: 4, marginBottom: 4 },
    metaSmall: { fontSize: 10.5, color: colors.textSecondary, fontWeight: '600' },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
    actionBtnText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    deleteBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
    deleteBtnText: { color: colors.error, fontSize: 11, fontWeight: '700' },
    statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
    statusBadgeText: { fontSize: 9.5, fontWeight: '700' },
    statusBadge_on: { backgroundColor: '#E8F5E9' },
    statusBadgeText_on: { color: '#2E7D32' },
    statusBadge_info: { backgroundColor: '#E3F2FD' },
    statusBadgeText_info: { color: '#1565C0' },
    statusBadge_warn: { backgroundColor: '#FFF8E1' },
    statusBadgeText_warn: { color: '#F9A825' },
    statusBadge_off: { backgroundColor: '#EEEEEE' },
    statusBadgeText_off: { color: '#616161' },
    statusBadge_error: { backgroundColor: '#FFEBEE' },
    statusBadgeText_error: { color: '#C62828' },
  });
}
