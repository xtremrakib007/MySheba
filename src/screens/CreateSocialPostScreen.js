import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as socialFeedService from '../firebase/socialFeedService';
import { uploadSocialPostImage } from '../firebase/mediaUpload';

const MAX_PHOTOS = 4;

// Next Update PRD §3 - "Users can create text posts and, where supported
// by the current platform, media posts." Same two-step create-then-attach-
// images flow as CreateCommunityPostScreen.js, simplified: no post-type
// chips (one general feed, not five typed categories) and no location
// field (a general FB-style post isn't inherently location-tied the way
// a Lost & Found or Event post is).
export default function CreateSocialPostScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, openSocialPostDetail, authUser, profile } = useApp();

  const [text, setText] = useState('');
  const [photos, setPhotos] = useState([]); // local { uri, mimeType }
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      showAlert('MySheba', `You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPhotos((p) => [...p, { uri: asset.uri, mimeType: asset.mimeType }]);
  };

  const removePhoto = (index) => setPhotos((p) => p.filter((_, i) => i !== index));

  const submit = async () => {
    if (!text.trim() && photos.length === 0) {
      return showAlert('MySheba', 'Write something or add a photo before posting.');
    }
    if (!authUser) return;

    setSubmitting(true);
    try {
      const postId = await socialFeedService.createPost(
        { uid: authUser.uid, name: profile?.name, role: profile?.role, country: profile?.country },
        { text }
      );

      if (photos.length > 0) {
        const urls = [];
        for (let i = 0; i < photos.length; i++) {
          const url = await uploadSocialPostImage(postId, photos[i].uri, photos[i].mimeType, i);
          urls.push(url);
        }
        await socialFeedService.setPostImages(postId, urls);
      }

      showAlert('MySheba', 'Your post is live!');
      openSocialPostDetail(postId);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not create your post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What's on your mind?"
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={6}
          autoFocus
        />

        <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS}) - optional</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoThumbWrap}>
              <Image source={{ uri: p.uri }} style={styles.photoThumb} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < MAX_PHOTOS && (
            <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
              <Text style={styles.addPhotoIcon}>📷</Text>
              <Text style={styles.addPhotoText}>Add</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {!!profile?.country && (
          <Text style={styles.hintText}>Posting to {profile.country} · also visible in the Global feed</Text>
        )}

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Post</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 14, marginBottom: 6 },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text },
    textArea: { minHeight: 120, textAlignVertical: 'top' },
    photoRow: { flexGrow: 0 },
    photoThumbWrap: { marginRight: 10, position: 'relative' },
    photoThumb: { width: 74, height: 74, borderRadius: radius.md, backgroundColor: '#F1F3F4' },
    photoRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    photoRemoveText: { color: 'white', fontSize: 11, fontWeight: '700' },
    addPhotoBtn: { width: 74, height: 74, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    addPhotoIcon: { fontSize: 18 },
    addPhotoText: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    hintText: { fontSize: 11, color: colors.textSecondary, marginTop: 14 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    submitBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  });
}
