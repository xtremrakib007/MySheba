import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators, amountToPoints } from '../data/countries';
import { getMergedPackages } from '../utils/internetPackages';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';
import * as apiProviderService from '../firebase/apiProviderService';

// Internet flow: country -> operator -> phone -> package.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function InternetStep({ step }) {
  const { serviceData, updateServiceData, nextStep, internetPricing, rates } = useApp();
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
    // What the wallet is actually charged, on every row rather than only on the
    // one already chosen. Recharge offers six amounts, so its summary card is
    // enough; a 63-package catalogue priced in BDT tells a MYR wallet holder
    // nothing until they have picked one and scrolled past the list.
    const walletCost = (price) => (isForeign && Number(price) > 0
      ? `≈ ${amountToPoints(Number(price), serviceData.country, rates).toFixed(2)} MYR`
      : '');
    const selectedPackage = packages.find((p) => p.name === serviceData.package);
    const walletDeductionMyr = isForeign && selectedPackage ? amountToPoints(selectedPackage.price, serviceData.country, rates) : null;
    return (
      <View>
        <FormLabel>Select Package</FormLabel>
        {!!packageLoading && <FormLabel>Loading Success TopUp packages…</FormLabel>}
        {!!packageError && <FormLabel>{packageError}</FormLabel>}
        {!packageLoading && !packageError && serviceData.country === 'BD' && packages.length === 0 && <FormLabel>No internet packages are available for this operator right now. Try another operator, or use Recharge for a plain top-up.</FormLabel>}
        {!packageLoading && !packageError && packages.map((p) => <PackageCard key={p.id || p.name} subPrice={walletCost(p.price)} name={p.name} detail={[p.data, p.valid, p.category].filter(Boolean).join(' • ')} price={p.price} currency={cur} selected={serviceData.package === p.name} onPress={() => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })} />)}
        {!!(isForeign && selectedPackage) && <SummaryCard rows={[{ label: 'Package Price', value: `${cur} ${Number(selectedPackage.price).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}
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
