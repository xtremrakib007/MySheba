import React from 'react';
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { phoneCountries } from '../data/phoneCountries';

export default function PhoneCountryPicker({ visible, value, onSelect, onClose }) {
  const [q, setQ] = React.useState('');
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
            placeholderTextColor="#8F9AAA"
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
                <View style={styles.flagBox}><Text style={styles.flag}>{item.flag}</Text></View>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  sheet: {
    height: '84%',
    backgroundColor: '#050505',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontWeight: '800', color: '#FFFFFF' },
  close: { fontSize: 20, padding: 6, color: '#FFFFFF' },
  search: {
    borderWidth: 1,
    borderColor: '#3A3A3A',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 9,
    backgroundColor: '#111111',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: '#101010',
    borderWidth: 1,
    borderColor: '#242424',
  },
  selected: { backgroundColor: '#102A28', borderColor: '#00A99D' },
  flagBox: { width: 42, alignItems: 'center', justifyContent: 'center' },
  flag: { fontSize: 25 },
  name: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700', includeFontPadding: false },
  dial: { color: '#D8E0E8', fontSize: 13, fontWeight: '800', marginLeft: 10, minWidth: 42, textAlign: 'right' },
});
