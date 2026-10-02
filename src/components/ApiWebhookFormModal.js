import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export default function ApiWebhookFormModal({ visible, provider, config, onClose, onSave }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const special = provider?.name === 'Success TopUp';
  const [form, setForm] = useState({});
  useEffect(() => setForm({
    providerId: provider?.id || '',
    enabled: config?.enabled !== false,
    authHeader: config?.authHeader || 'x-webhook-token',
    webhookToken: '',
    transactionIdPath: config?.transactionIdPath || 'transactionId',
    statusPath: config?.statusPath || 'status',
    messagePath: config?.messagePath || 'message',
    successStatus: config?.successStatus || 'Success',
    processingStatus: config?.processingStatus || 'Processing',
    cancelStatus: config?.cancelStatus || 'Cancel',
  }), [provider, config, visible]);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{special ? 'Success TopUp Webhook' : 'Webhook Configuration'}</Text>
      <ScrollView>
        <Text style={styles.provider}>Provider: {provider?.name || 'API Provider'}</Text>
        <Text style={styles.label}>Webhook URL</Text>
        <Text selectable style={styles.value}>{config?.webhookUrl || 'Webhook URL will be generated automatically.'}</Text>
        {special ? <>
          <Text style={styles.label}>Webhook token</Text>
          <Text selectable style={styles.token}>{config?.webhookToken || 'Token unavailable — save the Success TopUp provider again.'}</Text>
          <Text style={styles.help}>This is generated automatically by MySheba. Copy the URL and token into your Success TopUp API settings. Do not change the webhook fields.</Text>
          <View style={styles.fixedBox}>
            <Text style={styles.fixedTitle}>Fixed webhook mapping</Text>
            <Text>Header: x-webhook-token</Text>
            <Text>Transaction ID: transactionId</Text>
            <Text>Status: status</Text>
            <Text>Message: comment</Text>
            <Text>Statuses: Success / Processing / Cancel</Text>
          </View>
        </> : <>
          <Text style={styles.help}>Give this URL to the provider. Webhooks are received by MySheba server-side; the mobile app does not receive provider callbacks.</Text>
          {['authHeader','webhookToken','transactionIdPath','statusPath','messagePath','successStatus','processingStatus','cancelStatus'].map((k) =>
            <TextInput key={k} style={styles.input} placeholder={k === 'webhookToken' ? 'Webhook token' : k} value={String(form[k] ?? '')} onChangeText={(v) => setForm((x) => ({ ...x, [k]: v }))} secureTextEntry={k === 'webhookToken'} />
          )}
          <TouchableOpacity onPress={() => setForm((x) => ({ ...x, enabled: !x.enabled }))} style={styles.toggle}><Text>{form.enabled ? '✓ Webhook Active' : '○ Webhook Inactive'}</Text></TouchableOpacity>
        </>}
      </ScrollView>
      <View style={styles.row}><TouchableOpacity onPress={onClose} style={styles.cancel}><Text>Close</Text></TouchableOpacity>{!special && <TouchableOpacity onPress={() => onSave(form)} style={styles.save}><Text style={{color:'white',fontWeight:'700'}}>Save Webhook</Text></TouchableOpacity>}</View>
    </View></View>
  </Modal>;
}
// Themed, for the same reason as ApiProviderManagementScreen: built at module
// level, every colour was a literal and most text carried none, so the labels
// rendered in the platform default against a hardcoded white sheet.
function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' },
    card: { backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, maxHeight: '90%' },
    title: { fontSize: 19, fontWeight: '800', marginBottom: 10, color: colors.text },
    provider: { fontWeight: '700', marginBottom: 8, color: colors.textSecondary },
    label: { fontWeight: '700', marginTop: 8, color: colors.text },
    value: { fontSize: 12, marginTop: 6, marginBottom: 8, color: colors.text },
    token: { fontSize: 12, marginTop: 6, marginBottom: 8, fontFamily: 'monospace', color: colors.text },
    help: { fontSize: 11, lineHeight: 16, marginBottom: 8, color: colors.textSecondary },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, padding: 11, marginBottom: 9, color: colors.text, backgroundColor: colors.inputBg },
    fixedBox: { marginTop: 8, marginBottom: 8, padding: 12, borderRadius: 10, backgroundColor: colors.surface, gap: 4 },
    fixedTitle: { fontWeight: '800', marginBottom: 4, color: colors.text },
    toggle: { padding: 12, marginVertical: 10 },
    toggleText: { color: colors.primary, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancel: { padding: 12 },
    cancelText: { color: colors.textSecondary, fontWeight: '700' },
    save: { padding: 12, borderRadius: 9, backgroundColor: colors.primary },
    saveText: { color: colors.onPrimary, fontWeight: '800' },
  });
}
