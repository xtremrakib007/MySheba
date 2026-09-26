import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries } from '../data/countries';
import CountrySelectCard from '../components/CountrySelectCard';
import { FormLabel, FormInput, Grid3, OperatorCard, SummaryCard } from '../components/ui';

const BILLERS = {
  MY: {
    electricity: ['TNB'],
    water: ['Air Selangor', 'PBAPP', 'SAJ'],
    internet: ['Unifi', 'TIME', 'Maxis'],
    tv: ['Astro'],
    mobile: ['CelcomDigi', 'Maxis', 'U Mobile'],
    utilities: ['Indah Water'],
  },
  BD: {
    electricity: ['DESCO', 'DPDC', 'NESCO', 'Palli Bidyut'],
    water: ['WASA'],
    internet: ['ISP'],
    tv: ['TV / Cable'],
    mobile: ['Grameenphone', 'Robi', 'Banglalink'],
    utilities: ['Gas / Utilities'],
  },
};

const CATEGORIES = [
  { key: 'electricity', label: 'Electricity', icon: '⚡' },
  { key: 'water', label: 'Water', icon: '💧' },
  { key: 'internet', label: 'Internet & Broadband', icon: '📡' },
  { key: 'tv', label: 'TV / Astro', icon: '📺' },
  { key: 'mobile', label: 'Postpaid Mobile', icon: '📱' },
  { key: 'utilities', label: 'Other Utilities', icon: '🏢' },
];

export default function BillPaymentStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();
  if (step === 0) return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, category: null, provider: null, accountNumber: '', amount: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 1) return <View><FormLabel>Select Bill Category</FormLabel><Grid3>{CATEGORIES.map((item) => <OperatorCard key={item.key} name={item.label} initials={item.icon} selected={serviceData.category === item.key} onPress={() => { updateServiceData({ category: item.key, provider: null }); nextStep(); }} />)}</Grid3></View>;
  if (step === 2) { const providers = BILLERS[serviceData.country]?.[serviceData.category] || []; return <View><FormLabel>Select Provider</FormLabel>{providers.length ? <Grid3>{providers.map((provider) => <OperatorCard key={provider} name={provider} initials='BP' selected={serviceData.provider === provider} onPress={() => { updateServiceData({ provider }); nextStep(); }} />)}</Grid3> : <Text>No biller is configured for this country and category yet.</Text>}</View>; }
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