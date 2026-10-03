import { operatorForNumber } from '../data/operatorPrefix';
import React, { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, SummaryCard } from '../components/ui';
import PackagePicker from '../components/PackagePicker';
import CountrySelectCard from '../components/CountrySelectCard';
import * as apiProviderService from '../firebase/apiProviderService';
import { isDriveWindowOpen, driveWindowClosedMessage } from '../utils/driveWindow';

// Offer Packs: Success TopUp's `drive` catalogue. Country -> operator -> phone
// -> package, same as Internet.
//
// These are the SAME kinds of product as the regular catalogue - Bundle, Voice,
// Data, Call Rate - at Success TopUp's commission-bearing tier, and they are the
// only catalogue that pays one (0-12% of price, averaging 4.9% across the 211
// packs in BD_Mobile_Operator_Packages.xlsx). That is why they get their own
// screen rather than being mixed into Internet: a voice-minutes pack does not
// belong under an "Internet" heading, which is the mistake this app already made
// once.
//
// Unlike every other service here, they are only on sale 10:00-22:00
// Asia/Dhaka (12:00-00:00 Asia/Kuala_Lumpur). The server enforces that at both
// the listing and the order; this screen only explains it.
//
// No category filter: all four categories are legitimately on offer here.
const OPERATOR_CODES = {
  Grameenphone: 'GP', Robi: 'RB', Banglalink: 'BL', Airtel: 'AT',
  Teletalk: 'TT', Skitto: 'SK', 'Brilliant Connect': 'BT', Ryze: 'RY',
};

export default function OfferPacksStep({ step }) {
  const { serviceData, updateServiceData, nextStep } = useApp();
  const OPERATOR_LIST = rechargeOperators[serviceData.country] || [];

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
    if (step !== 2) return;
    const phone = String(serviceData.phone || '');
    const detected = operatorForNumber(serviceData.country, phone, OPERATOR_LIST);
    if (!detected || autoSkippedFor.current === phone) return;
    autoSkippedFor.current = phone;
    if (serviceData.operator !== detected) updateServiceData({ operator: detected });
    nextStep();
  });
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [windowClosed, setWindowClosed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (serviceData.country !== 'BD' || step !== 3) return () => { alive = false; };
    if (!isDriveWindowOpen()) {
      setWindowClosed(true); setPackages([]); setLoading(false); setError('');
      return () => { alive = false; };
    }
    setWindowClosed(false); setLoading(true); setError('');
    apiProviderService
      .listSuccessTopUpDrives(OPERATOR_CODES[serviceData.operator] || 'ALL', 'drive', 'Offer Packs', serviceData.operator || '')
      .then((items) => { if (alive) setPackages(items); })
      .catch((e) => { if (alive) { setPackages([]); setError(e?.message || 'Unable to load offer packs.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, serviceData.operator, step]);

  if (step === 0) {
    return <View><FormLabel>Select Country</FormLabel><Grid3>{countries.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, operator: null, package: null, packageId: null, amount: null }); nextStep(); }} />)}</Grid3></View>;
  }

  if (step === 1) {
    return <View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Mobile number" keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} /></View>;
  }

  if (step === 2) {
    const list = rechargeOperators[serviceData.country] || [];
    return <View><FormLabel>Select Operator</FormLabel><Grid3>{list.map((o) => { const brand = getOperatorBrand(o); return <OperatorCard key={o} name={o} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { updateServiceData({ operator: o, package: null, packageId: null, amount: null }); nextStep(); }} />; })}</Grid3></View>;
  }

  if (step === 3) {
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
    const selected = packages.find((p) => p.name === serviceData.package);
    return (
      <View>
        {serviceData.country !== 'BD' && <FormLabel>Offer packs are available for Bangladesh only.</FormLabel>}
        {!!windowClosed && <FormLabel>{driveWindowClosedMessage()} Please come back during those hours.</FormLabel>}
        {!!loading && <FormLabel>Loading offer packs…</FormLabel>}
        {!!error && <FormLabel>{error}</FormLabel>}
        {!loading && !error && !windowClosed && serviceData.country === 'BD' && packages.length === 0 && <FormLabel>No offer packs are available for this operator right now. Try another operator, or use Internet or Recharge.</FormLabel>}
        {!loading && !error && (
          <PackagePicker
            packages={packages}
            label="Select Offer Pack"
            selectedName={serviceData.package}
            priceOf={shownPrice}
            currencyOf={shownCurrency}
            onSelect={(p) => updateServiceData({ package: p.name, packageId: p.id, amount: p.price })}
          />
        )}
        {!!selected && <SummaryCard totalLabel="Wallet deduction" totalValue={`${shownCurrency(selected)} ${Number(shownPrice(selected)).toFixed(2)}`} />}
      </View>
    );
  }

  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 2 && !serviceData.operator) return 'Please select an operator.';
  if (step === 1 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.';
  // The server will refuse a drive order outside the window anyway; saying so
  // here saves the customer filling in a form that cannot be submitted.
  if (step === 3 && !isDriveWindowOpen()) return driveWindowClosedMessage();
  if (step === 3 && !serviceData.packageId) return 'Please select an offer pack.';
  return null;
}
