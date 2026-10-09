import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import StepBar from '../components/StepBar';
import { PrimaryButton, OutlineButton } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import SmartAd from '../components/SmartAd';

import RechargeStep, { validateStep as validateRecharge } from '../steps/RechargeSteps';
import MobileBankingStep, { validateStep as validateMobileBanking } from '../steps/MobileBankingSteps';
import InternetStep, { validateStep as validateInternet } from '../steps/InternetSteps';
import RemittanceStep, { validateStep as validateRemittance } from '../steps/RemittanceSteps';
import BillPaymentStep, { validateStep as validateBillPayment } from '../steps/BillPaymentSteps';
import OfferPacksStep, { validateStep as validateOfferPacks } from '../steps/OfferPacksSteps';
import EntertainmentStep, { validateStep as validateEntertainment } from '../steps/EntertainmentSteps';
import BusStep from '../steps/BusSteps';
import TrainStep from '../steps/TrainSteps';
import FlightStep from '../steps/FlightSteps';
import { validateStep as validateTravelInquiry } from '../steps/TravelInquirySteps';
import ServiceRateBar from '../components/ServiceRateBar';
import ESimStep, { validateStep as validateESim } from '../steps/ESimSteps';

const SERVICE_TITLES = {
  recharge: 'Recharge',
  mobilebanking: 'Mobile Banking',
  internet: 'Internet',
  remittance: 'Remittance',
  billpayment: 'Bill Payment',
  offerpacks: 'Offer Packs',
  entertainment: 'Entertainment',
  bus: 'Bus',
  train: 'Train',
  flight: 'Flight',
  esim: 'eSIM',
};

const STEP_COMPONENTS = {
  recharge: RechargeStep,
  mobilebanking: MobileBankingStep,
  internet: InternetStep,
  remittance: RemittanceStep,
  billpayment: BillPaymentStep,
  offerpacks: OfferPacksStep,
  entertainment: EntertainmentStep,
  bus: BusStep,
  train: TrainStep,
  flight: FlightStep,
  esim: ESimStep,
};

// Each service's required-field check for its current step. Returns null
// when the step is complete, or a message to show the user when it isn't.
const VALIDATORS = {
  recharge: validateRecharge,
  mobilebanking: validateMobileBanking,
  internet: validateInternet,
  remittance: validateRemittance,
  billpayment: validateBillPayment,
  offerpacks: validateOfferPacks,
  entertainment: validateEntertainment,
  bus: validateTravelInquiry,
  train: validateTravelInquiry,
  flight: validateTravelInquiry,
  esim: validateESim,
};

// PHASE 4 - MySheba Advertisement System. Maps this screen's own
// currentService key to the ad system's FEATURE_IDS/PLACEMENT_IDS
// (src/constants/adFeatures.ts / adPlacements.ts) - a separate, small
// vocabulary from SERVICE_TITLES/STEP_COMPONENTS above on purpose (see
// adFeatures.ts's header comment on why the two aren't unified). 'bus'
// and 'train' have no entry here deliberately - the ad system's 12
// features (adFeatures.ts) only define an "Air Ticket" placement, not
// separate Bus/Train ones, so those two services render no SmartAd slot.
const AD_SLOTS = {
  recharge: { feature: 'mobile_recharge', top: 'RECHARGE_TOP', bottom: 'RECHARGE_BOTTOM' },
  mobilebanking: { feature: 'mobile_banking', top: 'MOBILE_BANKING_TOP', bottom: 'MOBILE_BANKING_BOTTOM' },
  internet: { feature: 'internet_package', top: 'INTERNET_TOP', bottom: 'INTERNET_BOTTOM' },
  remittance: { feature: 'remittance', top: 'REMITTANCE_TOP', bottom: 'REMITTANCE_BOTTOM' },
  flight: { feature: 'air_ticket', top: 'FLIGHT_TOP', bottom: 'FLIGHT_BOTTOM' },
  offerpacks: { feature: 'internet', top: 'INTERNET_TOP', bottom: 'INTERNET_BOTTOM' },
  entertainment: { feature: 'entertainment', top: 'ENTERTAINMENT_TOP', bottom: 'ENTERTAINMENT_BOTTOM' },
};

export default function ServiceScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { currentService, currentStep, totalSteps, serviceData, goBackOrHome, nextStep, prevStep, setScreen, submitting } = useApp();

  const StepComponent = STEP_COMPONENTS[currentService];
  const title = SERVICE_TITLES[currentService] || 'Service';
  const isLast = currentStep === totalSteps - 1;
  const adSlot = AD_SLOTS[currentService];
  const isBangladeshApiService =
    ['recharge', 'internet', 'offerpacks', 'entertainment', 'billpayment'].includes(currentService) &&
    String(serviceData?.country || '').trim().toUpperCase() === 'BD';
  // Only Bill Payment pays a bill. Internet, Offer Packs and Entertainment are
  // all one package purchase through /api/recharge, and the chain here named
  // only `internet`, so Offer Packs and Entertainment both finished on "Pay
  // Bill" - telling someone buying a data pack they are paying a bill.
  const finalButtonLabel = isBangladeshApiService
    ? (currentService === 'recharge'
      ? 'Recharge Now'
      : currentService === 'billpayment'
        ? 'Pay Bill'
        : 'Buy Package')
    : 'Submit';

  // Same step-at-a-time behaviour as the "← Back" button in the nav bar
  // below - only leaves the wizard entirely once we're already on step 1.
  const onHeaderBack = () => {
    if (currentStep > 0) prevStep();
    else goBackOrHome();
  };

  const onNext = () => {
    const validate = VALIDATORS[currentService];
    if (validate) {
      const message = validate(currentStep, serviceData);
      if (message) {
        showAlert('Missing information', message);
        return;
      }
    }
    if (!isLast) nextStep();
    else if (!submitting) setScreen('confirmTransaction');
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={onHeaderBack}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </LinearGradient>

      <StepBar totalSteps={totalSteps} currentStep={currentStep} />

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
        {!!adSlot && <SmartAd placement={adSlot.top} feature={adSlot.feature} height={100} style={{ marginBottom: 12 }} />}
        <ServiceRateBar service={currentService} />
        {StepComponent ? <StepComponent step={currentStep} /> : <Text>Service content</Text>}
        {!!adSlot && <SmartAd placement={adSlot.bottom} feature={adSlot.feature} height={100} style={{ marginTop: 12 }} />}
      </ScrollView>

      <View style={styles.navBar}>
        <View style={styles.btnGroup}>
          {currentStep > 0 && <OutlineButton label="← Back" onPress={prevStep} />}
          <PrimaryButton
            label={isLast ? (submitting ? 'Processing...' : finalButtonLabel) : 'Next →'}
            onPress={onNext}
            disabled={isLast && submitting}
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    content: { flex: 1 },
    navBar: { padding: 14, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: '#EEE' },
    btnGroup: { flexDirection: 'row', gap: 10 },
  });
}
