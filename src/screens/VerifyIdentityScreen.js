import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { PrimaryButton, SearchPicker, DateField } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import VerifiedBadge from '../components/VerifiedBadge';
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
  pending: { icon: '⏳', title: 'KYC Under Review', body: 'Your KYC submission is with our verification team. You can return here to see the status.' },
  approved: { icon: '✅', title: "You're Verified", body: 'Your identity has been verified. Your approved KYC status is now active.' },
  rejected: { icon: '❌', title: 'KYC Needs Attention', body: 'Your KYC submission was not approved. Correct the information or documents and submit again.' },
};

function Field({ label, children, styles }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text>{children}</View>;
}

function Input({ value, onChangeText, placeholder, styles, keyboardType, autoCapitalize, multiline }) {
  return <TextInput value={value || ''} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#9CA3AF" keyboardType={keyboardType} autoCapitalize={autoCapitalize} multiline={multiline} style={[styles.input, multiline && styles.textArea]} />;
}

function UploadCard({ label, uri, onPick, styles }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity style={styles.uploadBox} onPress={onPick} activeOpacity={0.85}>
      {uri ? <Image source={{ uri }} style={styles.uploadPreview} resizeMode="cover" /> : <><Text style={styles.uploadIcon}>📷</Text><Text style={styles.uploadText}>Tap to upload</Text><Text style={styles.uploadHint}>Clear, readable photo</Text></>}
    </TouchableOpacity>
  </View>;
}

export default function VerifyIdentityScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();
  const [request, setRequest] = useState(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState({ front: null, back: null, selfie: null });
  const [mimes, setMimes] = useState({ front: null, back: null, selfie: null });
  const [form, setForm] = useState({
    documentType: 'Passport', documentNumber: profile?.passportNumber || '', nationality: '', dateOfBirth: '', gender: '', occupation: '', skilledLabour: '', companyName: '', employerName: '', address: '', passportPlaceOfIssue: '', passportIssueDate: '', passportExpiryDate: '', sourceOfFunds: '',
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

  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const pick = async (kind) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { showAlert('MySheba', 'Please allow photo library access to upload your KYC document.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setFiles((p) => ({ ...p, [kind]: asset.uri }));
    setMimes((p) => ({ ...p, [kind]: asset.mimeType }));
  };

  const validate = () => {
    const required = [['documentType', 'Please select your document type.'], ['documentNumber', 'Please enter your document number.'], ['nationality', 'Please select your nationality.'], ['dateOfBirth', 'Please select your date of birth.'], ['gender', 'Please select your gender.'], ['occupation', 'Please select your occupation.'], ['address', 'Please enter your residential address.']];
    for (const [key, message] of required) if (!String(form[key] || '').trim()) return message;
    if (!files.front) return 'Please upload the front/main page of your identity document.';
    if (form.documentType === 'Passport') {
      if (!form.passportPlaceOfIssue) return 'Please select the passport place of issue.';
      if (!form.passportIssueDate) return 'Please select the passport issue date.';
      if (!form.passportExpiryDate) return 'Please select the passport expiry date.';
    }
    if (!files.selfie) return 'Please upload a clear selfie for identity matching.';
    return null;
  };

  const submit = async () => {
    const error = validate();
    if (error) { showAlert('MySheba', error); return; }
    if (!authUser?.uid) return;
    setSubmitting(true);
    try {
      const [frontDocumentUrl, backDocumentUrl, selfieUrl] = await Promise.all([
        uploadVerificationDocument(authUser.uid, files.front, mimes.front),
        files.back ? uploadVerificationDocument(authUser.uid, files.back, mimes.back) : Promise.resolve(''),
        uploadVerificationDocument(authUser.uid, files.selfie, mimes.selfie),
      ]);
      await verificationService.submitVerificationRequest(authUser.uid, { name: profile?.name, phone: profile?.phone || profile?.mobileNumber }, frontDocumentUrl, { ...form, frontDocumentUrl, backDocumentUrl, selfieUrl });
      setFiles({ front: null, back: null, selfie: null });
      showAlert('MySheba', 'KYC submitted successfully. Our verification team will review it.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your KYC. Please try again.');
    } finally { setSubmitting(false); }
  };

  const alreadyVerified = profile?.verified === true || profile?.verificationStatus === 'approved';
  const canEdit = !alreadyVerified && (!request || request.status === 'rejected');

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
      <HeaderDecor /><TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>KYC Verification</Text>
    </LinearGradient>
    {request === undefined ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View> : <ScrollView contentContainerStyle={styles.body}>
      {alreadyVerified && <View style={styles.statusCard}><Text style={styles.statusIcon}>{STATUS_COPY.approved.icon}</Text><Text style={styles.statusTitle}>{STATUS_COPY.approved.title}</Text><Text style={styles.statusBody}>{STATUS_COPY.approved.body}</Text><VerifiedBadge verified size="md" /></View>}
      {!alreadyVerified && request && <View style={[styles.statusCard, request.status === 'rejected' && styles.rejected]}><Text style={styles.statusIcon}>{STATUS_COPY[request.status]?.icon || 'ℹ️'}</Text><Text style={styles.statusTitle}>{STATUS_COPY[request.status]?.title || request.status}</Text><Text style={styles.statusBody}>{STATUS_COPY[request.status]?.body || ''}</Text>{request.note ? <Text style={styles.reason}>Reason: {request.note}</Text> : null}</View>}
      {canEdit && <>
        <View style={styles.infoCard}><Text style={styles.infoTitle}>Complete your identity verification</Text><Text style={styles.infoText}>Enter your legal details exactly as shown on your identity document. Upload clear documents and a selfie. Your submission will be reviewed by the MySheba verification team.</Text></View>
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
        {form.documentType === 'Passport' && <>
          <Field label="Passport Place of Issue" styles={styles}><SearchPicker placeholder="Select Passport Place of Issue" title="Select Passport Place of Issue" value={form.passportPlaceOfIssue} items={COUNTRY_NAMES} onSelect={(v) => set('passportPlaceOfIssue', v)} /></Field>
          <Field label="Passport Issue Date" styles={styles}><DateField placeholder="Select Passport Issue Date" value={form.passportIssueDate} onChange={(v) => set('passportIssueDate', v)} maximumDate={new Date()} /></Field>
          <Field label="Passport Expiry Date" styles={styles}><DateField placeholder="Select Passport Expiry Date" value={form.passportExpiryDate} onChange={(v) => set('passportExpiryDate', v)} minimumDate={new Date()} /></Field>
        </>}
        <Field label="Source of Funds" styles={styles}><SearchPicker placeholder="Select Source of Funds" title="Select Source of Funds" value={form.sourceOfFunds} items={FUNDS} searchable={false} onSelect={(v) => set('sourceOfFunds', v)} /></Field>
        <UploadCard label={form.documentType === 'Passport' ? 'Passport / ID Main Page' : 'Identity Document Front'} uri={files.front} onPick={() => pick('front')} styles={styles} />
        {form.documentType !== 'Passport' && <UploadCard label="Identity Document Back" uri={files.back} onPick={() => pick('back')} styles={styles} />}
        <UploadCard label="Selfie / Face Photo" uri={files.selfie} onPick={() => pick('selfie')} styles={styles} />
        <View style={styles.privacy}><Text style={styles.privacyTitle}>🔒 Your documents are protected</Text><Text style={styles.privacyText}>KYC documents are stored in the verification area and reviewed only through the verification workflow.</Text></View>
        {submitting ? <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} /> : <PrimaryButton label={request?.status === 'rejected' ? 'Resubmit KYC' : 'Submit KYC for Review'} onPress={submit} style={{ marginTop: 8 }} />}
      </>}
    </ScrollView>}
  </View>;
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4, marginRight: 8 }, backText: { color: '#fff', fontSize: 22 }, headerTitle: { color: '#fff', fontWeight: '800', fontSize: 17 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, body: { padding: 16, paddingBottom: 50 },
    infoCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    infoTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 }, infoText: { color: colors.textSecondary || colors.muted || '#6B7280', fontSize: 12, lineHeight: 18 },
    field: { marginBottom: 14 }, label: { color: colors.text, fontSize: 13, fontWeight: '800', marginBottom: 7 },
    input: { minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card, color: colors.text, paddingHorizontal: 14, fontSize: 14 },
    textArea: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
    uploadBox: { height: 170, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    uploadPreview: { width: '100%', height: '100%' }, uploadIcon: { fontSize: 30, marginBottom: 6 }, uploadText: { color: colors.text, fontSize: 14, fontWeight: '800' }, uploadHint: { color: colors.textSecondary || '#6B7280', fontSize: 11, marginTop: 4 },
    statusCard: { alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, marginBottom: 16 },
    rejected: { borderColor: colors.error || '#DC2626' }, statusIcon: { fontSize: 36, marginBottom: 8 }, statusTitle: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 5 }, statusBody: { color: colors.textSecondary || '#6B7280', textAlign: 'center', fontSize: 12, lineHeight: 18 }, reason: { color: colors.error || '#DC2626', fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
    privacy: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginVertical: 12 }, privacyTitle: { color: '#166534', fontWeight: '800', fontSize: 12 }, privacyText: { color: '#166534', fontSize: 11, lineHeight: 16, marginTop: 4 },
  });
}
