import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { auth } from '../firebase/config';
import * as authService from '../firebase/authService';
import * as apiProviderService from '../firebase/apiProviderService';
import { getIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { MARKUP_SERVICES, applyMarkup } from '../utils/markup';

// MySheba's markup on top of the provider's price, set from the superadmin
// app - the same rules the web dashboard's Pricing > Markups edits, saved
// through the same savePricingSettings callable.
//
//   price = provider price x (1 + percent/100) + fixed
//
// A product rule beats a country rule (service:CC), which beats the service
// rule. Below the rules, a cost check shows what IIMMPACT really charges
// MySheba for a product, so the markup can be set against cost rather than
// against IIMMPACT's selling rate.
const LABELS = {
  recharge: 'Mobile Recharge (incl. International)',
  internet: 'Internet Packages',
  offerpacks: 'Offer Packs',
  entertainment: 'Entertainment / Games',
  billpayment: 'Bill Payment (incl. International)',
  esim: 'eSIM',
  iimmpact: 'Marketplace (All Products)',
  rechargePin: 'PIN Generator / Vouchers',
};

const text = (v) => (v === undefined || v === null ? '0' : String(v));
const toRule = (row) => ({ percent: Number(row.percent) || 0, fixed: Number(row.fixed) || 0 });
const rowsOf = (rules) => Object.entries(rules || {}).map(([key, r]) => ({ key, percent: text(r?.percent), fixed: text(r?.fixed) }));
const money = (n, currency = 'MYR') => (Number.isFinite(Number(n)) ? `${currency} ${Number(n).toFixed(2)}` : '-');

export default function MarkupSettingsCard({ pricing }) {
  const saved = pricing?.markups || {};
  const [services, setServices] = useState({});
  const [countries, setCountries] = useState([]);
  const [products, setProducts] = useState([]);
  const [loadedFrom, setLoadedFrom] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');

  // Fill the form from the saved rules once they arrive, and again only if
  // they change underneath (another device saved).
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (loadedFrom === savedKey) return;
    setServices(Object.fromEntries(MARKUP_SERVICES.map((s) => [s, { percent: text(saved.services?.[s]?.percent), fixed: text(saved.services?.[s]?.fixed) }])));
    setCountries(rowsOf(saved.countries));
    setProducts(rowsOf(saved.products));
    setLoadedFrom(savedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const draft = useMemo(() => {
    const next = { services: {}, countries: {}, products: {} };
    for (const s of MARKUP_SERVICES) next.services[s] = toRule(services[s] || {});
    for (const r of countries) if (r.key.trim()) next.countries[r.key.trim()] = toRule(r);
    for (const r of products) if (r.key.trim()) next.products[r.key.trim()] = toRule(r);
    return next;
  }, [services, countries, products]);

  const save = async () => {
    if (saving) return;
    for (const key of Object.keys(draft.countries)) {
      const [service, cc] = key.split(':');
      if (!MARKUP_SERVICES.includes(service) || !/^[A-Z]{2}$/.test(cc || '')) {
        setMessage(`"${key}" should look like recharge:NP - a service, a colon and a 2-letter country code.`);
        return;
      }
    }
    setSaving(true); setMessage('');
    try {
      if (needPin) {
        // Pricing changes need a sign-in from the last 15 minutes.
        await authService.reauthenticate(pin);
        await auth.currentUser?.getIdToken(true);
      }
      await apiProviderService.saveMarkups(draft);
      setNeedPin(false); setPin('');
      setMessage('Saved. New prices apply to the next purchase.');
    } catch (e) {
      const msg = String(e?.message || 'Could not save markups.');
      if (/recent authentication/i.test(msg)) {
        setNeedPin(true);
        setMessage('For your security, enter your PIN and tap Save again.');
      } else {
        setMessage(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const ruleRows = (rows, setRows, placeholder) => (
    <View>
      {rows.map((row, index) => (
        <View key={index} style={styles.ruleRow}>
          <TextInput style={[styles.input, styles.keyInput]} value={row.key} placeholder={placeholder} autoCapitalize="none"
            onChangeText={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, key: v.trim() } : r)))} />
          <TextInput style={styles.input} value={row.percent} keyboardType="decimal-pad" placeholder="%"
            onChangeText={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, percent: v } : r)))} />
          <TextInput style={styles.input} value={row.fixed} keyboardType="decimal-pad" placeholder="RM"
            onChangeText={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, fixed: v } : r)))} />
          <TouchableOpacity onPress={() => setRows(rows.filter((_, i) => i !== index))} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={() => setRows([...rows, { key: '', percent: '0', fixed: '0' }])}>
        <Text style={styles.addText}>+ Add rule</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>💹 MySheba Markup</Text>
      <Text style={styles.hint}>
        Added on top of the provider&apos;s price: price × (1 + %/100) + RM. A product rule beats a country rule, which beats the service rule. 0 and 0 adds nothing.
      </Text>

      <View style={styles.headRow}>
        <Text style={[styles.headText, { flex: 1 }]}>Service</Text>
        <Text style={[styles.headText, styles.colHead]}>%</Text>
        <Text style={[styles.headText, styles.colHead]}>RM</Text>
      </View>
      {MARKUP_SERVICES.map((s) => (
        <View key={s} style={styles.ruleRow}>
          <Text style={styles.serviceLabel}>{LABELS[s] || s}</Text>
          <TextInput style={styles.input} value={services[s]?.percent ?? '0'} keyboardType="decimal-pad"
            onChangeText={(v) => setServices((x) => ({ ...x, [s]: { ...(x[s] || {}), percent: v } }))} />
          <TextInput style={styles.input} value={services[s]?.fixed ?? '0'} keyboardType="decimal-pad"
            onChangeText={(v) => setServices((x) => ({ ...x, [s]: { ...(x[s] || {}), fixed: v } }))} />
        </View>
      ))}

      <Text style={styles.section}>By country</Text>
      <Text style={styles.hint}>e.g. recharge:NP for Nepal reloads, billpayment:ID for Indonesian bills.</Text>
      {ruleRows(countries, setCountries, 'recharge:NP')}

      <Text style={styles.section}>By product code</Text>
      <Text style={styles.hint}>The IIMMPACT product code - see the cost check below.</Text>
      {ruleRows(products, setProducts, 'Product code')}

      {needPin && (
        <TextInput style={[styles.input, styles.pinInput]} value={pin} onChangeText={setPin} placeholder="Your PIN" secureTextEntry keyboardType="number-pad" />
      )}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <TouchableOpacity style={[styles.saveBtn, saving && styles.dim]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save markups</Text>}
      </TouchableOpacity>

      <CostCheck pricing={pricing} draft={draft} />
    </View>
  );
}

// What IIMMPACT really charges for one product: the catalogue's own rate
// against the cost it recorded on MySheba's recent orders.
function CostCheck({ pricing, draft }) {
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const [amount, setAmount] = useState('');
  const [service, setService] = useState('recharge');
  // For the preview only: a country rule (recharge:NP) applies when it is named.
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { getIimmpactCatalog().then(setCatalog).catch(() => {}); }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || product) return [];
    return Object.values(catalog?.products || {})
      .filter((p) => p && (String(p.name || '').toLowerCase().includes(q) || String(p.code || '').toLowerCase().includes(q)))
      .slice(0, 8);
  }, [catalog, query, product]);

  const check = async () => {
    if (!product || busy) return;
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await apiProviderService.getIimmpactCostCheck({ productCode: product.code, amount: Number(amount) || 0 }));
    } catch (e) {
      setError(e?.message || 'Could not check this product.');
    } finally {
      setBusy(false);
    }
  };

  // The customer's price with the rules as they stand in the form, saved or not.
  const customer = result?.salePrice
    ? applyMarkup({ ...pricing, markups: draft }, { service, country, productCode: result.productCode, amount: result.salePrice })
    : null;
  const margin = customer && result?.estimatedCost !== null && result?.estimatedCost !== undefined ? customer.amount - result.estimatedCost : null;
  const currency = result?.currency || 'MYR';

  return (
    <View style={styles.costBox}>
      <Text style={styles.section}>🔍 IIMMPACT cost check</Text>
      <Text style={styles.hint}>
        The catalogue only gives IIMMPACT&apos;s selling rate. Their real cost comes back with each order, and MySheba records it - so after one order of a product, this shows what it really costs.
      </Text>
      <TextInput style={[styles.input, styles.wide]} value={product ? `${product.name} (${product.code})` : query}
        onChangeText={(v) => { setProduct(null); setResult(null); setQuery(v); }} placeholder="Search product, e.g. Nepal" />
      {matches.map((p) => (
        <TouchableOpacity key={p.code} style={styles.match} onPress={() => { setProduct(p); setQuery(''); }}>
          <Text style={styles.matchText}>{p.name} <Text style={styles.dimText}>({p.code})</Text></Text>
        </TouchableOpacity>
      ))}
      <View style={styles.ruleRow}>
        <TextInput style={[styles.input, { flex: 1 }]} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
          placeholder={`Amount${product?.denomination_currency ? ` (${product.denomination_currency})` : ''}`} />
        <TouchableOpacity style={[styles.saveBtn, styles.checkBtn, (!product || busy) && styles.dim]} onPress={check} disabled={!product || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Check</Text>}
        </TouchableOpacity>
      </View>
      <View style={styles.chipRow}>
        <TextInput style={[styles.input, { width: 72 }]} value={country} onChangeText={(v) => setCountry(v.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2))} placeholder="NP" autoCapitalize="characters" />
        {['recharge', 'billpayment', 'iimmpact'].map((s) => (
          <TouchableOpacity key={s} onPress={() => setService(s)} style={[styles.chip, service === s && styles.chipActive]}>
            <Text style={[styles.chipText, service === s && styles.chipTextActive]}>{s === 'recharge' ? 'Reload' : s === 'billpayment' ? 'Bill' : 'Marketplace'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!!error && <Text style={styles.message}>{error}</Text>}
      {!!result && (
        <View>
          <Line label="Catalogue rate" value={result.catalogue?.denominationUnitPrice ? `1 ${currency} = MYR ${result.catalogue.denominationUnitPrice}` : 'MYR product'} />
          {!!result.catalogue?.pricing && <Line label="IIMMPACT adjustment" value={JSON.stringify(result.catalogue.pricing)} />}
          {result.catalogue?.cost !== null && result.catalogue?.cost !== undefined && <Line label="Cost in catalogue" value={String(typeof result.catalogue.cost === 'object' ? JSON.stringify(result.catalogue.cost) : result.catalogue.cost)} />}
          {result.salePrice !== null && <Line label={`IIMMPACT selling price (${currency} ${result.face})`} value={money(result.salePrice)} />}
          {!!customer && <Line label="Customer pays (with markup)" value={money(customer.amount)} strong />}
          <Line label="Real cost rate (median, recent orders)" value={result.medianRate ? `1 ${currency} = MYR ${result.medianRate}` : 'No orders recorded yet'} />
          {result.estimatedCost !== null && <Line label="Expected IIMMPACT cost" value={money(result.estimatedCost)} strong />}
          {margin !== null && <Line label="Expected MySheba margin" value={money(margin)} strong warn={margin < 0} />}
          {result.recent?.length > 0 && <Text style={styles.section}>Recent orders</Text>}
          {(result.recent || []).map((row, i) => (
            <Text key={i} style={styles.recentText}>
              {new Date(row.at).toLocaleDateString()} · {currency} {row.face} → cost MYR {row.cost} (rate {row.rate.toFixed(6)})
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Line({ label, value, strong, warn }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong, warn && styles.warn]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  hint: { fontSize: 12, opacity: 0.7, lineHeight: 18, marginBottom: 8 },
  section: { fontSize: 13, fontWeight: '800', marginTop: 14, marginBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  headText: { fontSize: 11, fontWeight: '800', opacity: 0.6 },
  colHead: { width: 64, textAlign: 'center' },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  serviceLabel: { flex: 1, fontSize: 12, fontWeight: '600' },
  input: { width: 64, borderWidth: 1, borderColor: '#d6dde5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13 },
  keyInput: { flex: 1, width: undefined },
  wide: { width: '100%', marginBottom: 4 },
  pinInput: { width: '100%', marginTop: 10 },
  removeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  removeText: { color: '#c0392b', fontWeight: '800' },
  addText: { color: '#0E7A79', fontWeight: '800', fontSize: 12, paddingVertical: 6 },
  message: { fontSize: 12, color: '#8a6d00', marginTop: 8 },
  saveBtn: { backgroundColor: '#0E7A79', borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginTop: 10 },
  checkBtn: { marginTop: 0, paddingHorizontal: 18 },
  saveText: { color: '#fff', fontWeight: '800' },
  dim: { opacity: 0.5 },
  costBox: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f6', paddingTop: 4 },
  match: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  matchText: { fontSize: 13, fontWeight: '600' },
  dimText: { opacity: 0.6, fontWeight: '400' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: '#d6dde5' },
  chipActive: { backgroundColor: '#0E7A79', borderColor: '#0E7A79' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#4a5a6a' },
  chipTextActive: { color: '#fff' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#f3f5f8' },
  lineLabel: { flex: 1, fontSize: 12, opacity: 0.75 },
  lineValue: { fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  strong: { fontWeight: '800' },
  warn: { color: '#c0392b' },
  recentText: { fontSize: 11, opacity: 0.75, paddingVertical: 2 },
});
