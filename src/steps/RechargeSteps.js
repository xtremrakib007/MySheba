import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { countries, rechargeOperators, getRechargeRate, amountToPoints } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { FormLabel, Grid3, SelectCard, OperatorCard, AmountButton, FormInput, SummaryCard } from '../components/ui';
import { radius } from '../theme/theme';

// Mirrors buildRechargeStep() - 4 steps: country -> operator -> phone -> amount
export default function RechargeStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates } = useApp();

  if (step === 0) {
    return (
      <View>
        <FormLabel>Select Country</FormLabel>
        <Grid3>
          {countries.map((c) => (
            <SelectCard
              key={c.code}
              flag={c.flag}
              name={c.name}
              selected={serviceData.country === c.code}
              onPress={() => { updateServiceData({ country: c.code, currency: c.curr }); nextStep(); }}
            />
          ))}
        </Grid3>
      </View>
    );
  }

  if (step === 1) {
    const list = rechargeOperators[serviceData.country] || ['Operator 1', 'Operator 2'];
    return (
      <View>
        <FormLabel>Select Operator</FormLabel>
        <Grid3>
          {list.map((o) => {
            const brand = getOperatorBrand(o);
            return (
              <OperatorCard
                key={o}
                name={o}
                logo={brand.logo}
                color={brand.color}
                initials={brand.initials}
                selected={serviceData.operator === o}
                onPress={() => { updateServiceData({ operator: o }); nextStep(); }}
              />
            );
          })}
        </Grid3>
      </View>
    );
  }

  if (step === 2) {
    return (
      <View>
        <FormLabel>Enter Mobile Number</FormLabel>
        <FormInput
          placeholder="Enter number"
          keyboardType="phone-pad"
          value={serviceData.phone || ''}
          onChangeText={(v) => updateServiceData({ phone: v })}
        />
      </View>
    );
  }

  if (step === 3) {
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const rate = isForeign ? getRechargeRate(serviceData.country, rates) : null;
    const points = isForeign ? amountToPoints(serviceData.amount || 0, serviceData.country, rates) : (serviceData.amount || 0);
    const amounts = cur === 'MYR' ? [10, 20, 30, 50, 100] : cur === 'BDT' ? [50, 100, 200, 500, 1000] : [50, 100, 200, 500];
    return (
      <View>
        <FormLabel>Select Amount ({cur})</FormLabel>
        {isForeign && (
          <View style={styles.rateBox}>
            <Text style={styles.rateBoxText}>💱 Rate: 1 MYR = {cur} {rate}</Text>
          </View>
        )}
        <Grid3>
          {amounts.map((a) => (
            <AmountButton
              key={a}
              label={`${cur} ${a}`}
              selected={serviceData.amount === a}
              onPress={() => updateServiceData({ amount: a })}
            />
          ))}
        </Grid3>
        <FormInput
          placeholder="Custom amount"
          keyboardType="numeric"
          style={{ marginTop: 10 }}
          value={serviceData.amount != null ? String(serviceData.amount) : ''}
          onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })}
        />
        {isForeign && serviceData.amount > 0 && (
          <SummaryCard
            rows={[
              { label: 'Amount', value: `${cur} ${Number(serviceData.amount).toFixed(2)}` },
            ]}
            totalLabel="Points to be deducted"
            totalValue={`${points.toFixed(2)} pts`}
          />
        )}
      </View>
    );
  }

  return null;
}

// Required-field checks the wizard calls before advancing to the next step.
// Returns null when the step is complete, or a user-facing message when not.
export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.operator) return 'Please select an operator.';
  if (step === 2 && !(serviceData.phone || '').trim()) return 'Please enter a mobile number.';
  if (step === 3 && !(serviceData.amount > 0)) return 'Please select or enter an amount.';
  return null;
}

const styles = StyleSheet.create({
  rateBox: { backgroundColor: '#E3F2FD', padding: 10, borderRadius: radius.md, marginBottom: 14 },
  rateBoxText: { fontSize: 13, fontWeight: '600', color: '#1565C0' },
});
