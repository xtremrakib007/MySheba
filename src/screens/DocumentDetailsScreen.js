import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import DocumentStatusBadge from '../components/DocumentStatusBadge';
import DocumentExpiry from '../components/DocumentExpiry';
import DocumentUpload from '../components/DocumentUpload';
import { DOCUMENT_TYPE_LABELS, MULTI_PAGE_TYPES } from '../data/documentConstants';
import { listDocuments, updateDocument, deleteDocumentRecord } from '../firebase/documentService';
import { uploadMultipleFiles, deleteFiles } from '../firebase/documentStorageService';
import { cancelReminders } from '../firebase/documentReminderService';

export default function DocumentDetailsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, activeDocumentId, openDocumentViewer, openAddDocument, openMyDocuments } = useApp();
  const documentId = activeDocumentId;
  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  async function load() {
    if (!authUser || !documentId) return;
    setLoading(true);
    const docs = await listDocuments(authUser.uid);
    setDocument(docs.find((d) => d.id === documentId) ?? null);
    setLoading(false);
  }

  // No separate PIN prompt for share/view here - My Documents is already
  // gated on entry in MyDocumentsScreen, matching Notepad's
  // single-gate-on-entry model rather than re-asking per action.
  const handleShare = async () => {
    if (!document?.files?.length) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        showAlert('MySheba', 'Sharing is not available on this device.');
        return;
      }
      const file = document.files[0];
      const localUri = `${FileSystem.cacheDirectory}${document.documentName}-share`;
      const { uri } = await FileSystem.downloadAsync(file.url, localUri);
      await Sharing.shareAsync(uri);
    } catch {
      showAlert('MySheba', 'Could not share this file. Please try again.');
    }
  };

  const handleView = () => {
    openDocumentViewer(document.id);
  };

  const handleReplaceFiles = async (files) => {
    setReplacing(true);
    try {
      const uploaded = await uploadMultipleFiles(authUser.uid, documentId, files, () => {});
      await deleteFiles(document.files); // remove old files after new ones succeed
      await updateDocument(documentId, { files: uploaded });
      await load();
    } catch {
      showAlert('Upload failed', 'Please try again.');
    } finally {
      setReplacing(false);
    }
  };

  const handleDelete = () => {
    showAlert('Delete Document?', 'Are you sure you want to permanently delete this document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await cancelReminders(documentId);
          await deleteFiles(document.files);
          await deleteDocumentRecord(documentId);
          openMyDocuments();
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
  if (!document) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Document</Text>
        </LinearGradient>
        <Text style={styles.notFound}>Document not found.</Text>
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
        <Text style={styles.headerTitle} numberOfLines={1}>{document.documentName}</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.type}>{DOCUMENT_TYPE_LABELS[document.documentType]}</Text>

        <View style={styles.badgeRow}>
          <DocumentStatusBadge status={document.status} />
          <DocumentExpiry expiryDate={document.expiryDate} />
        </View>

        <View style={styles.metaBlock}>
          {document.documentNumber ? <MetaRow label="Document Number" value={document.documentNumber} /> : null}
          {document.issueDate ? <MetaRow label="Issue Date" value={new Date(document.issueDate).toLocaleDateString()} /> : null}
          {document.expiryDate ? <MetaRow label="Expiry Date" value={new Date(document.expiryDate).toLocaleDateString()} /> : null}
          {!!document.notes && <MetaRow label="Notes" value={document.notes} />}
          <MetaRow label="Uploaded" value={new Date(document.createdAt).toLocaleDateString()} />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton label="View" onPress={handleView} />
          <ActionButton label="Share" onPress={handleShare} />
          <ActionButton label="Edit Details" onPress={() => openAddDocument(document.documentType, document.id)} />
        </View>

        <Text style={styles.sectionLabel}>Replace Document</Text>
        {replacing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <DocumentUpload multiple={MULTI_PAGE_TYPES.includes(document.documentType)} onFilesPicked={handleReplaceFiles} />
        )}

        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Document</Text>
        </TouchableOpacity>
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

function ActionButton({ label, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <Text style={styles.actionButtonText}>{label}</Text>
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
    content: { padding: 16, paddingBottom: 60, gap: 4 },
    type: { fontSize: 14, color: colors.textSecondary, marginBottom: 4 },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    metaBlock: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginVertical: 12, gap: 10 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    metaLabel: { color: colors.textSecondary, fontSize: 13 },
    metaValue: { fontWeight: '600', fontSize: 13, color: colors.text, flexShrink: 1, textAlign: 'right' },
    actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
    actionButton: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.sm },
    actionButtonText: { fontWeight: '600', fontSize: 14, color: colors.primaryDark },
    sectionLabel: { fontSize: 14, fontWeight: '700', marginBottom: 8, color: colors.text },
    deleteButton: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
    deleteButtonText: { color: colors.error, fontWeight: '700' },
    notFound: { textAlign: 'center', marginTop: 40, color: colors.textSecondary },
  });
}
