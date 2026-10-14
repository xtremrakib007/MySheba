import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { auth } from '../firebase/config';
import * as authService from '../firebase/authService';
import * as apiProviderService from '../firebase/apiProviderService';
import { getIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { MARKUP_SERVICES, PRICE_ROLES, applyMarkup } from '../utils/markup';
import { countries as COUNTRY_LIST } from '../data/countries';

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
const SHORT = {
  recharge: 'Recharge', internet: 'Internet', offerpacks: 'Offer Packs', entertainment: 'Games',
  billpayment: 'Bills', esim: 'eSIM', iimmpact: 'Marketplace', rechargePin: 'Vouchers',
};
const countryName = (cc) => {
  const c = COUNTRY_LIST.find((x) => x.code === cc);
  return c ? `${c.flag} ${c.name}` : cc;
};
const money = (n, currency = 'MYR') => (Number.isFinite(Number(n)) ? `${currency} ${Number(n).toFixed(2)}` : '-');

export default function MarkupSettingsCard({ pricing }) {
  const saved = pricing?.markups || {};
  const [services, setServices] = useState({});
  const [countries, setCountries] = useState([]);
  const [products, setProducts] = useState([]);
  // Set prices: [{ code, amount, roles: { customer: '4.92', retail: '4.90' } }]
  const [prices, setPrices] = useState([]);
  const [loadedFrom, setLoadedFrom] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState('');
  const [catalog, setCatalog] = useState(null);

  useEffect(() => { getIimmpactCatalog().then(setCatalog).catch(() => {}); }, []);

  // Fill the form from the saved rules once they arrive, and again only if
  // they change underneath (another device saved).
  const savedKey = JSON.stringify(saved);
  useEffect(() => {
    if (loadedFrom === savedKey) return;
    setServices(Object.fromEntries(MARKUP_SERVICES.map((s) => [s, { percent: text(saved.services?.[s]?.percent), fixed: text(saved.services?.[s]?.fixed) }])));
    setCountries(rowsOf(saved.countries));
    setProducts(rowsOf(saved.products));
    setPrices(Object.entries(saved.prices || {}).map(([key, byRole]) => {
      const [code, amount] = key.split('|');
      return { code, amount: String(Number(amount)), roles: Object.fromEntries(Object.entries(byRole || {}).map(([r, v]) => [r, String(v)])) };
    }));
    setLoadedFrom(savedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const draft = useMemo(() => {
    const next = { services: {}, countries: {}, products: {} };
    for (const s of MARKUP_SERVICES) next.services[s] = toRule(services[s] || {});
    for (const r of countries) if (r.key.trim()) next.countries[r.key.trim()] = toRule(r);
    for (const r of products) if (r.key.trim()) next.products[r.key.trim()] = toRule(r);
    next.prices = {};
    for (const r of prices) {
      const amount = Number(r.amount);
      if (!r.code || !(amount > 0)) continue;
      const byRole = {};
      for (const role of PRICE_ROLES) {
        const v = Number(r.roles?.[role]);
        if (String(r.roles?.[role] ?? '').trim() !== '' && v > 0) byRole[role] = Math.round(v * 100) / 100;
      }
      if (Object.keys(byRole).length) next.prices[`${r.code}|${amount.toFixed(2)}`] = byRole;
    }
    return next;
  }, [services, countries, products, prices]);

  const save = async () => {
    if (saving) return;
    for (const key of Object.keys(draft.countries)) {
      const [service, cc] = key.split(':');
      if (!MARKUP_SERVICES.includes(service) || !/^[A-Z]{2}$/.test(cc || '')) {
        setMessage(`"${key}" should look like recharge:NP - a service, a colon and a 2-letter country code.`);
        return;
      }
    }
    if (prices.some((r) => !(Number(r.amount) > 0))) {
      setMessage('Every set price needs the amount it is for, e.g. 5 for Digi RM5.');
      return;
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

  // A rule row: what it applies to as a label (picked, never typed), then
  // its % and RM.
  const ruleRows = (rows, setRows, labelOf) => rows.map((row, index) => (
    <View key={row.key} style={styles.ruleRow}>
      <View style={{ flex: 1 }}>{labelOf(row.key)}</View>
      <TextInput style={styles.input} value={row.percent} keyboardType="decimal-pad" placeholder="%"
        onChangeText={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, percent: v } : r)))} />
      <TextInput style={styles.input} value={row.fixed} keyboardType="decimal-pad" placeholder="RM"
        onChangeText={(v) => setRows(rows.map((r, i) => (i === index ? { ...r, fixed: v } : r)))} />
      <TouchableOpacity onPress={() => setRows(rows.filter((_, i) => i !== index))} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
    </View>
  ));
  // Adding the same target twice would make two rows with one key, and only
  // one of them could be saved; the existing row is kept instead.
  const addRule = (rows, setRows, key) => {
    if (!key || rows.some((r) => r.key === key)) return;
    setRows([...rows, { key, percent: '0', fixed: '0' }]);
  };
  const productName = (code) => {
    const p = catalog?.products?.[code] || Object.values(catalog?.products || {}).find((x) => x?.code === code);
    return (
      <Text style={styles.ruleLabel} numberOfLines={2}>
        {p?.name || code}{p?.name ? <Text style={styles.dimText}>{`\n${code}`}</Text> : null}
      </Text>
    );
  };
  const countryRuleName = (key) => {
    const [service, cc] = key.split(':');
    return <Text style={styles.ruleLabel}>{SHORT[service] || service} · {countryName(cc)}</Text>;
  };

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
      <Text style={styles.hint}>A different markup for one service in one country, e.g. Recharge in Nepal.</Text>
      {ruleRows(countries, setCountries, countryRuleName)}
      <CountryPicker onPick={(key) => addRule(countries, setCountries, key)} />

      <Text style={styles.section}>By product</Text>
      <Text style={styles.hint}>A different markup for one product - an operator, biller or voucher.</Text>
      {ruleRows(products, setProducts, productName)}
      <ProductPicker catalog={catalog} taken={products.map((r) => r.key)} onPick={(code) => addRule(products, setProducts, code)} />

      <Text style={styles.section}>Set prices by product and amount</Text>
      <Text style={styles.hint}>
        The exact price each kind of user pays, e.g. Digi RM5: Retail RM4.90, Customer RM4.92. A set price replaces every markup above for that user, and no discount is added on top. Leave a role empty to use the markup.
      </Text>
      {prices.map((row, index) => {
        const update = (patch) => setPrices(prices.map((r, i) => (i === index ? { ...r, ...patch } : r)));
        return (
          <View key={`${row.code}-${index}`} style={styles.priceBox}>
            <View style={styles.ruleRow}>
              <View style={{ flex: 1 }}>{productName(row.code)}</View>
              <Text style={styles.priceAt}>Amount</Text>
              <TextInput style={styles.input} value={row.amount} keyboardType="decimal-pad" placeholder="5" onChangeText={(v) => update({ amount: v })} />
              <TouchableOpacity onPress={() => setPrices(prices.filter((_, i) => i !== index))} style={styles.removeBtn}><Text style={styles.removeText}>✕</Text></TouchableOpacity>
            </View>
            <View style={styles.roleGrid}>
              {PRICE_ROLES.map((role) => (
                <View key={role} style={styles.roleCell}>
                  <Text style={styles.roleLabel}>{role[0].toUpperCase() + role.slice(1)}</Text>
                  <TextInput style={[styles.input, styles.roleInput]} value={row.roles?.[role] ?? ''} keyboardType="decimal-pad" placeholder="RM"
                    onChangeText={(v) => update({ roles: { ...(row.roles || {}), [role]: v } })} />
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <ProductPicker catalog={catalog} taken={[]} onPick={(code) => setPrices([...prices, { code, amount: '', roles: {} }])} />

      {needPin && (
        <TextInput style={[styles.input, styles.pinInput]} value={pin} onChangeText={setPin} placeholder="Your PIN" secureTextEntry keyboardType="number-pad" />
      )}
      {!!message && <Text style={styles.message}>{message}</Text>}
      <TouchableOpacity style={[styles.saveBtn, saving && styles.dim]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save markups</Text>}
      </TouchableOpacity>

      <CostCheck pricing={pricing} draft={draft} catalog={catalog} />
    </View>
  );
}

// What IIMMPACT really charges for one product: the catalogue's own rate
// against the cost it recorded on MySheba's recent orders.
function CostCheck({ pricing, draft, catalog }) {
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState(null);
  const [amount, setAmount] = useState('');
  const [service, setService] = useState('recharge');
  // For the preview only: a country rule (recharge:NP) applies when it is named.
  const [country, setCountry] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const matches = useMemo(() => (product ? [] : searchProducts(catalog, query)), [catalog, query, product]);

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

// Products whose name, code or category matches the search, best first.
function searchProducts(catalog, query, limit = 8) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return Object.values(catalog?.products || {})
    .filter((p) => p && p.code && [p.name, p.code, p.category].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => Number(!String(a.name || '').toLowerCase().startsWith(q)) - Number(!String(b.name || '').toLowerCase().startsWith(q)))
    .slice(0, limit);
}

// "+ Add product": search the IIMMPACT catalogue and tap a product.
function ProductPicker({ catalog, taken, onPick }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchProducts(catalog, query), [catalog, query]);
  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Text style={styles.addText}>+ Add product</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.pickerBox}>
      <TextInput style={[styles.input, styles.wide]} value={query} onChangeText={setQuery} autoFocus
        placeholder={catalog ? 'Search, e.g. Digi, Shell, TNB, Nepal' : 'Loading products...'} />
      {matches.map((p) => {
        const added = taken.includes(p.code);
        return (
          <TouchableOpacity key={p.code} style={styles.match} disabled={added}
            onPress={() => { onPick(p.code); setQuery(''); setOpen(false); }}>
            <Text style={[styles.matchText, added && styles.dim]}>
              {p.name} <Text style={styles.dimText}>({p.code}){added ? ' - already added' : ''}</Text>
            </Text>
          </TouchableOpacity>
        );
      })}
      {!!query.trim() && !!catalog && !matches.length && <Text style={styles.hint}>No product matches.</Text>}
      <TouchableOpacity onPress={() => { setOpen(false); setQuery(''); }}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// "+ Add country rule": tap a service, then a country.
function CountryPicker({ onPick }) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState('recharge');
  if (!open) {
    return (
      <TouchableOpacity onPress={() => setOpen(true)}>
        <Text style={styles.addText}>+ Add country rule</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={styles.pickerBox}>
      <Text style={styles.pickerLabel}>Service</Text>
      <View style={styles.chipRow}>
        {MARKUP_SERVICES.map((s) => (
          <TouchableOpacity key={s} onPress={() => setService(s)} style={[styles.chip, service === s && styles.chipActive]}>
            <Text style={[styles.chipText, service === s && styles.chipTextActive]}>{SHORT[s] || s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.pickerLabel}>Country</Text>
      <View style={styles.chipRow}>
        {COUNTRY_LIST.map((c) => (
          <TouchableOpacity key={c.code} style={styles.chip} onPress={() => { onPick(`${service}:${c.code}`); setOpen(false); }}>
            <Text style={styles.chipText}>{c.flag} {c.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity onPress={() => setOpen(false)}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
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
  wide: { width: '100%', marginBottom: 4 },
  pinInput: { width: '100%', marginTop: 10 },
  ruleLabel: { fontSize: 12, fontWeight: '700' },
  priceBox: { borderWidth: 1, borderColor: '#eef2f6', borderRadius: 10, padding: 8, marginVertical: 4 },
  priceAt: { fontSize: 11, fontWeight: '700', opacity: 0.6 },
  roleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  roleCell: { alignItems: 'center' },
  roleLabel: { fontSize: 10.5, fontWeight: '700', opacity: 0.7, marginBottom: 2 },
  roleInput: { width: 58 },
  pickerBox: { borderWidth: 1, borderColor: '#eef2f6', borderRadius: 10, padding: 10, marginVertical: 6 },
  pickerLabel: { fontSize: 11, fontWeight: '800', opacity: 0.6, marginTop: 2 },
  cancelText: { color: '#4a5a6a', fontWeight: '700', fontSize: 12, paddingTop: 8 },
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
