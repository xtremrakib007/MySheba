import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { auth } from '../firebase/config';
import * as authService from '../firebase/authService';
import * as apiProviderService from '../firebase/apiProviderService';
import { getIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { commissionProductGroups } from '../utils/commissionProducts';

// Superadmin: who earns commission, and how much, per role.
//
// Commission used to be one value per service for everyone, so a customer
// earned exactly what a retailer did. These rules (commissionRules.byRole,
// functions/commissionService.js) are per role: an empty box uses the general
// rule, except for a customer, who earns nothing unless a value is set here.
const ROLES = ['customer', 'retail', 'reseller', 'dealer', 'admin'];
const SHORT_ROLE = { customer: 'Cust', retail: 'Retail', reseller: 'Resell', dealer: 'Dealer', admin: 'Admin' };
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

// commissionRules.products: { DI: { retail: { type, value }, ... } } as rows
// [{ code, type, roles: { retail: '1.5' } }]; one type per product.
const toProductRows = (products) => Object.entries(products || {}).map(([code, byRole]) => {
  const rules = Object.values(byRole || {});
  return {
    code,
    type: rules[0]?.type === 'fixed' ? 'fixed' : 'percent',
    roles: Object.fromEntries(Object.entries(byRole || {}).map(([r, rule]) => [r, String(rule?.value ?? '')])),
  };
});

const toForm = (byRole) => Object.fromEntries(ROLES.map((role) => [role, Object.fromEntries(SERVICES.map((s) => {
  const r = byRole?.[role]?.[s.key];
  return [s.key, r && r.value !== undefined ? String(r.value) : ''];
}))]));

export default function CommissionByRoleCard({ pricing }) {
  const saved = pricing?.commissionRules || {};
  const savedKey = JSON.stringify([saved.byRole || {}, saved.products || {}]);
  const [form, setForm] = useState(() => toForm(saved.byRole));
  const [productRows, setProductRows] = useState(() => toProductRows(saved.products));
  const [catalog, setCatalog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setForm(toForm(saved.byRole)); setProductRows(toProductRows(saved.products)); }, [savedKey]);
  useEffect(() => { getIimmpactCatalog().then(setCatalog).catch(() => {}); }, []);

  const productName = (code) => {
    const p = catalog?.products?.[code] || Object.values(catalog?.products || {}).find((x) => x?.code === code);
    return p?.name ? `${p.name} (${code})` : code;
  };
  // Every product in the catalogue, by category, each with its own boxes - a
  // product with no row yet gets one the moment a box is typed in.
  const rowFor = (code) => productRows.find((r) => r.code === code) || { code, type: 'percent', roles: {} };
  const setRow = (code, patch) => setProductRows((rows) => {
    const existing = rows.find((r) => r.code === code);
    if (existing) return rows.map((r) => (r.code === code ? { ...r, ...patch } : r));
    return [...rows, { code, type: 'percent', roles: {}, ...patch }];
  });
  const [filter, setFilter] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const isSet = (code) => Object.values(rowFor(code).roles || {}).some((v) => String(v ?? '').trim() !== '');
  const groups = useMemo(
    () => commissionProductGroups(catalog, productRows.filter((r) => isSet(r.code)).map((r) => r.code), filter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog, productRows, filter],
  );

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
    const products = {};
    for (const row of productRows) {
      for (const role of ROLES) {
        const raw = String(row.roles?.[role] ?? '').trim();
        if (raw === '') continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0 || (row.type === 'percent' && value > 100)) {
          setMessage(`${productName(row.code)} ${role}: enter a number${row.type === 'percent' ? ' from 0 to 100' : ' of 0 or more'}.`);
          return;
        }
        products[row.code] = { ...(products[row.code] || {}), [role]: { type: row.type, value } };
      }
    }
    setSaving(true); setMessage('');
    try {
      if (needPin) {
        await authService.reauthenticate(pin);
        await auth.currentUser?.getIdToken(true);
      }
      await apiProviderService.saveCommissionRules({ ...DEFAULT_RULES, ...saved, byRole, products });
      setNeedPin(false); setPin('');
      setMessage('Saved. New commissions apply to the next order.');
    } catch (e) {
      const msg = String(e?.message || 'Could not save commissions.');
      if (/recent authentication/i.test(msg)) { setNeedPin(true); setMessage('For your security, enter the password you sign in with (not your transaction PIN) and tap Save again.'); }
      else setMessage(msg);
    } finally { setSaving(false); }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>🤝 Commission by role & product</Text>
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

      <Text style={styles.section}>By product / operator</Text>
      <Text style={styles.hint}>
        Every product, by category: tap a category to open it. A value here beats the table above for that product, for Reload, Internet,
        Bill and Vouchers. Vouchers earn commission only from this list. Leave a role empty to use the table above.
      </Text>
      <TextInput style={[styles.input, styles.search]} value={filter} onChangeText={setFilter}
        placeholder={catalog ? 'Filter, e.g. Digi, Shell, TNB, Nepal' : 'Loading products...'} />
      {groups.map(({ label: category, items: list }) => {
        const open = !!filter.trim() || !!openGroups[category];
        const setCount = list.filter((p) => isSet(p.code)).length;
        return (
          <View key={category} style={styles.group}>
            <TouchableOpacity style={styles.groupHead} onPress={() => setOpenGroups((g) => ({ ...g, [category]: !g[category] }))}>
              <Text style={styles.groupTitle}>{open ? '▾' : '▸'} {category}</Text>
              <Text style={styles.groupCount}>{list.length} products{setCount ? ` · ${setCount} set` : ''}</Text>
            </TouchableOpacity>
            {open && list.map((p) => {
              const row = rowFor(p.code);
              return (
                <View key={p.code} style={[styles.productBox, isSet(p.code) && styles.productSet]}>
                  <View style={styles.productHead}>
                    <Text style={styles.productName} numberOfLines={2}>{p.name} <Text style={styles.code}>({p.code})</Text></Text>
                    {['percent', 'fixed'].map((t) => (
                      <TouchableOpacity key={t} onPress={() => setRow(p.code, { type: t })} style={[styles.chip, row.type === t && styles.chipActive]}>
                        <Text style={[styles.chipText, row.type === t && styles.chipTextActive]}>{t === 'percent' ? '%' : 'RM'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.roleLine}>
                    {ROLES.map((role) => (
                      <View key={role} style={styles.roleCellSmall}>
                        <Text style={styles.roleSmall}>{SHORT_ROLE[role]}</Text>
                        <TextInput style={[styles.input, styles.inputSmall]} keyboardType="decimal-pad" value={row.roles?.[role] ?? ''} placeholder="-"
                          onChangeText={(v) => setRow(p.code, { roles: { ...row.roles, [role]: v } })} />
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
      {!!catalog && !groups.length && <Text style={styles.hint}>No product matches.</Text>}

      {!!needPin && <TextInput style={[styles.input, styles.pin]} value={pin} onChangeText={setPin} placeholder="Your login password" secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" autoComplete="password" />}
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
  section: { fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 4 },
  productBox: { borderWidth: 1, borderColor: '#eef2f6', borderRadius: 10, padding: 10, marginBottom: 8 },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productName: { flex: 1, fontSize: 13, fontWeight: '700' },
  chip: { borderWidth: 1, borderColor: '#d6dde5', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipActive: { backgroundColor: '#0E7A79', borderColor: '#0E7A79' },
  chipText: { fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  roleLine: { flexDirection: 'row', gap: 4, marginTop: 6 },
  roleCellSmall: { flex: 1 },
  inputSmall: { paddingHorizontal: 4, paddingVertical: 5, fontSize: 12, textAlign: 'center' },
  search: { width: '100%', marginBottom: 6 },
  group: { borderTopWidth: 1, borderTopColor: '#eef2f6' },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  groupTitle: { fontSize: 13.5, fontWeight: '800' },
  groupCount: { fontSize: 11, opacity: 0.6 },
  productSet: { borderColor: '#0E7A79' },
  code: { fontSize: 11, fontWeight: '400', opacity: 0.6 },
  roleSmall: { fontSize: 10.5, fontWeight: '700', opacity: 0.6, marginBottom: 2 },
});
