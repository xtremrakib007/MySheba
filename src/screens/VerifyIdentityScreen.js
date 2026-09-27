import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton, SearchPicker, DateField } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import VerifiedBadge from '../components/VerifiedBadge';
import LiveFaceCapture from '../components/LiveFaceCapture';
import * as verificationService from '../firebase/verificationService';
import { uploadVerificationDocument } from '../firebase/mediaUpload';
import { countries } from '../data/countries';
import { radius } from '../theme/theme';

const DOCUMENT_TYPES = ['Passport', 'MyKad / National ID', 'Work Permit / ID', "Driver's License"];
const GENDERS = ['Male', 'Female', 'Other'];
const COUNTRY_NAMES = [...new Set(countries.map((c) => c.name).filter(Boolean))].sort();

const STEPS = [
  { number: 1, title: 'Personal information', short: 'Personal' },
  { number: 2, title: 'Identity document', short: 'Document' },
  { number: 3, title: 'Face verification', short: 'Face' },
  { number: 4, title: 'Review & submit', short: 'Review' },
];

const STATUS_COPY = {
  pending: { icon: '⏳', title: 'KYC Under Review', body: 'Your submission is with our verification team.' },
  approved: { icon: '✓', title: "You're Verified", body: 'Your approved KYC status is now active.' },
  rejected: { icon: '!', title: 'KYC Needs Attention', body: 'Please correct the requested information and submit again.' },
};

function Field({ label, required = false, children, styles }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      {children}
    </View>
  );
}

function Input({ value, onChangeText, placeholder, styles, keyboardType, autoCapitalize, multiline }) {
  return (
    <TextInput
      value={value || ''}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={styles.placeholderColor}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      style={[styles.input, multiline && styles.textArea]}
    />
  );
}

function UploadCard({ label, required, uri, onPick, styles, hint }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{required ? <Text style={styles.required}> *</Text> : null}</Text>
      <TouchableOpacity style={styles.uploadBox} onPress={onPick} activeOpacity={0.85}>
        {uri ? (
          <Image source={{ uri }} style={styles.uploadPreview} resizeMode="cover" />
        ) : (
          <>
            <View style={styles.uploadIconCircle}><Text style={styles.uploadIcon}>+</Text></View>
            <Text style={styles.uploadText}>Upload photo</Text>
            <Text style={styles.uploadHint}>{hint || 'Clear and readable'}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ProgressHeader({ step, colors, styles }) {
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTop}>
        <Text style={styles.progressCount}>Step {step} of {STEPS.length}</Text>
        <Text style={styles.progressTitle}>{STEPS[step - 1].title}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / STEPS.length) * 100}%`, backgroundColor: colors.primary }]} />
      </View>
      <View style={styles.stepRow}>
        {STEPS.map((item) => (
          <View key={item.number} style={styles.stepItem}>
            <View style={[styles.stepDot, item.number <= step && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              <Text style={[styles.stepDotText, item.number <= step && styles.stepDotTextActive]}>{item.number}</Text>
            </View>
            <Text style={[styles.stepLabel, item.number === step && { color: colors.text, fontWeight: '800' }]}>{item.short}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function VerifyIdentityScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();

  const [request, setRequest] = useState(undefined);
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showLiveFace, setShowLiveFace] = useState(false);
  const [files, setFiles] = useState({ front: null, back: null, selfie: null });
  const [mimes, setMimes] = useState({ front: null, back: null, selfie: null });
  const [liveFaceVerified, setLiveFaceVerified] = useState(false);
  const [form, setForm] = useState({
    name: profile?.name || '',
    documentType: 'Passport',
    documentNumber: profile?.passportNumber || '',
    nationality: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    passportExpiryDate: '',
  });

  useEffect(() => {
    if (!authUser) return undefined;
    return verificationService.subscribeMyVerificationRequest(authUser.uid, setRequest, () => setRequest(null));
  }, [authUser]);

  useEffect(() => {
    if (!form.nationality && profile?.country) {
      const c = countries.find((x) => x.code === profile.country);
      if (c?.name) setForm((p) => ({ ...p, nationality: c.name }));
    }
  }, [profile?.country, form.nationality]);

  useEffect(() => {
    if (!form.name && profile?.name) setForm((p) => ({ ...p, name: profile.name }));
  }, [profile?.name, form.name]);

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const alreadyVerified = profile?.verified === true || profile?.verificationStatus === 'approved';
  const canEdit = !alreadyVerified && (!request || request.status === 'rejected');

  const documentNeedsBack = form.documentType !== 'Passport';
  const reviewItems = useMemo(() => [
    ['Full legal name', form.name],
    ['Date of birth', form.dateOfBirth],
    ['Nationality', form.nationality],
    ['Gender', form.gender],
    ['Residential address', form.address],
    ['Document type', form.documentType],
    ['Document number', form.documentNumber],
    ['Document expiry', form.passportExpiryDate || 'Not required'],
  ], [form]);

  const pickDocument = async (kind) => {
    const { requestMediaLibraryPermissionsAsync, launchImageLibraryAsync, MediaTypeOptions } = require('expo-image-picker');
    const perm = await requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('MySheba', 'Please allow photo library access to upload your identity document.');
      return;
    }
    const result = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFiles((p) => ({ ...p, [kind]: asset.uri }));
    setMimes((p) => ({ ...p, [kind]: asset.mimeType || 'image/jpeg' }));
  };

  const handleLiveFace = (uri, mime) => {
    setShowLiveFace(false);
    setFiles((p) => ({ ...p, selfie: uri }));
    setMimes((p) => ({ ...p, selfie: mime || 'image/jpeg' }));
    setLiveFaceVerified(true);
  };

  const validateStep = (targetStep = step) => {
    if (targetStep === 1) {
      if (!form.name.trim()) return 'Please enter your full legal name.';
      if (!form.dateOfBirth) return 'Please select your date of birth.';
      if (!form.nationality) return 'Please select your nationality.';
      if (!form.gender) return 'Please select your gender.';
      if (!form.address.trim()) return 'Please enter your residential address.';
    }
    if (targetStep === 2) {
      if (!form.documentType) return 'Please select your identity document.';
      if (!form.documentNumber.trim()) return 'Please enter your document number.';
      if (!files.front) return 'Please upload the front/main page of your identity document.';
      if (documentNeedsBack && !files.back) return 'Please upload the back of your identity document.';
      if (form.documentType === 'Passport' && !form.passportExpiryDate) return 'Please select your passport expiry date.';
    }
    if (targetStep === 3 && (!liveFaceVerified || !files.selfie)) return 'Please complete the live camera face verification.';
    return null;
  };

  const next = () => {
    const error = validateStep(step);
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const back = () => setStep((s) => Math.max(1, s - 1));

  const submit = async () => {
    for (let i = 1; i <= 3; i += 1) {
      const error = validateStep(i);
      if (error) {
        setStep(i);
        showAlert('MySheba', error);
        return;
      }
    }
    if (!authUser?.uid) return;

    setSubmitting(true);
    try {
      const [frontDocumentUrl, backDocumentUrl, selfieUrl] = await Promise.all([
        uploadVerificationDocument(authUser.uid, files.front, mimes.front),
        files.back ? uploadVerificationDocument(authUser.uid, files.back, mimes.back) : Promise.resolve(''),
        uploadVerificationDocument(authUser.uid, files.selfie, mimes.selfie),
      ]);

      await verificationService.submitVerificationRequest(
        authUser.uid,
        { name: form.name.trim(), phone: profile?.phone || profile?.mobileNumber },
        frontDocumentUrl,
        {
          documentType: form.documentType,
          documentNumber: form.documentNumber.trim(),
          nationality: form.nationality,
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          address: form.address.trim(),
          passportExpiryDate: form.documentType === 'Passport' ? form.passportExpiryDate : '',
          frontDocumentUrl,
          backDocumentUrl,
          selfieUrl,
          liveFaceVerified: true,
          liveFaceMethod: 'front_camera_challenge',
        },
      );

      setFiles({ front: null, back: null, selfie: null });
      setMimes({ front: null, back: null, selfie: null });
      setLiveFaceVerified(false);
      setStep(1);
      showAlert('MySheba', 'KYC submitted successfully. Our verification team will review it.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your KYC. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep = () => {
    if (step === 1) {
      return (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Tell us about yourself</Text>
            <Text style={styles.infoText}>Use your legal details exactly as they appear on your identity document.</Text>
          </View>
          <Field label="Full legal name" required styles={styles}>
            <Input value={form.name} onChangeText={(v) => set('name', v)} placeholder="Enter your full legal name" autoCapitalize="words" styles={styles} />
          </Field>
          <Field label="Date of birth" required styles={styles}>
            <DateField placeholder="Select date of birth" value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} maximumDate={new Date()} />
          </Field>
          <Field label="Nationality" required styles={styles}>
            <SearchPicker placeholder="Select nationality" title="Select nationality" value={form.nationality} items={COUNTRY_NAMES} onSelect={(v) => set('nationality', v)} />
          </Field>
          <Field label="Gender" required styles={styles}>
            <SearchPicker placeholder="Select gender" title="Select gender" value={form.gender} items={GENDERS} searchable={false} onSelect={(v) => set('gender', v)} />
          </Field>
          <Field label="Residential address" required styles={styles}>
            <Input value={form.address} onChangeText={(v) => set('address', v)} placeholder="Enter your full residential address" multiline styles={styles} />
          </Field>
        </>
      );
    }

    if (step === 2) {
      return (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Verify your identity document</Text>
            <Text style={styles.infoText}>Choose one valid government-issued document. Photos must be clear, readable and show all corners.</Text>
          </View>
          <Field label="Document type" required styles={styles}>
            <SearchPicker placeholder="Select document type" title="Select document type" value={form.documentType} items={DOCUMENT_TYPES} searchable={false} onSelect={(v) => { set('documentType', v); set('passportExpiryDate', ''); setFiles((p) => ({ ...p, back: null })); }} />
          </Field>
          <Field label="Document number" required styles={styles}>
            <Input value={form.documentNumber} onChangeText={(v) => set('documentNumber', v)} placeholder="Enter document number" autoCapitalize="characters" styles={styles} />
          </Field>
          {form.documentType === 'Passport' && (
            <Field label="Passport expiry date" required styles={styles}>
              <DateField placeholder="Select passport expiry date" value={form.passportExpiryDate} onChange={(v) => set('passportExpiryDate', v)} minimumDate={new Date()} />
            </Field>
          )}
          <UploadCard label={form.documentType === 'Passport' ? 'Passport main page' : 'Identity document front'} required uri={files.front} onPick={() => pickDocument('front')} styles={styles} hint="All four corners visible" />
          {!!documentNeedsBack && <UploadCard label="Identity document back" required uri={files.back} onPick={() => pickDocument('back')} styles={styles} hint="All four corners visible" />}
          <View style={styles.tipCard}><Text style={styles.tipIcon}>✓</Text><Text style={styles.tipText}>Avoid glare, blur, cropped edges and screenshots. The document must be readable by our verification team.</Text></View>
        </>
      );
    }

    if (step === 3) {
      return (
        <>
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>Confirm it’s really you</Text>
            <Text style={styles.infoText}>Complete the live front-camera face check. A gallery photo cannot be used for this step.</Text>
          </View>
          <View style={[styles.faceCard, liveFaceVerified && styles.faceCardSuccess]}>
            <View style={styles.faceIconCircle}><Text style={styles.faceIcon}>{liveFaceVerified ? '✓' : '◉'}</Text></View>
            <Text style={styles.faceTitle}>{liveFaceVerified ? 'Face verification complete' : 'Live face verification required'}</Text>
            <Text style={styles.faceText}>{liveFaceVerified ? 'Your live camera challenge has been completed. You can continue to review.' : 'Follow the camera instructions to complete the liveness check.'}</Text>
            <PrimaryButton label={liveFaceVerified ? 'Redo face verification' : 'Start face verification'} onPress={() => { setLiveFaceVerified(false); setShowLiveFace(true); }} />
          </View>
          <View style={styles.privacyCard}>
            <Text style={styles.privacyTitle}>Privacy & security</Text>
            <Text style={styles.privacyText}>Your face image is submitted only as part of this KYC review. Submission is blocked until the live camera check is completed.</Text>
          </View>
        </>
      );
    }

    return (
      <>
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Review your information</Text>
          <Text style={styles.infoText}>Check everything carefully before sending your KYC application.</Text>
        </View>
        <View style={styles.reviewCard}>
          {reviewItems.map(([label, value]) => (
            <View key={label} style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>{label}</Text>
              <Text style={styles.reviewValue}>{value || '—'}</Text>
            </View>
          ))}
        </View>
        <View style={styles.reviewImages}>
          <Image source={{ uri: files.front }} style={styles.reviewImage} />
          {files.back ? <Image source={{ uri: files.back }} style={styles.reviewImage} /> : null}
          {files.selfie ? <Image source={{ uri: files.selfie }} style={styles.reviewImage} /> : null}
        </View>
        <View style={styles.consentCard}>
          <Text style={styles.consentTitle}>Ready to submit?</Text>
          <Text style={styles.consentText}>By submitting, you confirm that the information and documents are accurate and belong to you.</Text>
        </View>
      </>
    );
  };

  if (request === undefined) {
    return <View style={styles.screen}><View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View></View>;
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>KYC Verification</Text>
      </LinearGradient>

      {!!alreadyVerified && (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.statusCard}><Text style={styles.statusIcon}>{STATUS_COPY.approved.icon}</Text><Text style={styles.statusTitle}>{STATUS_COPY.approved.title}</Text><Text style={styles.statusBody}>{STATUS_COPY.approved.body}</Text><VerifiedBadge verified size="md" /></View>
        </ScrollView>
      )}

      {!alreadyVerified && !canEdit && (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={[styles.statusCard, request?.status === 'rejected' && styles.rejected]}>
            <Text style={styles.statusIcon}>{STATUS_COPY[request?.status]?.icon || '⏳'}</Text>
            <Text style={styles.statusTitle}>{STATUS_COPY[request?.status]?.title || 'KYC Under Review'}</Text>
            <Text style={styles.statusBody}>{STATUS_COPY[request?.status]?.body || 'Your submission is being reviewed.'}</Text>
            {request?.note || request?.rejectionReason ? <Text style={styles.reason}>Reason: {request.note || request.rejectionReason}</Text> : null}
          </View>
        </ScrollView>
      )}

      {!!(!alreadyVerified && canEdit) && (
        <>
          <ProgressHeader step={step} colors={colors} styles={styles} />
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {request?.status === 'rejected' && <View style={[styles.statusCard, styles.rejected]}><Text style={styles.statusTitle}>Update your KYC</Text><Text style={styles.statusBody}>{request.note || request.rejectionReason || 'Please review your details and submit again.'}</Text></View>}
            {renderStep()}
            <View style={styles.actions}>
              {step > 1 && <TouchableOpacity style={styles.secondaryButton} onPress={back} disabled={submitting}><Text style={styles.secondaryButtonText}>Back</Text></TouchableOpacity>}
              <View style={styles.actionGrow}>
                {step < 4 ? (
                  <PrimaryButton label="Next" onPress={next} />
                ) : (
                  <PrimaryButton label={submitting ? 'Submitting…' : (request?.status === 'rejected' ? 'Resubmit KYC' : 'Submit KYC')} onPress={submit} disabled={submitting} />
                )}
              </View>
            </View>
          </ScrollView>
        </>
      )}

      <Modal visible={showLiveFace} animationType="slide" onRequestClose={() => setShowLiveFace(false)}>
        <LiveFaceCapture onCaptured={handleLiveFace} onCancel={() => setShowLiveFace(false)} />
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4, marginRight: 8 },
    backText: { color: '#fff', fontSize: 22 },
    headerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    progressWrap: { backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
    progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    progressCount: { color: colors.primary, fontSize: 12, fontWeight: '800' },
    progressTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
    progressTrack: { height: 5, borderRadius: 5, backgroundColor: colors.border, overflow: 'hidden' },
    progressFill: { height: 5, borderRadius: 5 },
    stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
    stepItem: { alignItems: 'center', flex: 1 },
    stepDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    stepDotText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 11, fontWeight: '800' },
    stepDotTextActive: { color: '#fff' },
    stepLabel: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 10, marginTop: 4 },
    body: { padding: 16, paddingBottom: 60 },
    infoCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    infoTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
    infoText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, lineHeight: 18 },
    field: { marginBottom: 14 },
    label: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 7 },
    required: { color: colors.danger || '#DC2626' },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 14, fontSize: 14 },
    placeholderColor: colors.textSecondary || colors.muted || '#9CA3AF',
    textArea: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
    uploadBox: { height: 170, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    uploadPreview: { width: '100%', height: '100%' },
    uploadIconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    uploadIcon: { color: '#fff', fontSize: 26, fontWeight: '400', lineHeight: 28 },
    uploadText: { color: colors.text, fontSize: 14, fontWeight: '800' },
    uploadHint: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 11, marginTop: 4 },
    tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.primary + '12', borderRadius: 12, padding: 12, marginBottom: 4 },
    tipIcon: { color: colors.primary, fontWeight: '900', fontSize: 16 },
    tipText: { flex: 1, color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 11, lineHeight: 16 },
    faceCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 22, alignItems: 'center', marginBottom: 14 },
    faceCardSuccess: { borderColor: colors.primary },
    faceIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    faceIcon: { color: colors.primary, fontSize: 34, fontWeight: '800' },
    faceTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
    faceText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 7, marginBottom: 16 },
    privacyCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
    privacyTitle: { color: colors.text, fontWeight: '800', fontSize: 13, marginBottom: 5 },
    privacyText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 11, lineHeight: 16 },
    reviewCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14, marginBottom: 14 },
    reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    reviewLabel: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, flex: 0.9 },
    reviewValue: { color: colors.text, fontSize: 12, fontWeight: '700', flex: 1.1, textAlign: 'right' },
    reviewImages: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    reviewImage: { flex: 1, height: 86, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    consentCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
    consentTitle: { color: colors.text, fontWeight: '800', fontSize: 13, marginBottom: 5 },
    consentText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 11, lineHeight: 16 },
    actions: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 18 },
    actionGrow: { flex: 1 },
    secondaryButton: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    secondaryButtonText: { color: colors.text, fontSize: 14, fontWeight: '800' },
    statusCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 20, alignItems: 'center', marginBottom: 16 },
    rejected: { borderColor: colors.danger || '#DC2626' },
    statusIcon: { color: colors.primary, fontSize: 28, fontWeight: '900', marginBottom: 8 },
    statusTitle: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    statusBody: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 6, marginBottom: 12 },
    reason: { color: colors.danger || '#DC2626', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  });
}
