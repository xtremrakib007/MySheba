import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { daysRemainingLabel, computeStatus } from '../firebase/documentService';
import { STATUS_COLORS } from '../data/documentConstants';

export default function DocumentExpiry({ expiryDate }) {
  if (!expiryDate) return null;
  const status = computeStatus(expiryDate);
  return <Text style={[styles.text, { color: STATUS_COLORS[status] }]}>{daysRemainingLabel(expiryDate)}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 13, fontWeight: '600' },
});
