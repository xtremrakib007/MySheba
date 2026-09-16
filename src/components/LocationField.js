// Tappable "Location" form field used in CreatePropertyScreen,
// opens LocationPickerModal and reports back { address, latitude,
// longitude }. Looks like the plain TextInput it replaces so it drops
// into existing form layouts without any surrounding style changes.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import LocationPickerModal from './LocationPickerModal';

export default function LocationField({ value, latitude, longitude, onChange, placeholder = 'Tap to set location on map' }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [visible, setVisible] = useState(false);

  const handleConfirm = (result) => {
    setVisible(false);
    onChange(result); // { address, latitude, longitude }
  };

  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => setVisible(true)}>
        <Text style={value ? styles.valueText : styles.placeholderText} numberOfLines={1}>
          {value ? `📍 ${value}` : placeholder}
        </Text>
      </TouchableOpacity>
      <LocationPickerModal
        visible={visible}
        initial={{ address: value, latitude, longitude }}
        onConfirm={handleConfirm}
        onCancel={() => setVisible(false)}
      />
    </>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: 12,
      paddingHorizontal: 12,
      justifyContent: 'center',
    },
    valueText: { fontSize: 14, color: colors.text },
    placeholderText: { fontSize: 14, color: '#9AA0A6' },
  });
}
