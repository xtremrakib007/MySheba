import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import CountrySelectCard from '../components/CountrySelectCard';
import { FormLabel, FormInput, Grid3, OperatorCard, SummaryCard } from '../components/ui';
import { getBillerBrand } from '../data/billerBrand';
import ServiceArt from '../components/ServiceArt';
import { useTheme } from '../theme/ThemeContext';

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
      <ServiceArt name={item.art} size={38} color={colors.primary} />
      <Text style={[cardStyles.label, { color: colors.text }]} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );
}

const noneStyles = StyleSheet.create({
  none: { fontSize: 13, lineHeight: 19, opacity: 0.75, paddingVertical: 10 },
  fixed: { fontSize: 15, fontWeight: '700', paddingVertical: 10 },
});

const cardStyles = StyleSheet.create({
  card: { width: '30%', minHeight: 104, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 10 },
  label: { fontSize: 11.5, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});

export default function BillPaymentStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();
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
  if (step === 3) return <View><FormLabel>Enter Bill / Account Number</FormLabel><FormInput placeholder='Bill / account number' autoCapitalize='characters' value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} />{serviceData.country === 'BD' && <><FormLabel>Bangladesh Mobile Number</FormLabel><FormInput placeholder='01XXXXXXXXX' keyboardType='phone-pad' value={serviceData.mobileNumber || ''} onChangeText={(v) => updateServiceData({ mobileNumber: v.replace(/\\D/g, '').slice(0, 11) })} /></>}</View>;
  if (step === 4) {
    const fixed = fixedAmountFor(serviceData);
    const cur = serviceData.currency || 'MYR';
    return <View>
      {fixed != null
        ? <><FormLabel>Amount</FormLabel><Text style={noneStyles.fixed}>{cur} {Number(fixed).toFixed(2)} - set by the voucher you chose</Text></>
        : <><FormLabel>Enter Amount ({cur})</FormLabel><FormInput placeholder='Amount' keyboardType='decimal-pad' value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} /></>}
      <SummaryCard rows={[{ label: 'Provider', value: serviceData.provider || '' }, { label: 'Account', value: serviceData.accountNumber || '' }]} totalLabel='Bill amount' totalValue={`${cur} ${Number(serviceData.amount || 0).toFixed(2)}`} />
    </View>;
  }
  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.category) return 'Please select a bill category.';
  if (step === 2 && !serviceData.provider) return 'Please select a bill provider.';
  if (step === 3 && !(serviceData.accountNumber || '').trim()) return 'Please enter the bill or account number.';
  if (step === 3 && serviceData.country === 'BD' && !/^01\\d{9}$/.test(String(serviceData.mobileNumber || '').trim())) return 'Please enter a valid Bangladesh mobile number.';
  if (step === 4 && !(Number(serviceData.amount) > 0)) return 'Please enter a valid amount.';
  return null;
}

const styles = StyleSheet.create({ screen: { flex: 1 } });