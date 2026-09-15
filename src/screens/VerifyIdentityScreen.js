import React, { useEffect, useState } from 'react';
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
const OCCUPATIONS = ['Employee', 'Self-employed', 'Business Owner', 'Professional', 'Skilled Worker', 'Unskilled Worker', 'Factory / Manufacturing Worker', 'Construction Worker', 'Driver', 'Domestic Worker', 'Student', 'Homemaker', 'Retired', 'Other'];
const SKILLS = ['Skilled Labour', 'Unskilled Labour', 'Technician', 'Electrician', 'Plumber', 'Welder', 'Machine Operator', 'Driver', 'Construction Worker', 'Factory / Manufacturing Worker', 'Domestic Worker', 'Other'];
const FUNDS = ['Salary / Employment Income', 'Business Income', 'Personal Savings', 'Family Support', 'Investment Income', 'Pension', 'Loan', 'Sale of Asset', 'Other'];
const COUNTRY_NAMES = [...new Set(countries.map((c) => c.name).filter(Boolean))].sort();

const STATUS_COPY = {
  pending: { icon: '⏳', title: 'KYC Under Review', body: 'Your KYC submission is with our verification team.' },
  approved: { icon: '✅', title: "You're Verified", body: 'Your approved KYC status is now active.' },
  rejected: { icon: '❌', title: 'KYC Needs Attention', body: 'Correct the information or documents and submit again.' },
};

function Field({ label, children, styles }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>; }
function Input({ value, onChangeText, placeholder, styles, keyboardType, autoCapitalize, multiline }) { return <TextInput value={value || ''} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType} autoCapitalize={autoCapitalize} multiline={multiline} style={[styles.input, multiline && styles.textArea]} />; }
function UploadCard({ label, uri, onPick, styles }) { return <View style={styles.field}><Text style={styles.label}>{label}</Text><TouchableOpacity style={styles.uploadBox} onPress={onPick} activeOpacity={0.85}>{uri ? <Image source={{ uri }} style={styles.uploadPreview} resizeMode="cover" /> : <><Text style={styles.uploadIcon}>📷</Text><Text style={styles.uploadText}>Tap to upload</Text><Text style={styles.uploadHint}>Clear, readable photo</Text></>}</TouchableOpacity></View>; }

export default function VerifyIdentityScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();
  const [request, setRequest] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [showLiveFace, setShowLiveFace] = useState(false);
  const [files, setFiles] = useState({ front: null, back: null, selfie: null });
  const [mimes, setMimes] = useState({ front: null, back: null, selfie: null });
  const [liveFaceVerified, setLiveFaceVerified] = useState(false);
  const [form, setForm] = useState({ documentType: 'Passport', documentNumber: profile?.passportNumber || '', nationality: '', dateOfBirth: '', gender: '', occupation: '', skilledLabour: '', companyName: '', employerName: '', address: '', passportPlaceOfIssue: '', passportIssueDate: '', passportExpiryDate: '', sourceOfFunds: '' });

  useEffect(() => { if (!authUser) return undefined; return verificationService.subscribeMyVerificationRequest(authUser.uid, setRequest, () => setRequest(null)); }, [authUser]);
  useEffect(() => { if (!form.nationality && profile?.country) { const c = countries.find((x) => x.code === profile.country); if (c?.name) setForm((p) => ({ ...p, nationality: c.name })); } }, [profile?.country, form.nationality]);
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const pickDocument = async (kind) => {
    const { requestMediaLibraryPermissionsAsync, launchImageLibraryAsync, MediaTypeOptions } = require('expo-image-picker');
    const perm = await requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showAlert('MySheba', 'Please allow photo library access to upload your identity document.'); return; }
    const result = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFiles((p) => ({ ...p, [kind]: asset.uri }));
    setMimes((p) => ({ ...p, [kind]: asset.mimeType || 'image/jpeg' }));
  };

  const handleLiveFace = async (uri, mime) => {
    setShowLiveFace(false); setFiles((p) => ({ ...p, selfie: uri })); setMimes((p) => ({ ...p, selfie: mime || 'image/jpeg' })); setLiveFaceVerified(true);
    showAlert('MySheba', 'Live camera face check completed. Your KYC can now be submitted.');
  };

  const validate = () => {
    const required = [['documentType', 'Please select your document type.'], ['documentNumber', 'Please enter your document number.'], ['nationality', 'Please select your nationality.'], ['dateOfBirth', 'Please select your date of birth.'], ['gender', 'Please select your gender.'], ['occupation', 'Please select your occupation.'], ['address', 'Please enter your residential address.']];
    for (const [key, message] of required) if (!String(form[key] || '').trim()) return message;
    if (!files.front) return 'Please upload the front/main page of your identity document.';
    if (form.documentType === 'Passport') { if (!form.passportPlaceOfIssue) return 'Please select the passport place of issue.'; if (!form.passportIssueDate) return 'Please select the passport issue date.'; if (!form.passportExpiryDate) return 'Please select the passport expiry date.'; }
    if (!liveFaceVerified || !files.selfie) return 'Live face camera verification is required. Gallery and file uploads are not accepted for the selfie.';
    return null;
  };

  const submit = async () => {
    const error = validate(); if (error) { showAlert('MySheba', error); return; } if (!authUser?.uid) return;
    setSubmitting(true);
    try {
      const [frontDocumentUrl, backDocumentUrl, selfieUrl] = await Promise.all([
        uploadVerificationDocument(authUser.uid, files.front, mimes.front),
        files.back ? uploadVerificationDocument(authUser.uid, files.back, mimes.back) : Promise.resolve(''),
        uploadVerificationDocument(authUser.uid, files.selfie, mimes.selfie),
      ]);
      await verificationService.submitVerificationRequest(authUser.uid, { name: profile?.name, phone: profile?.phone || profile?.mobileNumber }, frontDocumentUrl, { ...form, frontDocumentUrl, backDocumentUrl, selfieUrl, liveFaceVerified: true, liveFaceMethod: 'front_camera_challenge' });
      setFiles({ front: null, back: null, selfie: null }); setLiveFaceVerified(false);
      showAlert('MySheba', 'KYC submitted successfully. Our verification team will review it.');
    } catch (err) { showAlert('MySheba', err.message || 'Could not submit your KYC. Please try again.'); } finally { setSubmitting(false); }
  };

  const alreadyVerified = profile?.verified === true || profile?.verificationStatus === 'approved';
  const canEdit = !alreadyVerified && (!request || request.status === 'rejected');
  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}><HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>KYC Verification</Text></LinearGradient>
    {request === undefined ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View> : <ScrollView contentContainerStyle={styles.body}>
      {alreadyVerified && <View style={styles.statusCard}><Text style={styles.statusIcon}>{STATUS_COPY.approved.icon}</Text><Text style={styles.statusTitle}>{STATUS_COPY.approved.title}</Text><Text style={styles.statusBody}>{STATUS_COPY.approved.body}</Text><VerifiedBadge verified size="md" /></View>}
      {!alreadyVerified && request && <View style={[styles.statusCard, request.status === 'rejected' && styles.rejected]}><Text style={styles.statusIcon}>{STATUS_COPY[request.status]?.icon || 'ℹ️'}</Text><Text style={styles.statusTitle}>{STATUS_COPY[request.status]?.title || request.status}</Text><Text style={styles.statusBody}>{STATUS_COPY[request.status]?.body || ''}</Text>{request.note ? <Text style={styles.reason}>Reason: {request.note}</Text> : null}</View>}
      {canEdit && <>
        <View style={styles.infoCard}><Text style={styles.infoTitle}>Complete your identity verification</Text><Text style={styles.infoText}>Identity documents may be selected from your device. Your selfie is different: it must be captured through the live front camera challenge. No gallery or file-manager selfie is accepted.</Text></View>
        <Field label="Document Type" styles={styles}><SearchPicker placeholder="Select Document Type" title="Select Document Type" value={form.documentType} items={DOCUMENT_TYPES} searchable={false} onSelect={(v) => set('documentType', v)} /></Field>
        <Field label="Document Number" styles={styles}><Input value={form.documentNumber} onChangeText={(v) => set('documentNumber', v)} placeholder="Passport / ID number" autoCapitalize="characters" styles={styles} /></Field>
        <Field label="Nationality" styles={styles}><SearchPicker placeholder="Select Nationality" title="Select Nationality" value={form.nationality} items={COUNTRY_NAMES} onSelect={(v) => set('nationality', v)} /></Field>
        <Field label="Date of Birth" styles={styles}><DateField placeholder="Select Date of Birth" value={form.dateOfBirth} onChange={(v) => set('dateOfBirth', v)} maximumDate={new Date()} /></Field>
        <Field label="Gender" styles={styles}><SearchPicker placeholder="Select Gender" title="Select Gender" value={form.gender} items={GENDERS} searchable={false} onSelect={(v) => set('gender', v)} /></Field>
        <Field label="Occupation" styles={styles}><SearchPicker placeholder="Select Occupation" title="Select Occupation" value={form.occupation} items={OCCUPATIONS} searchable={false} onSelect={(v) => set('occupation', v)} /></Field>
        <Field label="Skilled Labour / Skill" styles={styles}><SearchPicker placeholder="Select Skilled Labour / Skill" title="Select Skilled Labour / Skill" value={form.skilledLabour} items={SKILLS} searchable={false} onSelect={(v) => set('skilledLabour', v)} /></Field>
        <Field label="Company Name" styles={styles}><Input value={form.companyName} onChangeText={(v) => set('companyName', v)} placeholder="Company name" styles={styles} /></Field>
        <Field label="Employer Name" styles={styles}><Input value={form.employerName} onChangeText={(v) => set('employerName', v)} placeholder="Employer name" styles={styles} /></Field>
        <Field label="Residential Address" styles={styles}><Input value={form.address} onChangeText={(v) => set('address', v)} placeholder="Full residential address" multiline styles={styles} /></Field>
        {form.documentType === 'Passport' && <><Field label="Passport Place of Issue" styles={styles}><SearchPicker placeholder="Select Passport Place of Issue" title="Select Passport Place of Issue" value={form.passportPlaceOfIssue} items={COUNTRY_NAMES} onSelect={(v) => set('passportPlaceOfIssue', v)} /></Field><Field label="Passport Issue Date" styles={styles}><DateField placeholder="Select Passport Issue Date" value={form.passportIssueDate} onChange={(v) => set('passportIssueDate', v)} maximumDate={new Date()} /></Field><Field label="Passport Expiry Date" styles={styles}><DateField placeholder="Select Passport Expiry Date" value={form.passportExpiryDate} onChange={(v) => set('passportExpiryDate', v)} minimumDate={new Date()} /></Field></>}
        <Field label="Source of Funds" styles={styles}><SearchPicker placeholder="Select Source of Funds" title="Select Source of Funds" value={form.sourceOfFunds} items={FUNDS} searchable={false} onSelect={(v) => set('sourceOfFunds', v)} /></Field>
        <UploadCard label={form.documentType === 'Passport' ? 'Passport / ID Main Page' : 'Identity Document Front'} uri={files.front} onPick={() => pickDocument('front')} styles={styles} />
        {form.documentType !== 'Passport' && <UploadCard label="Identity Document Back" uri={files.back} onPick={() => pickDocument('back')} styles={styles} />}
        <View style={styles.liveCard}><Text style={styles.liveTitle}>Live Face Verification</Text><Text style={styles.liveText}>{liveFaceVerified ? '✓ Live camera face challenge completed.' : 'Required. The selfie can only be captured from the front camera. Gallery/file-manager selection is blocked.'}</Text><PrimaryButton label={liveFaceVerified ? 'Redo Live Face Check' : 'Start Live Face Check'} onPress={() => { setLiveFaceVerified(false); setShowLiveFace(true); }} /></View>
        <View style={styles.privacy}><Text style={styles.privacyTitle}>🔒 KYC security</Text><Text style={styles.privacyText}>The selfie field is camera-only. KYC submission is blocked until the live camera challenge is completed.</Text></View>
        {submitting ? <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} /> : <PrimaryButton label={request?.status === 'rejected' ? 'Resubmit KYC' : 'Submit KYC for Review'} onPress={submit} style={{ marginTop: 8 }} />}
      </>}
    </ScrollView>}
    <Modal visible={showLiveFace} animationType="slide" onRequestClose={() => setShowLiveFace(false)}><LiveFaceCapture onCaptured={handleLiveFace} onCancel={() => setShowLiveFace(false)} /></Modal>
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg }, header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.primary, overflow: 'hidden' }, backBtn: { padding: 4, marginRight: 8 }, backText: { color: '#fff', fontSize: 22 }, headerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, body: { padding: 16, paddingBottom: 50 },
  infoCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border }, infoTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 }, infoText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, lineHeight: 18 }, field: { marginBottom: 14 }, label: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 7 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 14, fontSize: 14 }, textArea: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  uploadBox: { height: 170, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, uploadPreview: { width: '100%', height: '100%' }, uploadIcon: { fontSize: 30, marginBottom: 6 }, uploadText: { color: colors.text, fontSize: 14, fontWeight: '800' }, uploadHint: { color: colors.textSecondary || '#6B7280', fontSize: 11, marginTop: 4 },
  statusCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 }, rejected: { borderColor: colors.error || '#DC2626' }, statusIcon: { fontSize: 36, marginBottom: 8 }, statusTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 5 }, statusBody: { color: colors.textSecondary || '#6B7280', textAlign: 'center' }, reason: { color: colors.error || '#DC2626', marginTop: 10, textAlign: 'center' }, liveCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.lg, padding: 16, marginBottom: 14 }, liveTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 5 }, liveText: { color: colors.textSecondary || '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 12 }, privacy: { backgroundColor: colors.card, borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 10, borderWidth: 1, borderColor: colors.border }, privacyTitle: { color: colors.text, fontWeight: '800', marginBottom: 4 }, privacyText: { color: colors.textSecondary || '#6B7280', fontSize: 11, lineHeight: 16 },
}); }
