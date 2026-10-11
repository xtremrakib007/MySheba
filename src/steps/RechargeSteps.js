import { operatorForNumber } from '../data/operatorPrefix';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators, amountToPoints } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, FormInput, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import ServiceInterruptionNotice from '../components/ServiceInterruptionNotice';
import { useNetworkStatus } from '../components/useNetworkStatus';
import * as apiProviderService from '../firebase/apiProviderService';
import { rechargeProductsFromCatalog } from '../data/iimmpactRecharge';
import { applyMarkup } from '../utils/markup';

// Recharge flow: country -> operator -> mobile number -> amount.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function RechargeStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates, pricing } = useApp();
  const [iimmpactOperators, setIimmpactOperators] = useState([]);
  const [iimmpactOptions, setIimmpactOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsUnavailable, setOptionsUnavailable] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const staticOperators = rechargeOperators[serviceData.country] || [];
  const OPERATOR_LIST = String(serviceData.country || '').toUpperCase() === 'BD' ? staticOperators : iimmpactOperators.map((product) => product.name);
  const selectedIimmpactProduct = iimmpactOperators.find((product) => String(product.code) === String(serviceData.productCode || '')) || null;

  const wantCatalog = step >= 2;
  // In API-routed countries, use the active provider's own recharge products.
  // Static country lists can include unsupported operators and miss new ones.
  useEffect(() => {
    let alive = true;
    const country = String(serviceData.country || '').trim().toUpperCase();
    setIimmpactOperators([]);
    setCatalogUnavailable(false);
    // Kept after the operator step too: the amount step finds the chosen
    // product in this list, and clearing it on leaving step 2 left that step
    // with no product and so no IIMMPACT amounts to offer.
    if (!country || country === 'BD' || !wantCatalog) {
      setCatalogLoading(false);
      return () => { alive = false; };
    }
    setCatalogLoading(true);
    apiProviderService.getIimmpactCatalogForUser('', 'Recharge', country)
      .then((catalog) => {
        if (!alive) return;
        // Every operator IIMMPACT sells for this country: Mobile Prepaid for
        // Malaysia, International Topup for everywhere else. See
        // data/iimmpactRecharge.js for why category names decide this.
        const productsUnique = rechargeProductsFromCatalog(catalog, {
          country,
          countryName: (countries.find((item) => item.code === country) || {}).name || '',
          staticOperators,
          countryNames: countries.map((item) => item.name),
        });
        setIimmpactOperators(productsUnique);
      })
      .catch(() => { if (alive) setCatalogUnavailable(true); })
      .finally(() => { if (alive) setCatalogLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, wantCatalog]);

  useEffect(() => {
    let alive = true;
    setIimmpactOptions([]);
    setOptionsUnavailable(false);
    const product = selectedIimmpactProduct;
    const fields = Array.isArray(product?.fields) ? product.fields : [];
    const pricingField = fields.find((field) => field && field.type === 'select' && field.role === 'pricing') || fields.find((field) => field && field.type === 'select');
    if (step !== 3 || !product || !pricingField?.id || String(serviceData.country || '').toUpperCase() === 'BD') {
      setOptionsLoading(false);
      return () => { alive = false; };
    }
    setOptionsLoading(true);
    apiProviderService.getIimmpactOptions({
      productCode: product.code, fieldId: pricingField.id,
      accountNumber: String(serviceData.phone || ''), service: 'Recharge',
      country: String(serviceData.country || '').toUpperCase(), page: 1, limit: 25000,
    }).then((result) => {
      if (!alive) return;
      const items = Array.isArray(result?.items) ? result.items : [];
      setIimmpactOptions(items);
      setOptionsUnavailable(items.length === 0);
    }).catch(() => { if (alive) setOptionsUnavailable(true); })
      .finally(() => { if (alive) setOptionsLoading(false); });
    return () => { alive = false; };
  }, [step, serviceData.country, serviceData.phone, selectedIimmpactProduct?.code]);

  // The number is collected first so the operator can be read off it. A
  // detected operator is selected and its step skipped, as asked. Prefixes are
  // the original allocation, so a ported number can be detected wrongly; the
  // grid is still reachable with Back, and a prefix two operators share is
  // left undetected so the grid shows instead of a guess.
  //
  // Keyed on the number already skipped for: without that, stepping back to
  // the operator would skip forward again and the grid could never be opened.
  const autoSkippedFor = useRef('');
  useEffect(() => {
    if (step !== 2 || String(serviceData.country || '').toUpperCase() !== 'BD') return;
    const phone = String(serviceData.phone || '');
    const detected = operatorForNumber(serviceData.country, phone, OPERATOR_LIST);
    if (!detected || autoSkippedFor.current === phone) return;
    autoSkippedFor.current = phone;
    if (serviceData.operator !== detected) updateServiceData({ operator: detected });
    nextStep();
  });
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors, isDark);
  // Advisory only, and never consulted by validateStep: an interruption is
  // "this might be slow", not "you may not pay".
  const interruption = useNetworkStatus({
    service: 'Recharge',
    country: serviceData.country,
    operator: serviceData.operator,
    active: step === 3,
  });

  // What the customer pays for a provider price: MySheba's markup for this
  // service, destination and product - the same rule the server charges by.
  const customerPrice = (amount) => applyMarkup(pricing, { service: 'recharge', country: serviceData.country, productCode: serviceData.productCode, amount }).amount;

  if (step === 0) {
    return (<View><FormLabel>Select Country</FormLabel><View style={styles.grid3}>{countries.map((c) => (<CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr }); nextStep(); }} />))}</View></View>);
  }
  if (step === 1) {
    return (<View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Enter number" placeholderTextColor={isDark ? '#9AA6BA' : '#777777'} keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} style={styles.phoneInput} /></View>);
  }
  if (step === 2) {
    const list = OPERATOR_LIST;
    return (<View>
      <FormLabel>Select Operator</FormLabel>
      {catalogLoading && <Text style={styles.catalogInfo}>Loading available operators from IIMMPACT…</Text>}
      {!catalogLoading && catalogUnavailable && serviceData.country !== 'BD' && <Text style={styles.catalogInfo}>Could not load IIMMPACT's live catalog. No static operators are shown because they may not be supported by the provider. Please retry or check the active IIMMPACT provider configuration.</Text>}
      {!catalogLoading && !catalogUnavailable && !list.length && <Text style={styles.catalogInfo}>IIMMPACT returned no active recharge products for this country. Add or enable the operator product in the IIMMPACT catalog before offering it here.</Text>}
      <View style={styles.grid3}>{list.map((o) => { const brand = getOperatorBrand(o); const remote = iimmpactOperators.find((item) => item.name === o)?.image_url; return <RechargeOperatorCard key={o} name={o} logo={brand.logo || (remote ? { uri: remote } : null)} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { const product = String(serviceData.country || '').toUpperCase() === 'BD' ? null : iimmpactOperators.find((item) => item.name === o); const accountFieldId = String((product?.fields || []).find((field) => field && (field.role === 'account' || /phone|mobile|msisdn|accountnumber/i.test(String(field.id || '') + ' ' + String(field.label || ''))))?.id || 'phone'); updateServiceData(product ? { operator: product.name, operatorCode: product.code, productCode: product.code, productName: product.name, iimmpactCatalog: true, iimmpactFields: product.fields || [], iimmpactDenomination: product.denomination || '', iimmpactProcessingTime: product.processing_time || '', amount: null, package: '', subproductCode: '', selectedOptions: {}, fieldValues: { [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || '') } } : { operator: o, iimmpactCatalog: false, productCode: '', amount: null, selectedOptions: {}, fieldValues: {} }); nextStep(); }} styles={styles} primaryColor={colors.primary} />; })}</View>
    </View>);
  }
  if (step === 3) {
    const cur = serviceData.currency || 'MYR';
    if (String(serviceData.country || '').toUpperCase() !== 'BD' && serviceData.iimmpactCatalog === true) {
      const product = selectedIimmpactProduct;
      const fields = Array.isArray(product?.fields) ? product.fields : [];
      const pricingField = fields.find((field) => field && field.type === 'select' && field.role === 'pricing') || fields.find((field) => field && field.type === 'select');
      const accountFieldId = String(fields.find((field) => field && (field.role === 'account' || /phone|mobile|msisdn|accountnumber/i.test(String(field.id || '') + ' ' + String(field.label || ''))))?.id || 'phone');
      const denominations = String(product?.denomination || '').split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value) && value > 0);
      const extraFields = fields.filter((field) => field && field.id && field.id !== pricingField?.id && field.id !== accountFieldId && field.required && field.type !== 'select');
      return (<View>
        <ServiceInterruptionNotice notice={interruption} />
        <FormLabel>{product?.name || serviceData.operator || 'Recharge'} — choose a live amount</FormLabel>
        {!!product?.processing_time && <Text style={styles.catalogInfo}>Processing: {String(product.processing_time).replace(/_/g, ' ')}</Text>}
        {extraFields.map((field) => <View key={field.id}><FormLabel>{field.label || field.id}</FormLabel><FormInput placeholder={field.placeholder || field.label || field.id} keyboardType={field.input_mode === 'numeric' || field.type === 'number' ? 'numeric' : 'default'} style={styles.phoneInput} value={String(serviceData.fieldValues?.[field.id] ?? '')} onChangeText={(value) => updateServiceData({ fieldValues: { ...(serviceData.fieldValues || {}), [field.id]: value } })} /></View>)}
        {optionsLoading && <Text style={styles.catalogInfo}>Loading live amounts from IIMMPACT…</Text>}
        {optionsUnavailable && !optionsLoading && !!pricingField?.id && <Text style={styles.catalogInfo}>IIMMPACT has no available amount for this product and number. Check its required fields and options in the provider catalog.</Text>}
        {!!pricingField?.id && <View style={styles.grid3}>{iimmpactOptions.map((option) => { const price = Number(option?.price?.amount ?? option?.price ?? option?.amount); const label = localAmountLabel(option, product); const pay = Number.isFinite(price) && price > 0 ? customerPrice(price) : null; return <RechargeAmountButton key={String(option.code)} label={`${label}${pay != null ? `\nPay RM ${pay.toFixed(2)}` : ''}`} selected={String(serviceData.selectedOptions?.[pricingField.id]?.code || '') === String(option.code)} onPress={() => updateServiceData({ selectedOptions: { ...(serviceData.selectedOptions || {}), [pricingField.id]: option }, fieldValues: { ...(serviceData.fieldValues || {}), [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || '') }, amount: Number.isFinite(price) && price > 0 ? price : Number(option?.denomination || 0), package: label, subproductCode: String(option.code || '') })} styles={styles} />; })}</View>}
        {!pricingField?.id && <View style={styles.grid3}>{denominations.map((amount) => <RechargeAmountButton key={amount} label={`RM ${amount}`} selected={Number(serviceData.amount) === amount} onPress={() => updateServiceData({ amount, fieldValues: { ...(serviceData.fieldValues || {}), [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || ''), amount } })} styles={styles} />)}</View>}
        {!!(serviceData.amount > 0) && <SummaryCard rows={[{ label: 'Product', value: product?.name || serviceData.operator }, { label: 'Amount', value: serviceData.package || `MYR ${Number(serviceData.amount).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`MYR ${customerPrice(Number(serviceData.amount)).toFixed(2)}`} />}
      </View>);
    }
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const walletDeductionMyr = isForeign ? amountToPoints(serviceData.amount || 0, serviceData.country, rates) : (serviceData.amount || 0);
    const amounts = cur === 'MYR' ? [10, 20, 30, 50, 100] : cur === 'BDT' ? [50, 100, 200, 500, 1000] : [50, 100, 200, 500];
    return (<View><ServiceInterruptionNotice notice={interruption} /><FormLabel>Select Amount ({cur})</FormLabel><View style={styles.grid3}>{amounts.map((a) => <RechargeAmountButton key={a} label={`${cur} ${a}`} selected={serviceData.amount === a} onPress={() => updateServiceData({ amount: a })} styles={styles} />)}</View><FormInput placeholder="Custom amount" keyboardType="numeric" style={styles.phoneInput} value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} />{!!(isForeign && serviceData.amount > 0) && <SummaryCard rows={[{ label: 'Amount', value: `${cur} ${Number(serviceData.amount).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}</View>);
  }
  return null;
}

// An international top-up is bought in the destination's money - IDR 50,000,
// not RM 14.20 - so that leads, from the option's own denomination and the
// product's denomination currency. A Malaysian option, or one without those
// fields, keeps IIMMPACT's label.
function localAmountLabel(option, product) {
  const label = String(option?.label || option?.description || option?.name || option?.code || 'Amount');
  const currency = String(option?.denomination_currency || product?.denomination_currency || '').toUpperCase();
  const face = Number(option?.denomination);
  if (!currency || currency === 'MYR' || !Number.isFinite(face) || face <= 0) return label;
  const amount = face.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `${currency} ${amount}`;
}

function RechargeOperatorCard({ name, logo, color, initials, selected, onPress, styles, primaryColor }) { return <TouchableOpacity style={[styles.selectCard, styles.operatorCard, selected && styles.selectCardSelected]} onPress={onPress} activeOpacity={0.8}>{logo ? <Image source={logo} style={styles.operatorLogo} resizeMode="contain" /> : <View style={[styles.operatorBadge, { backgroundColor: color || primaryColor }]}><Text style={styles.operatorBadgeText}>{initials}</Text></View>}<Text style={[styles.selectName, styles.operatorName, selected && styles.selectNameSelected]} numberOfLines={2}>{String(name || '')}</Text></TouchableOpacity>; }
function RechargeAmountButton({ label, selected, onPress, styles }) { return <TouchableOpacity style={[styles.amountBtn, selected && styles.amountBtnSelected]} onPress={onPress} activeOpacity={0.8}><Text style={[styles.amountBtnText, selected && styles.amountBtnTextSelected]}>{label}</Text></TouchableOpacity>; }
export function validateStep(step, serviceData) { if (step === 0 && !serviceData.country) return 'Please select a country.'; if (step === 2 && !serviceData.operator) return 'Please select an operator.'; if (step === 1 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.'; if (step === 3 && serviceData.iimmpactCatalog === true) { const fields = Array.isArray(serviceData.iimmpactFields) ? serviceData.iimmpactFields : []; const pricing = fields.find((field) => field && field.type === 'select' && field.role === 'pricing') || fields.find((field) => field && field.type === 'select'); if (pricing?.required && !serviceData.selectedOptions?.[pricing.id]) return 'Please select an amount returned by IIMMPACT.'; for (const field of fields.filter((field) => field && field.required && field.type !== 'select' && field.role !== 'account')) if (!String(serviceData.fieldValues?.[field.id] ?? '').trim()) return `Please enter ${field.label || field.id}.`; } if (step === 3 && !(serviceData.amount > 0)) return 'Please select or enter an amount.'; return null; }
function createStyles(colors, isDark) {
  const tileBg = colors.surface;
  const tileText = colors.text;
  return StyleSheet.create({
    grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    selectCard: { width: '30%', height: 96, backgroundColor: tileBg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', marginBottom: 10, shadowColor: '#000', shadowOpacity: isDark ? 0 : 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
    selectCardSelected: { borderColor: colors.primary, backgroundColor: isDark ? colors.surfaceElevated : colors.card, borderWidth: 2 },
    catalogInfo: { fontSize: 12, color: colors.muted || tileText, marginBottom: 10 },
    selectName: { fontSize: 11, fontWeight: '700', marginTop: 2, textAlign: 'center', color: tileText },
    selectNameSelected: { color: colors.text },
    operatorCard: { paddingVertical: 14, paddingHorizontal: 8 }, operatorLogo: { width: 44, height: 44 }, operatorBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, operatorBadgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' }, operatorName: { marginTop: 8 }, phoneInput: { backgroundColor: tileBg, color: tileText, borderColor: colors.border }, amountBtn: { flexBasis: '31%', paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: tileBg, alignItems: 'center', marginBottom: 8 }, amountBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, amountBtnText: { fontWeight: '500', fontSize: 13, color: tileText, textAlign: 'center' }, amountBtnTextSelected: { color: colors.onPrimary },
  });
}
