import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { PLACEMENT_IDS, PLACEMENT_LABELS } from '../constants/adPlacements';
import { validatePackagePayload } from '../utils/adPackagePaymentRules';

// PHASE 10 - MY SHEBA ADVERTISING PACKAGES AND PAYMENTS - PACKAGE form.
//
// Create/Edit for one ad_packages doc. Every field from the brief's
// PACKAGE "Fields" list lives here (packageId is the Firestore doc id,
// not user-entered - see buildPackagePayload). Prices/durations are
// plain admin-entered numbers, never hard-coded anywhere in this
// component or its callers - see AdPackage's own header comment in
// src/types/ads.ts.

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  currency: 'MYR',
  durationDays: '',
  placements: [],
  maxImpressions: '',
  priority: '0',
  active: true,
};

function toFormState(pkg) {
  if (!pkg) return EMPTY_FORM;
  return {
    ...EMPTY_FORM,
    name: pkg.name || '',
    description: pkg.description || '',
    price: pkg.price != null ? String(pkg.price) : '',
    currency: pkg.currency || 'MYR',
    durationDays: pkg.durationDays != null ? String(pkg.durationDays) : '',
    placements: Array.isArray(pkg.placements) ? pkg.placements : [],
    maxImpressions: pkg.maxImpressions != null ? String(pkg.maxImpressions) : '',
    priority: pkg.priority != null ? String(pkg.priority) : '0',
    active: pkg.active !== false,
  };
}

export function buildPackagePayload(form) {
  return {
    name: form.name.trim(),
    description: form.description.trim(),
    price: Number(form.price) || 0,
    currency: (form.currency || 'MYR').trim().toUpperCase(),
    durationDays: Number(form.durationDays) || 0,
    placements: form.placements,
    maxImpressions: form.maxImpressions === '' ? null : Number(form.maxImpressions),
    priority: Number(form.priority) || 0,
    active: !!form.active,
  };
}

const PLACEMENT_OPTIONS = Object.values(PLACEMENT_IDS).map((id) => ({ id, label: PLACEMENT_LABELS[id] }));

export default function AdPackageFormModal({ visible, pkg, onSubmit, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setForm(toFormState(pkg));
  }, [visible, pkg]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const togglePlacement = (id) => {
    setForm((f) => ({
      ...f,
      placements: f.placements.includes(id) ? f.placements.filter((p) => p !== id) : [...f.placements, id],
    }));
  };

  const save = async () => {
    const error = validatePackagePayload(form);
    if (error) {
      showAlert('MySheba', error);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(buildPackagePayload(form));
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not save this package. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.heading}>{pkg ? 'Edit Package' : 'New Package'}</Text>

            <Text style={styles.label}>Package Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Starter, Standard, Business, Premium"
              placeholderTextColor="#999"
              value={form.name}
              onChangeText={(v) => set('name', v)}
              maxLength={60}
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="What this package includes"
              placeholderTextColor="#999"
              value={form.description}
              onChangeText={(v) => set('description', v)}
              multiline
              numberOfLines={3}
              maxLength={240}
            />

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={form.price}
                  onChangeText={(v) => set('price', v.replace(/[^0-9.]/g, ''))}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Currency</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MYR"
                  placeholderTextColor="#999"
                  value={form.currency}
                  onChangeText={(v) => set('currency', v.toUpperCase())}
                  autoCapitalize="characters"
                  maxLength={6}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Duration (days)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 7"
                  placeholderTextColor="#999"
                  value={form.durationDays}
                  onChangeText={(v) => set('durationDays', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Priority</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#999"
                  value={form.priority}
                  onChangeText={(v) => set('priority', v.replace(/[^0-9-]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <Text style={styles.label}>Max Impressions (blank = unlimited)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 50000"
              placeholderTextColor="#999"
              value={form.maxImpressions}
              onChangeText={(v) => set('maxImpressions', v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
            />

            <Text style={styles.label}>Placements</Text>
            <View style={styles.chipRow}>
              {PLACEMENT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.chip, form.placements.includes(opt.id) && styles.chipActive]}
                  onPress={() => togglePlacement(opt.id)}
                >
                  <Text style={[styles.chipText, form.placements.includes(opt.id) && styles.chipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.toggleRow} onPress={() => set('active', !form.active)}>
              <Text style={styles.label}>Active</Text>
              <View style={[styles.toggle, form.active && styles.toggleOn]}>
                <View style={[styles.toggleKnob, form.active && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
    box: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, maxHeight: '88%' },
    heading: { fontSize: 17, fontWeight: '700', color: colors.text },
    label: { fontSize: 12.5, fontWeight: '700', color: colors.text, marginTop: 12, marginBottom: 6 },
    input: {
      borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm,
      paddingVertical: 9, paddingHorizontal: 12, fontSize: 13.5, color: colors.text, backgroundColor: colors.bg,
    },
    textArea: { minHeight: 60, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    rowItem: { flex: 1 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 11, fontWeight: '600', color: colors.text },
    chipTextActive: { color: 'white' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border, padding: 3, justifyContent: 'center' },
    toggleOn: { backgroundColor: colors.primary },
    toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },
    toggleKnobOn: { alignSelf: 'flex-end' },
    actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: {
      flex: 1, paddingVertical: 11, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    },
    cancelBtnText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    saveBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
    saveBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  });
}
