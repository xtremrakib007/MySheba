import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { SearchPicker } from './ui';
import { AD_PAYMENT_METHOD_OPTIONS, AD_PAYMENT_STATUSES, AD_PAYMENT_STATUS_LABELS } from '../constants/adEnums';
import { validatePaymentPayload } from '../utils/adPackagePaymentRules';
import { subscribeAdvertisers, subscribeCampaignsByAdvertiser, subscribePackages } from '../firebase/adService';

// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS - PAYMENT form.
//
// Records a manually-taken payment (bank transfer, DuitNow QR, cash,
// cheque - no payment gateway exists anywhere in this app, per the
// brief's "Do not implement a payment gateway unless the existing
// project already has one"). Advertiser is required; Campaign/Package
// are optional but, once an advertiser is chosen, only show THAT
// advertiser's campaigns (mirrors BannerAdFormModal's Campaign picker
// convention). Picking a Package prefills Amount/Currency from its
// price - editable afterward, since the actual amount paid can differ
// from the list price (a discount, a partial payment, etc.).
//
// `advertiserId` prop pre-selects and locks the advertiser when opened
// from AdvertiserDetailScreen's Payment History tab; leave it unset for
// the cross-advertiser "+ Record Payment" entry point on
// AdPaymentsManagementScreen.

const EMPTY_FORM = {
  advertiserId: '',
  campaignId: '',
  packageId: '',
  amount: '',
  currency: 'MYR',
  paymentMethod: '',
  transactionReference: '',
  paymentStatus: AD_PAYMENT_STATUSES.PENDING,
};

const STATUS_CHOICES = Object.values(AD_PAYMENT_STATUSES).map((key) => ({ key, label: AD_PAYMENT_STATUS_LABELS[key] }));

export function buildPaymentPayload(form) {
  return {
    advertiserId: form.advertiserId,
    campaignId: form.campaignId || undefined,
    packageId: form.packageId || undefined,
    amount: Number(form.amount) || 0,
    currency: (form.currency || 'MYR').trim().toUpperCase(),
    paymentMethod: form.paymentMethod,
    transactionReference: form.transactionReference.trim(),
    paymentStatus: form.paymentStatus,
  };
}

export default function AdPaymentFormModal({ visible, advertiserId: fixedAdvertiserId, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [advertisers, setAdvertisers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    if (!visible) return;
    setForm({ ...EMPTY_FORM, advertiserId: fixedAdvertiserId || '' });
  }, [visible, fixedAdvertiserId]);

  useEffect(() => {
    if (!visible) return undefined;
    const unsub = subscribeAdvertisers(setAdvertisers, () => setAdvertisers([]));
    return unsub;
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const unsub = subscribePackages(setPackages, () => setPackages([]));
    return unsub;
  }, [visible]);

  useEffect(() => {
    if (!visible || !form.advertiserId) { setCampaigns([]); return undefined; }
    return subscribeCampaignsByAdvertiser(form.advertiserId, setCampaigns, () => setCampaigns([]));
  }, [visible, form.advertiserId]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const advertiserItems = useMemo(
    () => advertisers.map((a) => ({ key: a.id, name: a.companyName || 'Unnamed advertiser' })),
    [advertisers]
  );
  const selectedAdvertiserLabel = useMemo(() => {
    const a = advertisers.find((x) => x.id === form.advertiserId);
    return a ? a.companyName : '';
  }, [advertisers, form.advertiserId]);

  const campaignItems = useMemo(
    () => campaigns.map((c) => ({ key: c.id, name: c.name || 'Untitled campaign' })),
    [campaigns]
  );
  const selectedCampaignLabel = useMemo(() => {
    const c = campaigns.find((x) => x.id === form.campaignId);
    return c ? c.name : '';
  }, [campaigns, form.campaignId]);

  const activePackages = useMemo(() => packages.filter((p) => p.active !== false), [packages]);
  const packageItems = useMemo(
    () => activePackages.map((p) => ({ key: p.id, name: p.name || 'Untitled package', subtitle: `${p.currency || 'MYR'} ${p.price || 0}` })),
    [activePackages]
  );
  const selectedPackageLabel = useMemo(() => {
    const p = packages.find((x) => x.id === form.packageId);
    return p ? p.name : '';
  }, [packages, form.packageId]);

  const onChangeAdvertiser = (advertiserId) => {
    setForm((f) => ({ ...f, advertiserId, campaignId: '' }));
  };
  const onChangePackage = (packageId) => {
    const pkg = packages.find((p) => p.id === packageId);
    setForm((f) => ({
      ...f,
      packageId,
      // Prefill only when the amount/currency are still untouched, so
      // picking a package never clobbers an amount the admin already typed.
      amount: !f.amount && pkg ? String(pkg.price) : f.amount,
      currency: (!f.amount || f.currency === EMPTY_FORM.currency) && pkg ? pkg.currency : f.currency,
    }));
  };

  const save = async () => {
    const error = validatePaymentPayload(form);
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(buildPaymentPayload(form));
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not record this payment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>Record Payment</Text>

            <Text style={styles.label}>Advertiser</Text>
            {fixedAdvertiserId ? (
              <View style={[styles.input, styles.lockedInput]}>
                <Text style={styles.lockedInputText} numberOfLines={1}>{selectedAdvertiserLabel || '—'}</Text>
              </View>
            ) : (
              <SearchPicker
                placeholder="Choose an advertiser"
                title="Choose an advertiser"
                value={selectedAdvertiserLabel}
                onSelect={onChangeAdvertiser}
                items={advertiserItems}
              />
            )}

            <Text style={styles.label}>Campaign (optional)</Text>
            <SearchPicker
              placeholder={form.advertiserId ? 'Choose a campaign' : 'Choose an advertiser first'}
              title="Choose a campaign"
              value={selectedCampaignLabel}
              onSelect={(v) => set('campaignId', v)}
              items={campaignItems}
            />

            <Text style={styles.label}>Package (optional)</Text>
            <SearchPicker
              placeholder="Choose a package"
              title="Choose a package"
              value={selectedPackageLabel}
              onSelect={onChangePackage}
              items={packageItems}
            />

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Amount</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={form.amount}
                  onChangeText={(v) => set('amount', v.replace(/[^0-9.]/g, ''))}
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

            <Text style={styles.label}>Payment Method</Text>
            <View style={styles.chipRow}>
              {AD_PAYMENT_METHOD_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.chip, form.paymentMethod === opt.key && styles.chipActive]}
                  onPress={() => set('paymentMethod', opt.key)}
                >
                  <Text style={[styles.chipText, form.paymentMethod === opt.key && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Transaction Reference (optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. bank ref no., receipt no."
              placeholderTextColor="#999"
              value={form.transactionReference}
              onChangeText={(v) => set('transactionReference', v)}
              maxLength={80}
            />

            <Text style={styles.label}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_CHOICES.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.chip, form.paymentStatus === s.key && styles.chipActive]}
                  onPress={() => set('paymentStatus', s.key)}
                >
                  <Text style={[styles.chipText, form.paymentStatus === s.key && styles.chipTextActive]}>{s.label}</Text>
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
    label: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: 9, paddingHorizontal: 12, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg,
    },
    lockedInput: { justifyContent: 'center' },
    lockedInputText: { fontSize: 13.5, color: colors.textSecondary },
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
