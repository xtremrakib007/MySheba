import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import { FormLabel, FormInput, FormTextArea, DateField } from '../components/ui';
import { listNotes, createNote, updateNote } from '../firebase/notepadService';
import {
  NOTE_TYPES, NOTE_TYPE_SHORT_LABELS, NOTE_TYPE_ICONS, MONEY_NOTE_TYPES, NOTE_STATUS,
} from '../data/notepadConstants';

const TYPE_OPTIONS = [NOTE_TYPES.GENERAL, NOTE_TYPES.CREDIT, NOTE_TYPES.DEBIT, NOTE_TYPES.LOAN];

/**
 * Handles both "add new" and "edit" - editNoteId (from
 * AppContext.openAddNote) is null for a new note, or set when opened via
 * NoteDetailScreen's "Edit" action. Same screen covers plain notes and
 * the three money-note flavors (Credit/Debit/Loan); switching the type
 * selector swaps which fields show below it.
 */
export default function AddNoteScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, editNoteId, openNotepad, openNoteDetail } = useApp();
  const isEditing = !!editNoteId;

  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [noteType, setNoteType] = useState(NOTE_TYPES.GENERAL);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [personName, setPersonName] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(toDateInputValue(Date.now()));
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState(NOTE_STATUS.PENDING);
  const [saving, setSaving] = useState(false);

  const isMoneyNote = MONEY_NOTE_TYPES.includes(noteType);

  useEffect(() => {
    if (!isEditing || !authUser) return;
    (async () => {
      const notes = await listNotes(authUser.uid);
      const existing = notes.find((n) => n.id === editNoteId);
      if (existing) {
        setNoteType(existing.noteType);
        setTitle(existing.title || '');
        setContent(existing.content || '');
        setPersonName(existing.personName || '');
        setAmount(existing.amount != null ? String(existing.amount) : '');
        setTransactionDate(existing.transactionDate ? toDateInputValue(existing.transactionDate) : toDateInputValue(Date.now()));
        setDueDate(existing.dueDate ? toDateInputValue(existing.dueDate) : '');
        setStatus(existing.status || NOTE_STATUS.PENDING);
      }
      setLoadingExisting(false);
    })();
  }, [isEditing, editNoteId, authUser]);

  const handleSave = async () => {
    if (!authUser) return;

    if (isMoneyNote) {
      if (!personName.trim()) {
        showAlert('Name required', 'Please enter the name of the person for this ' + NOTE_TYPE_SHORT_LABELS[noteType].toLowerCase() + '.');
        return;
      }
      if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
        showAlert('Amount required', 'Please enter a valid amount.');
        return;
      }
    } else if (!title.trim() && !content.trim()) {
      showAlert('Note is empty', 'Please add a title or some content.');
      return;
    }

    setSaving(true);
    try {
      const draft = {
        noteType,
        title: title.trim(),
        content: content.trim(),
        personName: personName.trim(),
        amount: amount ? Number(amount) : null,
        transactionDate: transactionDate ? Date.parse(transactionDate) : Date.now(),
        dueDate: dueDate ? Date.parse(dueDate) : null,
        status,
      };

      if (isEditing) {
        await updateNote(editNoteId, draft);
        openNoteDetail(editNoteId);
      } else {
        const noteId = await createNote(authUser.uid, draft);
        openNoteDetail(noteId);
      }
    } catch (err) {
      showAlert('Save failed', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loadingExisting) {
    return (
      <View style={styles.screen}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.primary} />
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
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Note' : 'Add Note'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <FormLabel>Type</FormLabel>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, noteType === t && styles.typeChipActive]}
              onPress={() => setNoteType(t)}
              disabled={isEditing}
            >
              <Text style={[styles.typeChipText, noteType === t && styles.typeChipTextActive]}>
                {NOTE_TYPE_ICONS[t]} {NOTE_TYPE_SHORT_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {isEditing && <Text style={styles.typeLockedHint}>Note type can't be changed after creation.</Text>}

        {isMoneyNote ? (
          <>
            <FormLabel style={styles.spacedLabel}>Person's Name</FormLabel>
            <FormInput value={personName} onChangeText={setPersonName} placeholder="e.g. Ahmad Rahman" />

            <FormLabel style={styles.spacedLabel}>Amount (MYR)</FormLabel>
            <FormInput value={amount} onChangeText={setAmount} placeholder="e.g. 500" keyboardType="decimal-pad" />

            <FormLabel style={styles.spacedLabel}>Date</FormLabel>
            <DateField placeholder="Select date" value={transactionDate} onChange={setTransactionDate} />

            <FormLabel style={styles.spacedLabel}>Due Date (optional)</FormLabel>
            <DateField placeholder="Select due date" value={dueDate} onChange={setDueDate} />

            <FormLabel style={styles.spacedLabel}>Status</FormLabel>
            <View style={styles.statusRow}>
              <TouchableOpacity
                style={[styles.statusChip, status === NOTE_STATUS.PENDING && styles.statusChipPending]}
                onPress={() => setStatus(NOTE_STATUS.PENDING)}
              >
                <Text style={[styles.statusChipText, status === NOTE_STATUS.PENDING && styles.statusChipTextActive]}>Pending</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.statusChip, status === NOTE_STATUS.PAID && styles.statusChipPaid]}
                onPress={() => setStatus(NOTE_STATUS.PAID)}
              >
                <Text style={[styles.statusChipText, status === NOTE_STATUS.PAID && styles.statusChipTextActive]}>Settled</Text>
              </TouchableOpacity>
            </View>

            <FormLabel style={styles.spacedLabel}>Notes (optional)</FormLabel>
            <FormTextArea value={content} onChangeText={setContent} placeholder="Any extra details..." />
          </>
        ) : (
          <>
            <FormLabel style={styles.spacedLabel}>Title</FormLabel>
            <FormInput value={title} onChangeText={setTitle} placeholder="e.g. Wi-Fi password" />

            <FormLabel style={styles.spacedLabel}>Content</FormLabel>
            <FormTextArea value={content} onChangeText={setContent} placeholder="Write your note here..." style={{ minHeight: 140 }} />
          </>
        )}

        <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveButtonText}>Save</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function toDateInputValue(millis) {
  const d = new Date(millis);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backIcon: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700', flexShrink: 1 },
    content: { padding: 16, paddingBottom: 60 },
    spacedLabel: { marginTop: 14 },
    typeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    typeChip: { backgroundColor: 'white', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    typeChipTextActive: { color: 'white' },
    typeLockedHint: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
    statusRow: { flexDirection: 'row', gap: 8 },
    statusChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'white' },
    statusChipPending: { backgroundColor: '#FFF3E0', borderColor: '#FB8C00' },
    statusChipPaid: { backgroundColor: '#E8F5E9', borderColor: colors.success },
    statusChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    statusChipTextActive: { color: colors.text },
    saveButton: { marginTop: 22, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
    saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  });
}
