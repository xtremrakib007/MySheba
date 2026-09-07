import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as accommodationService from '../firebase/accommodationService';
import { LISTING_TYPES, FACILITIES } from '../firebase/accommodationService';
import { uploadPropertyImage } from '../firebase/mediaUpload';
import { DateField } from '../components/ui';
import LocationField from '../components/LocationField';

const MAX_PHOTOS = 6;

export default function CreatePropertyScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openPropertyDetail, authUser, profile } = useApp();

  const [listingType, setListingType] = useState(LISTING_TYPES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [deposit, setDeposit] = useState('');
  const [availableDate, setAvailableDate] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [facilities, setFacilities] = useState([]);
  const [photos, setPhotos] = useState([]); // local { uri, mimeType }
  const [submitting, setSubmitting] = useState(false);

  const toggleFacility = (f) => {
    setFacilities((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));
  };

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
    if (!monthlyRent || Number(monthlyRent) <= 0) return showAlert('MySheba', 'Please enter a valid monthly rent.');
    if (!location.trim()) return showAlert('MySheba', 'Please enter a location.');
    if (!authUser) return;

    setSubmitting(true);
    try {
      const propertyId = await accommodationService.createProperty(
        { uid: authUser.uid, name: profile?.name, role: profile?.role },
        { listingType, title, description, monthlyRent, deposit, availableDate, location, facilities, latitude: coords.latitude, longitude: coords.longitude }
      );

      if (photos.length > 0) {
        const urls = [];
        for (let i = 0; i < photos.length; i++) {
          const url = await uploadPropertyImage(propertyId, photos[i].uri, photos[i].mimeType, i);
          urls.push(url);
        }
        await accommodationService.setPropertyImages(propertyId, urls);
      }

      showAlert('MySheba', 'Your property listing is live!');
      openPropertyDetail(propertyId);
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
        <Text style={styles.headerTitle}>List a Property</Text>
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

        <Text style={styles.label}>Listing Type</Text>
        <View style={styles.chipWrap}>
          {LISTING_TYPES.map((t) => (
            <TouchableOpacity key={t} style={[styles.chip, listingType === t && styles.chipActive]} onPress={() => setListingType(t)}>
              <Text style={[styles.chipText, listingType === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g. Cozy single room near LRT" value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe the place, house rules, nearby amenities, etc."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Monthly Rent (MYR)</Text>
        <TextInput style={styles.input} placeholder="0.00" value={monthlyRent} onChangeText={setMonthlyRent} keyboardType="decimal-pad" />

        <Text style={styles.label}>Deposit (MYR)</Text>
        <TextInput style={styles.input} placeholder="0.00" value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" />

        <Text style={styles.label}>Available Date</Text>
        <DateField placeholder="Select available date" value={availableDate} onChange={setAvailableDate} minimumDate={new Date()} />

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

        <Text style={styles.label}>Facilities</Text>
        <View style={styles.chipWrap}>
          {FACILITIES.map((f) => (
            <TouchableOpacity key={f} style={[styles.chip, facilities.includes(f) && styles.chipActive]} onPress={() => toggleFacility(f)}>
              <Text style={[styles.chipText, facilities.includes(f) && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
