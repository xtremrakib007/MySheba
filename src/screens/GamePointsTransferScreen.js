import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';
import { subscribeMyGamePoints, transferGamePoints, subscribeMyGamePointsTransfers, STARTING_POINTS } from '../firebase/gamePointsService';

// Send Game Points (the play-money balance used for GameBot room games -
// see GamePointsScreen.js) directly to any other MySheba user. Unlike
// Transfer Points (real wallet money, scoped to a dealer's own pool - see
// TransferPointsScreen.js), any signed-in user can send Game Points to
// any other, so the recipient picker reuses the same free-text
// searchUsers flow AddContactScreen uses rather than a dealer-scoped
// manageable-users list. The actual balance move happens in the
// transferGamePoints Cloud Function (functions/walletService.js).
export default function GamePointsTransferScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goBackOrHome, authUser } = useApp();

  const [gamePoints, setGamePoints] = useState(null);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState([]);
  const [target, setTarget] = useState(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!authUser?.uid) return undefined;
    const unsub = subscribeMyGamePoints(authUser.uid, setGamePoints, () => {});
    return unsub;
  }, [authUser?.uid]);

  useEffect(() => {
    if (!authUser?.uid) return undefined;
    const unsub = subscribeMyGamePointsTransfers(authUser.uid, setHistory, () => {});
    return unsub;
  }, [authUser?.uid]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await contactsService.searchUsers(q);
        setResults(list.filter((u) => u.uid !== authUser?.uid));
      } catch (err) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [term, authUser?.uid]);

  const myBalance = gamePoints == null ? STARTING_POINTS : gamePoints;

  const openTransfer = (u) => {
    setTarget(u);
    setAmount('');
    setNote('');
  };

  const onSend = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await transferGamePoints({
        to: { uid: target.uid, name: target.name || target.phone || '' },
        amount,
        note,
      });
      showAlert('MySheba', `${amount} Game Points sent to ${target.name || target.phone || 'user'}.`);
      setTarget(null);
      setTerm('');
      setResults([]);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not complete this transfer.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer Game Points</Text>
      </LinearGradient>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Game Points</Text>
        <Text style={styles.balanceValue}>🎮 {myBalance}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <Text style={styles.sectionTitle}>Find someone to send to</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone number"
          value={term}
          onChangeText={setTerm}
        />
        {searching && <ActivityIndicator style={{ marginTop: 10 }} color={colors.primary} />}
        {results.map((u) => (
          <TouchableOpacity key={u.uid} style={styles.userCard} onPress={() => openTransfer(u)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{u.name || u.phone || '—'}</Text>
              <Text style={styles.userMeta}>{u.phone || ''}</Text>
            </View>
            <Text style={styles.sendChevron}>Send ›</Text>
          </TouchableOpacity>
        ))}
        {term.trim().length >= 2 && !searching && results.length === 0 && (
          <Text style={styles.emptyText}>No matching users found.</Text>
        )}

        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Recent Game Point Transfers</Text>
            {history.slice(0, 20).map((h) => {
              const sent = h.fromUid === authUser?.uid;
              return (
                <View key={h.id} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyText}>
                      {sent ? `To ${h.toName || 'user'}` : `From ${h.fromName || 'user'}`}
                    </Text>
                    {!!h.note && <Text style={styles.historyNote}>{h.note}</Text>}
                  </View>
                  <Text style={[styles.historyAmount, sent ? styles.historyOut : styles.historyIn]}>
                    {sent ? '-' : '+'}{h.amount} 🎮
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
            <TextInput
              style={styles.input}
              placeholder="Game Points amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Note (optional)"
              value={note}
              onChangeText={setNote}
            />
            <Text style={styles.modalLabel}>Your balance after: 🎮 {myBalance - (Number(amount) || 0)}</Text>
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
    balanceCard: { margin: 16, marginBottom: 0, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16 },
    balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
    balanceValue: { color: 'white', fontSize: 22, fontWeight: '700', marginTop: 4 },
    sectionTitle: { fontSize: 12, fontWeight: '700', color: '#999', marginBottom: 8, marginTop: 4, textTransform: 'uppercase' },
    searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, fontSize: 13, color: colors.text },
    userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10, gap: 10 },
    userName: { fontSize: 14, fontWeight: '600', color: colors.text },
    userMeta: { fontSize: 12, color: '#999', marginTop: 2 },
    sendChevron: { fontSize: 12, fontWeight: '700', color: colors.primary },
    emptyText: { textAlign: 'center', color: '#999', marginTop: 20 },
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
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, fontSize: 13 },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    modalCancel: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    modalCancelText: { color: '#999', fontWeight: '600' },
    modalConfirm: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: 10 },
    modalConfirmText: { color: 'white', fontWeight: '700' },
  });
}
