import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { DateField } from '../components/ui';
import { FEATURE_LABELS } from '../constants/adFeatures';
import { PLACEMENT_LABELS } from '../constants/adPlacements';
import { AD_STATUS_LABELS } from '../constants/adEnums';
import * as adAnalyticsService from '../firebase/adAnalyticsService';

// PHASE 8 - Super Admin advertisement analytics (the brief's own title).
// Superadmin-only, gated below - see src/firebase/adAnalyticsService.js's
// own SCOPE comment for why this gate lives here rather than at the
// Firestore rules layer (ad_daily_stats/ad_reports read is the slightly
// wider isAdmin() there; the app's own navigation just never offers a
// plain admin this screen).
//
// Read-only, one-shot fetch per filter change (adAnalyticsService's own
// header comment: "aggregate numbers don't need a live feed, pull-to-
// refresh instead") - same posture AdminAnalyticsScreen/analyticsService
// already use for the app's general Admin Analytics dashboard.

const FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'custom', label: 'Custom' },
];

const REPORT_TABS = [
  { key: 'campaign', label: 'Campaigns' },
  { key: 'feature', label: 'Features' },
  { key: 'placement', label: 'Placements' },
  { key: 'advertiser', label: 'Advertisers' },
];

const EMPTY_DASHBOARD = {
  activeCampaigns: 0, pendingAds: 0, activeAds: 0, advertisers: 0,
  impressions: 0, clicks: 0, ctr: 0, directRevenue: 0, admobRevenue: null,
};

function formatAmount(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatCTR(ctr) {
  return `${(Number(ctr) || 0).toFixed(2)}%`;
}

function formatCount(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

function StatCard({ icon, label, value, sub }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={styles.statSub}>{sub}</Text>}
    </View>
  );
}

function Section({ title, children }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

// Three-mini-stat row (Impressions / Clicks / CTR) shared by every report
// card below - the one place that trio of numbers is laid out, so all
// four report tables stay visually consistent.
function MiniStats({ impressions, clicks, ctr }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.miniStatsRow}>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatValue}>{formatCount(impressions)}</Text>
        <Text style={styles.miniStatLabel}>Impressions</Text>
      </View>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatValue}>{formatCount(clicks)}</Text>
        <Text style={styles.miniStatLabel}>Clicks</Text>
      </View>
      <View style={styles.miniStat}>
        <Text style={styles.miniStatValue}>{formatCTR(ctr)}</Text>
        <Text style={styles.miniStatLabel}>CTR</Text>
      </View>
    </View>
  );
}

function ReportCard({ title, badge, children }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.reportCard}>
      <View style={styles.reportCardHead}>
        <Text style={styles.reportCardTitle} numberOfLines={2}>{title}</Text>
        {!!badge && (
          <View style={styles.reportBadge}>
            <Text style={styles.reportBadgeText}>{badge}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function EmptyState({ text }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export default function AdAnalyticsScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, goBackOrHome } = useApp();
  const isSuperadmin = profile && profile.role === 'superadmin';

  const [filterKey, setFilterKey] = useState('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reportTab, setReportTab] = useState('campaign');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [campaignRows, setCampaignRows] = useState([]);
  const [featureRows, setFeatureRows] = useState([]);
  const [placementRows, setPlacementRows] = useState([]);
  const [advertiserRows, setAdvertiserRows] = useState([]);

  // Custom range needs BOTH dates picked before it means anything - a
  // half-picked custom range simply doesn't trigger a reload, rather than
  // querying with a missing bound.
  const customReady = filterKey !== 'custom' || (!!customStart && !!customEnd);
  const customRange = filterKey === 'custom' && customReady ? { startKey: customStart, endKey: customEnd } : undefined;

  const load = useCallback(async (isRefresh) => {
    if (!isSuperadmin || !customReady) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const [dash, campaigns, features, placements, advertisers] = await Promise.all([
      adAnalyticsService.getAdDashboard(filterKey, customRange).catch(() => EMPTY_DASHBOARD),
      adAnalyticsService.getCampaignPerformance(filterKey, customRange).catch(() => []),
      adAnalyticsService.getFeaturePerformance(filterKey, customRange).catch(() => []),
      adAnalyticsService.getPlacementPerformance(filterKey, customRange).catch(() => []),
      adAnalyticsService.getAdvertiserPerformance(filterKey, customRange).catch(() => []),
    ]);
    setDashboard(dash);
    setCampaignRows(campaigns);
    setFeatureRows(features);
    setPlacementRows(placements);
    setAdvertiserRows(advertisers);
    setLoading(false);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin, filterKey, customStart, customEnd, customReady]);

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = () => load(true);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📊 Ad Analytics</Text>
      </LinearGradient>

      {!isSuperadmin ? (
        <View style={styles.deniedWrap}>
          <Text style={styles.deniedText}>Only a Super Admin can view advertisement analytics.</Text>
        </View>
      ) : (
        <>
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterChip, filterKey === f.key && styles.filterChipActive]}
                  onPress={() => setFilterKey(f.key)}
                >
                  <Text style={[styles.filterText, filterKey === f.key && styles.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {filterKey === 'custom' && (
            <View style={styles.customRow}>
              <View style={styles.customField}>
                <DateField placeholder="Start date" value={customStart} onChange={setCustomStart} />
              </View>
              <View style={styles.customField}>
                <DateField placeholder="End date" value={customEnd} onChange={setCustomEnd} minimumDate={customStart ? new Date(`${customStart}T00:00:00`) : undefined} />
              </View>
            </View>
          )}

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.body}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
            >
              <Section title="Overview">
                <View style={styles.statGrid}>
                  <StatCard icon="📣" label="Active Campaigns" value={formatCount(dashboard.activeCampaigns)} />
                  <StatCard icon="⏳" label="Pending Ads" value={formatCount(dashboard.pendingAds)} />
                  <StatCard icon="✅" label="Active Ads" value={formatCount(dashboard.activeAds)} />
                  <StatCard icon="🏢" label="Advertisers" value={formatCount(dashboard.advertisers)} />
                  <StatCard icon="👁️" label="Impressions" value={formatCount(dashboard.impressions)} />
                  <StatCard icon="👆" label="Clicks" value={formatCount(dashboard.clicks)} />
                  <StatCard icon="📈" label="CTR" value={formatCTR(dashboard.ctr)} />
                  <StatCard icon="💰" label="Direct Ad Revenue" value={`MYR ${formatAmount(dashboard.directRevenue)}`} />
                  <StatCard
                    icon="🅰️"
                    label="AdMob Revenue"
                    value={dashboard.admobRevenue === null || dashboard.admobRevenue === undefined ? '—' : `MYR ${formatAmount(dashboard.admobRevenue)}`}
                    sub={dashboard.admobRevenue === null || dashboard.admobRevenue === undefined ? 'Not available yet' : undefined}
                  />
                </View>
              </Section>

              <Section title="Reports">
                <View style={styles.reportTabRow}>
                  {REPORT_TABS.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.reportTab, reportTab === t.key && styles.reportTabActive]}
                      onPress={() => setReportTab(t.key)}
                    >
                      <Text style={[styles.reportTabText, reportTab === t.key && styles.reportTabTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {reportTab === 'campaign' && (
                  campaignRows.length === 0 ? <EmptyState text="No campaign activity in this range." /> : (
                    campaignRows.map((r) => (
                      <ReportCard
                        key={r.campaignId}
                        title={r.name}
                        badge={r.status ? (AD_STATUS_LABELS[r.status] || r.status) : null}
                      >
                        <MiniStats impressions={r.impressions} clicks={r.clicks} ctr={r.ctr} />
                      </ReportCard>
                    ))
                  )
                )}

                {reportTab === 'feature' && (
                  featureRows.length === 0 ? <EmptyState text="No feature activity in this range." /> : (
                    featureRows.map((r) => (
                      <ReportCard key={r.feature} title={FEATURE_LABELS[r.feature] || r.feature}>
                        <MiniStats impressions={r.impressions} clicks={r.clicks} ctr={r.ctr} />
                      </ReportCard>
                    ))
                  )
                )}

                {reportTab === 'placement' && (
                  placementRows.length === 0 ? <EmptyState text="No placement activity in this range." /> : (
                    placementRows.map((r) => (
                      <ReportCard key={r.placementId} title={PLACEMENT_LABELS[r.placementId] || r.placementId}>
                        <MiniStats impressions={r.impressions} clicks={r.clicks} ctr={r.ctr} />
                      </ReportCard>
                    ))
                  )
                )}

                {reportTab === 'advertiser' && (
                  advertiserRows.length === 0 ? <EmptyState text="No advertiser activity in this range." /> : (
                    advertiserRows.map((r) => (
                      <ReportCard
                        key={r.advertiserId}
                        title={r.name}
                        badge={`${r.campaigns} campaign${r.campaigns === 1 ? '' : 's'}`}
                      >
                        <MiniStats impressions={r.impressions} clicks={r.clicks} ctr={r.ctr} />
                        <Text style={styles.advertiserRevenue}>Revenue: MYR {formatAmount(r.revenue)}</Text>
                      </ReportCard>
                    ))
                  )
                )}
              </Section>
            </ScrollView>
          )}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    deniedWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    deniedText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { padding: spacing.lg, paddingBottom: 40 },

    filterRow: { paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 12, fontWeight: '600', color: colors.text },
    filterTextActive: { color: 'white' },

    customRow: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    customField: { flex: 1 },

    section: { marginBottom: spacing.lg },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },

    statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statCard: {
      width: '31%',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm + 4,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    statIcon: { fontSize: 18, marginBottom: 4 },
    statValue: { fontSize: 15, fontWeight: '800', color: colors.navy },
    statLabel: { fontSize: 10, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
    statSub: { fontSize: 9, color: colors.textSecondary, textAlign: 'center', marginTop: 1 },

    reportTabRow: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, padding: 3, marginBottom: spacing.md },
    reportTab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.pill },
    reportTabActive: { backgroundColor: colors.primary },
    reportTabText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
    reportTabTextActive: { color: 'white' },

    reportCard: {
      backgroundColor: colors.card, borderRadius: radius.lg,
      borderWidth: 1, borderColor: colors.border,
      padding: spacing.md, marginBottom: 10,
    },
    reportCardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
    reportCardTitle: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text },
    reportBadge: { backgroundColor: '#F0F4F8', borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 9 },
    reportBadgeText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },

    miniStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    miniStat: { alignItems: 'center', flex: 1 },
    miniStatValue: { fontSize: 14, fontWeight: '800', color: colors.navy },
    miniStatLabel: { fontSize: 9.5, color: colors.textSecondary, marginTop: 2 },

    advertiserRevenue: { fontSize: 11.5, fontWeight: '700', color: colors.primaryDark, marginTop: 8, textAlign: 'right' },

    emptyWrap: { padding: spacing.lg, alignItems: 'center' },
    emptyText: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center' },
  });
}
