// Customer identity verification screen.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import VerifiedBadge from '../components/VerifiedBadge';
import * as verificationService from '../firebase/verificationService';
import { uploadVerificationDocument } from '../firebase/mediaUpload';

const STATUS_COPY = {
  pending: { icon: '⏳', title: 'Under Review', body: 'Your KYC document has been submitted and is waiting for admin review.' },
  approved: { icon: '✅', title: 'KYC Verified', body: 'Your identity has been verified successfully.' },
  rejected: { icon: '❌', title: 'Not Approved', body: 'Your KYC submission was not approved. You can review the reason and submit again.' },
};

export default function VerifyIdentityScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();
  const [request, setRequest] = useState(undefined);
  const [docUri, setDocUri] = useState(null);
  const [docMime, setDocMime] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authUser) return undefined;
    return verificationService.subscribeMyVerificationRequest(authUser.uid, setRequest, () => setRequest(null));
  }, [authUser]);

  const pickDocument = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      setDocUri(result.assets[0].uri);
      setDocMime(result.assets[0].mimeType);
    }
  };

  const submit = async () => {
    if (!docUri) {
      showAlert('MySheba', 'Please choose a photo of your ID document.');
      return;
    }
    setSubmitting(true);
    try {
      const documentUrl = await uploadVerificationDocument(authUser.uid, docUri, docMime);
      await verificationService.submitVerificationRequest(
        authUser.uid,
        { name: profile?.name, phone: profile?.phone },
        documentUrl
      );
      setDocUri(null);
      showAlert('MySheba', "Submitted! We'll review your KYC document and let you know.");
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your KYC document. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyVerified = !!profile?.verified;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Verification</Text>
      </LinearGradient>

      {request === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {alreadyVerified ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>{STATUS_COPY.approved.icon}</Text>
              <Text style={styles.statusTitle}>{STATUS_COPY.approved.title}</Text>
              <Text style={styles.statusBody}>{STATUS_COPY.approved.body}</Text>
              <VerifiedBadge verified size="md" />
              {!!profile?.kycId && (
                <View style={styles.kycIdBox}>
                  <Text style={styles.kycIdLabel}>KYC ID</Text>
                  <Text style={styles.kycId}>{profile.kycId}</Text>
                </View>
              )}
            </View>
          ) : request && request.status !== 'rejected' ? (
            <View style={styles.statusCard}>
              <Text style={styles.statusIcon}>{STATUS_COPY[request.status]?.icon || 'ℹ️'}</Text>
              <Text style={styles.statusTitle}>{STATUS_COPY[request.status]?.title || request.status}</Text>
              <Text style={styles.statusBody}>{STATUS_COPY[request.status]?.body || ''}</Text>
            </View>
          ) : (
            <>
              {request && request.status === 'rejected' && (
                <View style={[styles.statusCard, styles.rejectedCard]}>
                  <Text style={styles.statusIcon}>{STATUS_COPY.rejected.icon}</Text>
                  <Text style={styles.statusTitle}>{STATUS_COPY.rejected.title}</Text>
                  <Text style={styles.statusBody}>{STATUS_COPY.rejected.body}</Text>
                  {!!request.note && <Text style={styles.rejectReason}>Reason: {request.note}</Text>}
                </View>
              )}

              <Text style={styles.intro}>
                Upload a clear photo of a government-issued ID. Admin approval is required for Mobile Banking and Remittance.
              </Text>

              <TouchableOpacity style={styles.uploadBox} onPress={pickDocument} activeOpacity={0.8}>
                {docUri ? (
                  <Image source={{ uri: docUri }} style={styles.uploadPreview} resizeMode="cover" />
                ) : (
                  <>
                    <Text style={{ fontSize: 28, marginBottom: 6 }}>🪪</Text>
                    <Text style={styles.uploadText}>Tap to choose a photo</Text>
                  </>
                )}
              </TouchableOpacity>

              {submitting ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
              ) : (
                <PrimaryButton label="Submit for Review" onPress={submit} style={{ marginTop: 20 }} />
              )}
            </>
          )}
        </ScrollView>
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 6, flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { padding: 16, paddingBottom: 40 },
    intro: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginBottom: 16 },
    uploadBox: { height: 180, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    uploadPreview: { width: '100%', height: '100%' },
    uploadText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
    statusCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 24, marginBottom: 16 },
    rejectedCard: { marginBottom: 20 },
    statusIcon: { fontSize: 40, marginBottom: 10 },
    statusTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 6 },
    statusBody: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 10 },
    kycIdBox: { marginTop: 14, width: '100%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    kycIdLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
    kycId: { fontSize: 16, color: colors.text, fontWeight: '800', letterSpacing: 0.5 },
    rejectReason: { fontSize: 12, color: colors.error, textAlign: 'center', marginTop: 4 },
  });
}
