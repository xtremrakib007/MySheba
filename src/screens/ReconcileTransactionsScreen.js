import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as transactionService from '../firebase/transactionService';

/**
 * Settling transactions whose provider outcome was never confirmed.
 *
 * When a provider call fails ambiguously - a timeout, a dropped response, the
 * outage that refused every Cloud Function - walletService marks the
 * transaction `unknown` and deliberately does NOT refund or retry: an
 * ambiguous response may mean the customer already received the recharge, so
 * refunding would pay out twice and retrying would send it twice.
 *
 * That is the right call, but it left the money taken and no way to finish the
 * job. reconcileUnknownTransaction has existed since the guard was written and
 * nothing ever called it. This is the surface it was missing.
 *
 * The decision is deliberately manual: check the provider's own records first,
 * then record what actually happened. The provider reference is required so
 * the decision is auditable rather than taken on trust.
 */
export default function ReconcileTransactionsScreen() {
  const { goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reference, setReference] = useState({});
  const [busyId, setBusyId] = useState('');

  useEffect(() => {
    const unsubscribe = transactionService.subscribeUnknownTransactions(
      (list) => { setItems(list); setLoading(false); setError(''); },
      (err) => { setError(err?.message || 'Could not load uncertain transactions.'); setLoading(false); }
    );
    return unsubscribe;
  }, []);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const settle = useCallback((item, outcome) => {
    const ref = String(reference[item.id] || '').trim();
    if (!ref) {
      Alert.alert('Provider reference required', 'Check the provider first, then enter the reference or confirmation you found. It is recorded against this decision.');
      return;
    }
    const amount = Number(item.cost ?? item.pointsCharged ?? 0);
    const question = outcome === 'completed'
      ? `Mark this as DELIVERED? The customer keeps the ${amount.toFixed(2)} ${item.currency || ''} charge, so only do this if the provider shows it went through.`
      : `Mark this as FAILED and refund ${amount.toFixed(2)} ${item.currency || ''} to the customer's wallet? Only do this if the provider shows it did NOT go through.`;

    Alert.alert(
      outcome === 'completed' ? 'Confirm delivery' : 'Confirm refund',
      question,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: outcome === 'completed' ? 'Delivered' : 'Refund',
          style: outcome === 'completed' ? 'default' : 'destructive',
          onPress: async () => {
            setBusyId(item.id);
            try {
              const result = await transactionService.reconcileUnknownTransaction(item.id, outcome, ref);
              setReference((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
              Alert.alert(
                'Settled',
                result?.alreadyReconciled
                  ? 'This transaction had already been settled the same way.'
                  : outcome === 'completed' ? 'Recorded as delivered.' : 'Recorded as failed and the wallet was refunded.'
              );
            } catch (err) {
              Alert.alert('Could not settle', err?.message || 'Please try again.');
            } finally {
              setBusyId('');
            }
          },
        },
      ]
    );
  }, [reference]);

  const renderItem = ({ item }) => {
    const amount = Number(item.cost ?? item.pointsCharged ?? 0);
    const when = item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000) : null;
    const busy = busyId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={styles.service}>{item.service || item.chargedServiceKind || 'Order'}</Text>
          <Text style={styles.amount}>{amount.toFixed(2)} {item.currency || ''}</Text>
        </View>
        {!!item.details && <Text style={styles.details}>{item.details}</Text>}
        <Text style={styles.meta}>Customer {item.customerPhone || item.customerId || '—'}</Text>
        {!!when && <Text style={styles.meta}>{when.toLocaleString()}</Text>}
        {!!item.apiExecution?.error && <Text style={styles.reason}>Provider said: {item.apiExecution.error}</Text>}
        {item.apiExecution?.providerSucceeded === true && (
          <Text style={styles.hint}>The provider reported success before the failure — most likely delivered.</Text>
        )}

        <TextInput
          style={styles.input}
          placeholder="Provider reference / confirmation"
          placeholderTextColor={colors.textSecondary}
          value={reference[item.id] || ''}
          onChangeText={(v) => setReference((prev) => ({ ...prev, [item.id]: v }))}
          autoCapitalize="characters"
          editable={!busy}
        />

        {busy ? (
          <ActivityIndicator style={styles.busy} color={colors.primary} />
        ) : (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.action, styles.refund]} onPress={() => settle(item, 'failed')}>
              <Text style={styles.refundText}>Failed — refund</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.action, styles.deliver]} onPress={() => settle(item, 'completed')}>
              <Text style={styles.deliverText}>Delivered</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
        <Text style={styles.title}>Uncertain Transactions</Text>
      </LinearGradient>

      <Text style={styles.intro}>
        These were charged but the provider never confirmed the outcome. Check the provider&apos;s own records
        first, then record what actually happened — marking one wrongly either charges a customer for
        nothing or pays out for a recharge they received.
      </Text>

      {loading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.primary} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>Nothing is waiting. Every transaction has a confirmed outcome.</Text>}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { paddingTop: 44, paddingBottom: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    back: { padding: 8, marginRight: 6 },
    backText: { color: '#fff', fontSize: 22, fontWeight: '900' },
    title: { color: '#fff', fontSize: 19, fontWeight: '900' },
    intro: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    loading: { marginTop: 40 },
    error: { color: colors.error, textAlign: 'center', margin: 20, fontSize: 13 },
    list: { padding: 16, paddingBottom: 40 },
    empty: { color: colors.textSecondary, textAlign: 'center', marginTop: 50, fontSize: 13, paddingHorizontal: 30, lineHeight: 19 },
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    service: { color: colors.text, fontWeight: '900', fontSize: 15 },
    amount: { color: colors.text, fontWeight: '900', fontSize: 15 },
    details: { color: colors.text, fontSize: 13, marginTop: 6 },
    meta: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    reason: { color: colors.warning, fontSize: 12, marginTop: 8, lineHeight: 17 },
    hint: { color: colors.success, fontSize: 12, marginTop: 6, fontWeight: '700', lineHeight: 17 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, color: colors.text, fontSize: 13 },
    busy: { marginTop: 14 },
    actions: { flexDirection: 'row', marginTop: 12 },
    action: { flex: 1, paddingVertical: 12, borderRadius: 24, alignItems: 'center' },
    refund: { borderWidth: 1.5, borderColor: colors.error, marginRight: 8 },
    refundText: { color: colors.error, fontWeight: '800', fontSize: 13 },
    deliver: { backgroundColor: colors.primary, marginLeft: 8 },
    deliverText: { color: colors.onPrimary, fontWeight: '800', fontSize: 13 },
  });
}
