import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { ANNOUNCEMENT_AUDIENCES } from '../firebase/announcementService';

const EMPTY = { title: '', body: '', audience: 'all' };

// Compose form for one push broadcast - title/body/audience, submitted to
// sendAnnouncement (see AdminHomeScreen.js). `busy` disables Send while the
// Cloud Function call is in flight, since this fans out to potentially
// every user and shouldn't be double-tapped.
export default function AnnouncementFormModal({ visible, busy, onSubmit, onCancel }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (visible) setForm(EMPTY);
  }, [visible]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const canSend = form.title.trim() && form.body.trim() && !busy;

  const send = () => {
    if (!canSend) return;
    onSubmit(form);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.heading}>📣 New Announcement</Text>

            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Scheduled maintenance tonight"
              value={form.title}
              onChangeText={(v) => set('title', v)}
              maxLength={60}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="e.g. The app will be briefly unavailable from 1-2 AM."
              value={form.body}
              onChangeText={(v) => set('body', v)}
              maxLength={200}
              multiline
            />

            <Text style={styles.label}>Send to</Text>
            <View style={styles.chipRow}>
              {ANNOUNCEMENT_AUDIENCES.map((a) => (
                <TouchableOpacity
                  key={a.key}
                  style={[styles.chip, form.audience === a.key && styles.chipActive]}
                  onPress={() => set('audience', a.key)}
                >
                  <Text style={[styles.chipText, form.audience === a.key && styles.chipTextActive]}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.row}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.okBtn, !canSend && styles.okBtnDisabled]} onPress={send} disabled={!canSend}>
                <Text style={styles.okText}>{busy ? 'Sending…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '88%', maxWidth: 380, maxHeight: '85%' },
    heading: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
    label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 },
    textarea: { minHeight: 80, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, color: colors.text },
    chipTextActive: { color: 'white', fontWeight: '600' },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    okBtnDisabled: { opacity: 0.5 },
    okText: { color: 'white', fontWeight: '600' },
  });
}
