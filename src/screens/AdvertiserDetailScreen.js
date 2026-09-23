import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import CampaignFormModal from '../components/CampaignFormModal';
import AdPaymentFormModal from '../components/AdPaymentFormModal';
import { AD_STATUS_LABELS, ADVERTISER_STATUS_LABELS, AD_PRICING_MODEL_LABELS, CAMPAIGN_STATUS_FILTERS } from '../constants/adEnums';
import * as adService from '../firebase/adService';
import * as adAnalyticsService from '../firebase/adAnalyticsService';

// PHASE 9 - MY SHEBA ADVERTISER AND CAMPAIGN MANAGEMENT - ADVERTISER
// detail: the "View campaigns / View analytics / View payment history"
// trio from the brief's ADVERTISER "Admin can" list, as three tabs on one
// screen. Reads AppContext's activeAdvertiserId (set by
// AdvertiserManagementScreen's openAdvertiserDetail) to know which
// ad_advertisers doc this is.

const TABS = [
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'payments', label: 'Payment History' },
];

function fmtDate(dateLike) {
  if (!dateLike) return '—';
  const ms = typeof dateLike.toMillis === 'function' ? dateLike.toMillis() : typeof dateLike.seconds === 'number' ? dateLike.seconds * 1000 : null;
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function CampaignCard({ campaign, onEdit, onActivate, onDeactivate, busy }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const effectiveStatus = adService.getEffectiveAdStatus(campaign);
  const isLive = effectiveStatus === 'active' || effectiveStatus === 'scheduled';

  return (
    <View style={styles.card}>
      <View style={styles.cardTopRow}>
        <Text style={styles.name} numberOfLines={1}>{campaign.name || 'Untitled campaign'}</Text>
        <View style={[styles.statusBadge, isLive ? styles.statusBadgeOn : styles.statusBadgeOff]}>
          <Text style={[styles.statusBadgeText, isLive ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
            {AD_STATUS_LABELS[effectiveStatus] || effectiveStatus}
          </Text>
        </View>
      </View>
      <Text style={styles.meta}>{campaign.currency || 'MYR'} {campaign.budget || 0} · {AD_PRICING_MODEL_LABELS[campaign.pricingModel] || campaign.pricingModel}</Text>
      <Text style={styles.meta}>{fmtDate(campaign.startAt)} → {fmtDate(campaign.endAt)}</Text>
      {(campaign.targetImpressions > 0 || campaign.targetClicks > 0) && (
        <Text style={styles.meta}>
          Target: {campaign.targetImpressions ? `${campaign.targetImpressions} impressions` : ''}
          {campaign.targetImpressions && campaign.targetClicks ? ' · ' : ''}
          {campaign.targetClicks ? `${campaign.targetClicks} clicks` : ''}
        </Text>
      )}

      {busy ? (
        <View style={styles.actionsRow}><ActivityIndicator size="small" color={colors.primary} /></View>
      ) : (
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(campaign)}>
            <Text style={styles.actionBtnText}>Edit</Text>
          </TouchableOpacity>
          {isLive ? (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onDeactivate(campaign)}>
              <Text style={styles.actionBtnText}>Deactivate</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.actionBtn} onPress={() => onActivate(campaign)}>
              <Text style={styles.actionBtnText}>Activate</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function CampaignsTab({ advertiserId, colors }) {
  const styles = createStyles(colors);
  const [campaigns, setCampaigns] = useState(undefined);
  const [statusFilter, setStatusFilter] = useState('all');
  const [formVisible, setFormVisible] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!advertiserId) return undefined;
    return adService.subscribeCampaignsByAdvertiser(advertiserId, setCampaigns, () => setCampaigns([]));
  }, [advertiserId]);

  const filtered = useMemo(() => {
    const list = campaigns || [];
    if (statusFilter === 'all') return list;
    return list.filter((c) => adService.getEffectiveAdStatus(c) === statusFilter);
  }, [campaigns, statusFilter]);

  const openCreate = () => { setEditingCampaign(null); setFormVisible(true); };
  const openEdit = (campaign) => { setEditingCampaign(campaign); setFormVisible(true); };
  const closeForm = () => { setFormVisible(false); setEditingCampaign(null); };

  const submitForm = async (payload) => {
    if (editingCampaign) {
      await adService.updateCampaign(editingCampaign.id, payload);
    } else {
      await adService.createCampaign(payload);
    }
    closeForm();
  };

  const runAction = async (campaign, action, label) => {
    if (busyId) return;
    setBusyId(campaign.id);
    try {
      await action();
    } catch (e) {
      showAlert('MySheba', e.message || `Could not ${label} this campaign.`);
    } finally {
      setBusyId(null);
    }
  };
  const onActivate = (campaign) => runAction(campaign, () => adService.activateCampaign(campaign), 'activate');
  const onDeactivate = (campaign) => runAction(campaign, () => adService.deactivateCampaign(campaign.id), 'deactivate');

  return (
    <View>
      <View style={styles.tabHeaderRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {CAMPAIGN_STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, statusFilter === f.key && styles.filterChipActive]}
              onPress={() => setStatusFilter(f.key)}
            >
              <Text style={[styles.filterChipText, statusFilter === f.key && styles.filterChipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.newBtn} onPress={openCreate}>
          <Text style={styles.newBtnText}>+ New Campaign</Text>
        </TouchableOpacity>
      </View>

      {campaigns === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>📣</Text>
          <Text style={styles.emptyText}>No campaigns match this filter.</Text>
        </View>
      ) : (
        filtered.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            busy={busyId === campaign.id}
            onEdit={openEdit}
            onActivate={onActivate}
            onDeactivate={onDeactivate}
          />
        ))
      )}

      <CampaignFormModal
        visible={formVisible}
        campaign={editingCampaign}
        advertiserId={advertiserId}
        onSubmit={submitForm}
        onCancel={closeForm}
      />
    </View>
  );
}

function StatCard({ label, value, colors }) {
  const styles = createStyles(colors);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AnalyticsTab({ advertiserId, colors }) {
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ impressions: 0, clicks: 0, ctr: 0, revenue: 0 });
  const [campaignRows, setCampaignRows] = useState([]);

  useEffect(() => {
    if (!advertiserId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      adAnalyticsService.getAdvertiserSummary(advertiserId, 'last30').catch(() => ({ impressions: 0, clicks: 0, ctr: 0, revenue: 0 })),
      adAnalyticsService.getAdvertiserCampaignPerformance(advertiserId, 'last30').catch(() => []),
    ]).then(([s, rows]) => {
      if (cancelled) return;
      setSummary(s);
      setCampaignRows(rows);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [advertiserId]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;

  return (
    <View>
      <Text style={styles.sectionLabel}>Last 30 Days</Text>
      <View style={styles.statsGrid}>
        <StatCard label="Impressions" value={summary.impressions.toLocaleString()} colors={colors} />
        <StatCard label="Clicks" value={summary.clicks.toLocaleString()} colors={colors} />
        <StatCard label="CTR" value={`${(summary.ctr * 100).toFixed(2)}%`} colors={colors} />
        <StatCard label="Revenue" value={summary.revenue.toLocaleString()} colors={colors} />
      </View>

      <Text style={styles.sectionLabel}>By Campaign</Text>
      {campaignRows.length === 0 ? (
        <Text style={styles.emptyText}>No campaign activity in the last 30 days.</Text>
      ) : (
        campaignRows.map((row) => (
          <View key={row.campaignId} style={styles.tableRow}>
            <Text style={styles.tableRowName} numberOfLines={1}>{row.name}</Text>
            <Text style={styles.tableRowMeta}>{row.impressions.toLocaleString()} imp · {row.clicks.toLocaleString()} clicks · {(row.ctr * 100).toFixed(2)}% CTR</Text>
          </View>
        ))
      )}
    </View>
  );
}

function PaymentsTab({ advertiserId, colors }) {
  const styles = createStyles(colors);
  const [payments, setPayments] = useState(undefined);
  const [formVisible, setFormVisible] = useState(false);

  useEffect(() => {
    if (!advertiserId) return undefined;
    return adService.subscribeAdvertiserPayments(advertiserId, setPayments, () => setPayments([]));
  }, [advertiserId]);

  const sorted = useMemo(() => {
    const list = payments || [];
    return [...list].sort((a, b) => {
      const am = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
      const bm = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
      return bm - am;
    });
  }, [payments]);

  // PHASE 10 - lets an admin record a manual payment straight from an
  // advertiser's own detail screen, pre-linked to this advertiserId -
  // complements the cross-advertiser entry point on
  // AdPaymentsManagementScreen (see that screen's own header comment).
  const submitPayment = async (payload) => {
    await adService.createAdPayment(payload);
    setFormVisible(false);
  };

  return (
    <View>
      <View style={styles.tabHeaderRow}>
        <View />
        <TouchableOpacity style={styles.newBtn} onPress={() => setFormVisible(true)}>
          <Text style={styles.newBtnText}>+ Record Payment</Text>
        </TouchableOpacity>
      </View>

      {payments === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : sorted.length === 0 ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 32, marginBottom: 8 }}>💳</Text>
          <Text style={styles.emptyText}>No payment history yet.</Text>
        </View>
      ) : (
        sorted.map((p) => (
          <View key={p.id} style={styles.paymentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.paymentAmount}>{p.currency || 'MYR'} {p.amount}</Text>
              {!!p.packageName && <Text style={styles.meta}>📦 {p.packageName}</Text>}
              <Text style={styles.meta}>{p.paymentMethod || '—'} · {p.transactionReference || '—'}</Text>
              <Text style={styles.meta}>{fmtDate(p.createdAt)}</Text>
            </View>
            <View style={[styles.statusBadge, p.paymentStatus === 'paid' ? styles.statusBadgeOn : styles.statusBadgeOff]}>
              <Text style={[styles.statusBadgeText, p.paymentStatus === 'paid' ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
                {p.paymentStatus || 'pending'}
              </Text>
            </View>
          </View>
        ))
      )}

      <AdPaymentFormModal
        visible={formVisible}
        advertiserId={advertiserId}
        onSubmit={submitPayment}
        onCancel={() => setFormVisible(false)}
      />
    </View>
  );
}

export default function AdvertiserDetailScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome, activeAdvertiserId } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [advertiser, setAdvertiser] = useState(undefined);
  const [tab, setTab] = useState('campaigns');

  useEffect(() => {
    if (!isSuperadmin || !activeAdvertiserId) return undefined;
    return adService.subscribeAdvertiser(activeAdvertiserId, setAdvertiser, () => setAdvertiser(null));
  }, [isSuperadmin, activeAdvertiserId]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{advertiser?.companyName || 'Advertiser'}</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can view advertiser details.</Text>
        </View>
      ) : advertiser === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : advertiser === null ? (
        <View style={styles.center}><Text style={styles.emptyText}>This advertiser could not be found.</Text></View>
      ) : (
        <>
          <View style={styles.profileCard}>
            {advertiser.logoUrl ? (
              <Image source={{ uri: advertiser.logoUrl }} style={styles.logo} />
            ) : (
              <View style={[styles.logo, styles.logoPlaceholder]}><Text style={{ fontSize: 20 }}>🏢</Text></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{advertiser.companyName}</Text>
              <Text style={styles.meta}>{advertiser.contactName} · {advertiser.contactPhone}</Text>
              <Text style={styles.meta}>{advertiser.contactEmail}</Text>
            </View>
            <View style={[styles.statusBadge, advertiser.status === 'active' ? styles.statusBadgeOn : styles.statusBadgeOff]}>
              <Text style={[styles.statusBadgeText, advertiser.status === 'active' ? styles.statusBadgeTextOn : styles.statusBadgeTextOff]}>
                {ADVERTISER_STATUS_LABELS[advertiser.status] || advertiser.status}
              </Text>
            </View>
          </View>

          <View style={styles.tabsRow}>
            {TABS.map((t) => (
              <TouchableOpacity key={t.key} style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]} onPress={() => setTab(t.key)}>
                <Text style={[styles.tabBtnText, tab === t.key && styles.tabBtnTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 40 }}>
            {tab === 'campaigns' && <CampaignsTab advertiserId={activeAdvertiserId} colors={colors} />}
            {tab === 'analytics' && <AnalyticsTab advertiserId={activeAdvertiserId} colors={colors} />}
            {tab === 'payments' && <PaymentsTab advertiserId={activeAdvertiserId} colors={colors} />}
          </ScrollView>
        </>
      )}
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
    profileCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10, padding: spacing.md,
      backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border,
    },
    logo: { width: 46, height: 46, borderRadius: radius.sm },
    logoPlaceholder: { backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    profileName: { fontSize: 15, fontWeight: '700', color: colors.text },
    meta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 1 },
    tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabBtnText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
    tabBtnTextActive: { color: colors.primary },
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
    name: { fontSize: 14, fontWeight: '700', color: colors.text, flex: 1 },
    actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    actionBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.primary },
    actionBtnText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    statusBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill },
    statusBadgeText: { fontSize: 9.5, fontWeight: '700' },
    statusBadgeOn: { backgroundColor: '#E8F5E9' },
    statusBadgeTextOn: { color: '#2E7D32' },
    statusBadgeOff: { backgroundColor: '#FFEBEE' },
    statusBadgeTextOff: { color: '#C62828' },
    sectionLabel: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 4, marginBottom: 10 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    statCard: {
      flexBasis: '47%', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      padding: 12, alignItems: 'center',
    },
    statValue: { fontSize: 18, fontWeight: '800', color: colors.text },
    statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    tableRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    tableRowName: { fontSize: 13, fontWeight: '700', color: colors.text },
    tableRowMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    paymentRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10,
    },
    paymentAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
  });
}
