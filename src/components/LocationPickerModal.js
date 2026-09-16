// Full-screen location picker: Google Places Autocomplete search + a
// drag-pin map to fine-tune, used anywhere a screen needs a real
//
// Talks to the Google Places Web Service directly over fetch (Autocomplete
// + Place Details + a reverse-geocode call for "use my current location"),
// rather than a native Places SDK wrapper, so there's no extra native
// module/config beyond react-native-maps itself. Needs Places API +
// Geocoding API enabled on the same key used by react-native-maps
// (see GOOGLE_MAPS_SETUP.md).
//
// Returns { address, latitude, longitude } via onConfirm - callers should
// also run the value through computeGeohash() (src/utils/geo.js) before
// saving to Firestore.
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || '';

const DEFAULT_REGION = {
  // Kuala Lumpur - sensible default center for MySheba's Malaysia-based
  // users when no GPS fix / prior location is available yet.
  latitude: 3.139,
  longitude: 101.6869,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function LocationPickerModal({ visible, initial, onConfirm, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const mapRef = useRef(null);
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [marker, setMarker] = useState(null); // { latitude, longitude }
  const [address, setAddress] = useState('');
  const [query, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!visible) return;
    if (initial?.latitude != null && initial?.longitude != null) {
      const r = { latitude: Number(initial.latitude), longitude: Number(initial.longitude), latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(r);
      setMarker({ latitude: r.latitude, longitude: r.longitude });
      setAddress(initial.address || '');
      setQueryText(initial.address || '');
    } else {
      setRegion(DEFAULT_REGION);
      setMarker(null);
      setAddress('');
      setQueryText('');
    }
    setSuggestions([]);
  }, [visible, initial]);

  const fetchSuggestions = (text) => {
    setQueryText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!text || text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (!GOOGLE_MAPS_API_KEY) return;
      setSearching(true);
      try {
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
          text
        )}&components=country:my&key=${GOOGLE_MAPS_API_KEY}`;
        const res = await fetch(url);
        const json = await res.json();
        setSuggestions(json.status === 'OK' ? json.predictions : []);
      } catch (e) {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectSuggestion = async (placeId, description) => {
    setSuggestions([]);
    setQueryText(description);
    setResolving(true);
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry,formatted_address&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      const loc = json.result?.geometry?.location;
      if (loc) {
        const r = { latitude: loc.lat, longitude: loc.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 };
        setRegion(r);
        setMarker({ latitude: r.latitude, longitude: r.longitude });
        setAddress(json.result.formatted_address || description);
        mapRef.current?.animateToRegion(r, 300);
      }
    } catch (e) {
      // Swallow - user can still drop the pin manually.
    } finally {
      setResolving(false);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    if (!GOOGLE_MAPS_API_KEY) return;
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const json = await res.json();
      const formatted = json.results?.[0]?.formatted_address;
      if (formatted) {
        setAddress(formatted);
        setQueryText(formatted);
      }
    } catch (e) {
      // Non-fatal - lat/lng is still usable without a pretty address.
    }
  };

  const onMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setMarker({ latitude, longitude });
    reverseGeocode(latitude, longitude);
  };

  const useCurrentLocation = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return;
    setResolving(true);
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const r = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      setRegion(r);
      setMarker({ latitude: r.latitude, longitude: r.longitude });
      mapRef.current?.animateToRegion(r, 300);
      await reverseGeocode(r.latitude, r.longitude);
    } finally {
      setResolving(false);
    }
  };

  const confirm = () => {
    if (!marker) return;
    onConfirm({ address: address || query, latitude: marker.latitude, longitude: marker.longitude });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Set Location</Text>
          <TouchableOpacity onPress={confirm} style={styles.headerBtn} disabled={!marker}>
            <Text style={[styles.headerBtnText, styles.confirmText, !marker && styles.disabledText]}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search for an address or place"
            value={query}
            onChangeText={fetchSuggestions}
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} style={styles.searchSpinner} />}
          {suggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.place_id}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.suggestionRow} onPress={() => selectSuggestion(item.place_id, item.description)}>
                    <Text style={styles.suggestionText}>📍 {item.description}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>

        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          region={marker ? { ...region, latitude: marker.latitude, longitude: marker.longitude } : region}
          onPress={onMapPress}
        >
          {marker && <Marker coordinate={marker} draggable onDragEnd={(e) => onMapPress(e)} />}
        </MapView>

        {resolving && (
          <View style={styles.resolvingOverlay}>
            <ActivityIndicator color="white" />
          </View>
        )}

        <TouchableOpacity style={styles.currentLocationBtn} onPress={useCurrentLocation}>
          <Text style={styles.currentLocationText}>📍 Use my current location</Text>
        </TouchableOpacity>

        {!!address && (
          <View style={styles.addressBar}>
            <Text style={styles.addressText} numberOfLines={2}>{address}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.card },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: Platform.OS === 'ios' ? 54 : 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerBtn: { minWidth: 60 },
    headerBtnText: { fontSize: 15, color: colors.textSecondary },
    confirmText: { color: colors.primary, fontWeight: '700', textAlign: 'right' },
    disabledText: { opacity: 0.4 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    searchWrap: { paddingHorizontal: 16, paddingTop: 12, zIndex: 10 },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 14,
      backgroundColor: colors.card,
    },
    searchSpinner: { position: 'absolute', right: 28, top: 22 },
    suggestionsBox: {
      backgroundColor: 'white',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      marginTop: 4,
      maxHeight: 220,
      elevation: 4,
    },
    suggestionRow: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
    suggestionText: { fontSize: 13, color: colors.text },
    map: { flex: 1, marginTop: 12 },
    resolvingOverlay: {
      position: 'absolute',
      top: '45%',
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: radius.md,
      padding: 10,
    },
    currentLocationBtn: {
      position: 'absolute',
      right: 16,
      bottom: 90,
      backgroundColor: 'white',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: radius.pill,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
    },
    currentLocationText: { fontSize: 12, fontWeight: '600', color: colors.primary },
    addressBar: { padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
    addressText: { fontSize: 13, color: colors.text },
  });
}
