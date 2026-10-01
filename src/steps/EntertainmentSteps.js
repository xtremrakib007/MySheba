import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators, amountToPoints } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, PackageCard, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';
import * as apiProviderService from '../firebase/apiProviderService';

// Entertainment flow: country -> operator -> phone -> package.
//
// Success TopUp has no separate entertainment endpoint. Its documented API buys
// any bundle the same way: list the catalogue with /api/drives, then POST
// /api/recharge with that package's `package_id`. So this is the Internet flow
// over the `drive` catalogue rather than the `regular` one, and the server
// treats both services through one code path (SUCCESS_TOPUP_PACKAGE_SERVICES).
//
// Only Bangladesh has a configured provider. Other countries show nothing
// rather than a list that cannot be bought.
const DRIVE_OPERATOR_CODES = {
  Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL', Airtel: 'AT',
  Teletalk: 'TT', Skitto: 'SK', 'Brilliant Connect': 'BT', Ryze: 'RY',
};

export default function EntertainmentStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates } = useApp();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    if (serviceData.country !== 'BD' || step !== 3) return () => { alive = false; };
    setLoading(true); setError('');
    apiProviderService
      .listSuccessTopUpDrives(DRIVE_OPERATOR_CODES[serviceData.operator] || 'ALL', 'drive', 'Entertainment')
      .then((items) => { if (alive) setPackages(items); })
      .catch((e) => { if (alive) { setPackages([]); setError(e?.message || 'Unable to load entertainment packages.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, serviceData.operator, step]);

  if (step === 0) {
    return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, operator: null, package: null, packageId: null, amount: null }); nextStep(); }} />)}</Grid3></View>;
  }

  if (step === 1) {
    const list = rechargeOperators[serviceData.country] || [];
    return <View><FormLabel>Select Operator</FormLabel><Grid3>{list.map((o) => { const brand = getOperatorBrand(o); return <OperatorCard key={o} name={o} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { updateServiceData({ operator: o, package: null, packageId: null, amount: null }); nextStep(); }} />; })}</Grid3></View>;
  }

  if (step === 2) {
    return <View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Mobile number" keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} /></View>;
  }

  if (step === 3) {
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const selected = packages.find((p) => p.name === serviceData.package);
    const walletDeductionMyr = isForeign && selected ? amountToPoints(selected.price, serviceData.country, rates) : null;
    return (
      <View>
        <FormLabel>Select Entertainment Package</FormLabel>
        {serviceData.country !== 'BD' && <FormLabel>Entertainment packages are available for Bangladesh only right now.</FormLabel>}
        {!!loading && <FormLabel>Loading entertainment packages…</FormLabel>}
        {!!error && <FormLabel>{error}</FormLabel>}
        {!loading && !error && serviceData.country === 'BD' && packages.length === 0 && <FormLabel>No entertainment packages are available for this operator right now.</FormLabel>}
        {!loading && !error && packages.map((p) => <PackageCard key={p.id} name={p.name} detail={`${p.data} • ${p.valid}`} price={p.price} currency={cur} selected={serviceData.package === p.name} onPress={() => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })} />)}
        {!!(isForeign && selected) && <SummaryCard rows={[{ label: 'Package Price', value: `${cur} ${Number(selected.price).toFixed(2)}` }]} totalLabel="Wallet deduction" totalValue={`${walletDeductionMyr.toFixed(2)} MYR`} />}
      </View>
    );
  }

  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.operator) return 'Please select an operator.';
  if (step === 2 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.';
  // packageId is what the provider actually buys - a name with no id cannot be
  // dispatched, so never let the order through on the label alone.
  if (step === 3 && !serviceData.packageId) return 'Please select an entertainment package.';
  return null;
}
