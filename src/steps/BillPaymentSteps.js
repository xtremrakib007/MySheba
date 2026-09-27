import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import CountrySelectCard from '../components/CountrySelectCard';
import { FormLabel, FormInput, Grid3, OperatorCard, SummaryCard } from '../components/ui';
import { getBillerBrand } from '../data/billerBrand';
import ServiceArt from '../components/ServiceArt';
import { useTheme } from '../theme/ThemeContext';

const BILLERS = {
  MY: {
    electricity: ['TNB'],
    water: ['Air Selangor', 'Lembaga Air Perak', 'PBAPP', 'SAJ'],
    internet: ['Unifi', 'TIME', 'Maxis'],
    tv: ['Astro'],
    mobile: ['CelcomDigi', 'Maxis', 'U Mobile'],
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
};

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
  return CATEGORIES.filter((c) => (BILLERS[country]?.[c.key] || []).length > 0);
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

const cardStyles = StyleSheet.create({
  card: { width: '30%', minHeight: 104, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 10 },
  label: { fontSize: 11.5, fontWeight: '700', textAlign: 'center', marginTop: 8 },
});

export default function BillPaymentStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();
  if (step === 0) return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, category: null, provider: null, accountNumber: '', amount: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 1) return <View><FormLabel>Select Bill Category</FormLabel><Grid3>{categoriesFor(serviceData.country).map((item) => <CategoryCard key={item.key} item={item} selected={serviceData.category === item.key} onPress={() => { updateServiceData({ category: item.key, provider: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 2) { const providers = BILLERS[serviceData.country]?.[serviceData.category] || []; return <View><FormLabel>Select Provider</FormLabel>{providers.length ? <Grid3>{providers.map((provider) => { const brand = getBillerBrand(provider); return <OperatorCard key={provider} name={provider} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.provider === provider} onPress={() => { updateServiceData({ provider }); nextStep(); }} />; })}</Grid3> : <Text>No biller is configured for this country and category yet.</Text>}</View>; }
  if (step === 3) return <View><FormLabel>Enter Bill / Account Number</FormLabel><FormInput placeholder='Bill / account number' autoCapitalize='characters' value={serviceData.accountNumber || ''} onChangeText={(v) => updateServiceData({ accountNumber: v })} /></View>;
  if (step === 4) return <View><FormLabel>Enter Amount ({serviceData.currency || 'MYR'})</FormLabel><FormInput placeholder='Amount' keyboardType='decimal-pad' value={serviceData.amount != null ? String(serviceData.amount) : ''} onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })} /><SummaryCard rows={[{ label: 'Provider', value: serviceData.provider || '' }, { label: 'Account', value: serviceData.accountNumber || '' }]} totalLabel='Bill amount' totalValue={`${serviceData.currency || 'MYR'} ${Number(serviceData.amount || 0).toFixed(2)}`} /></View>;
  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.category) return 'Please select a bill category.';
  if (step === 2 && !serviceData.provider) return 'Please select a bill provider.';
  if (step === 3 && !(serviceData.accountNumber || '').trim()) return 'Please enter the bill or account number.';
  if (step === 4 && !(Number(serviceData.amount) > 0)) return 'Please enter a valid amount.';
  return null;
}

const styles = StyleSheet.create({ screen: { flex: 1 } });