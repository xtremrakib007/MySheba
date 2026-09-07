import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import DocumentStatusBadge from './DocumentStatusBadge';
import { DOCUMENT_TYPE_ICONS, DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS } from '../data/documentConstants';
import { daysRemainingLabel } from '../firebase/documentService';

export default function DocumentCard({ document, onPress, onAddPress }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const icon = DOCUMENT_TYPE_ICONS[document.documentType] ?? '📁';
  const label = DOCUMENT_TYPE_LABELS[document.documentType] ?? document.documentName;
  const isEmpty = document.status === DOCUMENT_STATUS.NOT_ADDED;

  return (
    <TouchableOpacity style={styles.card} onPress={isEmpty ? onAddPress : onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title} numberOfLines={1}>{document.documentName || label}</Text>
      </View>

      <DocumentStatusBadge status={document.status} />

      {!isEmpty && document.expiryDate ? (
        <Text style={styles.expiry}>
          Expiry: {new Date(document.expiryDate).toLocaleDateString()} · {daysRemainingLabel(document.expiryDate)}
        </Text>
      ) : null}

      <TouchableOpacity style={styles.actionButton} onPress={isEmpty ? onAddPress : onPress}>
        <Text style={styles.actionText}>{isEmpty ? '+ Add Document' : 'View'}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { fontSize: 22 },
    title: { fontSize: 16, fontWeight: '700', flexShrink: 1, color: colors.text },
    expiry: { fontSize: 13, color: colors.textSecondary },
    actionButton: {
      marginTop: 4,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radius.sm,
      backgroundColor: colors.bg,
    },
    actionText: { fontWeight: '600', fontSize: 14, color: colors.primaryDark },
  });
}
