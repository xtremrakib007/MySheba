import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../../theme/theme';

import { useTheme } from "../../theme/ThemeContext";

/**
 * Shared action row for a generated payslip PDF (PRD section 20: Open /
 * Share / Print / Save to My Documents / Create Another) - used both
 * right after generating in CreatePayslipScreen and again from
 * PayslipDetailsScreen, so the two places a user can act on a payslip
 * file never diverge in what's offered.
 */
export default function PayslipActionButtons({ onOpen, onShare, onPrint, onSaveToDocuments, onCreateAnother, savedToDocuments }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.grid}>
      {!!onOpen && <ActionBtn icon="👁️" label="Open PDF" onPress={onOpen} />}
      {!!onShare && <ActionBtn icon="📤" label="Share" onPress={onShare} />}
      {!!onPrint && <ActionBtn icon="🖨️" label="Print" onPress={onPrint} />}
      {!!onSaveToDocuments && (
        <ActionBtn icon="💾" label={savedToDocuments ? 'Saved ✓' : 'Save to My Documents'} onPress={onSaveToDocuments} disabled={savedToDocuments} />
      )}
      {!!onCreateAnother && <ActionBtn icon="➕" label="Create Another" onPress={onCreateAnother} />}
    </View>
  );
}

function ActionBtn({ icon, label, onPress, disabled }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <TouchableOpacity style={[styles.btn, disabled && styles.btnDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
    btn: { width: '47%', backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E8E8E8' },
    btnDisabled: { opacity: 0.6 },
    icon: { fontSize: 20, marginBottom: 6 },
    label: { fontSize: 12, fontWeight: '600', color: colors.navy, textAlign: 'center' },
  });
}
