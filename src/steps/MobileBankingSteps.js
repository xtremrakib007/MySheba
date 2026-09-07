import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { FormLabel, Grid3, OperatorCard, FormInput, SummaryCard } from '../components/ui';
import { radius } from '../theme/theme';
import { providerBrand } from '../data/providerBrand';

import { useTheme } from "../theme/ThemeContext";

const PROVIDERS = [
  { key: 'bKash' },
  { key: 'Nagad' },
  { key: 'Rocket' },
];

// Mirrors buildMBStep() - 3 steps: provider -> receiver phone -> dual amount calc
export default function MobileBankingStep({ step }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { serviceData, updateServiceData, nextStep, rates } = useApp();
  const rate = rates.mobileBanking || 110.5;

  if (step === 0) {
    return (
      <View>
        <FormLabel>Select Provider</FormLabel>
        <Grid3>
          {PROVIDERS.map((p) => {
            const brand = providerBrand[p.key] || {};
            return (
              <OperatorCard
                key={p.key}
                name={p.key}
                logo={brand.logo}
                color={brand.color}
                initials={brand.initials}
                selected={serviceData.provider === p.key}
                onPress={() => { updateServiceData({ provider: p.key }); nextStep(); }}
              />
            );
          })}
        </Grid3>
      </View>
    );
  }

  if (step === 1) {
    return (
      <View>
        <FormLabel>Receiver Mobile Number</FormLabel>
        <FormInput
          placeholder="Phone number"
          keyboardType="phone-pad"
          maxLength={11}
          value={serviceData.phone || ''}
          onChangeText={(v) => updateServiceData({ phone: v })}
        />
      </View>
    );
  }

  if (step === 2) {
    const myr = serviceData.myr || 0;
    const bdt = serviceData.bdt || 0;
    return (
      <View>
        <View style={styles.rateBox}><Text style={styles.rateBoxText}>💱 Rate: 1 MYR = BDT {rate}</Text></View>
        <View style={styles.dualInput}>
          <Text style={styles.currencyLabel}>🇲🇾 You Send (MYR)</Text>
          <FormInput
            keyboardType="numeric"
            placeholder="0.00"
            style={styles.dualField}
            value={serviceData.myr != null ? String(serviceData.myr) : ''}
            onChangeText={(v) => { const n = parseFloat(v) || 0; updateServiceData({ myr: n, bdt: n * rate }); }}
          />
        </View>
        <Text style={{ textAlign: 'center', paddingVertical: 6 }}>⬇️</Text>
        <View style={styles.dualInput}>
          <Text style={styles.currencyLabel}>🇧🇩 Receiver Gets (BDT)</Text>
          <FormInput
            keyboardType="numeric"
            placeholder="0.00"
            style={styles.dualField}
            value={serviceData.bdt != null ? String(serviceData.bdt) : ''}
            onChangeText={(v) => { const n = parseFloat(v) || 0; updateServiceData({ bdt: n, myr: n / rate }); }}
          />
        </View>
        {bdt > 0 && (
          <SummaryCard
            rows={[
              { label: 'Sending', value: `MYR ${myr.toFixed(2)}` },
              { label: 'Receiving', value: `BDT ${bdt.toFixed(2)}` },
              { label: 'Fee', value: 'MYR 5.00' },
            ]}
            totalLabel="Total"
            totalValue={`MYR ${(myr + 5).toFixed(2)}`}
          />
        )}
      </View>
    );
  }

  return null;
}

// Required-field checks the wizard calls before advancing to the next step.
export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.provider) return 'Please select a provider.';
  if (step === 1 && !(serviceData.phone || '').trim()) return "Please enter the receiver's mobile number.";
  if (step === 2 && !(serviceData.myr > 0)) return 'Please enter an amount to send.';
  return null;
}

function createStyles(colors) {
  return StyleSheet.create({
    rateBox: { backgroundColor: '#E3F2FD', padding: 10, borderRadius: radius.md, marginBottom: 14 },
    rateBoxText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
    dualInput: { backgroundColor: 'white', padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    currencyLabel: { fontSize: 11, color: '#999' },
    dualField: { borderWidth: 0, paddingHorizontal: 0, paddingVertical: 6, fontSize: 18, fontWeight: '600', marginBottom: 0, backgroundColor: 'transparent' },
  });
}
