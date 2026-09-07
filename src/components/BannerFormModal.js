import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { BANNER_COLOR_PRESETS, BANNER_LINK_TARGETS, uploadBannerImage } from '../firebase/bannerService';

const EMPTY = { title: '', body: '', icon: '📣', colorStart: BANNER_COLOR_PRESETS[0][0], colorEnd: BANNER_COLOR_PRESETS[0][1], imageUrl: '', linkTo: 'none', photoLinkTo: 'none' };

// Add/Edit form for one home-page banner slide. `banner` is null for "add
// new", or an existing banner doc (with `id`) for "edit".
export default function BannerFormModal({ visible, banner, onSubmit, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [form, setForm] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible) setForm(banner ? { ...EMPTY, ...banner } : EMPTY);
  }, [visible, banner]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const pickImage = async () => {
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [2, 1], // matches the slider's photoSlide box (full width x 150 height)
      quality: 0.7,
    });
    if (result.canceled || !result.assets || !result.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadBannerImage(result.assets[0].uri);
      set('imageUrl', url);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not upload this photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const save = () => {
    if (!form.title.trim()) return;
    if (uploading) {
      showAlert('MySheba', 'Still uploading the banner photo - please wait a moment.');
      return;
    }
    onSubmit(form);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.heading}>{banner ? 'Edit Banner' : 'New Banner'}</Text>

            <Text style={styles.label}>Title</Text>
            <TextInput style={styles.input} placeholder="e.g. 5% Cashback Recharge!" value={form.title} onChangeText={(v) => set('title', v)} maxLength={60} />

            <Text style={styles.label}>Body text</Text>
            <TextInput style={styles.input} placeholder="e.g. All Malaysian & international operators" value={form.body} onChangeText={(v) => set('body', v)} maxLength={100} />

            <Text style={styles.label}>Emoji icon</Text>
            <TextInput style={styles.input} placeholder="📱" value={form.icon} onChangeText={(v) => set('icon', v)} maxLength={4} />

            <Text style={styles.label}>Banner Photo (optional)</Text>
            <Text style={styles.hintText}>For best results use a wide photo, ideally around 1200×700px (16:9). Narrow or tall photos will look cropped in the slider.</Text>
            <TouchableOpacity style={styles.photoBox} onPress={pickImage} disabled={uploading} activeOpacity={0.8}>
              {form.imageUrl ? (
                <Image source={{ uri: form.imageUrl }} style={styles.photoPreview} resizeMode="cover" />
              ) : (
                <>
                  <Text style={styles.uploadIcon}>🖼️</Text>
                  <Text style={styles.uploadText}>Tap to upload a photo background</Text>
                </>
              )}
              {uploading && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator color="white" />
                </View>
              )}
            </TouchableOpacity>
            {!!form.imageUrl && !uploading && (
              <TouchableOpacity onPress={() => set('imageUrl', '')}>
                <Text style={styles.removePhoto}>✕ Remove photo (use color instead)</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.label}>Color{form.imageUrl ? ' (used if photo is removed)' : ''}</Text>
            <View style={styles.swatchRow}>
              {BANNER_COLOR_PRESETS.map(([start, end]) => (
                <TouchableOpacity
                  key={start}
                  style={[styles.swatch, { backgroundColor: start }, form.colorStart === start && styles.swatchActive]}
                  onPress={() => setForm((f) => ({ ...f, colorStart: start, colorEnd: end }))}
                />
              ))}
            </View>

            <Text style={styles.label}>{form.imageUrl ? 'Tapping the text opens' : 'Tapping this banner opens'}</Text>
            <View style={styles.chipRow}>
              {BANNER_LINK_TARGETS.map((t) => (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.chip, form.linkTo === t.key && styles.chipActive]}
                  onPress={() => set('linkTo', t.key)}
                >
                  <Text style={[styles.chipText, form.linkTo === t.key && styles.chipTextActive]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {!!form.imageUrl && (
              <>
                <Text style={styles.label}>Tapping the photo opens</Text>
                <Text style={styles.hintText}>Leave as "No link" to have the photo open the same place as the text above.</Text>
                <View style={styles.chipRow}>
                  {BANNER_LINK_TARGETS.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      style={[styles.chip, form.photoLinkTo === t.key && styles.chipActive]}
                      onPress={() => set('photoLinkTo', t.key)}
                    >
                      <Text style={[styles.chipText, form.photoLinkTo === t.key && styles.chipTextActive]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.okBtn} onPress={save}>
                <Text style={styles.okText}>Save</Text>
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '88%', maxWidth: 380, maxHeight: '85%' },
    heading: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
    photoBox: {
      width: '100%', minHeight: 150, borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed',
      borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4,
      backgroundColor: '#FAFAFA',
    },
    uploadIcon: { fontSize: 24, marginBottom: 4 },
    uploadText: { color: '#999', fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
    photoPreview: { width: '100%', height: 160 },
    hintText: { fontSize: 11, color: '#999', marginBottom: 6, marginTop: -2 },
    uploadOverlay: {
      ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
      alignItems: 'center', justifyContent: 'center',
    },
    removePhoto: { color: colors.danger || '#E53935', fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 4 },
    swatchRow: { flexDirection: 'row', gap: 10 },
    swatch: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 2, borderColor: 'transparent' },
    swatchActive: { borderColor: colors.text },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, color: colors.text },
    chipTextActive: { color: 'white', fontWeight: '600' },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okText: { color: 'white', fontWeight: '600' },
  });
}
