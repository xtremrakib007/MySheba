import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

// Labelled rather than a bare list of key names, because two of these decide
// whether a callback is believed at all and one of them decides whether a
// customer gets their money back.
const WEBHOOK_FIELDS = [
  { key: 'webhookToken', label: 'Webhook token', placeholder: 'Shared secret the provider sends back',
    hint: 'Leave blank to keep the stored token. Providers that send no token at all need the IP list below instead.' },
  { key: 'allowedIps', label: 'Allowed source IP addresses', placeholder: 'e.g. 18.140.170.98, 13.215.6.214',
    hint: 'Comma separated. IIMMPACT transaction callbacks currently use source-IP authentication. MySheba defaults to IIMMPACT production callback IPs; only change them when IIMMPACT gives you an updated list.' },
  { key: 'authHeader', label: 'Token header name', placeholder: 'x-webhook-token',
    hint: 'The header the provider puts the token in.' },
  { key: 'transactionIdPath', label: 'Our reference, in their callback', placeholder: 'transactionId',
    hint: 'Dotted path. For iimmpact this is the field echoing the refid we sent.' },
  { key: 'statusPath', label: 'Status path', placeholder: 'status', hint: 'Dotted path to the outcome.' },
  { key: 'messagePath', label: 'Message path', placeholder: 'message', hint: 'Dotted path to the provider\u2019s own wording.' },
  { key: 'successStatus', label: 'Status values that mean DONE', placeholder: 'Success',
    hint: 'Comma separated for a provider that spells it more than one way - iimmpact sends Succesful with one s.' },
  { key: 'processingStatus', label: 'Status values that mean NOT FINISHED', placeholder: 'Processing',
    hint: 'Comma separated, e.g. Accepted, Processing.' },
  { key: 'cancelStatus', label: 'Status values that REFUND the customer', placeholder: 'Cancel',
    hint: 'Comma separated. Every value here gives the money back, so list every failure name the provider uses, e.g. Failed, Refund. A failure name missing from this list leaves the customer charged.' },
];

export default function ApiWebhookFormModal({ visible, provider, config, onClose, onSave, onReveal, onRotate, onUnmatched }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const special = provider?.name === 'Success TopUp';
  const iimmpact = provider?.authType === 'iimmpactHmac';
  const [form, setForm] = useState({});
  const [token, setToken] = useState('');
  const [unmatched, setUnmatched] = useState(null);
  const [busy, setBusy] = useState('');
  // The token is shown once and never re-sent by listApiWebhooks, so a stale
  // one left on screen after switching providers would be the wrong secret
  // against the right name.
  useEffect(() => { setToken(''); setUnmatched(null); setBusy(''); }, [provider, visible]);
  const run = async (what, fn) => {
    if (busy) return;
    setBusy(what);
    try { await fn(); } finally { setBusy(''); }
  };
  const delivery = config?.delivery || {};
  const received = Number(delivery.matchedCount || 0) + Number(delivery.unmatchedCount || 0) + Number(delivery.mismatchedCount || 0) + Number(delivery.duplicateCount || 0);
  useEffect(() => setForm({
    providerId: provider?.id || '',
    enabled: config?.enabled !== false,
    authHeader: config?.authHeader || 'x-webhook-token',
    webhookToken: '',
    transactionIdPath: (iimmpact && (!config?.transactionIdPath || config.transactionIdPath === 'transactionId')) ? 'data.refid' : (config?.transactionIdPath || 'transactionId'),
    statusPath: (iimmpact && (!config?.statusPath || config.statusPath === 'status')) ? 'data.status' : (config?.statusPath || 'status'),
    messagePath: (iimmpact && (!config?.messagePath || config.messagePath === 'message')) ? 'data.remarks' : (config?.messagePath || 'message'),
    successStatus: (iimmpact && (!config?.successStatus || config.successStatus === 'Success')) ? 'Succesful, Successful' : (config?.successStatus || 'Success'),
    processingStatus: (iimmpact && (!config?.processingStatus || config.processingStatus === 'Processing')) ? 'Processing, Accepted' : (config?.processingStatus || 'Processing'),
    cancelStatus: (iimmpact && (!config?.cancelStatus || config.cancelStatus === 'Cancel')) ? 'Failed, Refund' : (config?.cancelStatus || 'Cancel'),
    allowedIps: (config?.allowedIps || (iimmpact ? ['18.140.170.98', '13.215.6.214'] : [])).join(', '),
  }), [provider, config, visible, iimmpact]);

  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>{special ? 'Success TopUp Webhook' : 'Webhook Configuration'}</Text>
      <ScrollView>
        <Text style={styles.provider}>Provider: {provider?.name || 'API Provider'}</Text>
        <Text style={styles.label}>Webhook URL</Text>
        <Text selectable style={styles.value}>{config?.webhookUrl || 'Webhook URL will be generated automatically.'}</Text>
        {special ? <>
          <Text style={styles.label}>Webhook token</Text>
          <Text selectable style={styles.token}>{token ? token : (config?.hasWebhookToken ? 'Stored and hidden. Tap Show token to copy it.' : 'Not generated yet. Tap Rotate token.')}</Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.secondary} disabled={Boolean(busy)} onPress={() => run('reveal', async () => { const t = await onReveal(); setToken(t || ''); })}>
              <Text style={styles.secondaryText}>{busy === 'reveal' ? 'Loading…' : 'Show token'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} disabled={Boolean(busy)} onPress={() => run('rotate', async () => { const t = await onRotate(); setToken(t || ''); })}>
              <Text style={styles.secondaryText}>{busy === 'rotate' ? 'Working…' : 'Rotate token'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.help}>This is generated automatically by MySheba. Copy the URL and token into your Success TopUp API settings. Do not change the webhook fields.</Text>

          <View style={styles.fixedBox}>
            <Text style={styles.fixedTitle}>Deliveries</Text>
            <Text style={styles.fixedLine}>{delivery.lastReceivedAt ? 'Last received: ' + new Date(delivery.lastReceivedAt).toLocaleString() : 'Nothing received yet. Until the URL and token are saved on the Success TopUp side, this stays empty.'}</Text>
            <Text style={styles.fixedLine}>{'Matched ' + Number(delivery.matchedCount || 0) + ' · Unmatched ' + Number(delivery.unmatchedCount || 0) + ' · Repeat ' + Number(delivery.duplicateCount || 0)}</Text>
            {received > 0 && Number(delivery.matchedCount || 0) === 0
              ? <Text style={styles.warn}>Callbacks are arriving but none matched a transaction. Tap Unmatched below to see which reference Success TopUp is sending.</Text>
              : null}
            <TouchableOpacity style={styles.secondary} disabled={Boolean(busy)} onPress={() => run('unmatched', async () => { setUnmatched(await onUnmatched()); })}>
              <Text style={styles.secondaryText}>{busy === 'unmatched' ? 'Loading…' : 'Unmatched callbacks'}</Text>
            </TouchableOpacity>
            {unmatched === null ? null : unmatched.length === 0
              ? <Text style={styles.fixedLine}>No unmatched callbacks. Every webhook found its transaction.</Text>
              : unmatched.map((u, i) => <Text key={String(i)} selectable style={styles.fixedLine}>{(u.receivedAt ? new Date(u.receivedAt).toLocaleString() : '—') + ' · ' + u.status + ' · ' + u.transactionId}</Text>)}
          </View>

          <View style={styles.fixedBox}>
            <Text style={styles.fixedTitle}>Fixed webhook mapping</Text>
            <Text style={styles.fixedLine}>Header: x-webhook-token</Text>
            <Text style={styles.fixedLine}>Transaction ID: transactionId</Text>
            <Text style={styles.fixedLine}>Status: status</Text>
            <Text style={styles.fixedLine}>Message: comment</Text>
            <Text style={styles.fixedLine}>Statuses: Success / Processing / Cancel</Text>
          </View>
        </> : <>
          <Text style={styles.help}>Give this URL to the provider. Webhooks are received by MySheba server-side; the mobile app does not receive provider callbacks.</Text>
          {iimmpact
            ? <View style={styles.fixedBox}>
                <Text style={styles.fixedTitle}>IIMMPACT transaction webhook security</Text>
                <Text style={styles.fixedLine}>Authentication: source IP allowlist</Text>
                <Text style={styles.fixedLine}>Production IPs: 18.140.170.98, 13.215.6.214</Text>
                <Text style={styles.fixedLine}>Reference: data.refid</Text>
                <Text style={styles.fixedLine}>Status: data.status</Text>
                <Text style={styles.fixedLine}>DONE: Succesful, Successful</Text>
                <Text style={styles.fixedLine}>NOT FINISHED: Processing, Accepted</Text>
                <Text style={styles.fixedLine}>REFUND: Failed, Refund</Text>
                <Text style={styles.help}>IIMMPACT's current transaction-webhook documentation says these callbacks do not carry a cryptographic signature. MySheba therefore does not require the payment-webhook signature here and will reject callbacks outside the allowlist.</Text>
              </View>
            : null}
          {WEBHOOK_FIELDS.map((f) => <View key={f.key}>
            <Text style={styles.label}>{f.label}</Text>
            <Text style={styles.help}>{f.hint}</Text>
            <TextInput
              style={styles.input}
              placeholder={f.placeholder}
              placeholderTextColor={colors.placeholder}
              value={String(form[f.key] ?? '')}
              onChangeText={(v) => setForm((x) => ({ ...x, [f.key]: v }))}
              secureTextEntry={f.key === 'webhookToken'}
              autoCapitalize="none"
            />
          </View>)}
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
    // These lines carried no colour at all, so they rendered in the platform
    // default against a themed sheet - black on near-black in dark mode.
    fixedLine: { fontSize: 12, lineHeight: 18, color: colors.text },
    warn: { fontSize: 12, lineHeight: 18, fontWeight: '700', color: colors.danger || colors.primary, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    secondary: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: colors.border, marginTop: 6, alignSelf: 'flex-start' },
    secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
    toggle: { padding: 12, marginVertical: 10 },
    toggleText: { color: colors.primary, fontWeight: '700' },
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    cancel: { padding: 12 },
    cancelText: { color: colors.textSecondary, fontWeight: '700' },
    save: { padding: 12, borderRadius: 9, backgroundColor: colors.primary },
    saveText: { color: colors.onPrimary, fontWeight: '800' },
  });
}
