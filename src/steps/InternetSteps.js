import { operatorForNumber } from '../data/operatorPrefix';
import React, { useEffect, useState, useRef } from 'react';
import { View } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, internetOperators } from '../data/countries';
import { getMergedPackages } from '../utils/internetPackages';
import { resolvePackageSource } from '../utils/packageSource';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, OperatorCard, FormInput, SummaryCard } from '../components/ui';
import PackagePicker from '../components/PackagePicker';
import CountrySelectCard from '../components/CountrySelectCard';
import * as apiProviderService from '../firebase/apiProviderService';
import { useIimmpactCatalog } from '../firebase/iimmpactCatalogStore';
import { extraDataOperators } from '../data/iimmpactRecharge';
import ServiceInterruptionNotice from '../components/ServiceInterruptionNotice';
import { useNetworkStatus } from '../components/useNetworkStatus';

// Internet flow: country -> operator -> phone -> package.
// Customer-facing wallet values are always displayed as MYR. The legacy
// conversion helper remains internal for settlement compatibility.
export default function InternetStep({ step }) {
  const { serviceData, updateServiceData, nextStep, internetPricing } = useApp();
  // Malaysia's list also carries any data operator IIMMPACT sells beyond the
  // built-in names, so every Mobile Data product can be reached.
  const { catalog: iimmpactCatalog } = useIimmpactCatalog({ enabled: serviceData.country === 'MY' });
  const builtInOperators = internetOperators[serviceData.country] || [];
  const OPERATOR_LIST = serviceData.country === 'MY'
    ? [...builtInOperators, ...extraDataOperators(iimmpactCatalog, builtInOperators)]
    : builtInOperators;

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

  // Plans the provider resolves for THIS number, where one does that.
  //
  // `null` means "not asked yet or not offered here" and is what keeps the
  // built-in package list showing for every operator and country that works the
  // old way. An empty array is a different answer - the provider was asked
  // about this number and had nothing - and says so on screen rather than
  // quietly falling back to a list this number may not be eligible for.
  const [perNumberPlans, setPerNumberPlans] = useState(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState('');
  // Why the provider has no per-number plans here ('no-provider',
  // 'no-product'), so the step can say so instead of drawing nothing.
  const [plansReason, setPlansReason] = useState('');
  const phone = String(serviceData.phone || '').trim();
  const operator = serviceData.operator || '';
  useEffect(() => {
    let alive = true;
    if (step !== 3 || serviceData.country === 'BD' || !serviceData.country || !operator || !phone) {
      setPerNumberPlans(null);
      return () => { alive = false; };
    }
    setPlansLoading(true); setPlansError(''); setPlansReason('');
    apiProviderService.listProviderDataPlans({ service: 'Internet', country: serviceData.country, operator, phone })
      .then(({ plans, supported, reason }) => { if (alive) { setPerNumberPlans(supported ? plans : null); setPlansReason(supported ? '' : (reason || 'unsupported')); } })
      // A failure here must NOT fall through to the built-in list: that list is
      // not what this number was quoted from, and the server would refuse the
      // order anyway once a per-number catalogue is configured. Saying so is
      // the only honest option.
      .catch((e) => { if (alive) { setPerNumberPlans(null); setPlansError(e?.message || 'Unable to load the plans for this number.'); } })
      .finally(() => { if (alive) setPlansLoading(false); });
    return () => { alive = false; };
  }, [serviceData.country, operator, phone, step]);

  // Advisory only, never wired into validateStep. The product code comes from
  // the plan once one is chosen, because an operator can map to more than one
  // product (CelcomDigi is Celcom AND Digi) and warning about the half the
  // customer is not on would talk them out of a payment that would have
  // worked. Before a plan is picked the server answers only for an operator
  // that is unambiguous.
  const interruption = useNetworkStatus({
    service: 'Internet',
    country: serviceData.country,
    operator,
    productCode: serviceData.operatorCode,
    active: step === 3,
  });

  if (step === 0) {
    // International Internet lists destinations abroad that sell packages;
    // Malaysia's packages are the Internet tile's.
    const destinations = serviceData.internationalOnly
      ? countries.filter((c) => c.code !== 'MY' && (internetOperators[c.code] || []).length > 0)
      : countries;
    return <View><FormLabel>Select Country</FormLabel><Grid3>{destinations.map((c) => <CountrySelectCard key={c.code} code={c.code} flag={c.flag} name={c.name} selected={serviceData.country === c.code} onPress={() => { updateServiceData({ country: c.code, currency: c.curr, operator: null, package: null, amount: null }); nextStep(); }} />)}</Grid3></View>;
  }

  if (step === 1) {
    return <View><FormLabel>Enter Mobile Number</FormLabel><FormInput placeholder="Mobile number" keyboardType="phone-pad" value={serviceData.phone || ''} onChangeText={(v) => updateServiceData({ phone: v })} /></View>;
  }

  if (step === 2) {
    const list = OPERATOR_LIST;
    return <View><FormLabel>Select Operator</FormLabel><Grid3>{list.map((o) => { const brand = getOperatorBrand(o); return <OperatorCard key={o} name={o} logo={brand.logo} color={brand.color} initials={brand.initials} selected={serviceData.operator === o} onPress={() => { updateServiceData({ operator: o, package: null, amount: null }); nextStep(); }} />; })}</Grid3></View>;
  }

  if (step === 3) {
    const source = resolvePackageSource({
      country: serviceData.country,
      perNumber: perNumberPlans,
      perNumberError: plansError,
      successTopUp: successTopUpPackages,
      builtIn: getMergedPackages(serviceData.operator, internetPricing[serviceData.operator]),
      // Non-Bangladesh Internet plans come from IIMMPACT per phone number.
      // Never display the old hardcoded package prices as a fallback.
      requirePerNumber: serviceData.country !== 'BD',
    });
    const packages = source.packages;
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
        <ServiceInterruptionNotice notice={interruption} />
        {!!packageLoading && <FormLabel>Loading MySheba packages…</FormLabel>}
        {!!plansLoading && <FormLabel>Checking which plans this number can buy…</FormLabel>}
        {!!packageError && <FormLabel>{packageError}</FormLabel>}
        {!!plansError && <FormLabel>{plansError}</FormLabel>}
        {!packageLoading && !packageError && serviceData.country === 'BD' && packages.length === 0 && <FormLabel>No internet packages are available for this operator right now. Try another operator, or use Recharge for a plain top-up.</FormLabel>}
        {!plansLoading && !!source.emptyForNumber && <FormLabel>This number has no data plans available right now. Try Recharge for a plain top-up.</FormLabel>}
        {/* Blocked with no error: the provider answered that it has no
            per-number plans for this operator. Said, never a blank page. */}
        {!plansLoading && !plansError && !!source.blocked && <FormLabel>{noPlansMessage(plansReason, operator, phone)}</FormLabel>}
        {!packageLoading && !packageError && !plansLoading && !source.blocked && (
          <>
            {!!source.perNumber && packages.length > 0 && <FormLabel>Plans available on {phone}</FormLabel>}
            <PackagePicker
              packages={packages}
              label="Select Package"
              selectedName={serviceData.package}
              priceOf={shownPrice}
              currencyOf={shownCurrency}
              // operatorCode rides along so the order is placed against the
              // product this plan actually came from. The server re-resolves it
              // either way - it is not taken on trust - but sending it keeps a
              // provider record that templates {{operatorCode}} working for
              // operators that map to a single product.
              onSelect={(p) => updateServiceData({ package: p.name, packageId: p.id, amount: p.price, operatorCode: p.productCode || '' })}
            />
          </>
        )}
        {!!selectedPackage && <SummaryCard totalLabel="Wallet deduction" totalValue={`${shownCurrency(selectedPackage)} ${Number(shownPrice(selectedPackage)).toFixed(2)}`} />}
      </View>
    );
  }

  return null;
}

// What to say when there are no per-number plans and nothing went wrong.
export function noPlansMessage(reason, operator, phone) {
  if (!phone || !operator) return 'Enter the mobile number and choose the operator to see its plans.';
  if (reason === 'no-provider') return 'Internet plans are not set up for this country yet. Please use Recharge for a plain top-up.';
  if (reason === 'no-product') return `Internet plans for ${operator} are not available right now. Try another operator, or use Recharge for a plain top-up.`;
  return `Internet plans for ${operator} could not be loaded. Go Back and try again.`;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 0 && serviceData.internationalOnly && String(serviceData.country).toUpperCase() === 'MY') return 'Malaysian packages are under Internet.';
  if (step === 2 && !serviceData.operator) return 'Please select an operator.';
  if (step === 1 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.';
  if (step === 3 && !serviceData.package) return 'Please select a package.';
  return null;
}
