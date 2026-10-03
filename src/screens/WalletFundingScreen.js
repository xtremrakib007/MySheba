import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import { FormLabel, FormInput, PrimaryButton } from '../components/ui';
import { showAlert } from '../utils/appAlert';
import { FUNDING_REJECT_REASONS } from '../data/rejectionReasons';
import * as fundingService from '../firebase/walletFundingService';

/**
 * Asking the wallet above yours for money, and answering the one below.
 *
 * Money reaches a customer by moving, not by appearing: finance pays the
 * customer, admin pays finance, superadmin pays admin. Nobody - superadmin
 * included - can send what they do not hold, so when the payer is short the
 * top-up that prompted it stays pending and they raise a request here. The
 * customer never resubmits; they wait and it completes.
 *
 * All three callables have existed and been tested since the chain was built.
 * Nothing rendered them, which meant finance could be short and had no way to
 * say so - the queue just stopped moving with no explanation anywhere.
 */

// Who each role asks. Mirrors FUNDS_FROM in functions/walletFundingService.js;
// the server decides, this only phrases it.
const APPROVER_FOR = { finance: 'admin', admin: 'superadmin' };

const ROLE_LABELS = { finance: 'Finance', admin: 'Admin', superadmin: 'Superadmin' };

function money(n) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function when(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
}

function statusColor(colors, status) {
  if (status === 'approved') return colors.success;
  if (status === 'rejected') return colors.error;
  return colors.warning;
}

function RequestCard({ request, children }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardName}>{request.fromName || 'Staff wallet'}</Text>
          <Text style={styles.cardMeta}>
            {`${ROLE_LABELS[request.fromRole] || request.fromRole || 'staff'} · asked ${ROLE_LABELS[request.approverRole] || request.approverRole}`}
          </Text>
        </View>
        <Text style={styles.cardAmount}>{`${request.currency} ${money(request.amount)}`}</Text>
      </View>
      {request.note ? <Text style={styles.cardNote}>{request.note}</Text> : null}
      <View style={styles.cardBottom}>
        <Text style={styles.cardDate}>{when(request.decidedAt || request.createdAt)}</Text>
        <Text style={[styles.cardStatus, { color: statusColor(colors, request.status) }]}>{request.status}</Text>
      </View>
      {request.status === 'rejected' && request.rejectReason
        ? <Text style={styles.cardReason}>{`Reason: ${request.rejectReason}`}</Text>
        : null}
      {children}
    </View>
  );
}

export default function WalletFundingScreen() {
  const { goBackOrHome, profile } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const role = profile?.role || '';
  const approver = APPROVER_FOR[role];
  const currency = profile?.walletCurrency || 'MYR';
  const balance = Number(profile?.walletBalance || 0);

  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [rejecting, setRejecting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fundingService.listWalletFundingRequests();
      setIncoming(data.incoming);
      setOutgoing(data.outgoing);
    } catch (e) {
      setError(e?.message || 'Could not load funding requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Only one request can be open at a time, so the form is hidden rather than
  // left to fail - the server refuses a second and this says why first.
  const openRequest = outgoing.find((r) => r.status === 'pending');

  const submit = useCallback(async () => {
    const value = parseFloat(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showAlert('Enter an amount', 'How much does this wallet need?');
      return;
    }
    setSubmitting(true);
    try {
      await fundingService.requestWalletFunding(amount.trim(), note.trim());
      setAmount('');
      setNote('');
      showAlert('Request sent', `${ROLE_LABELS[approver] || 'Your approver'} will see it and can approve or reject it.`);
      await load();
    } catch (e) {
      showAlert('Could not send', e?.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [amount, note, approver, load]);

  const decide = useCallback(async (request, approve, reason = '') => {
    setBusyId(request.id);
    try {
      await fundingService.decideWalletFunding(request.id, approve, reason);
      showAlert(
        approve ? 'Funded' : 'Rejected',
        approve
          ? `${request.currency} ${money(request.amount)} moved from your wallet to ${request.fromName || 'their wallet'}.`
          : 'They will see the reason you gave.'
      );
      await load();
    } catch (e) {
      showAlert('Could not complete', e?.message || 'Please try again.');
    } finally {
      setBusyId('');
    }
  }, [load]);

  const confirmApprove = useCallback((request) => {
    showAlert(
      'Fund this wallet?',
      `${request.currency} ${money(request.amount)} will move out of YOUR wallet into ${request.fromName || 'theirs'}. You hold ${currency} ${money(balance)}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Fund', onPress: () => decide(request, true) },
      ]
    );
  }, [decide, currency, balance]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wallet Funding</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }} keyboardShouldPersistTaps="handled">
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your wallet</Text>
          <Text style={styles.balanceValue}>{`${currency} ${money(balance)}`}</Text>
          <Text style={styles.balanceHint}>
            Every approval below moves money out of this wallet. Nothing is created here.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {approver ? (
          <>
            <Text style={styles.sectionTitle}>{`Ask ${ROLE_LABELS[approver]} for funds`}</Text>
            {openRequest ? (
              <View style={styles.card}>
                <Text style={styles.cardNote}>
                  {`You already have a request open for ${openRequest.currency} ${money(openRequest.amount)}. Wait for it to be decided, or ask ${ROLE_LABELS[approver]} to look at it.`}
                </Text>
              </View>
            ) : (
              <View style={styles.card}>
                <FormLabel>Amount ({currency})</FormLabel>
                <FormInput value={amount} onChangeText={setAmount} placeholder="0.00" keyboardType="decimal-pad" />
                <FormLabel>Why (optional)</FormLabel>
                <FormInput value={note} onChangeText={setNote} placeholder="e.g. four customer top-ups waiting" maxLength={500} />
                <PrimaryButton label={submitting ? "Sending…" : "Send request"} onPress={submit} disabled={submitting} />
              </View>
            )}
          </>
        ) : (
          <Text style={styles.topNote}>
            {role === 'superadmin'
              ? 'You are the top of the chain, so there is nobody to ask. Your own balance has to come from somewhere real.'
              : 'Your role does not request wallet funding.'}
          </Text>
        )}

        <Text style={styles.sectionTitle}>Requests for you to decide</Text>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : incoming.length === 0 ? (
          <View style={styles.card}><Text style={styles.empty}>Nothing waiting on you.</Text></View>
        ) : incoming.map((r) => (
          <RequestCard key={r.id} request={r}>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.rejectBtn, busyId === r.id && styles.btnBusy]}
                onPress={() => setRejecting(r)}
                disabled={busyId === r.id}
              >
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.approveBtn, busyId === r.id && styles.btnBusy]}
                onPress={() => confirmApprove(r)}
                disabled={busyId === r.id}
              >
                <Text style={styles.approveText}>{busyId === r.id ? 'Working…' : 'Fund'}</Text>
              </TouchableOpacity>
            </View>
          </RequestCard>
        ))}

        <Text style={styles.sectionTitle}>Your requests</Text>
        {loading ? null : outgoing.length === 0 ? (
          <View style={styles.card}><Text style={styles.empty}>You have not asked for funds.</Text></View>
        ) : outgoing.map((r) => <RequestCard key={r.id} request={r} />)}

        <TouchableOpacity style={styles.refreshBtn} onPress={load} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? 'Refreshing…' : '↻ Refresh'}</Text>
        </TouchableOpacity>
      </ScrollView>

      <PromptModal
        visible={!!rejecting}
        title="Why are you rejecting this?"
        placeholder="They will see this"
        maxLength={500}
        suggestions={FUNDING_REJECT_REASONS}
        onCancel={() => setRejecting(null)}
        onSubmit={(reason) => {
          const r = rejecting;
          setRejecting(null);
          if (!String(reason || '').trim()) {
            showAlert('A reason is required', 'Say why, so they know what to do next.');
            return;
          }
          if (r) decide(r, false, String(reason).trim());
        }}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    balanceCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 16 },
    balanceLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', fontWeight: '700' },
    balanceValue: { fontSize: 24, fontWeight: '800', color: colors.primary, marginTop: 4 },
    balanceHint: { fontSize: 11, color: '#888', marginTop: 8, lineHeight: 16 },
    sectionTitle: { fontSize: 11, fontWeight: '700', color: '#999', textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
    topNote: { fontSize: 12, color: '#888', lineHeight: 18, marginTop: 16 },
    error: { marginTop: 12, fontSize: 12, color: colors.error, lineHeight: 17 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 10 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardName: { fontSize: 14, fontWeight: '700', color: colors.text },
    cardMeta: { fontSize: 10, color: '#888', marginTop: 3, textTransform: 'capitalize' },
    cardAmount: { fontSize: 15, fontWeight: '800', color: colors.primary },
    cardNote: { fontSize: 12, color: colors.text, marginTop: 8, lineHeight: 17 },
    cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
    cardDate: { fontSize: 10, color: '#999' },
    cardStatus: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    cardReason: { fontSize: 11, color: colors.error, marginTop: 6, lineHeight: 16 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    rejectBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
    rejectText: { color: colors.error, fontWeight: '700', fontSize: 13 },
    approveBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.success, alignItems: 'center' },
    approveText: { color: 'white', fontWeight: '700', fontSize: 13 },
    btnBusy: { opacity: 0.5 },
    empty: { textAlign: 'center', color: '#999', fontSize: 12, paddingVertical: 10 },
    refreshBtn: { marginTop: 16, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
    refreshText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  });
}
