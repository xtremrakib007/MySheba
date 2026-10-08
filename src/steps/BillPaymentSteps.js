import React, { useEffect, useRef, useState } from 'react';
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

// An entry is a name, or { name, amount } when the denomination IS the
// product. Prepaid electricity tokens are sold that way - you buy a 50,000
// IDR PLN token, you do not tell PLN how much your bill was - so those
// billers carry their amount and the amount step shows it rather than
// asking for it.
const BILLERS = {
  MY: {
    electricity: ['TNB', 'Sabah Electricity (SESB)', 'Sarawak Energy (SESCO)'],
    water: [
      'Air Selangor', 'SAJ Ranhill Air Johor', 'Syarikat Air Melaka (SAMB)',
      'Lembaga Air Perak', 'PBAPP', 'Kuching Water Board',
      'Syarikat Air Darul Aman (SADA)', 'Syarikat Air Terengganu (SATU)',
      'Syarikat Air Negeri Sembilan (SAINS)', 'Air Kelantan',
      'Sibu Water Board', 'Syarikat Air Perlis (SAP)', 'Air Pahang (PAIP)',
    ],
    internet: ['Unifi', 'Telekom Malaysia (TM)', 'TIME', 'Maxis'],
    tv: ['Astro'],
    mobile: ['CelcomDigi', 'Maxis', 'U Mobile', 'Yes'],
    utilities: ['Indah Water'],
    ewallet: ["Touch 'n Go eWallet"],
    // JomPAY is one rail covering thousands of billers, so there is no list to
    // choose from here: the biller code is printed on the customer's own bill
    // and they type it, exactly as they would at a bank's JomPAY screen. The
    // single entry keeps the provider step's shape without pretending to offer
    // a choice.
    jompay: ['JomPAY'],
    // Tax is not a separate IIMMPACT rail. Government/tax bills that expose
    // a JomPAY biller are paid through the same JomPAY flow.
    tax: ['JomPAY'],
  },
  BD: {
    // Prepaid and postpaid are separate billers, not a setting on one: they
    // are different accounts with different numbers at the same board.
    electricity: [
      'Palli Bidyut (Prepaid)', 'Palli Bidyut (Postpaid)',
      'DESCO (Prepaid)', 'DESCO (Postpaid)',
      'NESCO (Prepaid)', 'NESCO (Postpaid)',
      'DPDC (Prepaid)', 'DPDC (Postpaid)',
    ],
    gas: ['Titas Gas', 'Karnaphuli Gas', 'Jalalabad Gas', 'Sundarban Gas', 'Bakhrabad Gas'],
    water: ['Dhaka WASA'],
    internet: ['Amber IT'],
    mobile: ['Grameenphone', 'Robi', 'Banglalink'],
  },
  NP: {
    electricity: ['NEA (Nepal Electricity Authority)'],
    water: ['Nepal Water Supply', 'Khanepani (KUKL)'],
    internet: ['Vianet', 'Sky Internet', 'Websurfer', 'Arrownet'],
    tv: ['Dish Home', 'Sim TV', 'Mero TV', 'Sky TV'],
  },
  ID: {
    electricity: [
      { name: 'PLN Meter 20000 IDR', amount: 20000 },
      { name: 'PLN Meter 50000 IDR', amount: 50000 },
      { name: 'PLN Meter 100000 IDR', amount: 100000 },
      { name: 'PLN Meter 200000 IDR', amount: 200000 },
      { name: 'PLN Meter 500000 IDR', amount: 500000 },
      { name: 'PLN Meter 1000000 IDR', amount: 1000000 },
    ],
    utilities: ['BPJS Insurance'],
  },
  PH: {
    electricity: [
      { name: 'Meralco Load 100', amount: 100 },
      { name: 'Meralco Load 200', amount: 200 },
      { name: 'Meralco Load 300', amount: 300 },
      { name: 'Meralco Load 500', amount: 500 },
      { name: 'Meralco Load 1000', amount: 1000 },
    ],
  },
};

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

const CATEGORIES = [
  { key: 'electricity', label: 'Electricity', art: 'billElectricity' },
  { key: 'water', label: 'Water', art: 'billWater' },
  { key: 'gas', label: 'Gas', art: 'billGas' },
  { key: 'internet', label: 'Internet & Broadband', art: 'billInternet' },
  { key: 'tv', label: 'TV / Astro', art: 'billTv' },
  { key: 'mobile', label: 'Postpaid Mobile', art: 'billMobile' },
  { key: 'utilities', label: 'Other Utilities', art: 'billUtilities' },
  // A wallet reload is not a bill, but it is the same transaction: choose who,
  // say which account, say how much. Here it reuses the whole charged path -
  // pricing, refund on refusal, the audit trail - instead of growing a service.
  //
  // It deliberately is NOT a Recharge operator. Malaysia has prefix detection
  // for 010-019 and Recharge auto-selects the operator and skips the step, so
  // somebody entering their TnG number - an ordinary 012 mobile - would be sent
  // to Hotlink and never offered the choice.
  { key: 'ewallet', label: 'E-Wallet Reload', art: 'walletTransfer' },
  { key: 'jompay', label: 'JomPAY Bill', art: 'jompay' },
  { key: 'tax', label: 'Government / Tax (JomPAY)', art: 'jompay' },
];

// Only the categories the chosen country actually bills for. Malaysia has no
// gas biller and Bangladesh no Astro, and offering either led to a category
// that could only answer "no biller is configured for this yet".
function categoriesFor(country) {
  return CATEGORIES.filter((c) => billersFor(country, c.key).length > 0);
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

  if (step === 0) return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, category: null, provider: null, accountNumber: '', mobileNumber: '', amount: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 1) {
    const cats = categoriesFor(serviceData.country);
    return <View><FormLabel>Select Bill Category</FormLabel>{cats.length
      ? <Grid3>{cats.map((item) => <CategoryCard key={item.key} item={item} selected={serviceData.category === item.key} onPress={() => { updateServiceData({ category: item.key, provider: null }); nextStep(); }} />)}</Grid3>
      : <Text style={noneStyles.none}>No bills can be paid for this country yet. Go back and pick another.</Text>}</View>;
  }
  if (step === 2) {
    const providers = billersFor(serviceData.country, serviceData.category);
    return <View><FormLabel>Select Provider</FormLabel>{providers.length
      ? <Grid3>{providers.map((b) => { const brand = getBillerBrand(b.name); return <OperatorCard key={b.name} name={b.name} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.provider === b.name} onPress={() => { updateServiceData({ provider: b.name, amount: b.amount != null ? b.amount : null }); nextStep(); }} />; })}</Grid3>
      : <Text style={noneStyles.none}>No biller is configured for this country and category yet.</Text>}</View>;
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
        <FormLabel>JomPAY Biller Code</FormLabel>
        <FormInput placeholder='e.g. 818625' keyboardType='number-pad' value={serviceData.billerCode || ''} onChangeText={(v) => updateServiceData({ billerCode: v.replace(/\D/g, '').slice(0, 6) })} />
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
    return <View><FormLabel>{serviceData.category === 'ewallet' ? 'Mobile number registered to the wallet' : 'Enter Bill / Account Number'}</FormLabel><FormInput placeholder={serviceData.category === 'ewallet' ? 'e.g. 0123456789' : 'Bill / account number'} keyboardType={serviceData.category === 'ewallet' ? 'phone-pad' : 'default'} autoCapitalize={serviceData.category === 'ewallet' ? 'none' : 'characters'} value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} />{serviceData.country === 'BD' && <><FormLabel>Bangladesh Mobile Number</FormLabel><FormInput placeholder='01XXXXXXXXX' keyboardType='phone-pad' value={serviceData.mobileNumber || ''} onChangeText={(v) => updateServiceData({ mobileNumber: v.replace(/\D/g, '').slice(0, 11) })} /></>}<ServiceInterruptionNotice notice={interruption} /><BillDetails bill={bill} loading={billLoading} /></View>;
  }
  if (step === 4) {
    const fixed = fixedAmountFor(serviceData);
    const cur = serviceData.currency || 'MYR';
    return <View>
      {fixed != null
        ? <><FormLabel>Amount</FormLabel><Text style={noneStyles.fixed}>{cur} {Number(fixed).toFixed(2)} - set by the voucher you chose</Text></>
        : <><FormLabel>Enter Amount ({cur})</FormLabel><FormInput placeholder='Amount' keyboardType='decimal-pad' value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} /></>}
      <ServiceInterruptionNotice notice={interruption} />
      <BillDetails bill={bill} loading={billLoading} />
      <SummaryCard rows={serviceData.category === 'jompay'
        ? [
            { label: 'Biller Code', value: serviceData.billerCode || '' },
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

function validateAccountStep(serviceData) {
  if (serviceData.category === 'jompay') {
    if (!/^\d{4,6}$/.test(String(serviceData.billerCode || '').trim())) return 'Please enter the JomPAY Biller Code printed on your bill.';
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
  if (step === 1 && !serviceData.category) return 'Please select a bill category.';
  if (step === 2 && !serviceData.provider) return 'Please select a bill provider.';
  if (step === 3) {
    const fieldError = validateAccountStep(serviceData);
    if (fieldError) return fieldError;
  }
  if (step === 4 && !(Number(serviceData.amount) > 0)) return 'Please enter a valid amount.';
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