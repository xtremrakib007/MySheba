// Small, non-interactive map + marker for *DetailScreen views (Property,
// Tapping it opens the device's native Maps app for directions - it does
// not open the full LocationPickerModal (that's for editing, this is
// read-only display).
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

export default function MapPreview({ latitude, longitude, address, height = 160 }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  if (latitude == null || longitude == null) return null;

  const region = {
    latitude: Number(latitude),
    longitude: Number(longitude),
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  };

  const openDirections = () => {
    const label = encodeURIComponent(address || 'Destination');
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
    });
    Linking.openURL(url).catch(() => {});
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={openDirections} style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        region={region}
        pointerEvents="none"
        scrollEnabled={false}
        zoomEnabled={false}
      >
        <Marker coordinate={region} />
      </MapView>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>🧭 Directions</Text>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: { borderRadius: radius.lg, overflow: 'hidden', marginTop: 8, backgroundColor: colors.bg },
    badge: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      backgroundColor: 'white',
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: radius.pill,
      elevation: 2,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 3,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  });
}
