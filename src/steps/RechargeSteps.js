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
import { rechargeProductsFromCatalog, internationalRechargeCountries } from '../data/iimmpactRecharge';
import { getIimmpactCatalog, useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { iimmpactCustomerPrice, canPriceTypedAmount } from '../utils/iimmpactPrice';
import { applyMarkup } from '../utils/markup';
import DenominationGrid from '../components/DenominationGrid';
import { denominationItems, amountItems, optionPrice } from '../utils/denominations';

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
    // The app's shared catalogue - MySheba's saved copy, drawn at once - not
    // a fresh 10-15 second request to IIMMPACT on every reload.
    getIimmpactCatalog()
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
    // The number goes along only when IIMMPACT says this list depends on it
    // (its data_source names the account). An operator's reload amounts are
    // the same for every number, and asking per number made each new number
    // wait on IIMMPACT again instead of using the saved list.
    const deps = Array.isArray(pricingField.data_source?.depends_on) ? pricingField.data_source.depends_on.map(String) : [];
    const accountParam = pricingField.data_source?.params?.account_number;
    const perNumber = deps.length > 0 || !!accountParam?.from_field;
    apiProviderService.getIimmpactOptions({
      productCode: product.code, fieldId: pricingField.id,
      accountNumber: perNumber ? String(serviceData.phone || '') : '', service: 'Recharge',
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

  // International Reload offers only the countries IIMMPACT sells a top-up
  // for (plus Bangladesh, which is Success TopUp's), read from the shared
  // catalogue the country step can draw at once.
  const { catalog: sharedCatalog } = useIimmpactCatalog({ enabled: !!serviceData.internationalOnly });
  const soldAbroad = sharedCatalog ? new Set(internationalRechargeCountries(sharedCatalog, countries)) : null;

  // Choosing an IIMMPACT product: what the tile tap and the automatic pick
  // below both do.
  const chooseIimmpactProduct = (product) => {
    const accountFieldId = String((product?.fields || []).find((field) => field && (field.role === 'account' || /phone|mobile|msisdn|accountnumber/i.test(String(field.id || '') + ' ' + String(field.label || ''))))?.id || 'phone');
    updateServiceData({ operator: product.name, operatorCode: product.code, productCode: product.code, productName: product.name, iimmpactCatalog: true, iimmpactFields: product.fields || [], iimmpactDenomination: product.denomination || '', iimmpactProcessingTime: product.processing_time || '', amount: null, package: '', subproductCode: '', selectedOptions: {}, fieldValues: { [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || '') } });
  };

  // An international top-up is one product per country ("Bangladesh",
  // "Nepal"), so once the country is chosen there is nothing to pick: the
  // product is selected and the operator step passed. Once per country and
  // number, so Back can still open the step.
  const autoPickedFor = useRef('');
  useEffect(() => {
    const country = String(serviceData.country || '').toUpperCase();
    if (step !== 2 || country === 'MY' || country === 'BD' || catalogLoading || iimmpactOperators.length !== 1) return;
    const key = country + '|' + String(serviceData.phone || '');
    if (autoPickedFor.current === key) return;
    autoPickedFor.current = key;
    chooseIimmpactProduct(iimmpactOperators[0]);
    nextStep();
  });

  // What the customer pays for a provider price: MySheba's markup for this
  // service, destination and product - the same rule the server charges by.
  const customerPrice = (amount) => applyMarkup(pricing, { service: 'recharge', country: serviceData.country, productCode: serviceData.productCode, amount }).amount;

  if (step === 0) {
    // International Reload lists destinations abroad only; Malaysian numbers
    // are Prepaid Reload's.
    const destinations = serviceData.internationalOnly
      ? countries.filter((c) => c.code !== 'MY' && (!soldAbroad || c.code === 'BD' || soldAbroad.has(c.code)))
      : countries;
    return (<View><FormLabel>Select Country</FormLabel><View style={styles.grid3}>{destinations.map((c) => (<CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr }); nextStep(); }} />))}</View></View>);
  }
  if (step === 1) {
    return (<View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Enter number" placeholderTextColor={isDark ? '#9AA6BA' : '#777777'} keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} style={styles.phoneInput} /></View>);
  }
  if (step === 2) {
    const list = OPERATOR_LIST;
    return (<View>
      <FormLabel>Select Operator</FormLabel>
      {catalogLoading && <Text style={styles.catalogInfo}>Loading MySheba catalogue…</Text>}
      {!catalogLoading && catalogUnavailable && serviceData.country !== 'BD' && <Text style={styles.catalogInfo}>Could not load the MySheba catalogue. Please check your connection and try again.</Text>}
      {!catalogLoading && !catalogUnavailable && !list.length && <Text style={styles.catalogInfo}>No operators are available for this country right now.</Text>}
      <View style={styles.grid3}>{list.map((o) => { const brand = getOperatorBrand(o); const remote = iimmpactOperators.find((item) => item.name === o)?.image_url; return <RechargeOperatorCard key={o} name={o} logo={brand.logo || (remote ? { uri: remote } : null)} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { const product = String(serviceData.country || '').toUpperCase() === 'BD' ? null : iimmpactOperators.find((item) => item.name === o); if (product) chooseIimmpactProduct(product); else updateServiceData({ operator: o, iimmpactCatalog: false, productCode: '', amount: null, selectedOptions: {}, fieldValues: {} }); nextStep(); }} styles={styles} primaryColor={colors.primary} />; })}</View>
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
      // A typed amount: the field IIMMPACT's fulfillment takes the amount from,
      // when it is not a list. Its face value is in the product's currency
      // (BDT 100) and costs that times the product's unit price in ringgit -
      // the server's own formula - so both are shown before paying.
      const amountFieldId = String(product?.fulfillment?.amount?.from_field || '');
      const typedAmountField = !pricingField?.id
        ? fields.find((field) => field && field.type !== 'select' && (String(field.id) === amountFieldId || field.role === 'amount'))
        : null;
      const extraFields = fields.filter((field) => field && field.id && field.id !== pricingField?.id && field.id !== accountFieldId && field.id !== typedAmountField?.id && field.required && field.type !== 'select');
      const domestic = String(serviceData.country || '').toUpperCase() === 'MY';
      const faceCurrency = String(product?.denomination_currency || (domestic ? 'MYR' : '')).toUpperCase();
      const priceable = domestic || canPriceTypedAmount(product);
      const typedFace = typedAmountField ? Number(serviceData.fieldValues?.[typedAmountField.id]) : NaN;
      const typedRule = typedAmountField?.validation || {};
      const typedError = !typedAmountField || !(typedFace > 0) ? ''
        : (typedRule.min != null && typedFace < Number(typedRule.min)) ? `The amount must be at least ${faceCurrency} ${typedRule.min}.`
        : (typedRule.max != null && typedFace > Number(typedRule.max)) ? `The amount must be at most ${faceCurrency} ${typedRule.max}.`
        : '';
      const setTypedAmount = (value) => {
        const clean = String(value).replace(/[^0-9.]/g, '');
        const face = Number(clean);
        const rule = typedAmountField.validation || {};
        const inRange = face > 0 && !(rule.min != null && face < Number(rule.min)) && !(rule.max != null && face > Number(rule.max));
        const price = inRange && priceable ? iimmpactCustomerPrice(face, product) : 0;
        updateServiceData({
          fieldValues: { ...(serviceData.fieldValues || {}), [typedAmountField.id]: clean, [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || '') },
          amount: price > 0 ? price : null,
          package: face > 0 ? `${faceCurrency || 'MYR'} ${face.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '',
        });
      };
      return (<View>
        <ServiceInterruptionNotice notice={interruption} />
        <FormLabel>{product?.name || serviceData.operator || 'Recharge'} — choose a live amount</FormLabel>
        {!!product?.processing_time && <Text style={styles.catalogInfo}>Processing: {String(product.processing_time).replace(/_/g, ' ')}</Text>}
        {extraFields.map((field) => <View key={field.id}><FormLabel>{field.label || field.id}</FormLabel><FormInput placeholder={field.placeholder || field.label || field.id} keyboardType={field.input_mode === 'numeric' || field.type === 'number' ? 'numeric' : 'default'} style={styles.phoneInput} value={String(serviceData.fieldValues?.[field.id] ?? '')} onChangeText={(value) => updateServiceData({ fieldValues: { ...(serviceData.fieldValues || {}), [field.id]: value } })} /></View>)}
        {!!typedAmountField && <View>
          <FormLabel>{`Amount${faceCurrency ? ` (${faceCurrency})` : ''}`}</FormLabel>
          <FormInput placeholder={typedRule.min != null && typedRule.max != null ? `${typedRule.min} – ${typedRule.max}` : 'Amount'} keyboardType="decimal-pad" style={styles.phoneInput} value={String(serviceData.fieldValues?.[typedAmountField.id] ?? '')} onChangeText={setTypedAmount} />
          {!priceable && <Text style={styles.catalogInfo}>Prices for this country are being updated. Please try again a little later.</Text>}
          {!!typedError && <Text style={styles.catalogInfo}>{typedError}</Text>}
          {priceable && !typedError && serviceData.amount > 0 && <SummaryCard rows={[{ label: 'Top-up amount', value: serviceData.package }]} totalLabel="You pay" totalValue={`MYR ${customerPrice(Number(serviceData.amount)).toFixed(2)}`} />}
        </View>}
        {optionsLoading && <Text style={styles.catalogInfo}>Loading amounts…</Text>}
        {optionsUnavailable && !optionsLoading && !!pricingField?.id && <Text style={styles.catalogInfo}>No amounts are available for this operator right now. Please try again shortly.</Text>}
        {!!pricingField?.id && <DenominationGrid
          items={denominationItems(iimmpactOptions, { product, payFor: customerPrice })}
          selectedKey={serviceData.selectedOptions?.[pricingField.id]?.code}
          onSelect={({ option, value }) => updateServiceData({ selectedOptions: { ...(serviceData.selectedOptions || {}), [pricingField.id]: option }, fieldValues: { ...(serviceData.fieldValues || {}), [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || '') }, amount: optionPrice(option) > 0 ? optionPrice(option) : Number(option?.denomination || 0), package: value, subproductCode: String(option.code || '') })}
        />}
        {!pricingField?.id && !typedAmountField && <DenominationGrid
          items={amountItems(denominations, { payFor: customerPrice })}
          selectedKey={serviceData.amount > 0 ? String(Number(serviceData.amount)) : ''}
          onSelect={({ amount }) => updateServiceData({ amount, package: '', fieldValues: { ...(serviceData.fieldValues || {}), [accountFieldId]: String(serviceData.phone || ''), phone: String(serviceData.phone || ''), amount } })}
        />}
        {!typedAmountField && !!(serviceData.amount > 0) && <SummaryCard rows={[{ label: 'Product', value: product?.name || serviceData.operator }, { label: 'Amount', value: serviceData.package || `RM ${Number(serviceData.amount).toFixed(2)}` }]} totalLabel="You pay" totalValue={`MYR ${customerPrice(Number(serviceData.amount)).toFixed(2)}`} />}
      </View>);
    }
    // Only Bangladesh is sold without IIMMPACT's catalogue: Success TopUp takes
    // any amount. Everywhere else the amounts are the provider's own, above;
    // the old fixed RM 10/20/30 list and free amount are gone, because
    // IIMMPACT refuses an amount it does not list.
    if (String(serviceData.country || '').toUpperCase() !== 'BD') {
      return (<View><ServiceInterruptionNotice notice={interruption} /><Text style={styles.catalogInfo}>{catalogLoading ? 'Loading amounts…' : 'This operator has no amounts available right now. Go back and choose the operator again.'}</Text></View>);
    }
    const amounts = [50, 100, 200, 500, 1000];
    const walletDeductionMyr = amountToPoints(serviceData.amount || 0, serviceData.country, rates);
    return (<View><ServiceInterruptionNotice notice={interruption} /><FormLabel>Select Amount ({cur})</FormLabel><DenominationGrid items={amounts.map((a) => ({ key: String(a), value: `${cur} ${a}`, caption: '', amount: a }))} selectedKey={serviceData.amount > 0 ? String(serviceData.amount) : ''} onSelect={({ amount }) => updateServiceData({ amount })} /><FormInput placeholder="Custom amount" keyboardType="numeric" style={styles.phoneInput} value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} />{!!(serviceData.amount > 0) && <SummaryCard rows={[{ label: 'Amount', value: `${cur} ${Number(serviceData.amount).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}</View>);
  }
  return null;
}

function RechargeOperatorCard({ name, logo, color, initials, selected, onPress, styles, primaryColor }) { return <TouchableOpacity style={[styles.selectCard, styles.operatorCard, selected && styles.selectCardSelected]} onPress={onPress} activeOpacity={0.8}>{logo ? <Image source={logo} style={styles.operatorLogo} resizeMode="contain" /> : <View style={[styles.operatorBadge, { backgroundColor: color || primaryColor }]}><Text style={styles.operatorBadgeText}>{initials}</Text></View>}<Text style={[styles.selectName, styles.operatorName, selected && styles.selectNameSelected]} numberOfLines={2}>{String(name || '')}</Text></TouchableOpacity>; }
export function validateStep(step, serviceData) { if (step === 0 && !serviceData.country) return 'Please select a country.'; if (step === 0 && serviceData.internationalOnly && String(serviceData.country).toUpperCase() === 'MY') return 'Malaysian numbers are reloaded from Prepaid Reload.'; if (step === 2 && !serviceData.operator) return 'Please select an operator.'; if (step === 1 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.'; if (step === 3 && serviceData.iimmpactCatalog === true) { const fields = Array.isArray(serviceData.iimmpactFields) ? serviceData.iimmpactFields : []; const pricing = fields.find((field) => field && field.type === 'select' && field.role === 'pricing') || fields.find((field) => field && field.type === 'select'); if (pricing?.required && !serviceData.selectedOptions?.[pricing.id]) return 'Please select an amount.'; for (const field of fields.filter((field) => field && field.required && field.type !== 'select' && field.role !== 'account')) if (!String(serviceData.fieldValues?.[field.id] ?? '').trim()) return `Please enter ${field.label || field.id}.`; } if (step === 3 && !(serviceData.amount > 0)) return 'Please choose or enter a valid amount.'; return null; }
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
