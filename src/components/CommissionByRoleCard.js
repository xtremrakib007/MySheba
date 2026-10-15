import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { auth } from '../firebase/config';
import * as authService from '../firebase/authService';
import * as apiProviderService from '../firebase/apiProviderService';

// Superadmin: who earns commission, and how much, per role.
//
// Commission used to be one value per service for everyone, so a customer
// earned exactly what a retailer did. These rules (commissionRules.byRole,
// functions/commissionService.js) are per role: an empty box uses the general
// rule, except for a customer, who earns nothing unless a value is set here.
const ROLES = ['customer', 'retail', 'reseller', 'dealer', 'admin'];
const SERVICES = [
  { key: 'recharge', label: 'Recharge', type: 'percent', unit: '%' },
  { key: 'internet', label: 'Internet', type: 'percent', unit: '%' },
  { key: 'billpayment', label: 'Bill', type: 'fixed', unit: 'RM' },
];
const DEFAULT_RULES = {
  recharge: { type: 'fixed', value: 0 },
  internet: { type: 'fixed', value: 0 },
  billTiers: [{ minAmount: 10, maxAmount: 50, fee: 0.1 }, { minAmount: 50.01, maxAmount: null, fee: 0.2 }],
  remittanceTiers: [{ minAmount: 1, maxAmount: 999, fee: 10 }, { minAmount: 1000, maxAmount: 1999, fee: 15 }, { minAmount: 2000, maxAmount: null, fee: 20 }],
  touchNGoFeePercent: 0.5,
};

const toForm = (byRole) => Object.fromEntries(ROLES.map((role) => [role, Object.fromEntries(SERVICES.map((s) => {
  const r = byRole?.[role]?.[s.key];
  return [s.key, r && r.value !== undefined ? String(r.value) : ''];
}))]));

export default function CommissionByRoleCard({ pricing }) {
  const saved = pricing?.commissionRules || {};
  const savedKey = JSON.stringify(saved.byRole || {});
  const [form, setForm] = useState(() => toForm(saved.byRole));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(toForm(saved.byRole)); }, [savedKey]);

  const general = (key) => {
    const r = key === 'billpayment' ? null : saved[key];
    if (key === 'billpayment') return 'bill tiers';
    if (!r) return '0';
    return r.type === 'percent' ? `${r.value}%` : `RM${Number(r.value || 0).toFixed(2)}`;
  };

  const save = async () => {
    if (saving) return;
    const byRole = {};
    for (const role of ROLES) {
      for (const s of SERVICES) {
        const raw = String(form[role]?.[s.key] ?? '').trim();
        if (raw === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || (s.type === 'percent' && value > 100)) {
          setMessage(`${role} ${s.label}: enter a number${s.type === 'percent' ? ' from 0 to 100' : ' of 0 or more'}.`);
          return;
        }
        byRole[role] = { ...(byRole[role] || {}), [s.key]: { type: s.type, value } };
      }
    }
    setSaving(true); setMessage('');
    try {
      if (needPin) {
        await authService.reauthenticate(pin);
        await auth.currentUser?.getIdToken(true);
      }
      await apiProviderService.saveCommissionRules({ ...DEFAULT_RULES, ...saved, byRole });
      setNeedPin(false); setPin('');
      setMessage('Saved. New commissions apply to the next order.');
    } catch (e) {
      const msg = String(e?.message || 'Could not save commissions.');
      if (/recent authentication/i.test(msg)) { setNeedPin(true); setMessage('For your security, enter your PIN and tap Save again.'); }
      else setMessage(msg);
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🤝 Commission by role</Text>
      <Text style={styles.hint}>
        What each kind of user earns back on an order. Recharge and Internet are a % of the amount; Bill is RM per bill.
        Leave a box empty to use the general rule ({general('recharge')} recharge, {general('internet')} internet, {general('billpayment')}).
        Customers earn nothing unless you enter a value for them.
      </Text>
      <View style={styles.headRow}>
        <Text style={[styles.head, { flex: 1 }]}>Role</Text>
        {SERVICES.map((s) => <Text key={s.key} style={[styles.head, styles.col]}>{s.label} ({s.unit})</Text>)}
      </View>
      {ROLES.map((role) => (
        <View key={role} style={styles.row}>
          <Text style={styles.role}>{role[0].toUpperCase() + role.slice(1)}</Text>
          {SERVICES.map((s) => (
            <TextInput key={s.key} style={[styles.input, styles.col]} keyboardType="decimal-pad"
              value={form[role]?.[s.key] ?? ''} placeholder={role === 'customer' ? '0' : '-'}
              onChangeText={(v) => setForm((f) => ({ ...f, [role]: { ...f[role], [s.key]: v } }))} />
          ))}
        </View>
      ))}
      {!!needPin && <TextInput style={[styles.input, styles.pin]} value={pin} onChangeText={setPin} placeholder="Your PIN" secureTextEntry keyboardType="number-pad" />}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <TouchableOpacity style={[styles.save, saving && styles.dim]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save commissions</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginBottom: 8 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  head: { fontSize: 10.5, fontWeight: '800', opacity: 0.6 },
  col: { width: 74, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  role: { flex: 1, fontSize: 13, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#d6dde5', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 6, fontSize: 13 },
  pin: { width: '100%', marginTop: 10 },
  message: { fontSize: 12, color: '#8a6d00', marginTop: 8 },
  save: { backgroundColor: '#0E7A79', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontWeight: '800' },
  dim: { opacity: 0.5 },
});
