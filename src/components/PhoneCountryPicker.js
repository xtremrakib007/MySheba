import React from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { phoneCountries } from '../data/phoneCountries';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';

export default function PhoneCountryPicker({ visible, value, onSelect, onClose }) {
  const [q, setQ] = React.useState('');
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const list = phoneCountries.filter(c => !q || `${c.name} ${c.dial}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Select country</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search country or code"
            placeholderTextColor={colors.textSecondary}
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            data={list}
            keyExtractor={x => x.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, value?.code === item.code && styles.selected]}
                activeOpacity={0.7}
                onPress={() => { onSelect(item); setQ(''); }}
              >
                <View style={styles.flagBox}>
                  <CountryFlag code={item.code} emoji={item.flag} size={30} />
                </View>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.dial}>{item.dial}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
    sheet: {
      height: '84%',
      backgroundColor: colors.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    title: { fontSize: 19, fontWeight: '800', color: colors.text },
    close: { fontSize: 20, padding: 6, color: colors.text },
    search: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 13,
      paddingVertical: 11,
      marginBottom: 9,
      backgroundColor: colors.bg,
      color: colors.text,
      fontSize: 14,
      fontWeight: '500',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 58,
      paddingVertical: 9,
      paddingHorizontal: 10,
      marginBottom: 6,
      borderRadius: 12,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selected: { borderColor: colors.primary, borderWidth: 2 },
    // White tile intentionally used in both themes so flags remain bright/full-color.
    flagBox: {
      width: 46,
      height: 42,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 9,
      backgroundColor: '#FFFFFF',
      borderWidth: 1,
      borderColor: '#E2E8F0',
    },
    flag: { fontSize: 27, lineHeight: 32, opacity: 1 },
    name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '700', includeFontPadding: false },
    dial: { color: colors.textSecondary, fontSize: 13, fontWeight: '800', marginLeft: 10, minWidth: 48, textAlign: 'right' },
  });
}
