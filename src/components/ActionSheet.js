import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

/**
 * The actions for one thing, as a list you can read.
 *
 * The alternative, and what this replaced, is every action as its own small
 * pill crammed into the corner of a row: six of them wrapping onto three lines,
 * each too small to hit confidently, with "Delete" sitting the same size and a
 * thumb's width from "Upgrade". On a phone that is not a dense interface, it is
 * a dare.
 *
 * Here each action gets a full-width row, a label in a readable size and a line
 * saying what it does - so a destructive one is recognisable before it is
 * tapped, not after. Destructive actions are tinted and go last, below a
 * divider, because the ordering is itself a safety feature.
 *
 * `actions` is [{ key, label, description, tone, onPress }] where tone is
 * 'default' | 'primary' | 'danger'. A falsy entry is skipped, so a caller can
 * write `canDelete && {...}` without filtering first.
 */
export default function ActionSheet({ visible, title, subtitle, actions = [], onClose }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const rows = actions.filter(Boolean);
  const safe = rows.filter((a) => a.tone !== 'danger');
  const dangerous = rows.filter((a) => a.tone === 'danger');

  const Row = ({ action }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.7}
      onPress={() => { onClose(); action.onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={action.label}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, action.tone === 'danger' && { color: colors.error }, action.tone === 'primary' && { color: colors.primary }]}>
          {action.label}
        </Text>
        {!!action.description && <Text style={styles.rowDescription}>{action.description}</Text>}
      </View>
      <Text style={[styles.chevron, action.tone === 'danger' && { color: colors.error }]}>›</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* Tapping away closes, which is what everything else on this phone
            does. Without it the only way out is the Cancel button. */}
        <TouchableOpacity style={styles.backdropFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.headerBlock}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {!!subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <ScrollView style={styles.list} bounces={false}>
            {safe.map((a) => <Row key={a.key} action={a} />)}
            {dangerous.length > 0 && safe.length > 0 && <View style={styles.dangerDivider} />}
            {dangerous.map((a) => <Row key={a.key} action={a} />)}
            {rows.length === 0 && <Text style={styles.empty}>There is nothing you can do to this account.</Text>}
          </ScrollView>
          <TouchableOpacity style={styles.cancel} onPress={onClose} accessibilityRole="button">
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    backdropFill: { ...StyleSheet.absoluteFillObject },
    sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: 14, maxHeight: '82%' },
    grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 9, marginBottom: 4 },
    headerBlock: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.divider },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 3 },
    list: { paddingHorizontal: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.md },
    rowLabel: { fontSize: 14.5, fontWeight: '700', color: colors.text },
    rowDescription: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
    chevron: { fontSize: 20, color: colors.textSecondary },
    dangerDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 6, marginHorizontal: 12 },
    empty: { textAlign: 'center', color: colors.textSecondary, fontSize: 12.5, paddingVertical: 26 },
    cancel: { marginTop: 8, marginHorizontal: 14, paddingVertical: 13, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center' },
    cancelText: { fontSize: 14, fontWeight: '700', color: colors.text },
  });
}
