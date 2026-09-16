// Business Profile - admin-granted business identity page.
// The profile contains business name, logo, description, category, and
// location. Marketplace/property/service-provider listings are retired and
// are intentionally not rendered here.
//
// Business Profile status is admin-granted only (Admin Panel > Business
// Profiles). Once granted, the owner can edit their own business details;
// everyone else sees a read-only page.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import BusinessBadge from '../components/BusinessBadge';
import VerifiedBadge from '../components/VerifiedBadge';
import * as authService from '../firebase/authService';
import * as businessProfileService from '../firebase/businessProfileService';
import { uploadBusinessLogo } from '../firebase/mediaUpload';
import { computeGeohash } from '../utils/geo';
import LocationPickerModal from '../components/LocationPickerModal';
import MapPreview from '../components/MapPreview';

export default function BusinessProfileScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile, activeBusinessProfileUid } = useApp();

  const targetUid = activeBusinessProfileUid;
  const isOwner = !!authUser && authUser.uid === targetUid;

  const [biz, setBiz] = useState(undefined); // undefined = loading, null = no doc
  const [targetVerified, setTargetVerified] = useState(false);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (!targetUid) return undefined;
    return businessProfileService.subscribeBusinessProfile(targetUid, setBiz, () => setBiz(null));
  }, [targetUid]);

  useEffect(() => {
    if (!targetUid) return undefined;
    if (isOwner) {
      setTargetVerified(!!profile?.verified);
      return undefined;
    }
    let cancelled = false;
    authService.fetchProfile(targetUid)
      .then((p) => { if (!cancelled) setTargetVerified(!!p?.verified); })
      .catch(() => { if (!cancelled) setTargetVerified(false); });
    return () => { cancelled = true; };
  }, [targetUid, isOwner, profile?.verified]);

  const startEdit = (key) => {
    setDraft(biz ? biz[key] || '' : '');
    setEditingKey(key);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft('');
  };

  const saveField = async (key) => {
    setSaving(true);
    try {
      await businessProfileService.updateBusinessDetails(targetUid, { [key]: draft });
      setEditingKey(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save that. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploadingLogo(true);
    try {
      const url = await uploadBusinessLogo(targetUid, result.assets[0].uri, result.assets[0].mimeType);
      await businessProfileService.updateBusinessDetails(targetUid, { businessLogoUrl: url });
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const saveLocation = async ({ address, latitude, longitude }) => {
    setShowLocationPicker(false);
    setSavingLocation(true);
    try {
      await businessProfileService.updateBusinessDetails(targetUid, {
        businessAddress: address,
        latitude,
        longitude,
        geohash: computeGeohash(latitude, longitude),
      });
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not save that location. Please try again.');
    } finally {
      setSavingLocation(false);
    }
  };

  const displayName = (biz && biz.businessName) || (isOwner ? profile?.name : '') || 'Business';
  const initial = displayName.trim().charAt(0).toUpperCase() || '🏢';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Business Profile</Text>
      </LinearGradient>

      {biz === undefined ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : biz === null || !biz.isBusinessProfile ? (
        <View style={styles.center}>
          <Text style={{ fontSize: 36, marginBottom: 8 }}>🏢</Text>
          <Text style={styles.emptyText}>
            {isOwner
              ? "You don't have a Business Profile yet. This upgraded business profile is granted by MySheba admin - contact Support to apply."
              : "This user doesn't have a Business Profile."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.profileCard}>
            <TouchableOpacity onPress={isOwner ? changeLogo : undefined} disabled={!isOwner || uploadingLogo} style={styles.logoWrap}>
              {biz.businessLogoUrl ? (
                <Image source={{ uri: biz.businessLogoUrl }} style={styles.logo} />
              ) : (
                <View style={[styles.logo, styles.logoPlaceholder]}>
                  {uploadingLogo ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.logoInitial}>{initial}</Text>}
                </View>
              )}
              {isOwner && <View style={styles.logoEditBadge}><Text style={styles.logoEditBadgeText}>✎</Text></View>}
            </TouchableOpacity>

            {editingKey === 'businessName' ? (
              <View style={styles.editRow}>
                <TextInput style={styles.editInput} value={draft} onChangeText={setDraft} placeholder="Business name" autoFocus />
                <TouchableOpacity onPress={() => saveField('businessName')} disabled={saving}><Text style={styles.saveLink}>{saving ? '...' : 'Save'}</Text></TouchableOpacity>
                <TouchableOpacity onPress={cancelEdit}><Text style={styles.cancelLink}>Cancel</Text></TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={isOwner ? () => startEdit('businessName') : undefined}>
                <Text style={styles.businessName}>{displayName}{isOwner ? '  ✎' : ''}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.badgeRow}>
              <BusinessBadge isBusiness size="md" />
              <VerifiedBadge verified={targetVerified} size="md" />
            </View>

            {editingKey === 'businessCategory' ? (
              <View style={styles.editRow}>
                <TextInput style={styles.editInput} value={draft} onChangeText={setDraft} placeholder="Category" autoFocus />
                <TouchableOpacity onPress={() => saveField('businessCategory')} disabled={saving}><Text style={styles.saveLink}>{saving ? '...' : 'Save'}</Text></TouchableOpacity>
                <TouchableOpacity onPress={cancelEdit}><Text style={styles.cancelLink}>Cancel</Text></TouchableOpacity>
              </View>
            ) : (
              (!!biz.businessCategory || isOwner) && (
                <TouchableOpacity onPress={isOwner ? () => startEdit('businessCategory') : undefined}>
                  <Text style={styles.category}>{biz.businessCategory || (isOwner ? 'Add a category ✎' : '')}</Text>
                </TouchableOpacity>
              )
            )}

            {editingKey === 'businessDescription' ? (
              <View style={styles.editRow}>
                <TextInput style={[styles.editInput, styles.editInputMultiline]} value={draft} onChangeText={setDraft} placeholder="Description" multiline autoFocus />
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                  <TouchableOpacity onPress={() => saveField('businessDescription')} disabled={saving}><Text style={styles.saveLink}>{saving ? '...' : 'Save'}</Text></TouchableOpacity>
                  <TouchableOpacity onPress={cancelEdit}><Text style={styles.cancelLink}>Cancel</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
              (!!biz.businessDescription || isOwner) && (
                <TouchableOpacity onPress={isOwner ? () => startEdit('businessDescription') : undefined}>
                  <Text style={styles.description}>{biz.businessDescription || (isOwner ? 'Add a description ✎' : '')}</Text>
                </TouchableOpacity>
              )
            )}

            {(!!biz.businessAddress || isOwner) && (
              <TouchableOpacity
                style={styles.locationRow}
                onPress={isOwner ? () => setShowLocationPicker(true) : undefined}
                disabled={!isOwner || savingLocation}
              >
                <Text style={styles.locationText}>
                  📍 {biz.businessAddress || (isOwner ? 'Add a business location ✎' : '')}
                </Text>
                {isOwner && <Text style={styles.saveLink}>{savingLocation ? '...' : '✎'}</Text>}
              </TouchableOpacity>
            )}
            {biz.latitude != null && biz.longitude != null && (
              <MapPreview latitude={biz.latitude} longitude={biz.longitude} address={biz.businessAddress} />
            )}
          </View>
        </ScrollView>
      )}

      <LocationPickerModal
        visible={showLocationPicker}
        initial={biz ? { address: biz.businessAddress, latitude: biz.latitude, longitude: biz.longitude } : null}
        onConfirm={saveLocation}
        onCancel={() => setShowLocationPicker(false)}
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
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center', lineHeight: 19 },
    body: { padding: 16, paddingBottom: 40 },
    profileCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', marginBottom: 20 },
    logoWrap: { marginBottom: 10 },
    logo: { width: 84, height: 84, borderRadius: radius.lg },
    logoPlaceholder: { backgroundColor: '#EDE7F6', alignItems: 'center', justifyContent: 'center' },
    logoInitial: { fontSize: 30, fontWeight: '700', color: '#5E35B1' },
    logoEditBadge: { position: 'absolute', bottom: -2, right: -2, backgroundColor: colors.primary, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
    logoEditBadgeText: { color: 'white', fontSize: 11 },
    businessName: { fontSize: 19, fontWeight: '700', color: colors.text, textAlign: 'center' },
    badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    category: { fontSize: 12, fontWeight: '600', color: colors.primaryDark, marginTop: 6 },
    description: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 10, lineHeight: 19 },
    editRow: { width: '100%', marginTop: 8, alignItems: 'center' },
    editInput: { width: '100%', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: colors.text, backgroundColor: colors.bg },
    editInputMultiline: { minHeight: 70, textAlignVertical: 'top' },
    saveLink: { color: colors.primary, fontWeight: '700', fontSize: 13, marginTop: 6, marginRight: 12 },
    locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    locationText: { fontSize: 13, color: colors.textSecondary, flex: 1, marginRight: 8 },
    cancelLink: { color: '#999', fontWeight: '600', fontSize: 13, marginTop: 6 },
  });
}