import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { DateField, SearchPicker } from './ui';
import { AD_PRICING_MODEL_OPTIONS, AD_PRICING_MODELS, AD_STATUSES } from '../constants/adEnums';
import { subscribePackages } from '../firebase/adService';

// PHASE 9 - MY SHEBA ADVERTISER AND CAMPAIGN MANAGEMENT - CAMPAIGN form.
//
// Create/Edit form for one ad_campaigns doc, attached to a single fixed
// advertiserId (passed in as a prop - a campaign is always created FROM
// an advertiser's own detail page, per the RELATIONSHIP chain: Advertiser
// -> Campaign, so there's no advertiser picker on this form, unlike
// BannerAdFormModal's new Campaign picker which needed one). Every field
// from the brief's CAMPAIGN "Admin can create" list lives here: Campaign
// Name, Advertiser (implicit - see advertiserName prop), Budget, Currency,
// Pricing Model, Start Date, End Date, Target Impressions, Target Clicks,
// Status.

// Same "only the statuses an admin picks directly" posture as
// BannerAdFormModal's STATUS_CHOICES - 'scheduled'/'expired'/'archived'
// are outcomes of Activate/the campaign's own dates, not typed in here.
const STATUS_CHOICES = [
  { key: AD_STATUSES.DRAFT, label: 'Draft' },
  { key: AD_STATUSES.ACTIVE, label: 'Active' },
  { key: AD_STATUSES.PAUSED, label: 'Paused' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  budget: '',
  currency: 'MYR',
  pricingModel: AD_PRICING_MODELS.FIXED,
  startDate: '',
  endDate: '',
  targetImpressions: '',
  targetClicks: '',
  status: AD_STATUSES.DRAFT,
  // PHASE 10 - ADVERTISING PACKAGES AND PAYMENTS. Optional: which
  // ad_packages doc (if any) this campaign was purchased under - see
  // AdCampaign.packageId in src/types/ads.ts.
  packageId: '',
};

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

function toFormState(campaign) {
  if (!campaign) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    name: campaign.name || '',
    description: campaign.description || '',
    budget: campaign.budget != null ? String(campaign.budget) : '',
    currency: campaign.currency || 'MYR',
    pricingModel: campaign.pricingModel || AD_PRICING_MODELS.FIXED,
    startDate: dateToInputString(campaign.startAt),
    endDate: dateToInputString(campaign.endAt),
    targetImpressions: campaign.targetImpressions ? String(campaign.targetImpressions) : '',
    targetClicks: campaign.targetClicks ? String(campaign.targetClicks) : '',
    status: campaign.status || AD_STATUSES.DRAFT,
    packageId: campaign.packageId || '',
  };
}

export function buildCampaignPayload(form, advertiserId, packageName) {
  return {
    advertiserId,
    name: form.name.trim(),
    description: form.description.trim(),
    budget: Number(form.budget) || 0,
    currency: (form.currency || 'MYR').trim().toUpperCase(),
    pricingModel: form.pricingModel,
    startAt: form.startDate ? new Date(`${form.startDate}T00:00:00`) : null,
    endAt: form.endDate ? new Date(`${form.endDate}T23:59:59`) : null,
    targetImpressions: Number(form.targetImpressions) || 0,
    targetClicks: Number(form.targetClicks) || 0,
    status: form.status,
    packageId: form.packageId || '',
    // PHASE 10 - denormalized off the chosen package (same "denormalize
    // the display name" convention as Advertisement.advertiserName) so a
    // campaign card can show its linked package without a lookup.
    packageName: form.packageId ? (packageName || '') : '',
  };
}

export default function CampaignFormModal({ visible, campaign, advertiserId, advertiserName, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // PHASE 10 - the Package picker's own source list, live-loaded only
  // while this modal is open - same "just read it while the modal's up"
  // posture BannerAdFormModal's Campaign/Advertiser pickers already use.
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (!visible) return;
    setForm(toFormState(campaign));
  }, [visible, campaign]);

  useEffect(() => {
    if (!visible) return undefined;
    return subscribePackages(setPackages, () => setPackages([]));
  }, [visible]);

  const activePackages = useMemo(() => packages.filter((p) => p.id === form.packageId || p.active !== false), [packages, form.packageId]);
  const packageItems = useMemo(
    () => activePackages.map((p) => ({ key: p.id, name: p.name || 'Untitled package', subtitle: `${p.currency || 'MYR'} ${p.price || 0} · ${p.durationDays || 0}d` })),
    [activePackages]
  );
  const selectedPackageLabel = useMemo(() => {
    const p = packages.find((x) => x.id === form.packageId);
    return p ? p.name : '';
  }, [packages, form.packageId]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const onChangePackage = (packageId) => {
    const pkg = packages.find((p) => p.id === packageId);
    setForm((f) => ({
      ...f,
      packageId,
      // Prefill budget/currency from the package only when the admin
      // hasn't already typed a budget - never clobber an existing edit.
      budget: !f.budget && pkg ? String(pkg.price) : f.budget,
      currency: (!f.budget && pkg) ? pkg.currency : f.currency,
    }));
  };
  const clearPackage = () => set('packageId', '');

  const validate = () => {
    if (!form.name.trim()) return 'Enter a Campaign Name.';
    if (!form.budget || Number(form.budget) <= 0) return 'Enter a Budget greater than 0.';
    if (!form.currency.trim()) return 'Enter a Currency.';
    if (!form.startDate) return 'Choose a Start Date.';
    if (!form.endDate) return 'Choose an End Date.';
    if (new Date(`${form.endDate}T23:59:59`) < new Date(`${form.startDate}T00:00:00`)) {
      return 'End Date must be on or after Start Date.';
    }
    return null;
  };

  const save = async () => {
    const error = validate();
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    setSaving(true);
    try {
      const selectedPackage = packages.find((p) => p.id === form.packageId);
      await onSubmit(buildCampaignPayload(form, advertiserId, selectedPackage ? selectedPackage.name : ''));
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this campaign. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{campaign ? 'Edit Campaign' : 'New Campaign'}</Text>
            {!!advertiserName && <Text style={styles.subheading}>🏢 {advertiserName}</Text>}

            <Text style={styles.label}>Campaign Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ramadan 2026 Push"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              maxLength={80}
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What this campaign is for"
              placeholderTextColor="#999"
              value={form.description}
              onChangeText={(v) => set('description', v)}
              multiline
              numberOfLines={3}
              maxLength={240}
            />

            <Text style={styles.label}>Package (optional)</Text>
            <Text style={styles.hintText}>
              Link this campaign to a purchased package. Choosing one prefills the Budget/Currency below, if not already set.
            </Text>
            <SearchPicker
              placeholder="Choose a package"
              title="Choose a package"
              value={selectedPackageLabel}
              onSelect={onChangePackage}
              items={packageItems}
            />
            {!!form.packageId && (
              <TouchableOpacity onPress={clearPackage}>
                <Text style={styles.linkText}>Remove package</Text>
              </TouchableOpacity>
            )}

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Budget</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={form.budget}
                  onChangeText={(v) => set('budget', v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Currency</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MYR"
                  placeholderTextColor="#999"
                  value={form.currency}
                  onChangeText={(v) => set('currency', v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                />
              </View>
            </View>

            <Text style={styles.label}>Pricing Model</Text>
            <View style={styles.chipRow}>
              {AD_PRICING_MODEL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, form.pricingModel === opt.key && styles.chipActive]}
                  onPress={() => set('pricingModel', opt.key)}
                >
                  <Text style={[styles.chipText, form.pricingModel === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Start Date</Text>
                <DateField placeholder="Select date" value={form.startDate} onChange={(v) => set('startDate', v)} />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>End Date</Text>
                <DateField placeholder="Select date" value={form.endDate} onChange={(v) => set('endDate', v)} minimumDate={form.startDate ? new Date(`${form.startDate}T00:00:00`) : undefined} />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Target Impressions</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0 = no target"
                  placeholderTextColor="#999"
                  value={form.targetImpressions}
                  onChangeText={(v) => set('targetImpressions', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Target Clicks</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0 = no target"
                  placeholderTextColor="#999"
                  value={form.targetClicks}
                  onChangeText={(v) => set('targetClicks', v.replace(/[^0-9]/g, ''))}
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

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
    box: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, maxHeight: '88%' },
    heading: { fontSize: 17, fontWeight: '700', color: colors.text },
    subheading: { fontSize: 12, color: colors.textSecondary, marginTop: 2, marginBottom: 6 },
    label: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: 9, paddingHorizontal: 12, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg,
    },
    textArea: { minHeight: 60, textAlignVertical: 'top' },
    hintText: { fontSize: 11, color: '#999', marginBottom: 6, marginTop: -2 },
    linkText: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 4 },
    row: { flexDirection: 'row', gap: 10 },
    rowItem: { flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11.5, fontWeight: '600', color: colors.text },
    chipTextActive: { color: 'white' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: {
      flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    cancelBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  });
}
