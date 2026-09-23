// Admin Panel > Analytics (sitemap section; PRD section 19 "Success
// Metrics"). Admin/superadmin only (same MODERATION_ROLES gate as
// analyticsService.getDashboard() - no live subscriptions since these are
// aggregate counts, not a feed; pull-to-refresh instead.
//
// Merged with the old standalone AdminLogsScreen ("Activity Logs") so
// analytics and activity logs live together in one place: the top tab
// row switches between "Overview" (this file's original content) and
// the three log feeds (Activity / Errors / Audit) that used to be their
// own screen. The log feeds stay superadmin-only, same as before (see
// isSuperAdmin gate below - previously enforced by LOGS_ROLES in
// AdminHomeScreen's tool grid).
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as analyticsService from '../firebase/analyticsService';
import * as logService from '../firebase/logService';
import { subscribeAllUsers } from '../firebase/userManagementService';

const ROLE_LABELS = { customer: 'Customers', dealer: 'Dealers', dealer: 'Dealers', reseller: 'Resellers', admin: 'Admins', superadmin: 'Super Admins' };

// Which screen each module's row should open, keyed exactly the same way
const MODULE_SCREENS = {
};

const LOG_TABS = [
  { key: 'activity', label: '📈 Activity' },
  { key: 'errors', label: '⚠️ Errors' },
  { key: 'audit', label: '🔒 Audit' },
];

const ERROR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unresolved', label: 'Unresolved' },
  { key: 'resolved', label: 'Resolved' },
];

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// snake_case action -> "Snake case" for display, e.g. 'topup_requested' -> 'Topup requested'.
function humanizeAction(action) {
  const s = String(action || '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function metadataSummary(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const entries = Object.entries(obj).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `${k}: ${v}`).join(' \u00B7 ');
}

// Local calendar day, not a rolling 24h window - "today" resets at midnight
// the same way a person would expect from a dashboard.
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function daysAgo(n) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}
function isAfter(ts, threshold) {
  if (!ts || !ts.seconds) return false;
  return ts.seconds * 1000 >= threshold.getTime();
}

function StatCard({ icon, label, value, sub, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.statCard} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {!!sub && <Text style={styles.statSub}>{sub}</Text>}
    </Wrapper>
  );
}

function Section({ title, children }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ModuleRow({ cfg, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.moduleRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.moduleIcon}>{cfg.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.moduleLabel}>{cfg.label}</Text>
        <Text style={styles.moduleMeta}>
          {cfg.active} active{cfg.closedLabel ? ` · ${cfg.closed} ${cfg.closedLabel.toLowerCase()}` : ''} · {cfg.total} total
        </Text>
      </View>
      <View style={styles.moduleNewPill}>
        <Text style={styles.moduleNewPillText}>+{cfg.newThisWeek} this wk</Text>
      </View>
      {!!onPress && <Text style={styles.moduleChevron}>›</Text>}
    </Wrapper>
  );
}

function TrendChart({ trend }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const max = Math.max(1, ...trend.map((d) => d.count));
  return (
    <View style={styles.trendRow}>
      {trend.map((d, i) => (
        <View key={i} style={styles.trendCol}>
          <Text style={styles.trendCount}>{d.count}</Text>
          <View style={styles.trendBarTrack}>
            <View style={[styles.trendBarFill, { height: `${Math.max(4, (d.count / max) * 100)}%` }]} />
          </View>
          <Text style={styles.trendLabel}>{d.label}</Text>
        </View>
      ))}
    </View>
  );
}

function CategoryBar({ item, max }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.catRow}>
      <Text style={styles.catLabel} numberOfLines={1}>{item.category}</Text>
      <View style={styles.catTrack}>
        <View style={[styles.catFill, { width: `${Math.max(6, (item.count / max) * 100)}%` }]} />
      </View>
      <Text style={styles.catCount}>{item.count}</Text>
    </View>
  );
}

function RoleRow({ label, count, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={styles.roleRow} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.roleLabel}>{label}</Text>
      <Text style={styles.roleCount}>{count}</Text>
    </Wrapper>
  );
}

export default function AdminAnalyticsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, setScreen, profile } = useApp();
  const isSuperAdmin = profile && profile.role === 'superadmin';

  const [mainTab, setMainTab] = useState('overview'); // 'overview' | 'logs'

  // ---- Overview tab state ----
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const d = await analyticsService.getDashboard();
      setData(d);
    } catch (e) {
      setError(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const modules = data ? Object.entries(data.modules) : [];
  const activeListings = modules.reduce((a, [, m]) => a + (m.active || 0), 0);
  const maxCat = data && data.topCategories.length ? Math.max(...data.topCategories.map((c) => c.count)) : 1;

  // ---- Activity Logs tab state (merged from the old AdminLogsScreen) ----
  const [logTab, setLogTab] = useState('activity');

  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [errors, setErrors] = useState([]);
  const [errorsLoading, setErrorsLoading] = useState(true);
  const [errorFilter, setErrorFilter] = useState('unresolved');
  const [busyErrorId, setBusyErrorId] = useState(null);

  const [audit, setAudit] = useState([]);
  const [auditLoading, setAuditLoading] = useState(true);

  const [allUsers, setAllUsers] = useState([]);
  const [loginEvents, setLoginEvents] = useState([]);

  useEffect(() => {
    if (mainTab !== 'logs' || !isSuperAdmin) return undefined;
    const unsub = subscribeAllUsers(setAllUsers, () => {});
    return unsub;
  }, [mainTab, isSuperAdmin]);

  useEffect(() => {
    if (mainTab !== 'logs' || !isSuperAdmin) return undefined;
    const unsub = logService.subscribeLoginEvents(setLoginEvents, () => {});
    return unsub;
  }, [mainTab, isSuperAdmin]);

  useEffect(() => {
    if (mainTab !== 'logs' || !isSuperAdmin) return undefined;
    const unsub = logService.subscribeActivityLog(
      (list) => { setActivity(list); setActivityLoading(false); },
      () => setActivityLoading(false)
    );
    return unsub;
  }, [mainTab, isSuperAdmin]);

  useEffect(() => {
    if (mainTab !== 'logs' || !isSuperAdmin) return undefined;
    const unsub = logService.subscribeErrorLog(
      (list) => { setErrors(list); setErrorsLoading(false); },
      () => setErrorsLoading(false)
    );
    return unsub;
  }, [mainTab, isSuperAdmin]);

  useEffect(() => {
    if (mainTab !== 'logs' || !isSuperAdmin) return undefined;
    const unsub = logService.subscribeAuditLog(
      (list) => { setAudit(list); setAuditLoading(false); },
      () => setAuditLoading(false)
    );
    return unsub;
  }, [mainTab, isSuperAdmin]);

  const toggleResolved = async (item) => {
    setBusyErrorId(item.id);
    try {
      await logService.setErrorResolved(item.id, !item.resolved);
    } catch (e) {
      // Non-fatal - the live subscription will just show the old state.
    } finally {
      setBusyErrorId(null);
    }
  };

  const filteredErrors = errors.filter((e) => {
    if (errorFilter === 'unresolved') return !e.resolved;
    if (errorFilter === 'resolved') return !!e.resolved;
    return true;
  });
  const unresolvedCount = errors.filter((e) => !e.resolved).length;

  const today = startOfToday();
  const weekAgo = daysAgo(7);
  const totalUsers = allUsers.length;
  const newToday = allUsers.filter((u) => isAfter(u.createdAt, today)).length;
  const newThisWeek = allUsers.filter((u) => isAfter(u.createdAt, weekAgo)).length;
  const uniqueLoginsToday = new Set(
    loginEvents.filter((e) => isAfter(e.createdAt, today)).map((e) => e.userId)
  ).size;
  const uniqueLoginsThisWeek = new Set(
    loginEvents.filter((e) => isAfter(e.createdAt, weekAgo)).map((e) => e.userId)
  ).size;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
      </LinearGradient>

      {isSuperAdmin && (
        <View style={styles.mainTabRow}>
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'overview' && styles.mainTabActive]}
            onPress={() => setMainTab('overview')}
          >
            <Text style={[styles.mainTabText, mainTab === 'overview' && styles.mainTabTextActive]}>📊 Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainTab, mainTab === 'logs' && styles.mainTabActive]}
            onPress={() => setMainTab('logs')}
          >
            <Text style={[styles.mainTabText, mainTab === 'logs' && styles.mainTabTextActive]}>
              🗂️ Activity Logs{unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mainTab === 'overview' ? (
        !data ? (
          <View style={styles.center}>
            {error ? (
              <>
                <Text style={styles.emptyText}>Could not load analytics right now.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={load}>
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ActivityIndicator size="large" color={colors.primary} />
            )}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.body}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          >
            <Section title="Overview">
              <View style={styles.statGrid}>
                <StatCard
                  icon="🧑‍🤝‍🧑" label="Registered users" value={data.users.total} sub={`${data.users.verified} verified`}
                  onPress={() => setScreen('userManagement')}
                />
                <StatCard
                  icon="🛍️" label="Active listings" value={activeListings} sub="across all modules"
                />
                <StatCard icon="💬" label="Conversations" value={data.conversations} />
                <StatCard
                  icon="🚩" label="Open reports" value={data.reports.open} sub={`${data.reports.total} total filed`}
                />
                <StatCard
                  icon="⭐" label="Avg. rating" value={data.reviews.avg ? data.reviews.avg.toFixed(1) : '—'} sub={`${data.reviews.count} reviews`}
                />
                <StatCard
                  icon="✅" label="Verified sellers" value={data.users.verified}
                  onPress={() => setScreen('verificationManagement')}
                />
              </View>
            </Section>

            <Section title="New Posts - Last 7 Days">
              <View style={styles.card}>
                <TrendChart trend={data.trend} />
              </View>
            </Section>

              <Section title="Modules">
              <View style={styles.card}>
                {modules.map(([key, m], i) => (
                  <React.Fragment key={key}>
                    {i > 0 && <View style={styles.divider} />}
                    <ModuleRow cfg={m} onPress={MODULE_SCREENS[key] ? () => setScreen(MODULE_SCREENS[key]) : undefined} />
                  </React.Fragment>
                ))}
              </View>
            </Section>

            <Section title="Top Buy & Sell Categories">
              <View style={styles.card}>
                {data.topCategories.length === 0 ? (
                  <Text style={styles.emptyInline}>No active listings yet.</Text>
                ) : (
                  data.topCategories.map((c, i) => <CategoryBar key={i} item={c} max={maxCat} />)
                )}
              </View>
            </Section>

            <Section title="Users by Role">
              <View style={styles.card}>
                {Object.entries(data.users.byRole).map(([role, count], i) => (
                  <React.Fragment key={role}>
                    {i > 0 && <View style={styles.divider} />}
                    <RoleRow label={ROLE_LABELS[role] || role} count={count} onPress={() => setScreen('userManagement')} />
                  </React.Fragment>
                ))}
              </View>
            </Section>

            <Section title="Reports by Module">
              <View style={styles.card}>
                {data.reports.byKind.map((k, i) => (
                  <React.Fragment key={k.kind}>
                    {i > 0 && <View style={styles.divider} />}
                  </React.Fragment>
                ))}
              </View>
            </Section>
          </ScrollView>
        )
      ) : (
        <>
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.logStatValue}>{totalUsers}</Text>
              <Text style={styles.logStatLabel}>Total Users</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.logStatValue}>{newToday}</Text>
              <Text style={styles.logStatLabel}>New Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.logStatValue}>{newThisWeek}</Text>
              <Text style={styles.logStatLabel}>New This Week</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.logStatValue}>{uniqueLoginsToday}</Text>
              <Text style={styles.logStatLabel}>Logins Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.logStatValue}>{uniqueLoginsThisWeek}</Text>
              <Text style={styles.logStatLabel}>Logins This Week</Text>
            </View>
          </View>

          <View style={styles.topTabRow}>
            {LOG_TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.topTab, logTab === t.key && styles.topTabActive]}
                onPress={() => setLogTab(t.key)}
              >
                <Text style={[styles.topTabText, logTab === t.key && styles.topTabTextActive]}>
                  {t.label}{t.key === 'errors' && unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {logTab === 'activity' && (
            activityLoading ? (
              <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
              <ScrollView contentContainerStyle={styles.body}>
                {activity.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={styles.emptyIcon}>📈</Text>
                    <Text style={styles.emptyText}>No activity yet.</Text>
                  </View>
                ) : (
                  activity.map((a) => (
                    <View key={a.id} style={styles.logCard}>
                      <View style={styles.cardTop}>
                        <Text style={styles.subject}>{humanizeAction(a.action)}</Text>
                        <Text style={styles.date}>{formatDate(a.createdAt)}</Text>
                      </View>
                      <Text style={styles.meta}>👤 {a.userId || 'Unknown'}{a.platform ? ` \u00B7 ${a.platform}` : ''}{a.appVersion ? ` \u00B7 v${a.appVersion}` : ''}</Text>
                      {!!metadataSummary(a.metadata) && <Text style={styles.message}>{metadataSummary(a.metadata)}</Text>}
                    </View>
                  ))
                )}
              </ScrollView>
            )
          )}

          {logTab === 'errors' && (
            <>
              <View style={styles.filterRow}>
                {ERROR_FILTERS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.filterChip, errorFilter === f.key && styles.filterChipActive]}
                    onPress={() => setErrorFilter(f.key)}
                  >
                    <Text style={[styles.filterText, errorFilter === f.key && styles.filterTextActive]}>{f.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {errorsLoading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
              ) : (
                <ScrollView contentContainerStyle={styles.body}>
                  {filteredErrors.length === 0 ? (
                    <View style={styles.center}>
                      <Text style={styles.emptyIcon}>✅</Text>
                      <Text style={styles.emptyText}>No {errorFilter === 'all' ? '' : errorFilter + ' '}errors.</Text>
                    </View>
                  ) : (
                    filteredErrors.map((e) => {
                      const isBusy = busyErrorId === e.id;
                      return (
                        <View key={e.id} style={styles.logCard}>
                          <View style={styles.cardTop}>
                            <Text style={styles.subject}>{e.context || 'Unknown context'}</Text>
                            <View style={[styles.badge, { backgroundColor: e.resolved ? '#E8F5E9' : '#FFF8E1' }]}>
                              <Text style={[styles.badgeText, { color: e.resolved ? colors.success : colors.warning }]}>
                                {e.resolved ? 'RESOLVED' : 'OPEN'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.meta}>{e.source === 'server' ? '🖥️ Server' : '📱 Client'}{e.userId ? ` \u00B7 ${e.userId}` : ''}</Text>
                          <Text style={styles.message}>{e.message}</Text>
                          <Text style={styles.date}>{formatDate(e.createdAt)}</Text>
                          <View style={styles.actions}>
                            <TouchableOpacity
                              style={e.resolved ? styles.errorBtn : styles.successBtn}
                              onPress={() => toggleResolved(e)}
                              disabled={isBusy}
                            >
                              <Text style={styles.actionBtnText}>
                                {isBusy ? '…' : e.resolved ? '↺ Reopen' : '✓ Mark Resolved'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>
              )}
            </>
          )}

          {logTab === 'audit' && (
            auditLoading ? (
              <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
            ) : (
              <ScrollView contentContainerStyle={styles.body}>
                {audit.length === 0 ? (
                  <View style={styles.center}>
                    <Text style={styles.emptyIcon}>🔒</Text>
                    <Text style={styles.emptyText}>No audit events yet.</Text>
                  </View>
                ) : (
                  audit.map((a) => (
                    <View key={a.id} style={styles.logCard}>
                      <View style={styles.cardTop}>
                        <Text style={styles.subject}>{humanizeAction(a.action)}</Text>
                        <Text style={styles.date}>{formatDate(a.createdAt)}</Text>
                      </View>
                      <Text style={styles.meta}>
                        By {a.performedBy === 'system' ? 'System' : (a.performedBy || 'Unknown')}
                        {a.performedByRole ? ` (${a.performedByRole})` : ''}
                        {a.targetUid ? ` \u00B7 target: ${a.targetUid}` : ''}
                      </Text>
                      {!!metadataSummary(a.details) && <Text style={styles.message}>{metadataSummary(a.details)}</Text>}
                    </View>
                  ))
                )}
              </ScrollView>
            )
          )}
        </>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: spacing.lg, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 16, marginLeft: 6, flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 12 },
    emptyInline: { fontSize: 12, color: colors.textSecondary, textAlign: 'center', paddingVertical: 8 },
    retryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 20 },
    retryBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    body: { padding: spacing.lg, paddingBottom: spacing.xl + 12 },
    section: { marginBottom: spacing.lg },
    sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.navy, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

    // Merged main tab row (Overview / Activity Logs) - superadmin only.
    mainTabRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    mainTab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    mainTabActive: { borderBottomColor: colors.primary },
    mainTabText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    mainTabTextActive: { color: colors.primary },

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
    statValue: { fontSize: 18, fontWeight: '800', color: colors.navy },
    statLabel: { fontSize: 10.5, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
    statSub: { fontSize: 9.5, color: colors.textSecondary, textAlign: 'center', marginTop: 1 },

    moduleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    moduleIcon: { fontSize: 20, width: 26, textAlign: 'center' },
    moduleLabel: { fontSize: 13.5, fontWeight: '700', color: colors.text },
    moduleMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    moduleNewPill: { backgroundColor: '#E6F7F5', borderRadius: radius.pill, paddingVertical: 4, paddingHorizontal: 9 },
    moduleNewPillText: { fontSize: 10.5, fontWeight: '700', color: colors.primaryDark },
    moduleChevron: { fontSize: 18, color: '#CCC', marginLeft: 2 },

    trendRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130 },
    trendCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
    trendCount: { fontSize: 10.5, fontWeight: '700', color: colors.navy, marginBottom: 3 },
    trendBarTrack: { width: 18, flex: 1, backgroundColor: '#F0F4F8', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
    trendBarFill: { width: '100%', backgroundColor: colors.primary, borderRadius: 6 },
    trendLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 6 },

    catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    catLabel: { width: 92, fontSize: 12, color: colors.text },
    catTrack: { flex: 1, height: 8, backgroundColor: '#F0F4F8', borderRadius: 4, overflow: 'hidden' },
    catFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 4 },
    catCount: { width: 24, fontSize: 11, fontWeight: '700', color: colors.navy, textAlign: 'right' },

    roleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    roleLabel: { fontSize: 13, color: colors.text },
    roleCount: { fontSize: 13, fontWeight: '700', color: colors.navy },

    // ---- Activity Logs tab (merged from the old AdminLogsScreen) ----
    statsGrid: {
      flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card,
      borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10, paddingHorizontal: 8,
    },
    statBox: { flexGrow: 1, flexBasis: '20%', alignItems: 'center', paddingVertical: 6, minWidth: 68 },
    logStatValue: { fontSize: 18, fontWeight: '700', color: colors.primary },
    logStatLabel: { fontSize: 9, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
    topTabRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    topTab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    topTabActive: { borderBottomColor: colors.primary },
    topTabText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    topTabTextActive: { color: colors.primary },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 11, fontWeight: '600', color: colors.text },
    filterTextActive: { color: 'white' },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    logCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 1,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
    subject: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    meta: { fontSize: 11, color: colors.textSecondary, marginBottom: 6 },
    message: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 6 },
    date: { fontSize: 10, color: colors.textSecondary, marginBottom: 4 },
    badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    successBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    errorBtn: { flex: 1, backgroundColor: colors.error, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    actionBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  });
}
