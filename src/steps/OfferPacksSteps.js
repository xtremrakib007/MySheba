import { operatorForNumber } from '../data/operatorPrefix';
import React, { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { resolvePackageSource } from '../utils/packageSource';
import ServiceInterruptionNotice from '../components/ServiceInterruptionNotice';
import { useNetworkStatus } from '../components/useNetworkStatus';
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
    if (serviceData.country !== 'BD' || step !== 3) {
      // Cleared, not just skipped: a closed-window message left over from
      // Bangladesh would otherwise follow the customer to another country.
      setWindowClosed(false);
      return () => { alive = false; };
    }
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

  // Offer packs outside Bangladesh.
  //
  // They were Bangladesh-only because Success TopUp's `drive` catalogue was the
  // only source there has ever been for them - not because another country
  // could not have any. A provider that prices packs per phone number supplies
  // them the same way it supplies internet plans, and the pack the customer
  // picks already carries that provider's own product code as its id, so there
  // is no separate code map for this: the catalogue IS the list of products.
  //
  // null means "not offered here", which is still the answer for every country
  // with no such provider, and keeps the honest message below.
  const [perNumberPlans, setPerNumberPlans] = useState(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState('');
  const phone = String(serviceData.phone || '').trim();
  const operator = serviceData.operator || '';
  useEffect(() => {
    let alive = true;
    if (step !== 3 || serviceData.country === 'BD' || !serviceData.country || !operator || !phone) {
      setPerNumberPlans(null);
      return () => { alive = false; };
    }
    setPlansLoading(true); setPlansError('');
    apiProviderService.listProviderDataPlans({ service: 'Offer Packs', country: serviceData.country, operator, phone })
      .then(({ plans, supported }) => { if (alive) setPerNumberPlans(supported ? plans : null); })
      // A failure must not fall through to showing nothing as though none were
      // offered: the server would refuse an order against a list this number
      // was not quoted from anyway.
      .catch((e) => { if (alive) { setPerNumberPlans(null); setPlansError(e?.message || 'Unable to load the packs for this number.'); } })
      .finally(() => { if (alive) setPlansLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, operator, phone, step]);

  const interruption = useNetworkStatus({
    service: 'Offer Packs',
    country: serviceData.country,
    operator,
    productCode: serviceData.operatorCode,
    active: step === 3,
  });

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
    const source = resolvePackageSource({
      country: serviceData.country,
      perNumber: perNumberPlans,
      perNumberError: plansError,
      successTopUp: packages,
      builtIn: [],
    });
    const shown = source.packages;
    // Still the truth for every country with no per-number provider, which is
    // all of them until one is configured - but it is now a statement about
    // what is set up rather than a rule baked into the screen.
    const notOfferedHere = serviceData.country !== 'BD' && !source.perNumber && !plansLoading && !plansError;
    const selected = shown.find((p) => p.name === serviceData.package);
    return (
      <View>
        <ServiceInterruptionNotice notice={interruption} />
        {!!notOfferedHere && <FormLabel>Offer packs are not available for this country yet.</FormLabel>}
        {!!windowClosed && <FormLabel>{driveWindowClosedMessage()} Please come back during those hours.</FormLabel>}
        {!!loading && <FormLabel>Loading offer packs…</FormLabel>}
        {!!plansLoading && <FormLabel>Checking which packs this number can buy…</FormLabel>}
        {!!error && <FormLabel>{error}</FormLabel>}
        {!!plansError && <FormLabel>{plansError}</FormLabel>}
        {!loading && !error && !windowClosed && serviceData.country === 'BD' && shown.length === 0 && <FormLabel>No offer packs are available for this operator right now. Try another operator, or use Internet or Recharge.</FormLabel>}
        {!plansLoading && !!source.emptyForNumber && <FormLabel>This number has no offer packs available right now. Try Internet or Recharge.</FormLabel>}
        {!loading && !error && !plansLoading && !source.blocked && (
          <>
            {!!source.perNumber && shown.length > 0 && <FormLabel>Packs available on {phone}</FormLabel>}
            <PackagePicker
              packages={shown}
              label="Select Offer Pack"
              selectedName={serviceData.package}
              priceOf={shownPrice}
              currencyOf={shownCurrency}
              onSelect={(p) => updateServiceData({ package: p.name, packageId: p.id, amount: p.price, operatorCode: p.productCode || '' })}
            />
          </>
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
  // Scoped to Bangladesh, which is whose window it is: the drive window is
  // Success TopUp's selling hours, 10:00-22:00 Dhaka. Unscoped it would refuse
  // a Malaysian offer pack at nine in the evening for a reason that has nothing
  // to do with it - which it did the moment packs stopped being BD-only.
  if (step === 3 && serviceData.country === 'BD' && !isDriveWindowOpen()) return driveWindowClosedMessage();
  if (step === 3 && !serviceData.packageId) return 'Please select an offer pack.';
  return null;
}
