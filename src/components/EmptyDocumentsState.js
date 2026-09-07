import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

export default function EmptyDocumentsState({ onAddPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>📁</Text>
      <Text style={styles.title}>No documents yet</Text>
      <Text style={styles.body}>Add your passport, work permit, visa and other important documents.</Text>
      <TouchableOpacity style={styles.button} onPress={onAddPress}>
        <Text style={styles.buttonText}>+ Add Document</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
    icon: { fontSize: 48, marginBottom: 12 },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 6, color: colors.text },
    body: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
    button: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: radius.md },
    buttonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  });
}
