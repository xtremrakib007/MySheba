import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { subscribeManageableUsers } from '../firebase/userManagementService';
import { transferPoints, subscribeMyTransfers } from '../firebase/pointTransferService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

function fmt(n) {
  return `MYR ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TransferPointsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, profile, authUser, pricing, requireSecurityPin } = useApp();
  const myRole = profile?.role;
  const myBalance = typeof profile?.walletBalance === 'number' ? profile.walletBalance : 0;
  const isDealerTier = myRole === 'dealer' || myRole === 'dealer';
  const dealerEarningPercent = Number(pricing?.dealerEarningPercent) || 0;
  // Same pool every role already sees on the User Management screen:
  // dealer/dealer -> their customer pool, admin -> dealers,
  // superadmin -> admins + dealers. That's exactly who firestore.rules
  // trusts this tier to write to, so it's the right recipient list here too.
  const dealerScope = myRole === 'dealer' ? authUser?.uid : profile?.dealerId;

  const [users, setUsers] = useState([]);
  const [history, setHistory] = useState([]);
  const [target, setTarget] = useState(null); // user object being sent to
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  // Gate the whole screen behind the security PIN on entry (see
  // requireSecurityPin() in AppContext.js), same as NotepadScreen /
  // MyDocumentsScreen - cancelling backs out to Home instead of showing
  // balances, recipients, or transfer history. Runs once per mount, not
  // per re-render, so re-opening Transfer Points later asks again.
  useEffect(() => {
    let cancelled = false;
    requireSecurityPin('opening Transfer Points')
      .then(() => { if (!cancelled) setUnlocked(true); })
      .catch(() => { if (!cancelled) goBackOrHome(); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const isAdminTier = myRole === 'admin' || myRole === 'superadmin';
    if (!unlocked || (!isAdminTier && !dealerScope)) return undefined;
    const unsub = subscribeManageableUsers(myRole, dealerScope, setUsers, () => {});
    return unsub;
  }, [myRole, dealerScope, unlocked]);

  useEffect(() => {
    if (!authUser?.uid || !unlocked) return undefined;
    const unsub = subscribeMyTransfers(authUser.uid, setHistory, () => {});
    return unsub;
  }, [authUser?.uid, unlocked]);

  const recipients = useMemo(() => users.filter((u) => u.id !== profile?.uid), [users, profile]);

  // Dealer/dealer sending to one of their own customers earns a bonus
  // on top - see pointTransferService.transferPoints(). Preview it here so
  // it's not a surprise after sending.
  const earningPreview = isDealerTier && target?.role === 'customer'
    ? Math.round((Number(amount) || 0) * (dealerEarningPercent / 100) * 100) / 100
    : 0;

  const openTransfer = (u) => {
    setTarget(u);
    setAmount('');
    setNote('');
  };

  // No separate PIN prompt here - the whole screen is already gated on
  // entry above, matching Notepad's single-gate-on-entry model rather
  // than re-asking for every send.
  const onSend = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await transferPoints({
        to: { uid: target.id, name: target.name || target.phone || '', role: target.role },
        amount,
        note,
      });
      showAlert('MySheba', `${fmt(amount)} sent to ${target.name || target.phone || 'user'}.`);
      setTarget(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not complete this transfer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer Points</Text>
      </LinearGradient>

      {!unlocked ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
      <>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your balance</Text>
        <Text style={styles.balanceValue}>{fmt(myBalance)}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Text style={styles.sectionTitle}>Send to</Text>
        {recipients.map((u) => (
          <TouchableOpacity key={u.id} style={styles.userCard} onPress={() => openTransfer(u)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name || u.phone || '—'}</Text>
              <Text style={styles.userMeta}>
                {ROLE_LABEL[u.role] || u.role} · {fmt(u.walletBalance)}
              </Text>
            </View>
            <Text style={styles.sendChevron}>Send ›</Text>
          </TouchableOpacity>
        ))}
        {recipients.length === 0 && <Text style={styles.emptyText}>No one in your pool yet.</Text>}

        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Transfers</Text>
            {history.slice(0, 20).map((h) => {
              const sent = h.fromUid === authUser?.uid;
              return (
                <View key={h.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyText}>
                      {sent ? `To ${h.toName || 'user'}` : `From ${h.fromName || 'user'}`}
                    </Text>
                    {!!h.note && <Text style={styles.historyNote}>{h.note}</Text>}
                    {sent && !!h.dealerEarning && (
                      <Text style={styles.earningText}>+ {fmt(h.dealerEarning)} earning ({h.dealerEarningPercent}%)</Text>
                    )}
                  </View>
                  <Text style={[styles.historyAmount, sent ? styles.historyOut : styles.historyIn]}>
                    {sent ? '-' : '+'}{fmt(h.amount)}
                  </Text>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Modal visible={!!target} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Send to {target?.name || target?.phone || 'User'}</Text>
            <Text style={styles.modalLabel}>Their balance: {fmt(target?.walletBalance)}</Text>
            <TextInput
              style={styles.input}
              placeholder="Amount (MYR)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              value={note}
              onChangeText={setNote}
            />
            <Text style={styles.modalLabel}>Your balance after: {fmt(myBalance - (Number(amount) || 0) + earningPreview)}</Text>
            {earningPreview > 0 && (
              <Text style={styles.earningText}>You'll earn {fmt(earningPreview)} ({dealerEarningPercent}%) on this transfer</Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setTarget(null)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={onSend} disabled={busy}>
                <Text style={styles.modalConfirmText}>{busy ? 'Sending…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    balanceCard: { margin: 16, marginBottom: 0, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16 },
    balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
    balanceValue: { color: 'white', fontSize: 22, fontWeight: '700', marginTop: 4 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
    userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10, gap: 10 },
    userName: { fontSize: 14, fontWeight: '600', color: colors.text },
    userMeta: { fontSize: 12, color: '#999', marginTop: 2 },
    sendChevron: { fontSize: 12, fontWeight: '700', color: colors.primary },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 30 },
    historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    historyText: { fontSize: 13, fontWeight: '600', color: colors.text },
    historyNote: { fontSize: 11, color: '#999', marginTop: 2 },
    historyAmount: { fontSize: 13, fontWeight: '700' },
    historyOut: { color: colors.error },
    historyIn: { color: colors.success },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
    modalLabel: { fontSize: 12, color: '#999', marginBottom: 8 },
    earningText: { fontSize: 12, color: colors.success, fontWeight: '600', marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, fontSize: 13 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    modalCancel: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    modalCancelText: { color: '#999', fontWeight: '600' },
    modalConfirm: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: 10 },
    modalConfirmText: { color: 'white', fontWeight: '700' },
  });
}
