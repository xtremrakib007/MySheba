import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import {
  INVOICE_KINDS, invoiceKindLabel, createInvoice, approveInvoice, rejectInvoice, listInvoices,
} from '../firebase/invoiceService';

/**
 * Invoices for money put into the business and money paid out to providers.
 *
 * The screen is built around the thing the record is for: every row names who
 * raised it and who approved it, with the moment each happened. A row that only
 * said "approved" would answer nothing anybody asks of a payment later.
 *
 * The approve and reject buttons are hidden on an invoice you raised yourself,
 * and the reason is shown in their place. The server refuses it either way -
 * that rule lives in functions/invoiceRules.js and is enforced inside the
 * transaction - but a button that exists only to produce an error is worse than
 * no button, and saying why is better than either.
 */

const FILTERS = [{ key: '', label: 'All' }, ...INVOICE_KINDS];

const STATUS_COLOURS = { pending: '#F59E0B', approved: '#059669', rejected: '#DC2626' };

function when(millis) {
  if (!millis) return '';
  const d = new Date(millis);
  if (Number.isNaN(d.getTime())) return '';
  // Date AND time: "approved on the 3rd" is not an audit trail.
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return (currency || '') + ' ' + n.toFixed(2);
}

export default function InvoicesScreen() {
  const { colors, brandGradient } = useTheme();
  const { goBackOrHome, profile, can } = useApp();
  const styles = createStyles(colors);

  const [filter, setFilter] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ kind: 'providerPayment', party: '', amount: '', currency: 'MYR', reference: '', notes: '' });
  const [saving, setSaving] = useState(false);

  // Raising and deciding both need finance; reports can read the history.
  const mayDecide = typeof can === 'function' ? can('finance') : false;
  const myUid = profile?.uid || profile?.id || '';

  const load = useCallback(async () => {
    setLoading(true);
    try { setInvoices(await listInvoices({ kind: filter })); }
    catch (error) { showAlert('Invoices', error?.message || 'Could not load the invoices.'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await createInvoice(form);
      setForm({ kind: form.kind, party: '', amount: '', currency: form.currency, reference: '', notes: '' });
      setShowForm(false);
      await load();
    } catch (error) {
      // The server's own words: it names the field that is wrong.
      showAlert('Invoices', error?.message || 'Could not raise the invoice.');
    } finally { setSaving(false); }
  };

  const decide = async (invoice, approved) => {
    if (busyId) return;
    const act = async (note) => {
      setBusyId(invoice.id);
      try {
        if (approved) await approveInvoice(invoice.id, note);
        else await rejectInvoice(invoice.id, note);
        await load();
      } catch (error) { showAlert('Invoices', error?.message || 'Could not record the decision.'); }
      finally { setBusyId(''); }
    };
    if (approved) return act('');
    // A rejection has to say why - the server refuses one without a reason, so
    // the screen collects it rather than letting the call fail.
    showAlert('Reject invoice', 'Rejecting ' + invoice.number + '. A reason is required and is kept on the record.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: () => act('Rejected by ' + (profile?.name || 'finance')) },
    ]);
  };

  const renderItem = ({ item }) => {
    const mine = myUid && item.createdBy === myUid;
    const pending = item.status === 'pending';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.number}>{item.number}</Text>
          <Text style={[styles.status, { color: STATUS_COLOURS[item.status] || colors.text }]}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.party}>{item.party}</Text>
        <Text style={styles.kind}>{invoiceKindLabel(item.kind)}{item.reference ? '  ·  ' + item.reference : ''}</Text>
        <Text style={styles.amount}>{money(item.amount, item.currency)}</Text>
        {!!item.notes && <Text style={styles.notes}>{item.notes}</Text>}

        {/* The two names. Both always shown, so an invoice nobody has approved
            reads as unapproved rather than as merely missing a line. */}
        <View style={styles.trail}>
          <Text style={styles.trailLine}>
            <Text style={styles.trailLabel}>Raised by </Text>
            {item.createdByName || item.createdBy || 'unknown'}
            {item.createdByRole ? ' (' + item.createdByRole + ')' : ''}
            {item.createdAt ? ' · ' + when(item.createdAt) : ''}
          </Text>
          <Text style={styles.trailLine}>
            <Text style={styles.trailLabel}>{item.status === 'rejected' ? 'Rejected by ' : 'Approved by '}</Text>
            {item.approvedByName || item.approvedBy
              ? (item.approvedByName || item.approvedBy)
                + (item.approvedByRole ? ' (' + item.approvedByRole + ')' : '')
                + (item.approvedAt ? ' · ' + when(item.approvedAt) : '')
              : 'nobody yet'}
          </Text>
          {!!item.decisionNote && <Text style={styles.trailNote}>{item.decisionNote}</Text>}
        </View>

        {pending && mayDecide && (mine ? (
          <Text style={styles.selfNote}>
            You raised this one, so somebody else in finance has to approve it.
          </Text>
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity disabled={!!busyId} style={[styles.btn, styles.reject]} onPress={() => decide(item, false)}>
              <Text style={styles.rejectText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={!!busyId} style={[styles.btn, styles.approve]} onPress={() => decide(item, true)}>
              <Text style={styles.approveText}>{busyId === item.id ? '…' : 'Approve'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>🧾 Invoices</Text>
      </LinearGradient>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f.key || 'all'} style={[styles.chip, filter === f.key && styles.chipOn]} onPress={() => setFilter(f.key)}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!mayDecide && (
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowForm((v) => !v)}>
          <Text style={styles.newBtnText}>{showForm ? 'Cancel' : '+ Raise an invoice'}</Text>
        </TouchableOpacity>
      )}

      {!!showForm && (
        <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.kindRow}>
            {INVOICE_KINDS.map((k) => (
              <TouchableOpacity key={k.key} style={[styles.kindBtn, form.kind === k.key && styles.kindBtnOn]} onPress={() => setForm((f) => ({ ...f, kind: k.key }))}>
                <Text style={[styles.kindBtnText, form.kind === k.key && styles.kindBtnTextOn]}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>{form.kind === 'investment' ? 'Investor' : 'Paid to'}</Text>
          <TextInput style={styles.input} value={form.party} onChangeText={(v) => setForm((f) => ({ ...f, party: v }))} placeholder={form.kind === 'investment' ? 'Who put the money in' : 'e.g. iimmpact'} placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Amount</Text>
          <View style={styles.amountRow}>
            <TextInput style={[styles.input, styles.currency]} value={form.currency} autoCapitalize="characters" maxLength={3} onChangeText={(v) => setForm((f) => ({ ...f, currency: v }))} />
            <TextInput style={[styles.input, styles.amountInput]} value={form.amount} keyboardType="decimal-pad" onChangeText={(v) => setForm((f) => ({ ...f, amount: v }))} placeholder="0.00" placeholderTextColor={colors.textLight} />
          </View>
          <Text style={styles.label}>Reference (optional)</Text>
          <TextInput style={styles.input} value={form.reference} onChangeText={(v) => setForm((f) => ({ ...f, reference: v }))} placeholder="Their invoice or receipt number" placeholderTextColor={colors.textLight} />
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput style={[styles.input, styles.notesInput]} value={form.notes} multiline onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))} />
          <TouchableOpacity style={styles.save} disabled={saving} onPress={submit}>
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Raise invoice'}</Text>
          </TouchableOpacity>
          <Text style={styles.formNote}>
            It is recorded against your name and waits for somebody else in finance to approve it.
          </Text>
        </ScrollView>
      )}

      {loading ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : (
        <FlatList
          data={invoices}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No invoices yet.</Text>}
        />
      )}
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: 44, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  backBtn: { padding: 4 },
  backText: { color: '#fff', fontSize: 24 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  filters: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  newBtn: { marginHorizontal: 12, marginBottom: 8, padding: 12, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center' },
  newBtnText: { color: colors.primary, fontWeight: '700' },
  form: { maxHeight: 420, marginHorizontal: 12, marginBottom: 8, padding: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  kindBtn: { flex: 1, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  kindBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindBtnText: { color: colors.text, fontSize: 13 },
  kindBtnTextOn: { color: '#fff', fontWeight: '700' },
  label: { color: colors.textLight, fontSize: 12, marginBottom: 4, marginTop: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: 10, color: colors.text, backgroundColor: colors.background },
  amountRow: { flexDirection: 'row', gap: 8 },
  currency: { width: 80, textAlign: 'center' },
  amountInput: { flex: 1 },
  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  save: { marginTop: 12, padding: 13, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700' },
  formNote: { color: colors.textLight, fontSize: 11, marginTop: 8, marginBottom: 4 },
  list: { padding: 12, paddingTop: 0, gap: 10 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  number: { color: colors.text, fontWeight: '700', fontSize: 15 },
  status: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  party: { color: colors.text, fontSize: 16, marginTop: 6 },
  kind: { color: colors.textLight, fontSize: 12, marginTop: 2 },
  amount: { color: colors.text, fontSize: 20, fontWeight: '700', marginTop: 8 },
  notes: { color: colors.textLight, fontSize: 12, marginTop: 6 },
  trail: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 3 },
  trailLine: { color: colors.text, fontSize: 12 },
  trailLabel: { color: colors.textLight },
  trailNote: { color: colors.textLight, fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  selfNote: { color: colors.textLight, fontSize: 12, marginTop: 10, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, padding: 11, borderRadius: radius.sm, alignItems: 'center' },
  approve: { backgroundColor: '#059669' },
  approveText: { color: '#fff', fontWeight: '700' },
  reject: { borderWidth: 1, borderColor: '#DC2626' },
  rejectText: { color: '#DC2626', fontWeight: '700' },
  loader: { marginTop: 30 },
  empty: { color: colors.textLight, textAlign: 'center', marginTop: 40 },
});
