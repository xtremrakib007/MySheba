import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import * as apiProviderService from '../firebase/apiProviderService';
import * as internetPricingService from '../firebase/internetPricingService';

// Superadmin pricing for the Bangladesh packages that arrive live from
// Success TopUp's /api/drives.
//
// The built-in package list (Admin > Internet Package Prices) is edited by
// index, which cannot work here: there is no base list, the catalogue changes
// under us, and entries are identified only by the provider's package id. So
// these overrides are keyed by that id, and the price set here is the SELL
// price in BDT.
//
// Cost stays cost. /api/recharge validates `amount` against package_id, so the
// catalogue price is what gets sent to the provider and the markup set here is
// margin. Leaving a package alone sells it at cost, which is how it behaved
// before this screen existed.
const OPERATORS = [
  { name: 'Grameenphone', code: 'GP' },
  { name: 'Robi', code: 'RB' },
  { name: 'Banglalink', code: 'BL' },
  { name: 'Airtel', code: 'AT' },
  { name: 'Teletalk', code: 'TT' },
  { name: 'Skitto', code: 'SK' },
];
const TYPES = [
  { key: 'regular', label: 'Regular' },
  { key: 'drive', label: 'Drive' },
];

export default function ApiPackagePricingCard({ service = 'Internet', title = '📦 Success TopUp Package Prices (BD)' }) {
  const [operator, setOperator] = useState(OPERATORS[0]);
  const [type, setType] = useState('regular');
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const items = await apiProviderService.listSuccessTopUpCatalogForAdmin({
        operator: operator.code, operatorName: operator.name, type, service,
      });
      setPackages(items);
    } catch (e) {
      setPackages([]);
      setError(e?.message || 'Could not load the Success TopUp catalogue.');
    } finally {
      setLoading(false);
    }
  }, [operator, type, service]);

  useEffect(() => { load(); }, [load]);

  // Each write is followed by a reload rather than a local patch, so what is
  // shown is always what the server will charge.
  const run = async (fn) => {
    setSaving(true); setError('');
    try { await fn(); await load(); setEditingId(null); setDraft(''); }
    catch (e) { setError(e?.message || 'Could not save that price.'); }
    finally { setSaving(false); }
  };

  const busy = loading || saving;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.hint}>
        Prices come live from Success TopUp. Set a price to sell above cost - the provider is still
        paid the catalogue price, so the difference is your margin. Leave a package alone to sell it at cost.
      </Text>

      <View style={styles.chipRow}>
        {OPERATORS.map((op) => (
          <TouchableOpacity
            key={op.code}
            disabled={busy}
            style={[styles.chip, operator.code === op.code && styles.chipActive, busy && styles.dim]}
            onPress={() => setOperator(op)}
          >
            <Text style={[styles.chipText, operator.code === op.code && styles.chipTextActive]}>{op.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.chipRow}>
        {TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            disabled={busy}
            style={[styles.chip, type === t.key && styles.chipActive, busy && styles.dim]}
            onPress={() => setType(t.key)}
          >
            <Text style={[styles.chipText, type === t.key && styles.chipTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!loading && <ActivityIndicator style={{ marginVertical: 12 }} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!loading && !error && packages.length === 0 && (
        <Text style={styles.hint}>No {type} packages for {operator.name}.</Text>
      )}

      {packages.map((p) => {
        const isEditing = editingId === p.id;
        return (
          <View key={p.id} style={[styles.row, p.hidden && styles.rowHidden]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name}</Text>
              <Text style={styles.meta}>
                {[p.data, p.valid, p.category].filter(Boolean).join(' • ')}
              </Text>
              <Text style={styles.meta}>
                Cost BDT {Number(p.costPrice).toFixed(2)}
                {p.overridden ? `  →  selling BDT ${Number(p.sellPrice).toFixed(2)}` : '  •  selling at cost'}
                {p.hidden ? '  •  hidden' : ''}
              </Text>
            </View>

            {isEditing ? (
              <View style={styles.editRow}>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  keyboardType="decimal-pad"
                  placeholder={String(p.costPrice)}
                  autoFocus
                />
                <TouchableOpacity
                  disabled={busy}
                  style={[styles.btn, styles.btnPrimary, busy && styles.dim]}
                  onPress={() => run(() => internetPricingService.setApiPackagePrice(operator.name, p.id, draft))}
                >
                  <Text style={styles.btnPrimaryText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} style={[styles.btn, busy && styles.dim]} onPress={() => { setEditingId(null); setDraft(''); }}>
                  <Text style={styles.btnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.editRow}>
                <TouchableOpacity
                  disabled={busy}
                  style={[styles.btn, busy && styles.dim]}
                  onPress={() => { setEditingId(p.id); setDraft(String(p.sellPrice)); }}
                >
                  <Text style={styles.btnText}>Set price</Text>
                </TouchableOpacity>
                {!!p.overridden && (
                  <TouchableOpacity
                    disabled={busy}
                    style={[styles.btn, busy && styles.dim]}
                    onPress={() => run(() => internetPricingService.clearApiPackagePrice(operator.name, p.id))}
                  >
                    <Text style={styles.btnText}>At cost</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  disabled={busy}
                  style={[styles.btn, busy && styles.dim]}
                  onPress={() => run(() => internetPricingService.setApiPackageHidden(operator.name, p.id, !p.hidden))}
                >
                  <Text style={styles.btnText}>{p.hidden ? 'Show' : 'Hide'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#d6dde5' },
  chipActive: { backgroundColor: '#0E7A79', borderColor: '#0E7A79' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#4a5a6a' },
  chipTextActive: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#eef2f6' },
  rowHidden: { opacity: 0.5 },
  name: { fontSize: 13, fontWeight: '700' },
  meta: { fontSize: 11, opacity: 0.7, marginTop: 2 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { width: 84, borderWidth: 1, borderColor: '#d6dde5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13 },
  btn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#d6dde5' },
  btnText: { fontSize: 11, fontWeight: '700', color: '#4a5a6a' },
  btnPrimary: { backgroundColor: '#0E7A79', borderColor: '#0E7A79' },
  btnPrimaryText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  error: { fontSize: 12, color: '#c0392b', marginBottom: 8 },
  dim: { opacity: 0.45 },
});
