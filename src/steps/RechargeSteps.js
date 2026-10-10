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

// Recharge flow: country -> operator -> mobile number -> amount.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function RechargeStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates } = useApp();
  const [iimmpactOperators, setIimmpactOperators] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const staticOperators = rechargeOperators[serviceData.country] || [];
  const OPERATOR_LIST = catalogUnavailable ? staticOperators : ((catalogLoading || step === 2) ? iimmpactOperators : staticOperators);

  // In API-routed countries, use the active provider's own recharge products.
  // Static country lists can include unsupported operators and miss new ones.
  useEffect(() => {
    let alive = true;
    const country = String(serviceData.country || '').trim().toUpperCase();
    setIimmpactOperators([]);
    setCatalogUnavailable(false);
    if (!country || country === 'BD' || step !== 2) {
      setCatalogLoading(false);
      return () => { alive = false; };
    }
    setCatalogLoading(true);
    apiProviderService.getIimmpactCatalogForUser('', 'Recharge', country)
      .then((catalog) => {
        if (!alive) return;
        const products = catalog && catalog.products && typeof catalog.products === 'object' ? catalog.products : {};
        const groups = Array.isArray(catalog && catalog.tree && catalog.tree.groups) ? catalog.tree.groups : [];
        const rechargeCodes = new Set();
        for (const group of groups) {
          for (const category of (Array.isArray(group && group.categories) ? group.categories : [])) {
            if (/recharge|airtime|top.?up|prepaid reload|mobile reload/i.test(String(group.name || '') + ' ' + String(category.name || ''))) {
              for (const code of (Array.isArray(category.product_codes) ? category.product_codes : [])) rechargeCodes.add(String(code));
            }
          }
        }
        const isDataPlan = (p) => Array.isArray(p && p.fields) && p.fields.some((field) => field && field.type === 'select' && field.data_source);
        const knownNames = staticOperators.map((name) => String(name).toLowerCase().replace(/[^a-z0-9]/g, '')).filter(Boolean);
        const entries = Object.entries(products)
          .filter(([code, p]) => {
            if (!p || p.is_active === false || !p.code) return false;
            const name = String(p.name || p.label || code).toLowerCase();
            const normalizedName = name.replace(/[^a-z0-9]/g, '');
            const normalizedCode = String(p.code || code).toLowerCase().replace(/[^a-z0-9]/g, '');
            const belongsToRechargeCategory = rechargeCodes.has(String(p.code || code));
            const hasRechargeLabel = /recharge|airtime|top.?up|prepaid|reload/i.test(name + ' ' + String(p.code || code));
            const matchesKnownOperator = knownNames.some((known) =>
              normalizedName.includes(known) || known.includes(normalizedName) ||
              normalizedCode.includes(known) || known.includes(normalizedCode));
            // Explicit IIMMPACT category codes are authoritative. Without them,
            // only recognizable recharge products may be offered.
            return rechargeCodes.size ? belongsToRechargeCategory : (hasRechargeLabel || matchesKnownOperator);
          })
          .filter(([, p]) => String(p.processing_time || '').toLowerCase() !== 'pin')
          .filter(([code, p]) => rechargeCodes.has(String(p.code || code)) || !isDataPlan(p))
          .map(([code, p]) => String(p.name || p.label || code).trim())
          .filter(Boolean);
        const seen = new Set();
        const names = entries.filter((name) => {
          const key = name.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // A successful empty catalogue is not a network failure: don't advertise static operators the provider may not fulfil.
        setIimmpactOperators(names);
      })
      .catch(() => { if (alive) setCatalogUnavailable(true); })
      .finally(() => { if (alive) setCatalogLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, step]);

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
      {!catalogLoading && catalogUnavailable && serviceData.country !== 'BD' && <Text style={styles.catalogInfo}>Live operator catalogue is unavailable. The saved country operator list is shown temporarily.</Text>}
      {!catalogLoading && !catalogUnavailable && !list.length && <Text style={styles.catalogInfo}>IIMMPACT returned no active recharge products for this country. Add or enable the operator product in the IIMMPACT catalog before offering it here.</Text>}
      <View style={styles.grid3}>{list.map((o) => { const brand = getOperatorBrand(o); return <RechargeOperatorCard key={o} name={o} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { updateServiceData({ operator: o }); nextStep(); }} styles={styles} primaryColor={colors.primary} />; })}</View>
    </View>);
  }
  if (step === 3) {
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const walletDeductionMyr = isForeign ? amountToPoints(serviceData.amount || 0, serviceData.country, rates) : (serviceData.amount || 0);
    const amounts = cur === 'MYR' ? [10, 20, 30, 50, 100] : cur === 'BDT' ? [50, 100, 200, 500, 1000] : [50, 100, 200, 500];
    return (<View><ServiceInterruptionNotice notice={interruption} /><FormLabel>Select Amount ({cur})</FormLabel><View style={styles.grid3}>{amounts.map((a) => <RechargeAmountButton key={a} label={`${cur} ${a}`} selected={serviceData.amount === a} onPress={() => updateServiceData({ amount: a })} styles={styles} />)}</View><FormInput placeholder="Custom amount" keyboardType="numeric" style={styles.phoneInput} value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} />{!!(isForeign && serviceData.amount > 0) && <SummaryCard rows={[{ label: 'Amount', value: `${cur} ${Number(serviceData.amount).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}</View>);
  }
  return null;
}

function RechargeOperatorCard({ name, logo, color, initials, selected, onPress, styles, primaryColor }) { return <TouchableOpacity style={[styles.selectCard, styles.operatorCard, selected && styles.selectCardSelected]} onPress={onPress} activeOpacity={0.8}>{logo ? <Image source={logo} style={styles.operatorLogo} resizeMode="contain" /> : <View style={[styles.operatorBadge, { backgroundColor: color || primaryColor }]}><Text style={styles.operatorBadgeText}>{initials}</Text></View>}<Text style={[styles.selectName, styles.operatorName, selected && styles.selectNameSelected]} numberOfLines={2}>{String(name || '')}</Text></TouchableOpacity>; }
function RechargeAmountButton({ label, selected, onPress, styles }) { return <TouchableOpacity style={[styles.amountBtn, selected && styles.amountBtnSelected]} onPress={onPress} activeOpacity={0.8}><Text style={[styles.amountBtnText, selected && styles.amountBtnTextSelected]}>{label}</Text></TouchableOpacity>; }
export function validateStep(step, serviceData) { if (step === 0 && !serviceData.country) return 'Please select a country.'; if (step === 2 && !serviceData.operator) return 'Please select an operator.'; if (step === 1 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.'; if (step === 3 && !(serviceData.amount > 0)) return 'Please select or enter an amount.'; return null; }
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
    operatorCard: { paddingVertical: 14, paddingHorizontal: 8 }, operatorLogo: { width: 44, height: 44 }, operatorBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, operatorBadgeText: { color: colors.onPrimary, fontSize: 13, fontWeight: '700' }, operatorName: { marginTop: 8 }, phoneInput: { backgroundColor: tileBg, color: tileText, borderColor: colors.border }, amountBtn: { flexBasis: '31%', paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: tileBg, alignItems: 'center', marginBottom: 8 }, amountBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary }, amountBtnText: { fontWeight: '500', fontSize: 13, color: tileText }, amountBtnTextSelected: { color: colors.onPrimary },
  });
}
