import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { subscribeToNotes } from '../firebase/notepadService';
import {
  NOTE_TYPES, NOTE_TYPE_LABELS, NOTE_TYPE_SHORT_LABELS, NOTE_TYPE_ICONS, NOTE_TYPE_COLORS,
  MONEY_NOTE_TYPES, NOTE_STATUS, NOTE_FILTERS,
} from '../data/notepadConstants';
import { friendlyMessage } from '../utils/signInErrorCopy';

/**
 * Notepad - a private per-user notes space. Plain notes (title + text)
 * live alongside "money notes" (Credit / Debit / Loan) that track who
 * owes what, so credit/debit/loan details can be kept in the same place
 * as everything else instead of a separate module. See
 * AppContext.openNotepad / openAddNote / openNoteDetail for the
 * navigation state this screen reads/writes.
 */
export default function NotepadScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, openAddNote, openNoteDetail, requireSecurityPin, privateVaultUnlocked, setPrivateVaultUnlocked } = useApp();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [unlocked, setUnlocked] = useState(privateVaultUnlocked);

  // Gate the whole screen behind the security PIN on entry (see
  // requireSecurityPin() in AppContext.js) - cancelling backs out to
  // Home instead of showing any note content. Skipped entirely if
  // privateVaultUnlocked is already true (e.g. My Documents was opened
  // first this session) - shares that flag with MyDocumentsScreen, so
  // passing the PIN for either one unlocks both until the app is
  // backgrounded (see the AppState listener in AppContext.js, same
  // re-lock behavior as the Chat Lock vault).
  useEffect(() => {
    if (privateVaultUnlocked) { setUnlocked(true); return undefined; }
    let cancelled = false;
    requireSecurityPin('opening Notepad')
      .then(() => { if (!cancelled) { setUnlocked(true); setPrivateVaultUnlocked(true); } })
      .catch(() => { if (!cancelled) goBackOrHome(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authUser || !unlocked) return undefined;
    const unsubscribe = subscribeToNotes(
      authUser.uid,
      (list) => {
        setNotes(list);
        setLoading(false);
      },
      (err) => {
        setError(friendlyMessage(err, 'Could not load your notes. Please try again.'));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [authUser, unlocked]);

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      const matchesType = typeFilter === 'all' || n.noteType === typeFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.personName?.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [notes, typeFilter, search]);

  // Outstanding (pending) totals per money-note type - lets a user see at
  // a glance how much they're owed vs. how much they owe, without having
  // to open each note.
  const totals = useMemo(() => {
    const sums = { [NOTE_TYPES.CREDIT]: 0, [NOTE_TYPES.DEBIT]: 0, [NOTE_TYPES.LOAN]: 0 };
    notes.forEach((n) => {
      if (MONEY_NOTE_TYPES.includes(n.noteType) && n.status === NOTE_STATUS.PENDING) {
        sums[n.noteType] += Number(n.amount) || 0;
      }
    });
    return sums;
  }, [notes]);
  const hasAnyMoneyNotes = notes.some((n) => MONEY_NOTE_TYPES.includes(n.noteType));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Notepad</Text>
          <Text style={styles.headerSubtitle}>🔒 Private and only visible to you</Text>
        </View>
      </LinearGradient>

      {loading || !unlocked ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Couldn't load your notes. Pull to refresh or try again.</Text>
      ) : (
        <>
          {!!hasAnyMoneyNotes && (
            <View style={styles.summaryRow}>
              <SummaryChip icon="💰" label="Receivable" value={totals[NOTE_TYPES.CREDIT]} color={NOTE_TYPE_COLORS[NOTE_TYPES.CREDIT]} />
              <SummaryChip icon="💳" label="Payable" value={totals[NOTE_TYPES.DEBIT]} color={NOTE_TYPE_COLORS[NOTE_TYPES.DEBIT]} />
              <SummaryChip icon="🏦" label="Loan Due" value={totals[NOTE_TYPES.LOAN]} color={NOTE_TYPE_COLORS[NOTE_TYPES.LOAN]} />
            </View>
          )}

          <TextInput
            style={styles.search}
            placeholder="Search notes..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />

          <View style={styles.filterRow}>
            {NOTE_FILTERS.map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
                onPress={() => setTypeFilter(f)}
              >
                <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
                  {f === 'all' ? 'All' : `${NOTE_TYPE_ICONS[f]} ${NOTE_TYPE_SHORT_LABELS[f]}`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🗒️</Text>
                <Text style={styles.emptyTitle}>No notes yet</Text>
                <Text style={styles.emptyText}>Tap "+ Add Note" to save a note, or a credit, debit, or loan you want to track.</Text>
              </View>
            }
            renderItem={({ item }) => <NoteCard note={item} onPress={() => openNoteDetail(item.id)} />}
          />

          <TouchableOpacity style={styles.fab} onPress={() => openAddNote()}>
            <Text style={styles.fabText}>+ Add Note</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function SummaryChip({ icon, label, value, color }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.summaryChip}>
      <Text style={styles.summaryChipLabel}>{icon} {label}</Text>
      <Text style={[styles.summaryChipValue, { color }]}>MYR {value.toFixed(2)}</Text>
    </View>
  );
}

function NoteCard({ note, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const isMoneyNote = MONEY_NOTE_TYPES.includes(note.noteType);
  const accent = NOTE_TYPE_COLORS[note.noteType] || NOTE_TYPE_COLORS[NOTE_TYPES.GENERAL];
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.cardAccent, { backgroundColor: accent }]} />
      <View style={styles.cardIconWrap}>
        <Text style={styles.cardIcon}>{NOTE_TYPE_ICONS[note.noteType]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {isMoneyNote ? note.personName || NOTE_TYPE_LABELS[note.noteType] : note.title || 'Untitled Note'}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {isMoneyNote ? NOTE_TYPE_LABELS[note.noteType] : note.content || 'No content'}
        </Text>
      </View>
      {isMoneyNote ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.cardAmount, { color: accent }]}>MYR {Number(note.amount || 0).toFixed(2)}</Text>
          <View style={[styles.statusBadge, note.status === NOTE_STATUS.PAID ? styles.statusPaid : styles.statusPending]}>
            <Text style={[styles.statusBadgeText, note.status === NOTE_STATUS.PAID ? styles.statusPaidText : styles.statusPendingText]}>
              {note.status === NOTE_STATUS.PAID ? '✓ Settled' : 'Pending'}
            </Text>
          </View>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backIcon: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700' },
    headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
    summaryRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
    summaryChip: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10 },
    summaryChipLabel: { fontSize: 10, color: colors.textSecondary, fontWeight: '600' },
    summaryChipValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
    search: { marginHorizontal: 16, marginTop: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10, flexWrap: 'wrap' },
    filterChip: { backgroundColor: colors.card, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    filterChipTextActive: { color: 'white' },
    list: { paddingHorizontal: 16, paddingBottom: 100 },
    card: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg,
      padding: 12, marginBottom: 10, gap: 10, overflow: 'hidden',
      shadowColor: '#0B2447', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
    },
    cardAccent: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4 },
    cardIconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
    cardIcon: { fontSize: 18 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
    cardSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    cardAmount: { fontSize: 14, fontWeight: '700' },
    statusBadge: { borderRadius: radius.pill, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4 },
    statusPending: { backgroundColor: '#FFF3E0' },
    statusPaid: { backgroundColor: '#E8F5E9' },
    statusBadgeText: { fontSize: 10, fontWeight: '700' },
    statusPendingText: { color: '#EF6C00' },
    statusPaidText: { color: '#2E7D32' },
    emptyState: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyIcon: { fontSize: 48, marginBottom: 10 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    fab: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: radius.pill, elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    fabText: { color: '#FFFFFF', fontWeight: '700' },
    errorText: { textAlign: 'center', marginTop: 40, color: colors.error, paddingHorizontal: 24 },
  });
}
