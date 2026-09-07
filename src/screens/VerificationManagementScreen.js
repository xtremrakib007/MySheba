// Marketplace Admin Panel > Verification Management (sitemap section,
// Phase 3 of the PRD). Admin/superadmin only (gated in Sidebar.js, same
// pattern as MarketplaceModerationScreen). Shows every pending identity
// verification request, lets the admin view the submitted ID document and
// Approve (grants the ✓ Verified badge via the approveVerification Cloud
// Function) or Reject (with a reason the user will see - see
// VerifyIdentityScreen.js).
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import * as verificationService from '../firebase/verificationService';

function fmtDate(ts) {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function RequestCard({ req, onChanged, onReject }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [busy, setBusy] = useState(false);

  const approve = async () => {
    setBusy(true);
    try {
      await verificationService.approveVerification(req.uid);
      onChanged();
    } catch (e) {
      showAlert('Something went wrong', e.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={() => Linking.openURL(req.documentUrl).catch(() => {})}>
        <Image source={{ uri: req.documentUrl }} style={styles.docImage} resizeMode="cover" />
      </TouchableOpacity>
      <View style={styles.cardBody}>
        <Text style={styles.name}>{req.name || 'Unnamed user'}</Text>
        {!!req.phone && <Text style={styles.meta}>📱 {req.phone}</Text>}
        <Text style={styles.meta}>Submitted {fmtDate(req.submittedAt)}</Text>
        <View style={styles.actionsRow}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <TouchableOpacity style={styles.successBtn} onPress={approve}>
                <Text style={styles.successBtnText}>✓ Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.errorBtn} onPress={() => onReject(req)}>
                <Text style={styles.errorBtnText}>✕ Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}

export default function VerificationManagementScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome } = useApp();
  const [requests, setRequests] = useState(undefined);
  const [rejectTarget, setRejectTarget] = useState(null);

  useEffect(() => {
    return verificationService.subscribePendingVerifications(setRequests, () => setRequests([]));
  }, []);

  const submitReject = async (reason) => {
    if (!rejectTarget) return;
    try {
      await verificationService.rejectVerification(rejectTarget.uid, reason);
    } catch (e) {
      showAlert('Something went wrong', e.message || 'Please try again.');
    } finally {
      setRejectTarget(null);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verification Requests</Text>
      </LinearGradient>

      {requests === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {requests.length === 0 ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>🪪</Text>
              <Text style={styles.emptyText}>No pending verification requests.</Text>
            </View>
          ) : (
            requests.map((req) => (
              <RequestCard key={req.id} req={req} onChanged={() => {}} onReject={setRejectTarget} />
            ))
          )}
        </ScrollView>
      )}

      <PromptModal
        visible={!!rejectTarget}
        title="Reason for rejecting (shown to the user)"
        placeholder="e.g. Document photo is blurry"
        onSubmit={submitReject}
        onCancel={() => setRejectTarget(null)}
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 6, flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    body: { padding: 14, paddingBottom: 40 },
    card: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 12 },
    docImage: { width: 100, height: 100 },
    cardBody: { flex: 1, padding: 10 },
    name: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
    meta: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    successBtn: { backgroundColor: colors.success, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
    successBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
    errorBtn: { backgroundColor: colors.error, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 10 },
    errorBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
  });
}
