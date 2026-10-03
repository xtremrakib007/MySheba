import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import { getLedgerReport } from '../firebase/ledgerReportService';
import { buildLedger, filterLedger, totalsByCurrency, ledgerToCsv, LEDGER_KINDS } from '../utils/ledger';

/**
 * One list of every movement of money, with both sides named.
 *
 * Reports used to be four separate counts - orders here, top-ups there, and
 * transfers and funding nowhere at all - so there was no way to answer "what
 * went in and out this month" or "what has this person been paid". Every row
 * here says who sent it and who received it, by name and phone, because a row
 * that only carries a uid cannot be checked against a person.
 *
 * The shaping, filtering, totals and CSV all come from src/utils/ledger.js,
 * which has no Firestore and no React in it and is tested on its own. This
 * screen fetches, holds filter state, and hands the result to the share sheet.
 */

const RANGES = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '1 year', days: 365 },
];

const KIND_LABELS = {
  all: 'All', topup: 'Top-ups', order: 'Orders', transfer: 'Transfers', funding: 'Funding',
};

const STATUS_FILTERS = ['all', 'completed', 'approved', 'pending', 'rejected', 'failed'];

const DAY = 24 * 60 * 60 * 1000;

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

/** Stable, sortable, and safe as a filename on both platforms. */
function isoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function Chip({ label, active, onPress }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Party({ person, prefix }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <Text style={styles.party} numberOfLines={1}>
      <Text style={styles.partyPrefix}>{prefix} </Text>
      {person.name}
      {person.phone ? <Text style={styles.partyPhone}>{`  ${person.phone}`}</Text> : null}
      {person.role ? <Text style={styles.partyRole}>{`  ${person.role}`}</Text> : null}
    </Text>
  );
}

function statusColor(colors, status) {
  if (status === 'completed' || status === 'approved') return colors.success;
  if (status === 'rejected' || status === 'failed') return colors.error;
  return colors.warning;
}

function LedgerRow({ row }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.row}>
      <View style={styles.rowTop}>
        <Text style={styles.rowLabel} numberOfLines={1}>{row.label}</Text>
        <Text style={styles.rowAmount}>{`${row.currency} ${money(row.amount)}`}</Text>
      </View>
      <Party person={row.from} prefix="From" />
      <Party person={row.to} prefix="To" />
      <View style={styles.rowBottom}>
        <Text style={styles.rowDate}>{shortDate(row.at)}</Text>
        <Text style={[styles.rowStatus, { color: statusColor(colors, row.status) }]}>{row.status}</Text>
      </View>
      {row.reference ? <Text style={styles.rowMeta} numberOfLines={1}>{`Ref ${row.reference}`}</Text> : null}
      {row.note ? <Text style={styles.rowMeta} numberOfLines={2}>{row.note}</Text> : null}
    </View>
  );
}

export default function LedgerScreen() {
  const { goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [days, setDays] = useState(30);
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (rangeDays) => {
    setLoading(true);
    setError('');
    try {
      const toMs = Date.now();
      const data = await getLedgerReport({ fromMs: toMs - rangeDays * DAY, toMs });
      setReport(data);
    } catch (e) {
      setReport(null);
      setError(e?.message || 'Could not load the ledger.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  // Shaping is cheap; refetching is not. Changing a filter re-derives from what
  // is already here instead of going back to the server.
  const rows = useMemo(
    () => (report ? buildLedger(report.sources, report.names) : []),
    [report]
  );
  const visible = useMemo(() => filterLedger(rows, { kind, status, search }), [rows, kind, status, search]);
  const totals = useMemo(() => totalsByCurrency(visible), [visible]);

  // A short window would otherwise look like a complete answer.
  const cappedSources = useMemo(
    () => Object.entries(report?.truncated || {}).filter(([, hit]) => hit).map(([name]) => name),
    [report]
  );

  const exportCsv = useCallback(async () => {
    if (exporting) return;
    if (visible.length === 0) {
      showAlert('Nothing to export', 'No rows match the current filters.');
      return;
    }
    setExporting(true);
    try {
      const csv = ledgerToCsv(visible, shortDate);
      const from = report?.range?.from || Date.now() - days * DAY;
      const to = report?.range?.to || Date.now();
      const uri = `${FileSystem.cacheDirectory}MySheba_Ledger_${isoDay(from)}_to_${isoDay(to)}.csv`;
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export ledger' });
      } else {
        showAlert('MySheba', 'Saving or sharing files is not available on this device.');
      }
    } catch (e) {
      showAlert('Export failed', e?.message || 'Could not write the file.');
    } finally {
      setExporting(false);
    }
  }, [exporting, visible, report, days]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction Ledger</Text>
      </LinearGradient>

      <FlatList
        data={visible}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => <LedgerRow row={item} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        keyboardShouldPersistTaps="handled"
        refreshing={loading}
        onRefresh={() => load(days)}
        ListHeaderComponent={(
          <View>
            <Text style={styles.sectionTitle}>Period</Text>
            <View style={styles.chipRow}>
              {RANGES.map((r) => (
                <Chip key={r.key} label={r.label} active={days === r.days} onPress={() => setDays(r.days)} />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.chipRow}>
              {LEDGER_KINDS.map((k) => (
                <Chip key={k} label={KIND_LABELS[k] || k} active={kind === k} onPress={() => setKind(k)} />
              ))}
            </View>

            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_FILTERS.map((s) => (
                <Chip key={s} label={s === 'all' ? 'All' : s} active={status === s} onPress={() => setStatus(s)} />
              ))}
            </View>

            <TextInput
              style={styles.search}
              placeholder="Search name, phone, reference or note"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              selectionColor={colors.primary}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.totals}>
              <Text style={styles.totalsCount}>{`${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}`}</Text>
              {Object.keys(totals).length === 0 ? (
                <Text style={styles.totalsEmpty}>No money moved in this view.</Text>
              ) : Object.entries(totals).map(([currency, amount]) => (
                // Per currency, never added together: one number spanning MYR
                // and BDT would not be money.
                <Text key={currency} style={styles.totalsLine}>{`${currency} ${money(amount)}`}</Text>
              ))}
            </View>

            {cappedSources.length > 0 ? (
              <Text style={styles.warning}>
                {`Showing the most recent entries only - ${cappedSources.join(', ')} had more than this report fetched. Narrow the period for a complete picture.`}
              </Text>
            ) : null}

            <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8} disabled={exporting}>
              <Text style={styles.exportText}>{exporting ? 'Preparing…' : `⬇ Export ${visible.length} row${visible.length === 1 ? '' : 's'} as CSV`}</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={loading
          ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
          : <Text style={styles.empty}>{error ? 'Nothing loaded.' : 'No entries match these filters.'}</Text>}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 14, marginBottom: 7 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.text, textTransform: 'capitalize' },
    chipTextActive: { color: colors.onPrimary, fontWeight: '700' },
    search: { marginTop: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13 },
    error: { marginTop: 12, fontSize: 12, color: colors.error, lineHeight: 17 },
    totals: { marginTop: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14 },
    totalsCount: { fontSize: 11, color: '#999', marginBottom: 6 },
    totalsLine: { fontSize: 17, fontWeight: '800', color: colors.primary },
    totalsEmpty: { fontSize: 12, color: '#999' },
    warning: { marginTop: 10, fontSize: 11, color: colors.warning, lineHeight: 16 },
    exportBtn: { marginTop: 12, marginBottom: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
    exportText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
    row: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 13, marginTop: 10 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowLabel: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
    rowAmount: { fontSize: 14, fontWeight: '800', color: colors.primary },
    party: { fontSize: 12, color: colors.text, marginTop: 5 },
    partyPrefix: { fontSize: 10, color: '#999', fontWeight: '700' },
    partyPhone: { fontSize: 11, color: '#888' },
    partyRole: { fontSize: 10, color: '#aaa', textTransform: 'uppercase' },
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
    rowDate: { fontSize: 10, color: '#999' },
    rowStatus: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    rowMeta: { fontSize: 10, color: '#888', marginTop: 4 },
    empty: { textAlign: 'center', color: '#999', fontSize: 12, paddingVertical: 28 },
  });
}
