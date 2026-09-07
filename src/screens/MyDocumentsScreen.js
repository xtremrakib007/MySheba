import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import DocumentCard from '../components/DocumentCard';
import DocumentFilter from '../components/DocumentFilter';
import EmptyDocumentsState from '../components/EmptyDocumentsState';
import { subscribeToDocuments } from '../firebase/documentService';
import { DOCUMENT_STATUS, DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from '../data/documentConstants';

/**
 * "My Documents" - private per-user vault for passport, visa, work
 * permit, etc. Shows a catalog card for every default document type
 * (added or not) plus any custom "Other" documents, with search and
 * status filtering. See AppContext.openMyDocuments / openAddDocument /
 * openDocumentDetail for the navigation state this screen reads/writes.
 */
export default function MyDocumentsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, openDocumentTypePicker, openAddDocument, openDocumentDetail, openCreatePayslip, requireSecurityPin, privateVaultUnlocked, setPrivateVaultUnlocked } = useApp();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [unlocked, setUnlocked] = useState(privateVaultUnlocked);

  // Gate the whole screen behind the security PIN on entry (see
  // requireSecurityPin() in AppContext.js), same as NotepadScreen -
  // cancelling backs out to Home instead of showing any document
  // content. Skipped entirely if privateVaultUnlocked is already true
  // (e.g. Notepad was opened first this session) - shares that flag
  // with NotepadScreen, so passing the PIN for either one unlocks both
  // until the app is backgrounded (see the AppState listener in
  // AppContext.js, same re-lock behavior as the Chat Lock vault).
  useEffect(() => {
    if (privateVaultUnlocked) { setUnlocked(true); return undefined; }
    let cancelled = false;
    requireSecurityPin('opening My Documents')
      .then(() => { if (!cancelled) { setUnlocked(true); setPrivateVaultUnlocked(true); } })
      .catch(() => { if (!cancelled) goBackOrHome(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authUser || !unlocked) return undefined;
    const unsubscribe = subscribeToDocuments(
      authUser.uid,
      (docs) => {
        setDocuments(mergeWithCatalog(docs));
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [authUser, unlocked]);

  const filtered = useMemo(() => {
    return documents.filter((d) => {
      const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
      const matchesSearch =
        !search.trim() ||
        d.documentName?.toLowerCase().includes(search.toLowerCase()) ||
        DOCUMENT_TYPE_LABELS[d.documentType]?.toLowerCase().includes(search.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [documents, statusFilter, search]);

  const summary = useMemo(() => {
    const added = documents.filter((d) => d.status !== DOCUMENT_STATUS.NOT_ADDED);
    return {
      total: added.length,
      valid: added.filter((d) => d.status === DOCUMENT_STATUS.VALID).length,
      expiringSoon: added.filter((d) => d.status === DOCUMENT_STATUS.EXPIRING_SOON).length,
      expired: added.filter((d) => d.status === DOCUMENT_STATUS.EXPIRED).length,
    };
  }, [documents]);

  const hasAnyReal = documents.some((d) => d.status !== DOCUMENT_STATUS.NOT_ADDED);

  const goToAdd = (documentType) => {
    // A catalog card for a specific (unfilled) type skips the picker and
    // goes straight to Add for that type. The FAB, with no type known
    // yet, opens the type picker instead. Payslip is the one exception
    // (PRD "Create Payslip" section 3): its card routes into the guided
    // Create Payslip flow instead of a manual file upload, since a
    // payslip here is something MySheba generates for the user rather
    // than a document the user already has.
    if (documentType === DOCUMENT_TYPES.PAYSLIP) openCreatePayslip();
    else if (documentType) openAddDocument(documentType);
    else openDocumentTypePicker();
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>My Documents</Text>
          <Text style={styles.headerSubtitle}>🔒 Private and only visible to you</Text>
        </View>
      </LinearGradient>

      {loading || !unlocked ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>Couldn't load your documents. Pull to refresh or try again.</Text>
      ) : (
        <>
          {hasAnyReal && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotal}>{summary.total} Total</Text>
              <View style={styles.summaryChips}>
                <SummaryChip label={`🟢 ${summary.valid} Valid`} onPress={() => setStatusFilter(DOCUMENT_STATUS.VALID)} />
                <SummaryChip label={`🟠 ${summary.expiringSoon} Expiring Soon`} onPress={() => setStatusFilter(DOCUMENT_STATUS.EXPIRING_SOON)} />
                <SummaryChip label={`🔴 ${summary.expired} Expired`} onPress={() => setStatusFilter(DOCUMENT_STATUS.EXPIRED)} />
              </View>
            </View>
          )}

          <TextInput
            style={styles.search}
            placeholder="Search documents..."
            placeholderTextColor="#999"
            value={search}
            onChangeText={setSearch}
          />

          <DocumentFilter activeFilter={statusFilter} onChange={setStatusFilter} />

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id || item.documentType}
            contentContainerStyle={styles.list}
            ListEmptyComponent={!hasAnyReal ? <EmptyDocumentsState onAddPress={() => goToAdd()} /> : null}
            renderItem={({ item }) => (
              <DocumentCard
                document={item}
                onPress={() => openDocumentDetail(item.id)}
                onAddPress={() => goToAdd(item.documentType)}
              />
            )}
          />

          <TouchableOpacity style={styles.fab} onPress={() => goToAdd()}>
            <Text style={styles.fabText}>+ Add Document</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

function SummaryChip({ label, onPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity onPress={onPress} style={styles.summaryChip}>
      <Text style={styles.summaryChipText}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Ensures every default category shows a card even if the user hasn't
 * added it yet - those render with status NOT_ADDED and an "Add
 * Document" action. Custom "other" documents pass through as-is and are
 * appended after the default categories.
 */
function mergeWithCatalog(realDocs) {
  const byType = {};
  realDocs.forEach((d) => {
    if (d.documentType !== DOCUMENT_TYPES.OTHER) byType[d.documentType] = d;
  });

  const catalogEntries = Object.keys(DOCUMENT_TYPE_LABELS)
    .filter((type) => type !== DOCUMENT_TYPES.OTHER)
    .map((type) => byType[type] ?? { documentType: type, documentName: DOCUMENT_TYPE_LABELS[type], status: DOCUMENT_STATUS.NOT_ADDED });

  const customDocs = realDocs.filter((d) => d.documentType === DOCUMENT_TYPES.OTHER);
  return [...catalogEntries, ...customDocs];
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backIcon: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700' },
    headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
    summaryRow: { paddingHorizontal: 16, paddingTop: 12, marginBottom: 8 },
    summaryTotal: { fontSize: 15, fontWeight: '700', color: colors.navy, marginBottom: 6 },
    summaryChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    summaryChip: { backgroundColor: colors.card, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
    summaryChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    search: { marginHorizontal: 16, marginTop: 12, marginBottom: 10, backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border },
    list: { paddingHorizontal: 16, paddingBottom: 100 },
    fab: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: radius.pill, elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    fabText: { color: '#FFFFFF', fontWeight: '700' },
    errorText: { textAlign: 'center', marginTop: 40, color: colors.error, paddingHorizontal: 24 },
  });
}
