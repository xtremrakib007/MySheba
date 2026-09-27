import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import { listNotes, updateNote, deleteNoteRecord } from '../firebase/notepadService';
import {
  NOTE_TYPES, NOTE_TYPE_LABELS, NOTE_TYPE_ICONS, NOTE_TYPE_COLORS, MONEY_NOTE_TYPES, NOTE_STATUS,
} from '../data/notepadConstants';

export default function NoteDetailScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, activeNoteId, openAddNote, openNotepad } = useApp();
  const noteId = activeNoteId;
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  async function load() {
    if (!authUser || !noteId) return;
    setLoading(true);
    const notes = await listNotes(authUser.uid);
    setNote(notes.find((n) => n.id === noteId) ?? null);
    setLoading(false);
  }

  const isMoneyNote = note && MONEY_NOTE_TYPES.includes(note.noteType);
  const accent = note ? NOTE_TYPE_COLORS[note.noteType] || NOTE_TYPE_COLORS[NOTE_TYPES.GENERAL] : colors.primary;

  const toggleStatus = async () => {
    if (!note) return;
    setUpdatingStatus(true);
    try {
      const nextStatus = note.status === NOTE_STATUS.PAID ? NOTE_STATUS.PENDING : NOTE_STATUS.PAID;
      await updateNote(noteId, { status: nextStatus });
      await load();
    } catch {
      showAlert('Update failed', 'Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = () => {
    showAlert('Delete Note?', 'Are you sure you want to permanently delete this note?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteNoteRecord(noteId);
          openNotepad();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      </View>
    );
  }
  if (!note) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Note</Text>
        </LinearGradient>
        <Text style={styles.notFound}>Note not found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {isMoneyNote ? note.personName || NOTE_TYPE_LABELS[note.noteType] : note.title || 'Note'}
        </Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.typeBadgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: `${accent}1A` }]}>
            <Text style={[styles.typeBadgeText, { color: accent }]}>{NOTE_TYPE_ICONS[note.noteType]} {NOTE_TYPE_LABELS[note.noteType]}</Text>
          </View>
          {!!isMoneyNote && (
            <View style={[styles.statusBadge, note.status === NOTE_STATUS.PAID ? styles.statusPaid : styles.statusPending]}>
              <Text style={[styles.statusBadgeText, note.status === NOTE_STATUS.PAID ? styles.statusPaidText : styles.statusPendingText]}>
                {note.status === NOTE_STATUS.PAID ? '✓ Settled' : 'Pending'}
              </Text>
            </View>
          )}
        </View>

        {isMoneyNote ? (
          <>
            <Text style={[styles.amount, { color: accent }]}>MYR {Number(note.amount || 0).toFixed(2)}</Text>
            <View style={styles.metaBlock}>
              <MetaRow label="Person" value={note.personName} />
              {note.transactionDate ? <MetaRow label="Date" value={new Date(note.transactionDate).toLocaleDateString()} /> : null}
              {note.dueDate ? <MetaRow label="Due Date" value={new Date(note.dueDate).toLocaleDateString()} /> : null}
              {!!note.content && <MetaRow label="Notes" value={note.content} />}
              <MetaRow label="Last Updated" value={new Date(note.updatedAt).toLocaleDateString()} />
            </View>

            <TouchableOpacity style={[styles.statusToggle, updatingStatus && { opacity: 0.7 }]} onPress={toggleStatus} disabled={updatingStatus}>
              {updatingStatus ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.statusToggleText}>
                  {note.status === NOTE_STATUS.PAID ? 'Mark as Pending' : 'Mark as Settled'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.metaBlock}>
            <Text style={styles.noteContent}>{note.content || 'No content.'}</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <ActionButton label="Edit" onPress={() => openAddNote(note.id)} />
          <ActionButton label="Delete" destructive onPress={handleDelete} />
        </View>
      </ScrollView>
    </View>
  );
}

function MetaRow({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ActionButton({ label, onPress, destructive }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.actionButton, destructive && styles.actionButtonDestructive]} onPress={onPress}>
      <Text style={[styles.actionButtonText, destructive && styles.actionButtonTextDestructive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backIcon: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700', flexShrink: 1 },
    content: { padding: 16, paddingBottom: 60 },
    typeBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    typeBadge: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
    typeBadgeText: { fontSize: 12, fontWeight: '700' },
    statusBadge: { borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 12 },
    statusPending: { backgroundColor: '#FFF3E0' },
    statusPaid: { backgroundColor: '#E8F5E9' },
    statusBadgeText: { fontSize: 12, fontWeight: '700' },
    statusPendingText: { color: '#EF6C00' },
    statusPaidText: { color: '#2E7D32' },
    amount: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
    metaBlock: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 16, gap: 10 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    metaLabel: { color: colors.textSecondary, fontSize: 13 },
    metaValue: { fontWeight: '600', fontSize: 13, color: colors.text, flexShrink: 1, textAlign: 'right' },
    noteContent: { fontSize: 15, color: colors.text, lineHeight: 22 },
    statusToggle: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center', marginBottom: 16 },
    statusToggleText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    actionButton: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 12, alignItems: 'center', borderRadius: radius.sm },
    actionButtonDestructive: { borderColor: colors.error },
    actionButtonText: { fontWeight: '600', fontSize: 14, color: colors.primaryDark },
    actionButtonTextDestructive: { color: colors.error },
    notFound: { textAlign: 'center', marginTop: 40, color: colors.textSecondary },
  });
}
