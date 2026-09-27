import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import CountryFlag from './CountryFlag';
import { countries } from '../data/countries';
import AppModalHeader from './AppModalHeader';

// Profile > "Country / Region" row (Next Update PRD §2 - "Users must be
// able to change their country/region from Profile"). Mirrors
// LanguageModal.js's list-of-options-with-checkmark layout exactly, just
// swapping the language list for the same `countries` array Login/
// Remittance/Recharge already use - one country list for the whole app,
// no new data source. Selecting a country writes straight to
// users/{uid}.country via ProfileScreen's existing authService.
// updateUserFields path (firestore.rules already allows a user to write
// their own `country` - it isn't one of the frozen fields on the
// users/{uid} update rule), so no rules change was needed for this part.
//
// No "verification/business rules" gate on the change itself yet - the
// PRD says the change is "subject to any applicable verification/business
// rules" but nothing in this app today ties a business rule to country
// (unlike, say, KYC/passport verification), so there is nothing to
// enforce here beyond picking a value from the known list.
export default function CountryModal({ visible, onClose, value, onSelect }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            <Text style={styles.title}>Country / Region</Text>
            <Text style={styles.subtitle}>
              Sets your home country/region. Malaysia sees the standard service homepage; other
            </Text>

            <ScrollView style={styles.list} contentContainerStyle={{ flexGrow: 0 }}>
              {countries.map((c, idx) => {
                const isSelected = c.code === value;
                const isLast = idx === countries.length - 1;
                return (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.optionRow, isSelected && styles.optionRowSelected, isLast && styles.optionRowLast]}
                    onPress={() => { onSelect(c.code); onClose(); }}
                    activeOpacity={0.7}
                  >
                    <CountryFlag code={c.code} emoji={c.flag} size={30} style={styles.optionFlag} />
                    <View style={styles.optionTextWrap}>
                      <Text style={[styles.optionLabel, isSelected && { color: colors.primary, fontWeight: '700' }]}>{c.name}</Text>
                    </View>
                    {!!isSelected && <Text style={[styles.check, { color: colors.primary }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, width: '88%', maxWidth: 380, maxHeight: '80%', overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, color: colors.text },
    subtitle: { fontSize: 12, color: '#888', marginTop: 4, marginBottom: 14, lineHeight: 17 },
    list: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, maxHeight: 320 },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      gap: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionRowLast: { borderBottomWidth: 0 },
    optionRowSelected: { backgroundColor: `${colors.primary}14` },
    optionFlag: { marginRight: 4 },
    optionTextWrap: { flex: 1 },
    optionLabel: { fontSize: 14, fontWeight: '500', color: colors.text },
    check: { fontSize: 16, fontWeight: '700' },
    closeBtn: { marginTop: 16, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 14 },
  });
}
