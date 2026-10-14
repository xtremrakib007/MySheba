import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, StyleSheet } from 'react-native';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// Superadmin: the wallet-funding compliance switch (settings/walletCompliance).
//
// Customer wallet top-ups are refused by the server ("Wallet funding is not
// enabled for public use") until BOTH flags are on: accepting public money
// into a stored-value wallet in Malaysia is regulated e-money (Bank Negara
// Malaysia), so the business confirms an approved setup - its own approval
// or a licensed wallet partner - before turning deposits on. The server check
// (functions/walletComplianceService.js) is unchanged; this only lets the
// superadmin set the flags it reads, which firestore.rules already allows.
const POLICY_VERSION = 'MY-LAUNCH-WALLET-COMPLIANCE-1.0';
const REF = () => doc(db, 'settings', 'walletCompliance');

export default function WalletFundingSwitchCard() {
  const [policy, setPolicy] = useState({ partnerConfigured: false, publicFundingEnabled: false, p2pEnabled: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => onSnapshot(REF(), (snap) => {
    const d = snap.exists() ? snap.data() || {} : {};
    setPolicy({
      partnerConfigured: d.partnerConfigured === true,
      publicFundingEnabled: d.publicFundingEnabled === true,
      p2pEnabled: d.p2pEnabled !== false,
    });
  }, () => {}), []);

  const write = async (patch) => {
    setSaving(true);
    try {
      await setDoc(REF(), {
        policyVersion: POLICY_VERSION,
        partnerConfigured: policy.partnerConfigured,
        publicFundingEnabled: policy.publicFundingEnabled,
        p2pEnabled: policy.p2pEnabled,
        ...patch,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid || '',
      });
    } catch (e) {
      Alert.alert('Wallet funding', e?.message || 'Could not save this setting.');
    } finally {
      setSaving(false);
    }
  };

  // Turning a flag ON asks for confirmation; turning it OFF never does.
  const toggle = (key, title, body) => (next) => {
    if (!next) { write({ [key]: false }); return; }
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => write({ [key]: true }) },
    ]);
  };

  const open = policy.partnerConfigured && policy.publicFundingEnabled;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🏦 Customer wallet top-ups</Text>
      <Text style={[styles.status, { color: open ? '#1b7f3b' : '#b3261e' }]}>
        {open ? 'ON - customers can submit top-up requests.' : 'OFF - customers see "Wallet funding is not enabled for public use".'}
      </Text>
      <Text style={styles.hint}>
        Accepting money from the public into the MySheba wallet is regulated e-money in Malaysia (Bank Negara
        Malaysia). Turn these on only once your approved setup - your own approval or a licensed wallet
        partner - is in place. Both must be on.
      </Text>

      <View style={styles.row}>
        <Text style={styles.label}>Approved wallet partner / legal setup in place</Text>
        <Switch
          value={policy.partnerConfigured}
          disabled={saving}
          onValueChange={toggle('partnerConfigured', 'Confirm approved setup',
            'Confirm that MySheba has the required approval (or a licensed wallet partner) to accept customer funds in Malaysia.')}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Allow customer top-up requests</Text>
        <Switch
          value={policy.publicFundingEnabled}
          disabled={saving}
          onValueChange={toggle('publicFundingEnabled', 'Turn on customer top-ups',
            'Customers will be able to submit top-up requests and admins can approve them. Continue?')}
        />
      </View>
      <TouchableOpacity disabled={saving || !open} onPress={() => write({ partnerConfigured: false, publicFundingEnabled: false })}>
        <Text style={[styles.off, (!open || saving) && styles.dim]}>Turn customer top-ups off</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  status: { fontSize: 12.5, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  label: { flex: 1, fontSize: 13, fontWeight: '600' },
  off: { color: '#b3261e', fontWeight: '800', fontSize: 12.5, paddingTop: 8 },
  dim: { opacity: 0.4 },
});
