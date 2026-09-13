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

const STATUS = {
  pending: ['⏳', 'Verification in progress', 'Your KYC submission is securely queued for review. You will be notified when the review is complete.'],
  approved: ['✅', 'Identity verified', 'Your identity has been verified. Finance features can now use your verified account status.'],
  rejected: ['❌', 'Verification needs attention', 'Your submission was not approved. Check the reason below and submit a clearer document.'],
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
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('MySheba', 'Photo access is required to upload your identity document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) {
      setDocUri(result.assets[0].uri);
      setDocMime(result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const submit = async () => {
    if (!docUri) {
      showAlert('MySheba', 'Please upload a clear government-issued identity document.');
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
      showAlert('MySheba', 'KYC submitted successfully. Your application is now pending review.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit KYC. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const verified = !!profile?.verified;
  const status = request && STATUS[request.status];
  const showForm = !verified && (!request || request.status === 'rejected');

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.headerTitle}>Identity Verification</Text><Text style={styles.headerSub}>KYC / e-KYC onboarding</Text></View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introIcon}>🛡️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.introTitle}>Protect your financial account</Text>
            <Text style={styles.introText}>Verify your identity before using higher-risk money services. Never share passwords, PINs or OTPs in this form.</Text>
          </View>
        </View>

        {verified ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusIcon}>✅</Text>
            <Text style={styles.statusTitle}>Identity verified</Text>
            <Text style={styles.statusBody}>Your account has an approved identity-verification status.</Text>
            <VerifiedBadge verified size="md" />
          </View>
        ) : request && !showForm ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusIcon}>{status?.[0] || 'ℹ️'}</Text>
            <Text style={styles.statusTitle}>{status?.[1] || 'Verification status'}</Text>
            <Text style={styles.statusBody}>{status?.[2] || ''}</Text>
            {request.note ? <Text style={styles.reason}>Review note: {request.note}</Text> : null}
          </View>
        ) : (
          <>
            {request?.status === 'rejected' && (
              <View style={[styles.statusCard, styles.rejected]}>
                <Text style={styles.statusIcon}>❌</Text>
                <Text style={styles.statusTitle}>Please resubmit</Text>
                <Text style={styles.statusBody}>Use a clear, readable image with all document edges visible.</Text>
                {request.note ? <Text style={styles.reason}>Review note: {request.note}</Text> : null}
              </View>
            )}

            <Text style={styles.sectionTitle}>What you need</Text>
            <View style={styles.steps}>
              <Step n="1" title="Government-issued ID" body="Passport, national ID or other accepted identity document." styles={styles} />
              <Step n="2" title="Clear image" body="Good lighting, readable details and no heavy glare or blur." styles={styles} />
              <Step n="3" title="Secure review" body="Your submission is reviewed before an approved status is granted." styles={styles} />
            </View>

            <Text style={styles.sectionTitle}>Upload identity document</Text>
            <TouchableOpacity style={styles.uploadBox} onPress={pickDocument} activeOpacity={0.85}>
              {docUri ? <Image source={{ uri: docUri }} style={styles.preview} resizeMode="cover" /> : <><Text style={styles.uploadIcon}>🪪</Text><Text style={styles.uploadText}>Tap to choose a document photo</Text><Text style={styles.uploadHint}>JPEG / PNG • clear and readable</Text></>}
            </TouchableOpacity>

            <View style={styles.providerNote}>
              <Text style={styles.providerTitle}>e-KYC provider connection</Text>
              <Text style={styles.providerText}>This app is prepared for a licensed e-KYC provider integration. Until a provider is connected, submissions use the existing secure manual-review workflow and are not automatically approved.</Text>
            </View>

            {submitting ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} /> : <PrimaryButton label="Submit KYC for Review" onPress={submit} style={{ marginTop: 18 }} />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Step({ n, title, body, styles }) {
  return <View style={styles.step}><View style={styles.stepNo}><Text style={styles.stepNoText}>{n}</Text></View><View style={{ flex: 1 }}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepBody}>{body}</Text></View></View>;
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', padding: 12, overflow: 'hidden' },
    backBtn: { padding: 5, marginRight: 8 },
    backText: { color: '#FFFFFF', fontSize: 22 },
    headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
    headerSub: { color: '#FFFFFF', fontSize: 10, marginTop: 2 },
    body: { padding: 15, paddingBottom: 45 },
    introCard: { flexDirection: 'row', gap: 11, padding: 14, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    introIcon: { fontSize: 26 },
    introTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
    introText: { color: colors.text, fontSize: 11, lineHeight: 16 },
    sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 9, marginTop: 5 },
    steps: { gap: 9, marginBottom: 18 },
    step: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    stepNo: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    stepNoText: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
    stepTitle: { color: colors.text, fontWeight: '800', fontSize: 12 },
    stepBody: { color: colors.text, fontSize: 10, lineHeight: 14, marginTop: 2 },
    uploadBox: { height: 190, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    preview: { width: '100%', height: '100%' },
    uploadIcon: { fontSize: 34, marginBottom: 8 },
    uploadText: { color: colors.text, fontSize: 13, fontWeight: '800' },
    uploadHint: { color: colors.text, opacity: 0.7, fontSize: 10, marginTop: 4 },
    providerNote: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    providerTitle: { color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 4 },
    providerText: { color: colors.text, fontSize: 10, lineHeight: 14 },
    statusCard: { alignItems: 'center', padding: 24, borderRadius: radius.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
    rejected: { marginBottom: 16 },
    statusIcon: { fontSize: 38, marginBottom: 9 },
    statusTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
    statusBody: { color: colors.text, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7 },
    reason: { color: colors.error, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  });
}
