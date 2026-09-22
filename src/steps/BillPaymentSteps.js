import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { amountToPoints } from '../data/countries';
import { BILL_COUNTRIES, billersForCountry, findBiller, groupByCategory } from '../data/billers';
import { subscribeBillers } from '../firebase/billerService';
import { FormLabel, FormInput, SummaryCard } from '../components/ui';
import CountrySelectCard from '../components/CountrySelectCard';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

// Bill Payment flow: country -> biller -> account number -> amount.
// The bill is entered in the country's own currency; what leaves the wallet
// is always MYR, converted with the same admin-set rate Recharge uses.
export default function BillPaymentStep({ step }) {
  const { serviceData, updateServiceData, nextStep, rates } = useApp();
  const { colors, isDark } = useTheme();
  const styles = createStyles(colors, isDark);
  const [adminBillers, setAdminBillers] = useState([]);

  useEffect(() => subscribeBillers(setAdminBillers, () => {}), []);

  if (step === 0) {
    return (
      <View>
        <FormLabel>Select Country</FormLabel>
        <View style={styles.grid3}>
          {BILL_COUNTRIES.map((c) => (
            <CountrySelectCard
              key={c.code}
              flag={c.flag}
              name={c.name}
              selected={serviceData.country === c.code}
              onPress={() => {
                updateServiceData({ country: c.code, currency: c.curr, biller: null, billerName: '', accountNumber: '' });
                nextStep();
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  if (step === 1) {
    const groups = groupByCategory(billersForCountry(serviceData.country, adminBillers));
    return (
      <View>
        <FormLabel>Select Biller</FormLabel>
        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupTitle}>{group.icon} {group.label}</Text>
            {group.items.map((biller) => (
              <TouchableOpacity
                key={biller.id}
                style={[styles.billerRow, serviceData.biller === biller.id && styles.billerRowSelected]}
                activeOpacity={0.8}
                onPress={() => {
                  updateServiceData({
                    biller: biller.id,
                    billerName: biller.name,
                    billerCategory: biller.category,
                    accountLabel: biller.accountLabel,
                    accountNumber: '',
                  });
                  nextStep();
                }}
              >
                <Text style={[styles.billerName, serviceData.biller === biller.id && styles.billerNameSelected]} numberOfLines={2}>
                  {biller.name}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
        {groups.length === 0 && <Text style={styles.empty}>No billers available for this country yet.</Text>}
      </View>
    );
  }

  if (step === 2) {
    const biller = findBiller(serviceData.biller, adminBillers);
    return (
      <View>
        <FormLabel>{serviceData.accountLabel || biller?.accountLabel || 'Account Number'}</FormLabel>
        <FormInput
          placeholder="Enter the number printed on your bill"
          placeholderTextColor={isDark ? '#9AA6BA' : '#777777'}
          keyboardType="number-pad"
          value={serviceData.accountNumber || ''}
          onChangeText={(v) => updateServiceData({ accountNumber: v })}
          style={styles.input}
        />
        <Text style={styles.help}>
          Check this carefully — a bill paid to the wrong account cannot be reversed.
        </Text>
      </View>
    );
  }

  if (step === 3) {
    const cur = serviceData.currency || 'MYR';
    const isForeign = serviceData.country && serviceData.country !== 'MY';
    const walletDeductionMyr = isForeign
      ? amountToPoints(serviceData.amount || 0, serviceData.country, rates)
      : (serviceData.amount || 0);
    return (
      <View>
        <FormLabel>Bill Amount ({cur})</FormLabel>
        <FormInput
          placeholder={`Amount in ${cur}`}
          placeholderTextColor={isDark ? '#9AA6BA' : '#777777'}
          keyboardType="numeric"
          style={styles.input}
          value={serviceData.amount != null ? String(serviceData.amount) : ''}
          onChangeText={(v) => updateServiceData({ amount: parseFloat(v) || 0 })}
        />
        {serviceData.amount > 0 && (
          <SummaryCard
            rows={[
              { label: 'Biller', value: serviceData.billerName || '-' },
              { label: 'Account', value: serviceData.accountNumber || '-' },
              { label: 'Bill amount', value: `${cur} ${Number(serviceData.amount).toFixed(2)}` },
            ]}
            totalLabel="Wallet deduction"
            totalValue={`${walletDeductionMyr.toFixed(2)} MYR`}
          />
        )}
      </View>
    );
  }

  return null;
}

export function validateStep(step, serviceData) {
  if (step === 0 && !serviceData.country) return 'Please select a country.';
  if (step === 1 && !serviceData.biller) return 'Please select a biller.';
  if (step === 2) {
    const account = (serviceData.accountNumber || '').trim();
    if (!account) return 'Please enter your account number.';
    if (account.length < 4) return 'That account number looks too short.';
  }
  if (step === 3 && !(serviceData.amount > 0)) return 'Please enter the bill amount.';
  return null;
}

function createStyles(colors, isDark) {
  return StyleSheet.create({
    grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    group: { marginBottom: 18 },
    groupTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 8, letterSpacing: 0.3 },
    billerRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
      borderColor: colors.border, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8,
    },
    billerRowSelected: { borderColor: colors.primary, backgroundColor: isDark ? 'rgba(0,169,157,0.12)' : '#E8F7F5' },
    billerName: { fontSize: 13, fontWeight: '600', color: colors.text, flex: 1, paddingRight: 10 },
    billerNameSelected: { color: colors.primary },
    chevron: { fontSize: 18, color: colors.textSecondary },
    input: { marginTop: 4 },
    help: { fontSize: 11, color: colors.textSecondary, marginTop: 10, lineHeight: 16 },
    empty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 30 },
  });
}
