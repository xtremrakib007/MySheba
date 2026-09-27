import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator, Image, Linking } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import CopyButton from '../components/CopyButton';
import VerifiedBadge from '../components/VerifiedBadge';
import CountryModal from '../components/CountryModal';
import { countries } from '../data/countries';
import * as authService from '../firebase/authService';
import { uploadAvatar, uploadPassportCopy } from '../firebase/mediaUpload';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', support: 'Support Agent', finance: 'Finance', admin: 'Admin', superadmin: 'Super Admin' };

// Every editable field below goes straight onto the Firestore profile doc
// under this key via authService.updateUserFields, EXCEPT firstName/lastName
// which also have to recompute the app-wide combined `name` field and sync
// Firebase Auth's displayName - see saveField/authService.updateUserNameParts.
// Email is intentionally not in this list: it's verified via OTP at
// registration (see functions/customerRegistration.js) and shown read-only
// below instead of as an editable field.
const FIELDS = [
  { key: 'firstName', label: 'First Name', placeholder: 'Your first name' },
  { key: 'lastName', label: 'Last Name', placeholder: 'Your last name' },
  { key: 'mobileNumber', label: 'Mobile Number', placeholder: 'e.g. 01712345678', keyboardType: 'phone-pad' },
  { key: 'passportNumber', label: 'Passport Number', placeholder: 'e.g. BN0123456', autoCapitalize: 'characters' },
  { key: 'companyName', label: 'Company Name', placeholder: 'Your company name' },
  { key: 'address', label: 'Address', placeholder: 'Your current address', multiline: true },
];

// profile.name is still the single combined name every other screen reads
// (Sidebar, chat, receipts, ...). If firstName/lastName haven't been saved
// yet on an older account, fall back to splitting the existing full name so
// the two fields start pre-filled instead of blank.
function splitName(profile) {
  if (!profile) return { firstName: '', lastName: '' };
  if (profile.firstName || profile.lastName) {
    return { firstName: profile.firstName || '', lastName: profile.lastName || '' };
  }
  const parts = (profile.name || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export default function ProfileScreen() {
  const {
    colors,
    brandGradient,
    isDark,
    toggleMode
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile } = useApp();
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingPassport, setUploadingPassport] = useState(false);
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [savingCountry, setSavingCountry] = useState(false);

  const { firstName, lastName } = splitName(profile);
  const initial = firstName ? firstName.trim().charAt(0).toUpperCase() : '?';
  const roleLabel = profile ? (ROLE_LABEL[profile.role] || profile.role) : '';

  const startEdit = (key) => {
    if (key === 'firstName') setDraft(firstName);
    else if (key === 'lastName') setDraft(lastName);
    else setDraft(profile ? profile[key] || '' : '');
    setEditingKey(key);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft('');
  };

  const saveField = async (key) => {
    if (!authUser) return;
    if (key === 'firstName' && !draft.trim()) {
      showAlert('MySheba', 'Please enter your first name.');
      return;
    }
    setSaving(true);
    try {
      if (key === 'firstName') {
        await authService.updateUserNameParts(authUser.uid, { firstName: draft, lastName });
      } else if (key === 'lastName') {
        await authService.updateUserNameParts(authUser.uid, { firstName, lastName: draft });
      } else {
        await authService.updateUserFields(authUser.uid, { [key]: draft });
      }
      setEditingKey(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save that. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Next Update PRD §2 - country/region selector. Same simple
  // authService.updateUserFields path every other self-service field on
  // this screen uses (see FIELDS/saveField above) - no dedicated Cloud
  // Function needed since `country` isn't one of the frozen fields
  // firestore.rules protects on users/{uid}.
  //
  // PRD §2 also says this is "subject to any applicable verification/
  // business rules" - reviewed and left unrestricted: nothing elsewhere in
  // the app keys balances, pricing, or eligibility off profile.country in
  // a way a change could exploit (remittance/recharge destinations are
  // chosen per-transaction, not from this field; verified/business-profile
  // status are unrelated flags), so there's no rule to enforce here today.
  // Revisit if a future feature ties a country-scoped balance or business
  // rule to this field.
  const selectCountry = async (code) => {
    if (!authUser || code === profile?.country) return;
    setSavingCountry(true);
    try {
      await authService.updateUserFields(authUser.uid, { country: code });
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save that. Please try again.');
    } finally {
      setSavingCountry(false);
    }
  };

  const changePassportCopy = async () => {
    if (!authUser) return;
    let result;
    try {
      result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
    } catch (err) {
      showAlert('MySheba', 'Could not open the file picker. Please try again.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingPassport(true);
    try {
      const { url, isPdf } = await uploadPassportCopy(authUser.uid, asset.uri, asset.mimeType);
      await authService.updateUserFields(authUser.uid, {
        passportCopyUrl: url,
        passportCopyType: isPdf ? 'pdf' : 'image',
      });
    } catch (err) {
      showAlert('MySheba', 'Could not upload your passport copy. Please try again.');
    } finally {
      setUploadingPassport(false);
    }
  };

  const viewPassportCopy = () => {
    if (!profile?.passportCopyUrl) return;
    Linking.openURL(profile.passportCopyUrl).catch(() => {
      showAlert('MySheba', 'Could not open the file.');
    });
  };

  const changePhoto = async () => {
    if (!authUser) return;
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const url = await uploadAvatar(authUser.uid, asset.uri, asset.mimeType);
      await authService.updateUserAvatar(authUser.uid, url);
    } catch (err) {
      showAlert('MySheba', 'Could not upload your photo. Please try again.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const renderField = ({ key, label, placeholder, keyboardType, autoCapitalize, multiline }, isLast) => {
    const editing = editingKey === key;
    const value = key === 'firstName' ? firstName : key === 'lastName' ? lastName : profile ? profile[key] : '';
    return (
      <React.Fragment key={key}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {editing ? (
          <>
            <TextInput
              style={[styles.input, multiline && styles.inputMultiline]}
              value={draft}
              onChangeText={setDraft}
              placeholder={placeholder}
              placeholderTextColor="#999"
              keyboardType={keyboardType}
              autoCapitalize={autoCapitalize}
              multiline={multiline}
              autoFocus
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={() => saveField(key)} disabled={saving}>
                {saving ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.valueRow}>
            <Text style={[styles.fieldValue, !value && styles.fieldValueEmpty]} numberOfLines={multiline ? 4 : 1}>
              {value || `Not set`}
            </Text>
            <TouchableOpacity onPress={() => startEdit(key)}>
              <Text style={styles.editLink}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isLast && <View style={styles.divider} />}
      </React.Fragment>
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.themeBtn} onPress={toggleMode}>
          <Text style={styles.themeBtnText}>{isDark ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrap} onPress={changePhoto} disabled={uploadingPhoto}>
            {profile && profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
            )}
            <View style={styles.cameraBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.cameraBadgeText}>📷</Text>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhotoText}>Tap to change photo</Text>
          <View style={styles.pillRow}>
            {!!roleLabel && <View style={styles.rolePill}><Text style={styles.rolePillText}>{roleLabel}</Text></View>}
            {!!(profile && profile.userId) && (
              <View style={styles.idPill}><Text style={styles.idPillText}>ID {profile.userId}</Text></View>
            )}
            <VerifiedBadge verified={profile?.verified} size="sm" />
            {/* Tier/Level - server-computed only (see functions/
                progressionService.js), display here is read-only. tierLabel
                is written the moment tierPoints first crosses a threshold,
                so a brand-new account (tierPoints 0) has no tierLabel yet
                and shows nothing rather than a misleading "Bronze" before
                the first qualifying order ever completes. */}
            {!!(profile && profile.tierLabel) && (
              <View style={styles.tierPill}><Text style={styles.tierPillText}>🏆 {profile.tierLabel}</Text></View>
            )}
            {!!(profile && profile.level > 0) && (
              <View style={styles.levelPill}><Text style={styles.levelPillText}>⭐ Lv {profile.level}</Text></View>
            )}
          </View>
        </View>

        <View style={styles.card}>
          {renderField(FIELDS[0], false)}
          {renderField(FIELDS[1], false)}
          {renderField(FIELDS[2], false)}

          <Text style={styles.fieldLabel}>Email</Text>
          <View style={styles.valueRow}>
            <Text style={[styles.fieldValue, !profile?.email && styles.fieldValueEmpty]} numberOfLines={1}>
              {profile?.email || 'Not set'}
            </Text>
            {!!profile?.email && (
              <View style={styles.verifiedPill}><Text style={styles.verifiedPillText}>✓ Verified</Text></View>
            )}
          </View>
          <Text style={styles.fieldNote}>Verified during registration - contact support to change this.</Text>
          <View style={styles.divider} />

          {FIELDS.slice(3).map((f, i) => renderField(f, i === FIELDS.length - 4))}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Passport Copy</Text>
          {profile && profile.passportCopyUrl ? (
            <View style={styles.passportRow}>
              {profile.passportCopyType === 'pdf' ? (
                <TouchableOpacity style={styles.passportPdfBox} onPress={viewPassportCopy}>
                  <Text style={styles.passportPdfText}>📄 PDF</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={viewPassportCopy}>
                  <Image source={{ uri: profile.passportCopyUrl }} style={styles.passportThumb} />
                </TouchableOpacity>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldValue}>Uploaded</Text>
                <TouchableOpacity onPress={changePassportCopy} disabled={uploadingPassport}>
                  {uploadingPassport ? (
                    <ActivityIndicator size="small" color={colors.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  ) : (
                    <Text style={styles.editLink}>Replace</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.uploadBtn} onPress={changePassportCopy} disabled={uploadingPassport}>
              {uploadingPassport ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Text style={styles.uploadBtnText}>+ Upload passport copy</Text>
              )}
            </TouchableOpacity>
          )}
          <Text style={styles.fieldNote}>Only visible to you and Super Admin.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Country / Region</Text>
          <View style={styles.valueRow}>
            <Text style={styles.fieldValue} numberOfLines={1}>
              {(() => {
                const c = countries.find((x) => x.code === (profile?.country || 'MY'));
                return c ? `${c.flag} ${c.name}` : (profile?.country || 'Malaysia');
              })()}
            </Text>
            {savingCountry ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <TouchableOpacity onPress={() => setCountryModalVisible(true)}>
                <Text style={styles.editLink}>Change</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>User ID</Text>
          <View style={styles.valueRow}>
            <Text style={styles.fieldValue}>{profile ? profile.userId : ''}</Text>
            {!!(profile && profile.userId) && <CopyButton value={profile.userId} label="Copy ID" />}
          </View>
          <Text style={styles.fieldNote}>Give this ID to support or a dealer to be looked up quickly.</Text>

          <View style={styles.divider} />

          <Text style={styles.fieldLabel}>Login Phone Number</Text>
          <Text style={styles.fieldValue}>{profile ? (profile.phone || 'Not set (signed in with Google)') : ''}</Text>
          <Text style={styles.fieldNote}>Used to sign in - contact support to change this.</Text>
        </View>
      </ScrollView>
      <CountryModal
        visible={countryModalVisible}
        onClose={() => setCountryModalVisible(false)}
        value={profile?.country || 'MY'}
        onSelect={selectCountry}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    themeBtn: { padding: 4 },
    themeBtnText: { fontSize: 18 },
    avatarSection: { alignItems: 'center', paddingVertical: 26 },
    avatarWrap: { width: 80, height: 80, marginBottom: 6 },
    avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    avatarImage: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EEE' },
    avatarText: { color: 'white', fontSize: 30, fontWeight: '700' },
    cameraBadge: {
      position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 13,
      backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: colors.bg,
    },
    cameraBadgeText: { fontSize: 12 },
    changePhotoText: { fontSize: 11, color: '#999', marginBottom: 10 },
    rolePill: { backgroundColor: '#E8F0FE', paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill },
    rolePillText: { color: colors.primary, fontSize: 11, fontWeight: '700' },
    pillRow: { flexDirection: 'row', gap: 8 },
    idPill: { backgroundColor: '#E8F5E9', paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill },
    idPillText: { color: colors.success, fontSize: 11, fontWeight: '700' },
    tierPill: { backgroundColor: '#FFF8E1', paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill },
    tierPillText: { color: '#B8860B', fontSize: 11, fontWeight: '700' },
    levelPill: { backgroundColor: '#EDE7F6', paddingVertical: 4, paddingHorizontal: 12, borderRadius: radius.pill },
    levelPillText: { color: '#5E35B1', fontSize: 11, fontWeight: '700' },
    card: { backgroundColor: colors.card, marginHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 16 },
    fieldLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', fontWeight: '700', marginBottom: 6 },
    fieldValue: { fontSize: 16, color: colors.text, fontWeight: '600', flexShrink: 1, marginRight: 10 },
    fieldValueEmpty: { color: '#BBB', fontWeight: '400' },
    fieldNote: { fontSize: 11, color: '#999', marginTop: 4 },
    valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLink: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, marginBottom: 10 },
    inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancelBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.sm },
    cancelBtnText: { color: '#999', fontWeight: '600', fontSize: 13 },
    saveBtn: { backgroundColor: colors.primary, paddingVertical: 9, paddingHorizontal: 18, borderRadius: radius.sm, minWidth: 64, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 16 },
    verifiedPill: { backgroundColor: '#E8F5E9', paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill },
    verifiedPillText: { color: colors.success, fontSize: 11, fontWeight: '700' },
    passportRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
    passportThumb: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: '#EEE' },
    passportPdfBox: { width: 60, height: 60, borderRadius: radius.sm, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
    passportPdfText: { fontSize: 11, fontWeight: '700', color: colors.primary },
    uploadBtn: { borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: radius.sm, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
    uploadBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  });
}
