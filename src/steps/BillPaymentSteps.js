import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import CountrySelectCard from '../components/CountrySelectCard';
import { FormLabel, FormInput, Grid3, OperatorCard, SummaryCard } from '../components/ui';
import { getBillerBrand } from '../data/billerBrand';
import ServiceArt, { hasServiceArt } from '../components/ServiceArt';
import PhotoTileIcon, { hasPhotoTileIcon, photoIconFor } from '../components/PhotoTileIcon';
import { useTheme } from '../theme/ThemeContext';
import { presentmentRequest, presentmentKey } from '../utils/billPresentmentInputs';
import * as apiProviderService from '../firebase/apiProviderService';
import ServiceInterruptionNotice from '../components/ServiceInterruptionNotice';
import { useNetworkStatus } from '../components/useNetworkStatus';
import { BILLERS, BILL_CATEGORIES as CATEGORIES } from '../data/billers';
import { useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { billCategories } from '../components/iimmpactTiles';
import { billForm, fieldValue, accountStepError, amountStepError, optionAmount } from '../utils/iimmpactBillForm';
import DenominationGrid from '../components/DenominationGrid';
import { denominationItems } from '../utils/denominations';

/** Billers for a country and category, every entry in { name, amount } form. */
function billersFor(country, category) {
  return (BILLERS[country]?.[category] || [])
    .map((b) => (typeof b === 'string' ? { name: b } : b));
}

/** The fixed amount for the chosen biller, or null when it takes any amount. */
function fixedAmountFor(serviceData) {
  const match = billersFor(serviceData.country, serviceData.category)
    .find((b) => b.name === serviceData.provider);
  return match && match.amount != null ? match.amount : null;
}


// Only the categories the chosen country actually bills for. Malaysia has no
// gas biller and Bangladesh no Astro, and offering either led to a category
// that could only answer "no biller is configured for this yet".
function categoriesFor(country, catalogBills = []) {
  // Malaysia's bills are IIMMPACT's: its categories and every biller it sells,
  // each carrying its product code. The list below is what other countries
  // use. There is no built-in fallback for Malaysia any more: a biller IIMMPACT
  // does not list cannot be paid through it, so the old fixed list only led to
  // refused orders. Until the catalogue loads the step says so.
  if (country === 'MY') return catalogBills;
  // JomPAY and Touch 'n Go have dedicated homepage tiles. Keep their
  // internal biller mappings for those seeded flows, but don't duplicate them
  // inside the general Bill Payment category picker. Tax/JomPAY likewise
  // remains reachable only through the dedicated JomPAY entry point.
  const dedicatedHomepageCategories = new Set(['ewallet', 'jompay', 'tax']);
  return CATEGORIES.filter((c) =>
    !dedicatedHomepageCategories.has(c.key) && billersFor(country, c.key).length > 0
  );
}

// The category row draws its own card rather than borrowing OperatorCard:
// it wants one big circled line icon, not a logo-or-initials badge.
function CategoryCard({ item, selected, onPress }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[cardStyles.card, { borderColor: selected ? colors.primary : `${colors.primary}55`, backgroundColor: colors.card }]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {/* The picture this category has, if it has one, and the drawing
          otherwise - the same order the grids use, so one category added
          without artwork still shows something rather than nothing. */}
      {(hasPhotoTileIcon(item.art) ? item.art : photoIconFor(item.art))
        ? <PhotoTileIcon art={hasPhotoTileIcon(item.art) ? item.art : photoIconFor(item.art)} size={38} />
        : hasServiceArt(item.art)
          ? <ServiceArt name={item.art} size={38} color={colors.primary} />
          : null}
      <Text style={[cardStyles.label, { color: colors.text }]} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );
}

/** An identity number as a receipt should show it: the last four, nothing else. */
function maskId(value) {
  const id = String(value || '').trim();
  if (!id) return '';
  return id.length <= 4 ? id : `${'\u2022'.repeat(Math.min(8, id.length - 4))}${id.slice(-4)}`;
}

const noneStyles = StyleSheet.create({
  none: { fontSize: 13, lineHeight: 19, opacity: 0.75, paddingVertical: 10 },
  fixed: { fontSize: 15, fontWeight: '700', paddingVertical: 10 },
});

const cardStyles = StyleSheet.create({
  card: { width: '30%', minHeight: 104, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 10 },
  label: { fontSize: 11.5, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});

/**
 * The bill behind the account number, as the provider reads it.
 *
 * Only ever advisory. One answer stops the payment - the provider saying the
 * account is not theirs - and it is stored on serviceData so validateStep can
 * refuse to move on. Everything else, a biller that does not support this, a
 * provider that is down, a reply nobody has seen before, shows nothing and
 * changes nothing: somebody paying their electricity bill should not be stopped
 * because a read-only extra went quiet.
 */
function BillDetails({ bill, loading }) {
  const { colors } = useTheme();
  if (loading) return <Text style={[billStyles.note, { color: colors.textSecondary }]}>Checking this account…</Text>;
  if (!bill) return null;
  if (bill.blocking) return <Text style={[billStyles.error, { color: colors.danger || colors.primary }]}>{bill.message}</Text>;
  if (!bill.fields || !bill.fields.length) return null;
  return (
    <View style={[billStyles.card, { borderColor: `${colors.primary}44`, backgroundColor: colors.surface }]}>
      <Text style={[billStyles.title, { color: colors.text }]}>Bill details</Text>
      {bill.fields.map((f) => (
        <View key={f.key} style={billStyles.row}>
          <Text style={[billStyles.label, { color: colors.textSecondary }]}>{f.label}</Text>
          <Text style={[billStyles.value, { color: colors.text }]}>{f.value}</Text>
        </View>
      ))}
    </View>
  );
}

const billStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 12, marginBottom: 4, gap: 7 },
  title: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  label: { fontSize: 12.5, flexShrink: 0 },
  value: { fontSize: 12.5, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 12.5, paddingVertical: 8 },
  error: { fontSize: 13, fontWeight: '700', paddingVertical: 8, lineHeight: 19 },
});

export default function BillPaymentStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();

  // Every hook before the first `return`, without exception. The sidebar once
  // shipped a crash because one sat below an early return, and this component
  // is all early returns.
  const { catalog, loading: catalogLoading } = useIimmpactCatalog({ enabled: serviceData.country === 'MY' });
  const catalogBills = useMemo(() => billCategories(catalog), [catalog]);
  const [bill, setBill] = useState(null);
  const [billLoading, setBillLoading] = useState(false);
  const askedFor = useRef('');
  const request = presentmentRequest(serviceData);
  const requestKey = presentmentKey(request);
  const onBillSteps = step === 3 || step === 4;
  const storedBlock = String(serviceData.billPresentmentBlock || '');
  const fixedAmount = fixedAmountFor(serviceData);
  const typedAmount = Number(serviceData.amount);
  // Advisory only, and it is not wired into validateStep by design: an
  // interruption must not stop somebody paying a bill they owe.
  const interruption = useNetworkStatus({
    service: 'Bill Payment',
    country: serviceData.country,
    provider: serviceData.provider,
    active: onBillSteps,
  });
  useEffect(() => {
    let alive = true;
    if (!onBillSteps || !requestKey) {
      // The account was cleared or changed to something incomplete. A verdict
      // on the old one must not go on blocking the new one.
      askedFor.current = '';
      if (storedBlock) updateServiceData({ billPresentmentBlock: '' });
      if (bill) setBill(null);
      return () => { alive = false; };
    }
    if (askedFor.current === requestKey) return () => { alive = false; };
    askedFor.current = requestKey;
    setBillLoading(true);
    setBill(null);
    if (storedBlock) updateServiceData({ billPresentmentBlock: '' });
    apiProviderService.getBillPresentment(request)
      .then((result) => {
        if (!alive) return;
        setBill(result);
        if (result.blocking) {
          updateServiceData({ billPresentmentBlock: result.message || 'That account number was not recognised.' });
          return;
        }
        // Offered, not imposed: the figure comes from the provider's own
        // reading of this bill, it lands in a field the customer can see and
        // change, and it never overwrites one they have already filled in or
        // one the voucher fixed.
        if (result.outstanding && fixedAmount == null && !(Number.isFinite(typedAmount) && typedAmount > 0)) {
          updateServiceData({ amount: result.outstanding });
        }
      })
      .finally(() => { if (alive) setBillLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, onBillSteps]);

  // International Bills lists countries abroad only; Malaysian bills are
  // the Bills group's own tiles.
  if (step === 0) return <View><FormLabel>Select Country</FormLabel><Grid3>{(serviceData.internationalOnly ? countries.filter((c) => c.code !== 'MY') : countries).map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, category: null, provider: null, accountNumber: '', mobileNumber: '', amount: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 1) {
    const cats = categoriesFor(serviceData.country, catalogBills);
    return <View><FormLabel>Select Bill Category</FormLabel>{cats.length
      ? <Grid3>{cats.map((item) => <CategoryCard key={item.key} item={item} selected={serviceData.category === item.key} onPress={() => { updateServiceData({ category: item.key, provider: null }); nextStep(); }} />)}</Grid3>
      : <Text style={noneStyles.none}>{serviceData.country === 'MY' && catalogLoading ? 'Loading MySheba catalogue…' : 'No bills can be paid for this country yet. Go back and pick another.'}</Text>}</View>;
  }
  if (step === 2) {
    const fromCatalog = String(serviceData.category || '').startsWith('iimmpact:');
    const providers = fromCatalog
      ? (catalogBills.find((c) => c.key === serviceData.category)?.billers || [])
      : billersFor(serviceData.country, serviceData.category);
    // A catalogue biller carries IIMMPACT's product code into the order, so the
    // server charges that exact product instead of matching the biller's name.
    // A built-in biller clears any code left from an earlier choice.
    return <View><FormLabel>Select Provider</FormLabel>{providers.length
      ? <Grid3>{providers.map((b) => { const brand = getBillerBrand(b.name); const logo = brand.logo || (b.imageUrl ? { uri: b.imageUrl } : null); return <OperatorCard key={b.code || b.name} name={b.name} logo={logo} color={brand.color} initials={brand.initials} selected={serviceData.provider === b.name} onPress={() => { const product = b.code ? catalog?.products?.[b.code] : null; updateServiceData({ provider: b.name, operatorCode: b.code || '', productCode: b.code || '', productName: b.code ? b.name : '', amount: b.amount != null ? b.amount : null, iimmpactFields: Array.isArray(product?.fields) ? product.fields : [], iimmpactFulfillment: product?.fulfillment || null, fieldValues: {}, selectedOptions: {} }); nextStep(); }} />; })}</Grid3>
      : <Text style={noneStyles.none}>{fromCatalog && catalogLoading ? 'Loading MySheba catalogue…' : 'No biller is configured for this country and category yet.'}</Text>}</View>;
  }
  if (step === 3) {
    // JomPAY asks for what is printed on the bill - Biller Code, Ref-1, and
    // Ref-2 where that biller uses one - plus the payer's IC or passport.
    //
    // The IC is not ours to make optional: JomPAY transactions fall under
    // Malaysia's AMLA and the provider requires a verified number, with
    // account suspension as the stated penalty for sending a made-up one. It
    // is asked for here rather than defaulted from the profile precisely so
    // that the person paying confirms whose number it is.
    if (['jompay', 'tax'].includes(serviceData.category)) {
      return <View>
        <JompayBillerField serviceData={serviceData} updateServiceData={updateServiceData} />
        <FormLabel>Ref-1 (account / bill number)</FormLabel>
        <FormInput placeholder='As printed on your bill' autoCapitalize='characters' value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} />
        <FormLabel>Ref-2 (only if your bill shows one)</FormLabel>
        <FormInput placeholder='Leave empty if not shown' autoCapitalize='characters' value={serviceData.ref2 || ''} onChangeText={(v) => updateServiceData({ ref2: v })} />
        <FormLabel>IC / Passport Number of the payer</FormLabel>
        <FormInput placeholder='e.g. 941123045001' autoCapitalize='characters' value={serviceData.icNumber || ''} onChangeText={(v) => updateServiceData({ icNumber: v.replace(/[^A-Za-z0-9]/g, '').slice(0, 20) })} />
        <ServiceInterruptionNotice notice={interruption} />
        <BillDetails bill={bill} loading={billLoading} />
      </View>;
    }
    const form = billForm(serviceData);
    if (form.active) {
      // An IIMMPACT biller: the account box under the biller's own label, then
      // every other field the biller asks for, in its order.
      const account = form.account || {};
      return <View>
        <FormLabel>{(account.label || 'Bill / Account Number') + ' *'}</FormLabel>
        <FormInput placeholder={account.placeholder || 'Bill / account number'} keyboardType={keyboardFor(account)} autoCapitalize='characters' value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} />
        {form.extra.map((field) => <BillField key={String(field.id)} field={field} serviceData={serviceData} updateServiceData={updateServiceData} />)}
        <ServiceInterruptionNotice notice={interruption} />
        <BillDetails bill={bill} loading={billLoading} />
      </View>;
    }
    return <View><FormLabel>{serviceData.category === 'ewallet' ? 'Mobile number registered to the wallet' : 'Enter Bill / Account Number'}</FormLabel><FormInput placeholder={serviceData.category === 'ewallet' ? 'e.g. 0123456789' : 'Bill / account number'} keyboardType={serviceData.category === 'ewallet' ? 'phone-pad' : 'default'} autoCapitalize={serviceData.category === 'ewallet' ? 'none' : 'characters'} value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} />{serviceData.country === 'BD' && <><FormLabel>Bangladesh Mobile Number</FormLabel><FormInput placeholder='01XXXXXXXXX' keyboardType='phone-pad' value={serviceData.mobileNumber || ''} onChangeText={(v) => updateServiceData({ mobileNumber: v.replace(/\D/g, '').slice(0, 11) })} /></>}<ServiceInterruptionNotice notice={interruption} /><BillDetails bill={bill} loading={billLoading} /></View>;
  }
  if (step === 4) {
    const fixed = fixedAmountFor(serviceData);
    const cur = serviceData.currency || 'MYR';
    const amountField = billForm(serviceData).amount;
    return <View>
      {amountField && amountField.type === 'select'
        ? <><FormLabel>{(amountField.label || 'Amount') + ' *'}</FormLabel><BillField field={amountField} serviceData={serviceData} updateServiceData={updateServiceData} asAmount /></>
        : fixed != null
        ? <><FormLabel>Amount</FormLabel><Text style={noneStyles.fixed}>{cur} {Number(fixed).toFixed(2)} - set by the voucher you chose</Text></>
        : <><FormLabel>{amountField?.label ? `${amountField.label} (${cur})` : `Enter Amount (${cur})`}</FormLabel><FormInput placeholder='Amount' keyboardType='decimal-pad' value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} /></>}
      <ServiceInterruptionNotice notice={interruption} />
      <BillDetails bill={bill} loading={billLoading} />
      <SummaryCard rows={serviceData.category === 'jompay'
        ? [
            { label: 'Biller Code', value: serviceData.jompayBillerName ? `${serviceData.billerCode} · ${serviceData.jompayBillerName}` : (serviceData.billerCode || '') },
            { label: 'Ref-1', value: serviceData.accountNumber || '' },
            ...(String(serviceData.ref2 || '').trim() ? [{ label: 'Ref-2', value: serviceData.ref2 }] : []),
            // Last four only. The full number goes to the provider because
            // AMLA requires it; it does not need to sit on screen in a shop.
            { label: 'IC / Passport', value: maskId(serviceData.icNumber) },
          ]
        : [{ label: 'Provider', value: serviceData.provider || '' }, { label: 'Account', value: serviceData.accountNumber || '' }]} totalLabel='Bill amount' totalValue={`${cur} ${Number(serviceData.amount || 0).toFixed(2)}`} />
    </View>;
  }
  return null;
}

/**
 * The JomPAY biller code, checked against JomPAY's own directory as it is
 * typed: the biller's name when the code is known, a warning when it is not,
 * and nothing when the directory cannot be reached (a valid code is never
 * doubted for want of a list). A name search fills the code in for somebody
 * who has the biller's name but not the code.
 */
function JompayBillerField({ serviceData, updateServiceData }) {
  const { colors } = useTheme();
  const code = String(serviceData.billerCode || '');
  const [checking, setChecking] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    let alive = true;
    if (!/^\d{4,6}$/.test(code)) {
      if (serviceData.jompayBillerName || serviceData.jompayBillerUnknown) updateServiceData({ jompayBillerName: '', jompayBillerUnknown: false, jompayBillerMin: null, jompayBillerMax: null });
      return () => { alive = false; };
    }
    setChecking(true);
    const timer = setTimeout(() => {
      apiProviderService.lookupJompayBiller(code)
        .then((answer) => {
          if (!alive) return;
          if (!answer.available) updateServiceData({ jompayBillerName: '', jompayBillerUnknown: false });
          else updateServiceData({ jompayBillerName: answer.biller?.name || '', jompayBillerUnknown: !answer.biller, jompayBillerMin: answer.biller?.min ?? null, jompayBillerMax: answer.biller?.max ?? null });
        })
        .catch(() => { if (alive) updateServiceData({ jompayBillerName: '', jompayBillerUnknown: false }); })
        .finally(() => { if (alive) setChecking(false); });
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  useEffect(() => {
    let alive = true;
    if (query.trim().length < 2) { setResults([]); return () => { alive = false; }; }
    const timer = setTimeout(() => {
      apiProviderService.searchJompayBillers(query)
        .then((answer) => { if (alive) setResults(answer.results || []); })
        .catch(() => { if (alive) setResults([]); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);
  return <View>
    <FormLabel>JomPAY Biller Code</FormLabel>
    <FormInput placeholder='e.g. 818625' keyboardType='number-pad' value={code} onChangeText={(v) => updateServiceData({ billerCode: v.replace(/\D/g, '').slice(0, 6) })} />
    {checking && <Text style={[jompayStyles.note, { color: colors.textSecondary }]}>Checking biller…</Text>}
    {!checking && !!serviceData.jompayBillerName && <Text style={[jompayStyles.note, { color: colors.success }]}>✓ {serviceData.jompayBillerName}</Text>}
    {!checking && !!serviceData.jompayBillerUnknown && <Text style={[jompayStyles.note, { color: colors.error }]}>No JomPAY biller has this code. Check the code on your bill.</Text>}
    <FormLabel>Don't know the code? Find the biller</FormLabel>
    <FormInput placeholder='Biller name, e.g. Syabas' value={query} onChangeText={setQuery} autoCapitalize='none' />
    {results.map((b) => (
      <TouchableOpacity key={b.code} onPress={() => { updateServiceData({ billerCode: b.code, jompayBillerName: b.name, jompayBillerUnknown: false, jompayBillerMin: b.min ?? null, jompayBillerMax: b.max ?? null }); setQuery(''); setResults([]); }} style={[jompayStyles.result, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Text style={[jompayStyles.resultName, { color: colors.text }]} numberOfLines={2}>{b.name}</Text>
        <Text style={[jompayStyles.resultCode, { color: colors.textSecondary }]}>{b.code}</Text>
      </TouchableOpacity>
    ))}
  </View>;
}

const jompayStyles = StyleSheet.create({
  note: { fontSize: 12.5, fontWeight: '700', marginTop: -4, marginBottom: 8 },
  result: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6, gap: 10 },
  resultName: { flex: 1, fontSize: 13, fontWeight: '700' },
  resultCode: { fontSize: 12, fontWeight: '700' },
});

function keyboardFor(field) {
  const mode = String(field?.input_mode || '').toLowerCase();
  if (mode === 'decimal' || field?.type === 'money') return 'decimal-pad';
  if (mode === 'numeric' || field?.type === 'number') return 'number-pad';
  if (mode === 'tel') return 'phone-pad';
  if (mode === 'email') return 'email-address';
  return 'default';
}

/**
 * One field an IIMMPACT biller asks for. A list field loads its choices from
 * IIMMPACT (kept on the device like every other option list) once the fields
 * it depends on are filled; as the amount, a choice also sets the amount.
 */
function BillField({ field, serviceData, updateServiceData, asAmount = false }) {
  const { colors } = useTheme();
  const id = String(field.id);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const source = field.data_source || {};
  const deps = Array.isArray(source.depends_on) ? source.depends_on.map(String) : [];
  const accountId = String(serviceData?.iimmpactFulfillment?.account?.from_field || '');
  const valueOf = (fieldId) => (fieldId === accountId ? serviceData.accountNumber : fieldValue(serviceData, fieldId));
  const text = (v) => (v && typeof v === 'object' ? String(v.code || v.account_number || v.value || '') : String(v ?? ''));
  const param = (spec) => {
    if (!spec || typeof spec !== 'object') return '';
    if (spec.static !== undefined) return String(spec.static);
    return spec.from_field ? text(valueOf(String(spec.from_field))) : '';
  };
  const ready = deps.every((dep) => text(valueOf(dep)).trim());
  const depKey = deps.map((dep) => text(valueOf(dep))).join('|');
  useEffect(() => {
    let alive = true;
    if (field.type !== 'select' || !ready) { setOptions([]); return () => { alive = false; }; }
    const params = source.params || {};
    setLoading(true);
    apiProviderService.getIimmpactOptions({
      productCode: param(params.product_code) || serviceData.productCode,
      fieldId: param(params.field_id) || id,
      accountNumber: param(params.account_number),
      billerCode: param(params.biller_code),
      service: 'Bill Payment',
      country: serviceData.country || 'MY',
      limit: source.type === 'reference' ? 25000 : 100,
    })
      .then((data) => { if (alive) setOptions(Array.isArray(data?.items) ? data.items : []); })
      .catch(() => { if (alive) setOptions([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceData.productCode, id, depKey, ready]);

  if (field.type !== 'select') {
    return <View>
      <FormLabel>{(field.label || field.name || id) + (field.required ? ' *' : '')}</FormLabel>
      <FormInput placeholder={field.placeholder || ''} keyboardType={keyboardFor(field)} autoCapitalize='characters' value={String(serviceData.fieldValues?.[id] ?? '')} onChangeText={(v) => updateServiceData({ fieldValues: { ...(serviceData.fieldValues || {}), [id]: v } })} />
    </View>;
  }
  const chosen = serviceData.selectedOptions?.[id];
  const choose = (option) => updateServiceData({
    selectedOptions: { ...(serviceData.selectedOptions || {}), [id]: option },
    ...(asAmount ? { amount: optionAmount(option), package: String(option.label || option.description || option.code || '') } : {}),
  });
  return <View>
    {!asAmount && <FormLabel>{(field.label || field.name || id) + (field.required ? ' *' : '')}</FormLabel>}
    {!ready && <Text style={[noneStyles.none, { color: colors.textSecondary }]}>Fill in the details above to see the choices.</Text>}
    {ready && loading && <Text style={[noneStyles.none, { color: colors.textSecondary }]}>Loading choices…</Text>}
    {ready && !loading && !options.length && <Text style={[noneStyles.none, { color: colors.textSecondary }]}>No choices are available for these details.</Text>}
    {asAmount
      ? <DenominationGrid items={denominationItems(options.slice(0, 100))} selectedKey={chosen?.code} onSelect={({ option }) => choose(option)} columns={2} />
      : <View style={fieldStyles.options}>
      {options.slice(0, 100).map((option) => {
        const selected = String(chosen?.code || '') === String(option.code);
        const label = String(option.label || option.description || option.code);
        return <TouchableOpacity key={String(option.code)} onPress={() => choose(option)} style={[fieldStyles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card }]}>
          <Text style={[fieldStyles.optionText, { color: selected ? colors.onPrimary : colors.text }]}>{label}</Text>
        </TouchableOpacity>;
      })}
    </View>}
  </View>;
}

const fieldStyles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  option: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, minWidth: '30%' },
  optionText: { fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
});

function validateAccountStep(serviceData) {
  if (serviceData.category === 'jompay') {
    if (!/^\d{4,6}$/.test(String(serviceData.billerCode || '').trim())) return 'Please enter the JomPAY Biller Code printed on your bill.';
    // Only when JomPAY's directory answered and does not know the code; an
    // unreachable directory never blocks a payment.
    if (serviceData.jompayBillerUnknown === true) return 'No JomPAY biller has this code. Check the Biller Code printed on your bill.';
    if (!(serviceData.accountNumber || '').trim()) return 'Please enter Ref-1, the account or bill number on your bill.';
    // Length only - the shape of a passport number is not ours to decide, and
    // rejecting a valid one would stop a legitimate payment.
    if (!/^[A-Za-z0-9]{6,20}$/.test(String(serviceData.icNumber || '').trim())) return 'Please enter the payer\u2019s IC or passport number. JomPAY requires it by law.';
    return null;
  }
  if (!(serviceData.accountNumber || '').trim()) return 'Please enter the bill or account number.';
  if (serviceData.country === 'BD' && !/^01\d{9}$/.test(String(serviceData.mobileNumber || '').trim())) return 'Please enter a valid Bangladesh mobile number.';
  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 0 && serviceData.internationalOnly && String(serviceData.country).toUpperCase() === 'MY') return 'Malaysian bills are paid from the Bills tiles.';
  if (step === 1 && !serviceData.category) return 'Please select a bill category.';
  if (step === 2 && !serviceData.provider) return 'Please select a bill provider.';
  if (step === 3) {
    // An IIMMPACT biller is held to its own fields; the rest keep the old rules.
    const fieldError = billForm(serviceData).active && !['jompay', 'tax'].includes(serviceData.category)
      ? accountStepError(serviceData)
      : validateAccountStep(serviceData);
    if (fieldError) return fieldError;
  }
  if (step === 4) {
    const amountError = amountStepError(serviceData);
    if (amountError) return amountError;
    if (!(Number(serviceData.amount) > 0)) return 'Please enter a valid amount.';
    // The JomPAY biller's own limits, from IIMMPACT's directory.
    if (serviceData.category === 'jompay') {
      const amount = Number(serviceData.amount);
      const min = Number(serviceData.jompayBillerMin);
      const max = Number(serviceData.jompayBillerMax);
      if (min > 0 && amount < min) return `This biller accepts at least RM ${min.toFixed(2)}.`;
      if (max > 0 && amount > max) return `This biller accepts at most RM ${max.toFixed(2)}.`;
    }
  }
  // The single provider answer that stops a payment: this account number is
  // not theirs. Checked AFTER the field rules so an empty form complains about
  // the empty field rather than about a bill nobody has asked for yet, and
  // never set for any other outcome - see utils/billPresentmentInputs and
  // functions/billPresentment.
  if ((step === 3 || step === 4) && String(serviceData.billPresentmentBlock || '').trim()) {
    return String(serviceData.billPresentmentBlock).slice(0, 300);
  }
  return null;
}

const styles = StyleSheet.create({ screen: { flex: 1 } });