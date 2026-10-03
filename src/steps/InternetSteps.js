import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators } from '../data/countries';
import { getMergedPackages } from '../utils/internetPackages';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';
import * as apiProviderService from '../firebase/apiProviderService';

// Internet flow: country -> operator -> phone -> package.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function InternetStep({ step }) {
  const { serviceData, updateServiceData, nextStep, internetPricing } = useApp();
  const [successTopUpPackages, setSuccessTopUpPackages] = useState([]);
  const [packageLoading, setPackageLoading] = useState(false);
  const [packageError, setPackageError] = useState('');
  useEffect(() => {
    let alive = true;
    if (serviceData.country !== 'BD' || step !== 3) return () => { alive = false; };
    setPackageLoading(true); setPackageError('');
    const operatorMap = { Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL', Airtel: 'AT', Teletalk: 'TT', Skitto: 'SK', 'Brilliant Connect': 'BT', Ryze: 'RY' };
    apiProviderService.listSuccessTopUpDrives(operatorMap[serviceData.operator] || 'ALL', 'regular', 'Internet', serviceData.operator || '')
      // Success TopUp's `regular` catalogue IS the internet catalogue, so it is
      // shown whole. It used to be filtered to Data and Bundle, which hid the
      // Voice and Call Rate packs that are sold on the same screen.
      .then((items) => { if (alive) setSuccessTopUpPackages(items); })
      .catch((e) => { if (alive) { setSuccessTopUpPackages([]); setPackageError(e?.message || 'Unable to load Success TopUp packages.'); } })
      .finally(() => { if (alive) setPackageLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, serviceData.operator, step]);

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
    const packages = serviceData.country === 'BD' ? successTopUpPackages : getMergedPackages(serviceData.operator, internetPricing[serviceData.operator]);
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    // One number, in the customer's own wallet currency, from the server. The
    // catalogue price is a foreign figure the customer neither pays nor needs,
    // and anything computed here could only ever approximate the charge: the
    // per-unit price, the tier discount and the wallet sell rate are not on
    // this device. Falls back to the catalogue price if the server could not
    // quote, which beats showing nothing.
    const shownPrice = (p) => (p.walletPrice != null ? p.walletPrice : p.price);
    const shownCurrency = (p) => (p.walletPrice != null ? p.walletCurrency : cur);
    const selectedPackage = packages.find((p) => p.name === serviceData.package);
    return (
      <View>
        <FormLabel>Select Package</FormLabel>
        {!!packageLoading && <FormLabel>Loading Success TopUp packages…</FormLabel>}
        {!!packageError && <FormLabel>{packageError}</FormLabel>}
        {!packageLoading && !packageError && serviceData.country === 'BD' && packages.length === 0 && <FormLabel>No internet packages are available for this operator right now. Try another operator, or use Recharge for a plain top-up.</FormLabel>}
        {!packageLoading && !packageError && packages.map((p) => <PackageCard key={p.id || p.name} name={p.name} detail={[p.data, p.valid, p.category].filter(Boolean).join(' • ')} price={shownPrice(p)} currency={shownCurrency(p)} selected={serviceData.package === p.name} onPress={() => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })} />)}
        {!!selectedPackage && <SummaryCard totalLabel="Wallet deduction" totalValue={`${shownCurrency(selectedPackage)} ${Number(shownPrice(selectedPackage)).toFixed(2)}`} />}
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
