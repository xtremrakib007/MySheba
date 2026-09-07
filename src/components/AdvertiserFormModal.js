import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { uploadAdvertiserLogo, deleteAdvertiserLogo } from '../firebase/adService';

// PHASE 9 - MY SHEBA ADVERTISER AND CAMPAIGN MANAGEMENT - ADVERTISER form.
//
// Create/Edit form for one ad_advertisers doc, same add/edit-in-one-modal
// shape as BannerAdFormModal.js. Every field from the brief's ADVERTISER
// "Fields" list lives here: Business Name, Contact Name, Phone, Email,
// WhatsApp, Address, Country, Logo, Status. `advertiser` is null for
// "add new", or an existing ad_advertisers doc (with `id`) for "edit".
//
// Activate/Deactivate are NOT on this form - those are one-tap actions on
// AdvertiserManagementScreen's list row (mirrors BannerManagementScreen's
// own Activate/Deactivate buttons living outside the create/edit form),
// so Status here only ever matters for a brand-new advertiser (defaults
// to Active) - editing an existing one never changes status through this
// modal.

const EMPTY_FORM = {
  companyName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  whatsapp: '',
  address: '',
  country: '',
  logoUrl: '',
  logoStoragePath: '',
};

function toFormState(advertiser) {
  if (!advertiser) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    companyName: advertiser.companyName || '',
    contactName: advertiser.contactName || '',
    contactPhone: advertiser.contactPhone || '',
    contactEmail: advertiser.contactEmail || '',
    whatsapp: advertiser.whatsapp || '',
    address: advertiser.address || '',
    country: advertiser.country || '',
    logoUrl: advertiser.logoUrl || '',
    logoStoragePath: advertiser.logoStoragePath || '',
  };
}

export function buildAdvertiserPayload(form) {
  return {
    companyName: form.companyName.trim(),
    contactName: form.contactName.trim(),
    contactPhone: form.contactPhone.trim(),
    contactEmail: form.contactEmail.trim(),
    whatsapp: form.whatsapp.trim(),
    address: form.address.trim(),
    country: form.country.trim(),
    logoUrl: form.logoUrl,
    logoStoragePath: form.logoStoragePath,
  };
}

export default function AdvertiserFormModal({ visible, advertiser, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Same orphan-cleanup shape as BannerAdFormModal.js's
  // openStoragePathRef - the logo path that was already live when this
  // modal opened, so a replaced-then-discarded upload gets cleaned up.
  const openStoragePathRef = useRef('');

  useEffect(() => {
    if (!visible) return;
    const next = toFormState(advertiser);
    setForm(next);
    openStoragePathRef.current = next.logoStoragePath;
  }, [visible, advertiser]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const pickLogo = async () => {
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uploaded = await uploadAdvertiserLogo(asset.uri, asset.mimeType);
      const staleStorage = form.logoStoragePath && form.logoStoragePath !== openStoragePathRef.current
        ? form.logoStoragePath
        : null;
      setForm((f) => ({ ...f, logoUrl: uploaded.logoUrl, logoStoragePath: uploaded.logoStoragePath }));
      if (staleStorage) deleteAdvertiserLogo(staleStorage).catch(() => {});
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not upload this logo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const cancel = () => {
    if (form.logoStoragePath && form.logoStoragePath !== openStoragePathRef.current) {
      deleteAdvertiserLogo(form.logoStoragePath).catch(() => {});
    }
    onCancel();
  };

  const validate = () => {
    if (!form.companyName.trim()) return 'Enter a Business Name.';
    if (!form.contactName.trim()) return 'Enter a Contact Name.';
    if (!form.contactPhone.trim()) return 'Enter a Phone number.';
    if (!form.contactEmail.trim()) return 'Enter an Email address.';
    return null;
  };

  const save = async () => {
    if (uploading) {
      showAlert('MySheba', 'Still uploading the logo - please wait a moment.');
      return;
    }
    const error = validate();
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    setSaving(true);
    try {
      const payload = buildAdvertiserPayload(form);
      const priorStoragePath = openStoragePathRef.current;
      await onSubmit(payload);
      if (priorStoragePath && priorStoragePath !== form.logoStoragePath) {
        deleteAdvertiserLogo(priorStoragePath).catch(() => {});
      }
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this advertiser. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{advertiser ? 'Edit Advertiser' : 'New Advertiser'}</Text>

            <Text style={styles.label}>Business Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Acme Sdn Bhd"
              placeholderTextColor="#999"
              value={form.companyName}
              onChangeText={(v) => set('companyName', v)}
              maxLength={80}
            />

            <Text style={styles.label}>Contact Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Jane Tan"
              placeholderTextColor="#999"
              value={form.contactName}
              onChangeText={(v) => set('contactName', v)}
              maxLength={80}
            />

            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +60123456789"
              placeholderTextColor="#999"
              value={form.contactPhone}
              onChangeText={(v) => set('contactPhone', v)}
              keyboardType="phone-pad"
              maxLength={20}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. jane@acme.com"
              placeholderTextColor="#999"
              value={form.contactEmail}
              onChangeText={(v) => set('contactEmail', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              maxLength={120}
            />

            <Text style={styles.label}>WhatsApp</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. +60123456789"
              placeholderTextColor="#999"
              value={form.whatsapp}
              onChangeText={(v) => set('whatsapp', v)}
              keyboardType="phone-pad"
              maxLength={20}
            />

            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Business address"
              placeholderTextColor="#999"
              value={form.address}
              onChangeText={(v) => set('address', v)}
              multiline
              numberOfLines={3}
              maxLength={240}
            />

            <Text style={styles.label}>Country</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Malaysia"
              placeholderTextColor="#999"
              value={form.country}
              onChangeText={(v) => set('country', v)}
              maxLength={60}
            />

            <Text style={styles.label}>Logo</Text>
            <TouchableOpacity style={styles.logoBox} onPress={pickLogo} disabled={uploading} activeOpacity={0.8}>
              {form.logoUrl ? (
                <Image source={{ uri: form.logoUrl }} style={styles.logoImage} resizeMode="cover" />
              ) : (
                <>
                  <Text style={styles.uploadIcon}>🏢</Text>
                  <Text style={styles.uploadText}>Tap to upload a logo</Text>
                </>
              )}
              {uploading && (
                <View style={styles.uploadOverlay}><ActivityIndicator color="white" /></View>
              )}
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancel} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
                {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
    box: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, maxHeight: '88%' },
    heading: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 14 },
    label: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: 9, paddingHorizontal: 12, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg,
    },
    textArea: { minHeight: 70, textAlignVertical: 'top' },
    logoBox: {
      height: 110, width: 110, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    logoImage: { width: '100%', height: '100%' },
    uploadIcon: { fontSize: 26, marginBottom: 4 },
    uploadText: { fontSize: 10.5, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: 8 },
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
    },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: {
      flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    cancelBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  });
}
