import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import * as userManagementService from '../firebase/userManagementService';

// "Appoint Dealer" picker for a transaction that came in with no
// dealerId - lists every top-level dealer (see
// userManagementService.subscribeDealers) so admin can hand it off into
// that dealer's own queue. Mirrors AssignChatModal's shape, but dealers
// only (a transaction's dealerId always points to a top-level dealer).
export default function AssignDealerModal({ visible, onSelect, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return undefined;
    setLoading(true);
    const unsub = userManagementService.subscribeDealers(
      (list) => { setDealers(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Appoint Dealer</Text>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : dealers.length === 0 ? (
            <Text style={styles.empty}>No dealers found.</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {dealers.map((d) => (
                <TouchableOpacity key={d.id} style={styles.row} onPress={() => onSelect(d)}>
                  <Text style={styles.rowName}>{d.name || d.phone || 'Unnamed'}</Text>
                  {!!d.phone && <Text style={styles.rowPhone}>{d.phone}</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '85%', maxWidth: 340, maxHeight: '70%' },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 12 },
    empty: { fontSize: 12, color: '#999', textAlign: 'center', marginVertical: 20 },
    list: { maxHeight: 300, marginBottom: 12 },
    row: {
      paddingVertical: 10, paddingHorizontal: 10,
      borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 6,
    },
    rowName: { fontSize: 13, fontWeight: '600', color: colors.text },
    rowPhone: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    cancelBtn: { paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
  });
}
