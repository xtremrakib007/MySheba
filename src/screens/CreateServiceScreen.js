// section 8) - "List a Service" form. Mirrors CreatePropertyScreen's
// data model: a single optional photo (one add/remove slot) instead of a
// multi-photo row, and a price min/max pair instead of one price field
// (PRD section 8's Provider Profile has "Price range", not a fixed price).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import LocationField from '../components/LocationField';

export default function CreateServiceScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);

  const [category, setCategory] = useState(serviceCategories[0]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [coords, setCoords] = useState({ latitude: null, longitude: null });
  const [availability, setAvailability] = useState('');
  const [photo, setPhoto] = useState(null); // local { uri, mimeType }
  const [submitting, setSubmitting] = useState(false);

  const pickPhoto = async () => {
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, mimeType: asset.mimeType });
  };

  const removePhoto = () => setPhoto(null);

  const submit = async () => {
    if (!name.trim()) return showAlert('MySheba', 'Please enter a service name.');
    if (!serviceArea.trim()) return showAlert('MySheba', 'Please enter a service area.');
    if (priceMin && priceMax && Number(priceMin) > Number(priceMax)) {
      return showAlert('MySheba', 'Minimum price cannot be higher than maximum price.');
    }
    if (!authUser) return;

    setSubmitting(true);
    try {
        { uid: authUser.uid, name: profile?.name, role: profile?.role },
        { category, name, description, priceMin, priceMax, serviceArea, availability, latitude: coords.latitude, longitude: coords.longitude }
      );

      if (photo) {
      }

      showAlert('MySheba', 'Your service listing is live!');
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
        <Text style={styles.headerTitle}>List a Service</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Photo (optional)</Text>
        {photo ? (
          <View style={styles.photoThumbWrap}>
            <Image source={{ uri: photo.uri }} style={styles.photoThumb} />
            <TouchableOpacity style={styles.photoRemove} onPress={removePhoto}>
              <Text style={styles.photoRemoveText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.addPhotoBtn} onPress={pickPhoto}>
            <Text style={styles.addPhotoIcon}>📷</Text>
            <Text style={styles.addPhotoText}>Add</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipWrap}>
          {serviceCategories.map((c) => (
            <TouchableOpacity key={c} style={[styles.chip, category === c && styles.chipActive]} onPress={() => setCategory(c)}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Service Name</Text>
        <TextInput style={styles.input} placeholder="e.g. Deep Home Cleaning" value={name} onChangeText={setName} />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Describe what you offer, experience, equipment, etc."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <Text style={styles.label}>Price Range (MYR)</Text>
        <View style={styles.priceRow}>
          <TextInput style={[styles.input, styles.priceInput]} placeholder="Min" value={priceMin} onChangeText={setPriceMin} keyboardType="decimal-pad" />
          <Text style={styles.priceDash}>–</Text>
          <TextInput style={[styles.input, styles.priceInput]} placeholder="Max" value={priceMax} onChangeText={setPriceMax} keyboardType="decimal-pad" />
        </View>

        <Text style={styles.label}>Service Area</Text>
                <LocationField
          value={serviceArea}
          latitude={coords.latitude}
          longitude={coords.longitude}
          placeholder="Tap to set your service area on map"
          onChange={({ address, latitude, longitude }) => {
            setServiceArea(address);
            setCoords({ latitude, longitude });
          }}
        />

        <Text style={styles.label}>Availability</Text>
        <TextInput style={styles.input} placeholder="e.g. Mon–Sat, 9am–6pm" value={availability} onChangeText={setAvailability} />

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
    photoThumbWrap: { position: 'relative', alignSelf: 'flex-start' },
    photoThumb: { width: 90, height: 90, borderRadius: radius.md, backgroundColor: '#F1F3F4' },
    photoRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' },
    photoRemoveText: { color: 'white', fontSize: 11, fontWeight: '700' },
    addPhotoBtn: { width: 90, height: 90, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
    addPhotoIcon: { fontSize: 18 },
    addPhotoText: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    priceInput: { flex: 1 },
    priceDash: { fontSize: 14, color: colors.textSecondary },
    submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    submitBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  });
}
