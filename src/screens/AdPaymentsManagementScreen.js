import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import AdPaymentFormModal from '../components/AdPaymentFormModal';
import { PAYMENT_STATUS_FILTERS, AD_PAYMENT_STATUS_LABELS, AD_PAYMENT_METHOD_LABELS } from '../constants/adEnums';
import { isValidPaymentStatusTransition } from '../utils/adPackagePaymentRules';
import * as adService from '../firebase/adService';

// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS - PAYMENTS admin
// screen. Per the brief's ADMIN "Payments" action list: Pending / Paid /
// Failed / Refunded tabs, across every advertiser (not scoped to one -
// see AdvertiserDetailScreen's Payment History tab for the
// single-advertiser view this complements).

function fmtDate(dateLike) {
  if (!dateLike) return '—';
  const ms = typeof dateLike.toMillis === 'function' ? dateLike.toMillis() : typeof dateLike.seconds === 'number' ? dateLike.seconds * 1000 : null;
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

// Which quick-action buttons a payment's CURRENT status offers, sourced
// straight from the same state machine the Cloud Function enforces
// server-side (isValidPaymentStatusTransition) - so a button never
// offers a transition the backend would then reject.
const ALL_TARGET_STATUSES = ['paid', 'failed', 'refunded', 'pending'];

function PaymentRow({ payment, onChangeStatus, busy }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const badgeStyle = payment.paymentStatus === 'paid' ? styles.statusBadgeOn
    : payment.paymentStatus === 'refunded' ? styles.statusBadgeNeutral
    : payment.paymentStatus === 'failed' ? styles.statusBadgeOff
    : styles.statusBadgePending;
  const badgeTextStyle = payment.paymentStatus === 'paid' ? styles.statusBadgeTextOn
    : payment.paymentStatus === 'refunded' ? styles.statusBadgeTextNeutral
    : payment.paymentStatus === 'failed' ? styles.statusBadgeTextOff
    : styles.statusBadgeTextPending;

  const availableTargets = ALL_TARGET_STATUSES.filter((s) => isValidPaymentStatusTransition(payment.paymentStatus, s));

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.amount}>{payment.currency || 'MYR'} {payment.amount}</Text>
        <View style={[styles.statusBadge, badgeStyle]}>
          <Text style={[styles.statusBadgeText, badgeTextStyle]}>{AD_PAYMENT_STATUS_LABELS[payment.paymentStatus] || payment.paymentStatus}</Text>
        </View>
      </View>
      <Text style={styles.meta} numberOfLines={1}>🏢 {payment.advertiserName || payment.advertiserId || '—'}</Text>
      {!!payment.campaignName && <Text style={styles.meta} numberOfLines={1}>📣 {payment.campaignName}</Text>}
      {!!payment.packageName && <Text style={styles.meta} numberOfLines={1}>📦 {payment.packageName}</Text>}
      <Text style={styles.meta}>{AD_PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod || '—'} · {payment.transactionReference || 'no reference'}</Text>
      <Text style={styles.meta}>{fmtDate(payment.createdAt)}</Text>

      {availableTargets.length > 0 && (
        busy ? (
          <View style={styles.actionsRow}><ActivityIndicator size="small" color={colors.primary} /></View>
        ) : (
          <View style={styles.actionsRow}>
            {availableTargets.map((target) => (
              <TouchableOpacity key={target} style={styles.actionBtn} onPress={() => onChangeStatus(payment, target)}>
                <Text style={styles.actionBtnText}>Mark {AD_PAYMENT_STATUS_LABELS[target]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )
      )}
    </View>
  );
}

export default function AdPaymentsManagementScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [payments, setPayments] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!isSuperadmin) return undefined;
    return adService.subscribeAllPayments(setPayments, () => setPayments([]));
  }, [isSuperadmin]);

  const filtered = useMemo(() => {
    const list = payments || [];
    if (statusFilter === 'all') return list;
    return list.filter((p) => p.paymentStatus === statusFilter);
  }, [payments, statusFilter]);

  const submitForm = async (payload) => {
    await adService.createAdPayment(payload);
    setFormVisible(false);
  };

  const onChangeStatus = async (payment, target) => {
    if (busyId) return;
    setBusyId(payment.id);
    try {
      await adService.updateAdPaymentStatus(payment.id, target);
    } catch (e) {
      showAlert('MySheba', e.message || `Could not mark this payment as ${target}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>💳 Ad Payments</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can manage advertisement payments.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
          <View style={styles.tabHeaderRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {PAYMENT_STATUS_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.newBtn} onPress={() => setFormVisible(true)}>
              <Text style={styles.newBtnText}>+ Record Payment</Text>
            </TouchableOpacity>
          </View>

          {payments === undefined ? (
            <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 32, marginBottom: 8 }}>💳</Text>
              <Text style={styles.emptyText}>No payments match this filter.</Text>
            </View>
          ) : (
            filtered.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                busy={busyId === payment.id}
                onChangeStatus={onChangeStatus}
              />
            ))
          )}
        </ScrollView>
      )}

      <AdPaymentFormModal
        visible={formVisible}
        onSubmit={submitForm}
        onCancel={() => setFormVisible(false)}
      />
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
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    center: { alignItems: 'center', justifyContent: 'center', paddingTop: 40, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    tabHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
    filterChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 11, fontWeight: '600', color: colors.text },
    filterChipTextActive: { color: 'white' },
    newBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.sm, backgroundColor: colors.primary },
    newBtnText: { color: 'white', fontWeight: '700', fontSize: 11.5 },
    card: {
      backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      padding: 12, marginBottom: 12,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
    amount: { fontSize: 15, fontWeight: '800', color: colors.text },
    meta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
    actionBtnText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
    statusBadgeText: { fontSize: 9.5, fontWeight: '700' },
    statusBadgeOn: { backgroundColor: '#E8F5E9' },
    statusBadgeTextOn: { color: '#2E7D32' },
    statusBadgeOff: { backgroundColor: '#FFEBEE' },
    statusBadgeTextOff: { color: '#C62828' },
    statusBadgePending: { backgroundColor: '#FFF8E1' },
    statusBadgeTextPending: { color: '#F57F17' },
    statusBadgeNeutral: { backgroundColor: '#ECEFF1' },
    statusBadgeTextNeutral: { color: '#455A64' },
  });
}
