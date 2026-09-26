import React from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators, amountToPoints } from '../data/countries';
import { getMergedPackages } from '../utils/internetPackages';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';

// Internet flow: country -> operator -> phone -> package.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function InternetStep({ step }) {
  const { serviceData, updateServiceData, nextStep, internetPricing, rates } = useApp();

  if (step === 0) {
    return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, operator: null, package: null, amount: null }); nextStep(); }} />)}</Grid3></View>;
  }

  if (step === 1) {
    const list = rechargeOperators[serviceData.country] || ['Operator 1', 'Operator 2'];
    return <View><FormLabel>Select Operator</FormLabel><Grid3>{list.map((o) => { const brand = getOperatorBrand(o); return <OperatorCard key={o} name={o} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { updateServiceData({ operator: o, package: null, amount: null }); nextStep(); }} />; })}</Grid3></View>;
  }

  if (step === 2) {
    return <View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Mobile number" keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} /></View>;
  }

  if (step === 3) {
    const packages = getMergedPackages(serviceData.operator, internetPricing[serviceData.operator]);
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const selectedPackage = packages.find((p) => p.name === serviceData.package);
    const walletDeductionMyr = isForeign && selectedPackage ? amountToPoints(selectedPackage.price, serviceData.country, rates) : null;
    return (
      <View>
        <FormLabel>Select Package</FormLabel>
        {packages.map((p) => <PackageCard key={p.name} name={p.name} detail={`${p.data} • ${p.valid}`} price={p.price} currency={cur} selected={serviceData.package === p.name} onPress={() => updateServiceData({ package: p.name, amount: p.price })} />)}
        {isForeign && selectedPackage && <SummaryCard rows={[{ label: 'Package Price', value: `${cur} ${Number(selectedPackage.price).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}
      </View>
    );
  }

  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.operator) return 'Please select an operator.';
  if (step === 2 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.';
  if (step === 3 && !serviceData.package) return 'Please select a package.';
  return null;
}
