import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, Switch, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as marketplaceService from '../firebase/marketplaceService';
import { CONDITIONS } from '../firebase/marketplaceService';
import { uploadMarketplaceImage } from '../firebase/mediaUpload';
import LocationField from '../components/LocationField';

const MAX_PHOTOS = 6;

export default function CreateListingScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openListingDetail, authUser, profile, marketplaceCategories } = useApp();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(marketplaceCategories[0]);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(false);
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
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
    if (!title.trim()) return showAlert('MySheba', 'Please enter a title.');
    if (!price || Number(price) <= 0) return showAlert('MySheba', 'Please enter a valid price.');
    if (!location.trim()) return showAlert('MySheba', 'Please enter a location.');
    if (!authUser) return;

    setSubmitting(true);
    try {
      const listingId = await marketplaceService.createListing(
        { uid: authUser.uid, name: profile?.name, role: profile?.role, verified: profile?.verified },
        { title, category, description, price, negotiable, condition, location, latitude: coords.latitude, longitude: coords.longitude }
      );

      if (photos.length > 0) {
        const urls = [];
        for (let i = 0; i < photos.length; i++) {
          const url = await uploadMarketplaceImage(listingId, photos[i].uri, photos[i].mimeType, i);
          urls.push(url);
        }
        await marketplaceService.setListingImages(listingId, urls);
      }

      showAlert('MySheba', 'Your listing is live!');
      openListingDetail(listingId);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not create the listing. Please try again.');
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
        <Text style={styles.headerTitle}>Sell an Item</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
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

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g. iPhone 13 Pro, 256GB" value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipWrap}>
          {marketplaceCategories.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Condition</Text>
        <View style={styles.chipWrap}>
          {CONDITIONS.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, condition === c && styles.chipActive]} onPress={() => setCondition(c)}>
              <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the item's condition, reason for selling, etc."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Price (MYR)</Text>
        <TextInput style={styles.input} placeholder="0.00" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />

        <View style={styles.switchRow}>
          <Text style={styles.label}>Negotiable price</Text>
          <Switch
            value={negotiable}
            onValueChange={setNegotiable}
            trackColor={{ false: '#DDD', true: colors.primary }}
            thumbColor={Platform.OS === 'android' ? 'white' : undefined}
          />
        </View>

        <Text style={styles.label}>Location</Text>
        <LocationField
          value={location}
          latitude={coords.latitude}
          longitude={coords.longitude}
          onChange={({ address, latitude, longitude }) => {
            setLocation(address);
            setCoords({ latitude, longitude });
          }}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Post Listing</Text>}
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
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
    chipTextActive: { color: 'white' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    photoRow: { flexGrow: 0 },
    photoThumbWrap: { marginRight: 10, position: 'relative' },
    photoThumb: { width: 74, height: 74, borderRadius: radius.md, backgroundColor: '#F1F3F4' },
    photoRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    photoRemoveText: { color: 'white', fontSize: 11, fontWeight: '700' },
    addPhotoBtn: { width: 74, height: 74, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    addPhotoIcon: { fontSize: 18 },
    addPhotoText: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    submitBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  });
}
