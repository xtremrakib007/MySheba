import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { DateField, SearchPicker } from './ui';
import AdBannerPreview from './AdBannerPreview';
import ChipMultiSelect from './ChipMultiSelect';
import TagMultiSelect from './TagMultiSelect';
import { FEATURE_ID_LIST, FEATURE_LABELS } from '../constants/adFeatures';
import { PLACEMENTS_BY_FEATURE, PLACEMENT_LABELS } from '../constants/adPlacements';
import { AD_STATUSES, AD_TYPES, CLICK_ACTION_TYPES } from '../constants/adEnums';
import { AD_USER_TYPE_LIST, AD_USER_TYPE_LABELS } from '../constants/adTargeting';
import { LANGUAGE_LIST, LANGUAGES } from '../i18n/LanguageContext';
import { countries } from '../data/countries';
import { uploadBannerCreative, deleteBannerCreative, validateClickUrl, subscribeCampaigns, subscribeAdvertisers, getEffectiveAdStatus } from '../firebase/adService';

// PHASE 5 - MY SHEBA AD TARGETING ENGINE.
//
// Fixed-option lists for the Targeting section below, built once at
// module scope (not per-render) since none of these change while the
// app is running. Feature reuses the same FEATURE_ID_LIST the Feature
// picker above already uses - "Additional Target Features" lets an
// admin restrict a banner to more than just the single primary Feature/
// Placement combo above (e.g. a banner placed at RECHARGE_TOP that
// should ALSO only ever be considered a match for the 'mobile_recharge'
// feature context - which is already implied by the primary Feature, but
// exposing it here lets an admin layer on e.g. 'internet_package' too,
// for a promo that spans both).
const TARGET_FEATURE_ITEMS = FEATURE_ID_LIST.map((id) => ({ key: id, name: FEATURE_LABELS[id] }));
const TARGET_COUNTRY_ITEMS = countries.map((c) => ({ key: c.code, name: c.name, flag: c.flag }));
const TARGET_USER_TYPE_ITEMS = AD_USER_TYPE_LIST.map((id) => ({ key: id, name: AD_USER_TYPE_LABELS[id] }));
const TARGET_LANGUAGE_ITEMS = LANGUAGE_LIST.map((code) => ({ key: code, name: LANGUAGES[code]?.label || code }));

// PHASE 3 - MySheba Advertisement System - Super Admin Banner Management.
//
// Create/Edit form for one banner Advertisement (adType 'banner'). `banner`
// is null for "add new", or an existing Advertisement doc (with `id`) for
// "edit" - same add/edit-in-one-modal shape as PackageFormModal.js/
// BannerFormModal.js elsewhere in this app.
//
// Every field from the brief's "CREATE BANNER" list lives here: Banner
// Name, Advertiser, Upload Banner Image, optional Click URL, Feature,
// Placement, Start Date, End Date, Priority, Weight, Status - plus the
// required Preview step before saving.

// Only the statuses an admin picks directly when creating/editing. The
// rest of AD_STATUSES (pending_approval, approved, rejected, expired) are
// workflow/schedule-driven outcomes, not something typed in on this form -
// see BannerManagementScreen's Activate/Deactivate/Pause/Archive actions
// and adService.js's activateAdvertisement for how a banner actually
// reaches 'scheduled'/'active'/'archived' after creation.
const STATUS_CHOICES = [
  { key: AD_STATUSES.DRAFT, label: 'Draft' },
  { key: AD_STATUSES.SCHEDULED, label: 'Scheduled' },
  { key: AD_STATUSES.ACTIVE, label: 'Active' },
  { key: AD_STATUSES.PAUSED, label: 'Paused' },
];

const EMPTY_FORM = {
  name: '',
  campaignId: '',
  advertiserId: '',
  advertiserName: '',
  imageUrl: '',
  thumbnailUrl: '',
  imageStoragePath: '',
  thumbnailStoragePath: '',
  clickUrl: '',
  featureId: '',
  placementId: '',
  startDate: '',
  endDate: '',
  priority: '0',
  weight: '1',
  status: AD_STATUSES.DRAFT,
  // PHASE 5 - additional targeting, on top of the primary Feature/
  // Placement above. Every array here defaults empty = unrestricted,
  // matching Advertisement.target*'s own convention (src/types/ads.ts).
  targetFeatures: [],
  targetCountries: [],
  targetStates: [],
  targetCities: [],
  targetAreas: [],
  targetOutlets: [],
  targetUserTypes: [],
  targetLanguages: [],
};

function toFormState(ad) {
  if (!ad) return EMPTY_FORM;
  const clickUrl = ad.clickAction && ad.clickAction.type === CLICK_ACTION_TYPES.URL ? ad.clickAction.value || '' : '';
  return {
    ...EMPTY_FORM,
    name: ad.name || '',
    campaignId: ad.campaignId || '',
    advertiserId: ad.advertiserId || '',
    advertiserName: ad.advertiserName || '',
    imageUrl: ad.imageUrl || '',
    thumbnailUrl: ad.thumbnailUrl || '',
    imageStoragePath: ad.imageStoragePath || '',
    thumbnailStoragePath: ad.thumbnailStoragePath || '',
    clickUrl,
    featureId: (ad.targetFeatures && ad.targetFeatures[0]) || '',
    placementId: (ad.placements && ad.placements[0]) || '',
    startDate: dateToInputString(ad.startAt),
    endDate: dateToInputString(ad.endAt),
    priority: ad.priority != null ? String(ad.priority) : '0',
    weight: ad.weight != null ? String(ad.weight) : '1',
    status: ad.status || AD_STATUSES.DRAFT,
    // PHASE 5 - "Additional Target Features" only shows features beyond
    // the primary one at index 0 (which the Feature picker above already
    // covers and buildAdvertisementPayload always re-inserts) - otherwise
    // re-editing a banner would show its own primary feature pre-checked
    // in both places, which is redundant, not wrong, but confusing on a
    // re-open.
    targetFeatures: (ad.targetFeatures || []).slice(1),
    targetCountries: ad.targetCountries || [],
    targetStates: ad.targetStates || [],
    targetCities: ad.targetCities || [],
    targetAreas: ad.targetAreas || [],
    targetOutlets: ad.targetOutlets || [],
    targetUserTypes: ad.targetUserTypes || [],
    targetLanguages: ad.targetLanguages || [],
  };
}

function dateToInputString(ts) {
  if (!ts) return '';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : typeof ts.seconds === 'number' ? ts.seconds * 1000 : null;
  if (!ms) return '';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Builds the payload createAdvertisement/updateAdvertisement expect from
 * this form's local state. Exported so BannerManagementScreen can build
 * the same shape without duplicating the field mapping.
 */
export function buildAdvertisementPayload(form) {
  const clickCheck = validateClickUrl(form.clickUrl);
  const clickAction = clickCheck.normalized
    ? { type: CLICK_ACTION_TYPES.URL, value: clickCheck.normalized }
    : { type: CLICK_ACTION_TYPES.NONE };

  return {
    name: form.name.trim(),
    // PHASE 9 - a banner "attached" to a campaign (via the Campaign
    // picker below) carries that campaign's own advertiserId forward, so
    // adTrackingService.js's DAILY ROLLUP can denormalize advertiserId
    // onto ad_daily_stats the same way it already does for campaignId
    // (see that file's own header comment). A banner with no campaign
    // attached (campaignId '') keeps the PHASE 3 free-text advertiserName
    // only - both optional, per Advertisement.campaignId/advertiserId in
    // src/types/ads.ts.
    campaignId: form.campaignId || null,
    advertiserId: form.advertiserId || null,
    advertiserName: form.advertiserName.trim(),
    adType: AD_TYPES.BANNER,
    imageUrl: form.imageUrl,
    thumbnailUrl: form.thumbnailUrl,
    imageStoragePath: form.imageStoragePath,
    thumbnailStoragePath: form.thumbnailStoragePath,
    clickAction,
    placements: form.placementId ? [form.placementId] : [],
    // PHASE 5 - the primary Feature always leads targetFeatures (index
    // 0, so toFormState's re-hydration above can strip it back out on
    // re-edit); any additional targeting features an admin picked in the
    // Targeting section are appended after it, de-duplicated.
    targetFeatures: Array.from(new Set([
      ...(form.featureId ? [form.featureId] : []),
      ...(form.targetFeatures || []),
    ])),
    targetCountries: form.targetCountries || [],
    targetStates: form.targetStates || [],
    targetCities: form.targetCities || [],
    targetAreas: form.targetAreas || [],
    targetOutlets: form.targetOutlets || [],
    targetUserTypes: form.targetUserTypes || [],
    targetLanguages: form.targetLanguages || [],
    startAt: form.startDate ? new Date(`${form.startDate}T00:00:00`) : null,
    endAt: form.endDate ? new Date(`${form.endDate}T23:59:59`) : null,
    priority: Number(form.priority) || 0,
    weight: Number(form.weight) || 1,
    status: form.status,
  };
}

export default function BannerAdFormModal({ visible, banner, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // PHASE 9 - the Campaign picker's own source list, live-loaded only
  // while this modal is open (no point subscribing in the background on
  // BannerManagementScreen just for this form). Kept as two small,
  // bounded config collections (same "just read it" posture
  // adAnalyticsService.js's getCountsSummary already uses) - joined
  // client-side into campaignItems below rather than denormalizing
  // advertiser name onto ad_campaigns.
  const [campaigns, setCampaigns] = useState([]);
  const [advertisers, setAdvertisers] = useState([]);
  // The image storage path that was already live in Firestore when this
  // modal opened (empty for "add new") - used so cancelling, or replacing
  // the image again before saving, can clean up whichever file this
  // editing session uploaded but never committed. See the file header's
  // "IMAGE REQUIREMENT"/"STORAGE" notes.
  const openStoragePathRef = useRef('');

  useEffect(() => {
    if (!visible) return;
    const next = toFormState(banner);
    setForm(next);
    openStoragePathRef.current = next.imageStoragePath;
  }, [visible, banner]);

  useEffect(() => {
    if (!visible) return undefined;
    const unsubCampaigns = subscribeCampaigns(setCampaigns, () => setCampaigns([]));
    const unsubAdvertisers = subscribeAdvertisers(setAdvertisers, () => setAdvertisers([]));
    return () => { unsubCampaigns(); unsubAdvertisers(); };
  }, [visible]);

  const advertiserNameById = useMemo(
    () => Object.fromEntries(advertisers.map((a) => [a.id, a.companyName])),
    [advertisers]
  );
  // Only an advertiser's ACTIVE campaigns are offered for a new
  // attachment - re-editing a banner already attached to a since-paused/
  // expired campaign still shows that campaign selected (toFormState
  // above), it just won't be in this pick list to choose again.
  const campaignItems = useMemo(
    () => campaigns
      .filter((c) => c.id === form.campaignId || getEffectiveAdStatus(c) === 'active' || getEffectiveAdStatus(c) === 'scheduled')
      .map((c) => ({ key: c.id, name: c.name || 'Untitled campaign', subtitle: advertiserNameById[c.advertiserId] || '', advertiserId: c.advertiserId })),
    [campaigns, advertiserNameById, form.campaignId]
  );
  const selectedCampaignLabel = useMemo(() => {
    if (!form.campaignId) return '';
    const c = campaigns.find((x) => x.id === form.campaignId);
    if (!c) return '';
    const advName = advertiserNameById[c.advertiserId];
    return advName ? `${c.name} — ${advName}` : c.name;
  }, [form.campaignId, campaigns, advertiserNameById]);

  const onChangeCampaign = (campaignId, item) => {
    if (!campaignId) {
      setForm((f) => ({ ...f, campaignId: '', advertiserId: '' }));
      return;
    }
    const advertiserId = item?.advertiserId || '';
    setForm((f) => ({
      ...f,
      campaignId,
      advertiserId,
      advertiserName: advertiserNameById[advertiserId] || f.advertiserName,
    }));
  };
  const clearCampaign = () => setForm((f) => ({ ...f, campaignId: '', advertiserId: '' }));

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onChangeFeature = (featureId) => {
    // Changing Feature invalidates whichever Placement was picked for the
    // previous Feature (PLACEMENTS_BY_FEATURE is keyed by Feature) - clear
    // it rather than leave a mismatched placement silently saved.
    setForm((f) => ({ ...f, featureId, placementId: '' }));
  };

  const pickImage = async () => {
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // No forced aspect/crop UI beyond a sensible default - the brief's
      // "IMAGE REQUIREMENT" says the image IS the ad, so this only helps
      // the admin frame it for the banner slot, never adds anything to it.
      allowsEditing: true,
      aspect: [2, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadBannerCreative(asset.uri, asset.mimeType);
      // A previous pick from THIS SAME session (not yet saved anywhere)
      // is now an orphan - clean it up immediately rather than waiting
      // for save/cancel, since nothing could possibly reference it yet.
      const staleStorage = form.imageStoragePath && form.imageStoragePath !== openStoragePathRef.current
        ? { imageStoragePath: form.imageStoragePath, thumbnailStoragePath: form.thumbnailStoragePath }
        : null;
      setForm((f) => ({
        ...f,
        imageUrl: uploaded.imageUrl,
        thumbnailUrl: uploaded.thumbnailUrl,
        imageStoragePath: uploaded.imageStoragePath,
        thumbnailStoragePath: uploaded.thumbnailStoragePath,
      }));
      if (staleStorage) deleteBannerCreative(staleStorage).catch(() => {});
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not upload this image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const cancel = () => {
    // If this session uploaded an image that was never saved (brand new
    // banner abandoned, or an edit's replacement image discarded),
    // nothing will ever reference that file - clean it up. Best-effort,
    // never blocks closing the modal.
    if (form.imageStoragePath && form.imageStoragePath !== openStoragePathRef.current) {
      deleteBannerCreative({
        imageStoragePath: form.imageStoragePath,
        thumbnailStoragePath: form.thumbnailStoragePath,
      }).catch(() => {});
    }
    onCancel();
  };

  const validate = () => {
    if (!form.name.trim()) return 'Enter a Banner Name.';
    if (!form.imageUrl) return 'Upload a banner image - the image is the ad itself.';
    if (!form.featureId) return 'Choose a Feature.';
    if (!form.placementId) return 'Choose a Placement.';
    if (!form.startDate) return 'Choose a Start Date.';
    if (!form.endDate) return 'Choose an End Date.';
    if (new Date(`${form.endDate}T23:59:59`) < new Date(`${form.startDate}T00:00:00`)) {
      return 'End Date must be on or after Start Date.';
    }
    const clickCheck = validateClickUrl(form.clickUrl);
    if (!clickCheck.valid) return clickCheck.reason;
    return null;
  };

  const save = async () => {
    if (uploading) {
      showAlert('MySheba', 'Still uploading the banner image - please wait a moment.');
      return;
    }
    const error = validate();
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    const clickCheck = validateClickUrl(form.clickUrl);
    if (clickCheck.warning) {
      showAlert('MySheba', clickCheck.warning);
    }

    setSaving(true);
    try {
      const payload = buildAdvertisementPayload(form);
      const priorStoragePath = openStoragePathRef.current;
      const priorThumbPath = banner ? banner.thumbnailStoragePath : '';
      await onSubmit(payload);
      // Only clean up the OLD image after a successful save that actually
      // replaced it - never before, so a failed save never orphans the
      // still-live file.
      if (priorStoragePath && priorStoragePath !== form.imageStoragePath) {
        deleteBannerCreative({ imageStoragePath: priorStoragePath, thumbnailStoragePath: priorThumbPath }).catch(() => {});
      }
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this banner. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const featureItems = FEATURE_ID_LIST.map((id) => ({ key: id, name: FEATURE_LABELS[id] }));
  const placementItems = (PLACEMENTS_BY_FEATURE[form.featureId] || []).map((id) => ({ key: id, name: PLACEMENT_LABELS[id] }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{banner ? 'Edit Banner' : 'New Banner'}</Text>

            <Text style={styles.label}>Banner Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ramadan Recharge Promo"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              maxLength={80}
            />

            <Text style={styles.label}>Campaign (optional)</Text>
            <Text style={styles.hintText}>
              Attach this banner to a campaign to link it to an advertiser and their analytics/payment history. Leave unattached for a standalone banner.
            </Text>
            <SearchPicker
              placeholder="Choose a campaign"
              title="Choose a campaign"
              value={selectedCampaignLabel}
              onSelect={onChangeCampaign}
              items={campaignItems}
            />
            {!!form.campaignId && (
              <TouchableOpacity onPress={clearCampaign}>
                <Text style={styles.replacePhoto}>Remove campaign</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Advertiser{form.campaignId ? ' (from campaign)' : ''}</Text>
            <TextInput
              style={[styles.input, !!form.campaignId && { color: colors.textSecondary }]}
              placeholder="e.g. Acme Sdn Bhd"
              placeholderTextColor="#999"
              value={form.advertiserName}
              onChangeText={(v) => set('advertiserName', v)}
              editable={!form.campaignId}
              maxLength={80}
            />

            <Text style={styles.label}>Banner Image</Text>
            <Text style={styles.hintText}>
              The image is the complete ad - nothing is added on top of it (no title, button, or text overlay). Use a wide image, ideally around 1200×600px (2:1).
            </Text>
            <TouchableOpacity style={styles.photoBox} onPress={pickImage} disabled={uploading} activeOpacity={0.8}>
              {form.imageUrl ? (
                <AdBannerPreview ad={form} height={150} style={styles.photoPreviewOverride} />
              ) : (
                <>
                  <Text style={styles.uploadIcon}>🖼️</Text>
                  <Text style={styles.uploadText}>Tap to upload a banner image</Text>
                </>
              )}
              {!!uploading && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="white" />
                </View>
              )}
            </TouchableOpacity>
            {!!form.imageUrl && !uploading && (
              <TouchableOpacity onPress={pickImage}>
                <Text style={styles.replacePhoto}>Replace image</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Click URL (optional)</Text>
            <Text style={styles.hintText}>Leave blank for no action when tapped. HTTPS is recommended.</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com"
              placeholderTextColor="#999"
              value={form.clickUrl}
              onChangeText={(v) => set('clickUrl', v)}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={styles.label}>Feature</Text>
            <View style={styles.chipRow}>
              {featureItems.map((it) => (
                <TouchableOpacity
                  key={it.key}
                  style={[styles.chip, form.featureId === it.key && styles.chipActive]}
                  onPress={() => onChangeFeature(it.key)}
                >
                  <Text style={[styles.chipText, form.featureId === it.key && styles.chipTextActive]}>{it.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Placement</Text>
            {!form.featureId ? (
              <Text style={styles.hintText}>Choose a Feature first.</Text>
            ) : (
              <View style={styles.chipRow}>
                {placementItems.map((it) => (
                  <TouchableOpacity
                    key={it.key}
                    style={[styles.chip, form.placementId === it.key && styles.chipActive]}
                    onPress={() => set('placementId', it.key)}
                  >
                    <Text style={[styles.chipText, form.placementId === it.key && styles.chipTextActive]}>{it.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.heading}>Targeting</Text>
            <Text style={styles.hintText}>
              Optional. Leave a section empty to leave that dimension unrestricted (matches everyone). An ad shows only to users who match every dimension that IS restricted.
            </Text>

            <ChipMultiSelect
              label="Additional Target Features"
              hint="Beyond the primary Feature above - e.g. also show this banner when the context is Internet Package."
              items={TARGET_FEATURE_ITEMS.filter((it) => it.key !== form.featureId)}
              value={form.targetFeatures}
              onChange={(v) => set('targetFeatures', v)}
            />

            <ChipMultiSelect
              label="Countries"
              items={TARGET_COUNTRY_ITEMS}
              value={form.targetCountries}
              onChange={(v) => set('targetCountries', v)}
            />

            <TagMultiSelect
              label="States"
              placeholder="e.g. Selangor"
              value={form.targetStates}
              onChange={(v) => set('targetStates', v)}
            />

            <TagMultiSelect
              label="Cities"
              placeholder="e.g. Kuala Lumpur"
              value={form.targetCities}
              onChange={(v) => set('targetCities', v)}
            />

            <TagMultiSelect
              label="Areas"
              placeholder="e.g. Bukit Bintang"
              value={form.targetAreas}
              onChange={(v) => set('targetAreas', v)}
            />

            <TagMultiSelect
              label="Outlets"
              placeholder="e.g. outlet-042"
              value={form.targetOutlets}
              onChange={(v) => set('targetOutlets', v)}
            />

            <ChipMultiSelect
              label="User Types"
              items={TARGET_USER_TYPE_ITEMS}
              value={form.targetUserTypes}
              onChange={(v) => set('targetUserTypes', v)}
            />

            <ChipMultiSelect
              label="Languages"
              items={TARGET_LANGUAGE_ITEMS}
              value={form.targetLanguages}
              onChange={(v) => set('targetLanguages', v)}
            />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start Date</Text>
                <DateField placeholder="Select date" value={form.startDate} onChange={(v) => set('startDate', v)} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End Date</Text>
                <DateField placeholder="Select date" value={form.endDate} onChange={(v) => set('endDate', v)} />
              </View>
            </View>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Priority</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={form.priority}
                  onChangeText={(v) => set('priority', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Weight</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor="#999"
                  value={form.weight}
                  onChangeText={(v) => set('weight', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_CHOICES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, form.status === s.key && styles.chipActive]}
                  onPress={() => set('status', s.key)}
                >
                  <Text style={[styles.chipText, form.status === s.key && styles.chipTextActive]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!form.imageUrl && (
              <>
                <Text style={styles.label}>Preview</Text>
                <Text style={styles.hintText}>Exactly how this banner will appear in the app - image only.</Text>
                <AdBannerPreview ad={form} height={150} />
              </>
            )}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancel} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.okBtn} onPress={save} disabled={saving || uploading}>
                {saving ? <ActivityIndicator color="white" /> : <Text style={styles.okText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '90%', maxWidth: 420, maxHeight: '88%' },
    heading: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, color: colors.text },
    hintText: { fontSize: 11, color: '#999', marginBottom: 6, marginTop: -2 },
    photoBox: {
      width: '100%', minHeight: 150, borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed',
      borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4,
      backgroundColor: '#FAFAFA',
    },
    photoPreviewOverride: { width: '100%' },
    uploadIcon: { fontSize: 24, marginBottom: 4 },
    uploadText: { color: '#999', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center', justifyContent: 'center',
    },
    replacePhoto: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, color: colors.text },
    chipTextActive: { color: 'white', fontWeight: '600' },
    row: { flexDirection: 'row', marginTop: 4 },
    actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okText: { color: 'white', fontWeight: '600' },
  });
}
