import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, DOCUMENT_TYPE_ICONS } from '../data/documentConstants';

export default function DocumentTypeScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openAddDocument } = useApp();
  const types = Object.values(DOCUMENT_TYPES);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Document Type</Text>
      </LinearGradient>

      <FlatList
        data={types}
        keyExtractor={(t) => t}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => openAddDocument(item)}>
            <Text style={styles.icon}>{DOCUMENT_TYPE_ICONS[item]}</Text>
            <Text style={styles.label}>{DOCUMENT_TYPE_LABELS[item]}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backIcon: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontSize: 17, fontWeight: '700' },
    list: { paddingHorizontal: 16, paddingTop: 8 },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 14, backgroundColor: colors.card, paddingHorizontal: 12, marginBottom: 1 },
    icon: { fontSize: 22 },
    label: { fontSize: 15, fontWeight: '600', color: colors.text, flex: 1 },
    chevron: { fontSize: 18, color: colors.textSecondary },
  });
}
