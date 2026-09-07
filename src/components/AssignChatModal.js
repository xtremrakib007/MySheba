import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import * as chatService from '../firebase/chatService';

// "Assign to" picker for a support chat thread - lists every admin/
// superadmin/dealer/dealer (see chatService.subscribeAssignableStaff)
// so an admin/superadmin can hand a customer's thread off to whoever
// should own resolving it. Only rendered for admin/superadmin (see
// ChatScreen's `canAssign`), so no dealer-facing entry point exists yet.
const ROLE_LABEL = {
  admin: 'Admin',
  superadmin: 'Superadmin',
  dealer: 'Dealer',
  dealer: 'Dealer',
};

export default function AssignChatModal({ visible, currentUid, onSelect, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible) return undefined;
    setLoading(true);
    const unsub = chatService.subscribeAssignableStaff(
      (list) => { setStaff(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>Assign to</Text>

          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 20 }} />
          ) : staff.length === 0 ? (
            <Text style={styles.empty}>No admins or dealers found.</Text>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {staff.map((s) => {
                const isCurrent = s.id === currentUid;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.row, isCurrent && styles.rowActive]}
                    onPress={() => onSelect(s)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{s.name || s.phone || 'Unnamed'}</Text>
                      <Text style={styles.rowRole}>{ROLE_LABEL[s.role] || s.role}</Text>
                    </View>
                    {isCurrent && <Text style={styles.rowCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
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
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 10, paddingHorizontal: 10,
      borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 6,
    },
    rowActive: { borderColor: colors.primary, backgroundColor: '#E8F0FE' },
    rowName: { fontSize: 13, fontWeight: '600', color: colors.text },
    rowRole: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
    rowCheck: { color: colors.primary, fontWeight: '700', fontSize: 14, marginLeft: 8 },
    cancelBtn: { paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
  });
}
