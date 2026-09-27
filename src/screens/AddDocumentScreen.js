import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import DocumentUpload from '../components/DocumentUpload';
import { FormLabel, FormInput, FormTextArea, DateField } from '../components/ui';
import { DOCUMENT_TYPE_LABELS, MULTI_PAGE_TYPES, DEFAULT_REMINDER_OFFSETS } from '../data/documentConstants';
import { createDocument, updateDocument, listDocuments } from '../firebase/documentService';
import { uploadMultipleFiles } from '../firebase/documentStorageService';
import { rescheduleReminders } from '../firebase/documentReminderService';

/**
 * Handles both "add new" and "edit details" - editDocumentId (from
 * AppContext.openAddDocument) is null for a new document, or set when
 * opened via DocumentDetailsScreen's "Edit Details" action. Files are
 * required for a new document; editing only touches name/number/dates/
 * notes (replacing files is a separate action on DocumentDetailsScreen).
 */
export default function AddDocumentScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, activeDocumentType, editDocumentId, openMyDocuments, openDocumentDetail } = useApp();
  const documentType = activeDocumentType;
  const isEditing = !!editDocumentId;
  const allowsMultiplePages = MULTI_PAGE_TYPES.includes(documentType);

  const [loadingExisting, setLoadingExisting] = useState(isEditing);
  const [documentName, setDocumentName] = useState(DOCUMENT_TYPE_LABELS[documentType] ?? '');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [pickedFiles, setPickedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (!isEditing || !authUser) return;
    (async () => {
      const docs = await listDocuments(authUser.uid);
      const existing = docs.find((d) => d.id === editDocumentId);
      if (existing) {
        setDocumentName(existing.documentName || '');
        setDocumentNumber(existing.documentNumber || '');
        setIssueDate(existing.issueDate ? toDateInputValue(existing.issueDate) : '');
        setExpiryDate(existing.expiryDate ? toDateInputValue(existing.expiryDate) : '');
        setNotes(existing.notes || '');
      }
      setLoadingExisting(false);
    })();
  }, [isEditing, editDocumentId, authUser]);

  const handleFilesPicked = (files) => {
    setPickedFiles((prev) => (allowsMultiplePages ? [...prev, ...files] : files));
  };

  const removeFile = (index) => {
    setPickedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!authUser) return;
    if (!documentName.trim()) {
      showAlert('Document name required', 'Please give this document a name.');
      return;
    }
    if (!isEditing && pickedFiles.length === 0) {
      showAlert('No file added', 'Please take a photo or choose a file first.');
      return;
    }

    setSaving(true);
    try {
      const draft = {
        documentType,
        documentName: documentName.trim(),
        documentNumber: documentNumber.trim() || undefined,
        issueDate: issueDate ? Date.parse(issueDate) : null,
        expiryDate: expiryDate ? Date.parse(expiryDate) : null,
        notes: notes.trim(),
      };

      if (isEditing) {
        await updateDocument(editDocumentId, draft);
        await rescheduleReminders({ id: editDocumentId, ...draft, reminderSettings: { enabled: true, offsets: DEFAULT_REMINDER_OFFSETS } });
        openDocumentDetail(editDocumentId);
      } else {
        const tempId = `tmp-${Date.now()}`;
        const uploadedFiles = await uploadMultipleFiles(authUser.uid, tempId, pickedFiles, (_, pct) => setUploadProgress(pct));
        const fullDraft = { ...draft, reminderSettings: { enabled: true, offsets: DEFAULT_REMINDER_OFFSETS } };
        const documentId = await createDocument(authUser.uid, fullDraft, uploadedFiles);
        await rescheduleReminders({ id: documentId, ...fullDraft });
        openMyDocuments();
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
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Document' : DOCUMENT_TYPE_LABELS[documentType] ?? 'Add Document'}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <FormLabel>Document Name</FormLabel>
        <FormInput value={documentName} onChangeText={setDocumentName} placeholder="e.g. Malaysian Passport" />

        <FormLabel style={styles.spacedLabel}>Document Number (optional)</FormLabel>
        <FormInput value={documentNumber} onChangeText={setDocumentNumber} placeholder="e.g. A12345678" />

        <FormLabel style={styles.spacedLabel}>Issue Date (optional)</FormLabel>
        <DateField placeholder="Select issue date" value={issueDate} onChange={setIssueDate} />

        <FormLabel style={styles.spacedLabel}>Expiry Date (optional)</FormLabel>
        <DateField placeholder="Select expiry date" value={expiryDate} onChange={setExpiryDate} />

        <FormLabel style={styles.spacedLabel}>Notes (optional)</FormLabel>
        <FormTextArea value={notes} onChangeText={setNotes} placeholder="Any extra details..." />

        {!isEditing && (
          <>
            <Text style={styles.sectionLabel}>{allowsMultiplePages ? 'Pages' : 'Document File'}</Text>

            {pickedFiles.length > 0 && (
              <View style={styles.previewRow}>
                {pickedFiles.map((f, i) => (
                  <View key={i} style={styles.previewItem}>
                    {f.type?.startsWith('image') ? (
                      <Image source={{ uri: f.uri }} style={styles.previewImage} />
                    ) : (
                      <View style={styles.pdfPreview}><Text style={styles.pdfPreviewText}>📄 PDF</Text></View>
                    )}
                    <TouchableOpacity onPress={() => removeFile(i)} style={styles.removeBadge}>
                      <Text style={styles.removeBadgeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <DocumentUpload multiple={allowsMultiplePages} onFilesPicked={handleFilesPicked} />
          </>
        )}

        {!!saving && (
          <View style={styles.savingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.savingText}>{isEditing ? 'Saving…' : `Uploading… ${Math.round(uploadProgress)}%`}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.saveButton, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving…' : 'Save'}</Text>
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
    sectionLabel: { fontSize: 14, fontWeight: '700', marginTop: 16, marginBottom: 8, color: colors.text },
    previewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    previewItem: { width: 72, height: 72, position: 'relative' },
    previewImage: { width: 72, height: 72, borderRadius: radius.sm },
    pdfPreview: { width: 72, height: 72, borderRadius: radius.sm, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    pdfPreviewText: { fontSize: 11, color: colors.textSecondary },
    removeBadge: { position: 'absolute', top: -6, right: -6, backgroundColor: colors.scrim, borderRadius: radius.pill, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    removeBadgeText: { color: '#FFFFFF', fontSize: 12 },
    savingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, justifyContent: 'center' },
    savingText: { color: colors.textSecondary },
    saveButton: { marginTop: 20, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
    saveButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  });
}
