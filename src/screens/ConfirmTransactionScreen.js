import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { amountToPoints } from '../data/countries';
import { resolveCommission } from '../utils/commission';
import { applyMarkup } from '../utils/markup';

const TITLES = {
  recharge: 'Mobile Recharge', internet: 'Internet Package', offerpacks: 'Offer Pack',
  entertainment: 'Entertainment', billpayment: 'Bill Payment', mobilebanking: 'Mobile Banking',
  remittance: 'Remittance', esim: 'eSIM', flight: 'Flight Inquiry', bus: 'Bus Ticket Inquiry',
  train: 'Train Ticket Inquiry',
};
const LABELS = {
  phone: 'Mobile number', mobileNumber: 'Mobile number', country: 'Country', operator: 'Operator',
  amount: 'Amount', currency: 'Currency', package: 'Package', packageId: 'Package ID',
  provider: 'Provider', category: 'Bill category', accountNumber: 'Account/reference number',
  product: 'Product', productCode: 'Product code', quantity: 'Quantity', email: 'Email',
  myr: 'Amount (MYR)', sendAmt: 'Send amount', transferFee: 'Transfer fee', method: 'Payout method',
  paymentMethod: 'Payment method', senderName: 'Sender name', senderPhone: 'Sender phone',
  receiverFirstName: 'Recipient first name', receiverLastName: 'Recipient last name',
  receiverPhone: 'Recipient phone', receiverBankName: 'Recipient bank', receiverAccountNumber: 'Recipient account',
  receiverWalletProvider: 'Recipient wallet provider', receiverWalletNumber: 'Recipient wallet number',
  receiverPickupCity: 'Pickup city', receiverPickupNetwork: 'Pickup network',
  from: 'From', to: 'To', date: 'Travel date', time: 'Travel time', passengers: 'Passengers',
  pName: 'Passenger name', pPhone: 'Passenger phone', pEmail: 'Passenger email',
  server: 'Server/region', playerId: 'Player ID', validity: 'Validity',
};
const money = (value, currency = 'MYR') => {
  const n = Number(value);
  return Number.isFinite(n) ? `${currency} ${n.toFixed(2)}` : 'Not provided';
};
const labelFor = (key) => LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
const isPrivateKey = (key) => /(secret|token|password|security.?pin|collection.?pin|otp|authorization|receipt.?url|api.?key|selectedOptions|fieldValues|iimmpactCatalog|iimmpactFields|iimmpactDenomination|iimmpactProcessingTime|providerId)/i.test(key);

function getPricing(service, data, pricing, rates, role) {
  const raw = Number(data.amount ?? data.myr ?? data.sendAmt ?? 0);
  let selling = raw;
  if (['recharge', 'internet', 'offerpacks', 'entertainment', 'billpayment'].includes(service)) {
    selling = amountToPoints(raw, data.country, rates);
  }
  if (service === 'mobilebanking') selling = Number(data.myr || 0);
  const fee = service === 'mobilebanking' ? 5 : service === 'remittance' ? Number(data.transferFee || 0) : 0;
  // MySheba's markup on the provider price, exactly as the server adds it
  // (src/utils/markup.js mirrors functions/markupService.js). Commission is
  // still worked out on the provider price, as the server does.
  const providerPrice = selling;
  selling = applyMarkup(pricing, { service, country: data.country, productCode: data.productCode || data.operatorCode, amount: providerPrice }).amount;
  // What leaves the wallet when the order is submitted.
  const charged = service === 'remittance' ? Number(data.sendAmt || 0) + fee : selling + fee;
  const providedCost = Number(data.providerCost ?? data.costPrice ?? data.cost ?? data.wholesalePrice);
  const costPercent = Number(pricing?.rechargeCostPercent) || 0;
  const cost = Number.isFinite(providedCost) && providedCost > 0
    ? providedCost
    : (service === 'recharge' && costPercent > 0 ? Math.round(selling * costPercent) / 100 : null);
  // The commission the server credits back once the provider confirms, by
  // the same rules it uses - not the old rechargeProfitPercent estimate,
  // which could promise a commission that never arrived.
  const commission = resolveCommission(pricing, { service, amount: providerPrice, role, payload: { raw: data } });
  return { selling, fee, charged, cost, commission, total: Math.round((charged - commission) * 100) / 100 };
}

// Every service except remittance and mobile banking gets the short review:
// the few fields that identify the order, in this order, and a price
// breakdown without fee/profit rows whose total is net of commission.
// Remittance and mobile banking keep the full layout - every recipient field
// and the fee - because a payout is checked line by line before it is sent.
const FULL_LAYOUT = new Set(['remittance', 'mobilebanking']);
const SUMMARY_FIELDS = {
  recharge: ['country', 'currency', 'phone', 'operator', 'package'],
  internet: ['country', 'currency', 'phone', 'operator', 'package'],
  offerpacks: ['country', 'currency', 'phone', 'operator', 'package'],
  billpayment: ['country', 'currency', 'provider', 'accountNumber', 'mobileNumber'],
  entertainment: ['country', 'currency', 'game', 'playerId', 'serverId', 'package'],
  esim: ['country', 'currency', 'product', 'package', 'email'],
  flight: ['from', 'to', 'date', 'time', 'passengers', 'pName', 'pPhone'],
  bus: ['from', 'to', 'date', 'time', 'passengers', 'pName', 'pPhone'],
  train: ['from', 'to', 'date', 'time', 'passengers', 'pName', 'pPhone'],
};
// Names that read better in the short review than the generic labels.
const SUMMARY_LABELS = { provider: 'Biller', accountNumber: 'Account number', game: 'Game', playerId: 'Player ID', serverId: 'Server' };

export default function ConfirmTransactionScreen() {
  const { colors } = useTheme();
  const { currentService, serviceData, pricing, rates, profile, submitService, setScreen, goBack, submitting } = useApp();
  const styles = createStyles(colors);
  const title = TITLES[currentService] || currentService || 'Transaction';
  const summary = useMemo(() => getPricing(currentService, serviceData || {}, pricing, rates, profile?.role), [currentService, serviceData, pricing, rates, profile?.role]);
  const shown = (value) => value !== undefined && value !== null && String(value).trim() !== '';
  const full = FULL_LAYOUT.has(currentService);
  const generic = () => Object.entries(serviceData || {}).filter(([key, value]) =>
    !isPrivateKey(key) && shown(value) &&
    !['cost', 'costPrice', 'providerCost', 'wholesalePrice', 'commission', 'commissionAmount', 'providerCommission', 'profit', 'profitAmount'].includes(key)
  );
  const summaryKeys = !full && SUMMARY_FIELDS[currentService];
  const fields = summaryKeys
    ? summaryKeys
      .map((key) => [key, key === 'phone' ? (serviceData?.phone || serviceData?.mobileNumber) : serviceData?.[key]])
      .filter(([key, value]) => shown(value) && !(key === 'mobileNumber' && summaryKeys.includes('phone')))
    : generic();
  // On a recharge the "package" is the amount in the destination's money
  // (IDR 50,000), so it is labelled as that.
  const fieldLabel = (key) => (currentService === 'recharge' && key === 'package' ? 'Top-up amount' : '') || (!full && SUMMARY_LABELS[key]) || labelFor(key);
  // What the wallet ends at: net of commission on the short review, the full
  // charge on a payout, which earns none.
  const deduction = full ? summary.charged : summary.total;
  // A payout's commission and profit, as the page always showed them: only
  // when the order carries them, or derived from a cost it carries.
  const payout = (() => {
    const d = serviceData || {};
    const commission = Number(d.commissionAmount ?? d.commission ?? d.providerCommission);
    const profit = Number(d.profitAmount ?? d.profit);
    const cost = summary.cost;
    return {
      commission: Number.isFinite(commission) && commission >= 0 ? commission : (cost != null ? Math.round((summary.selling - cost) * 100) / 100 : null),
      profit: Number.isFinite(profit) ? profit : (cost != null ? Math.round((summary.selling - cost - summary.fee) * 100) / 100 : null),
    };
  })();
  const balance = Number(profile?.walletBalance ?? profile?.balance ?? 0);
  const walletCurrency = profile?.walletCurrency || 'MYR';

  // Return to the screen that actually opened this confirmation. The wizard is a safe fallback.
  const returnToPrevious = () => { if (!goBack()) setScreen('service'); };

  const confirm = async () => {
    if (submitting) return;
    await submitService();
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity accessibilityRole="button" onPress={returnToPrevious} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Confirm {title}</Text>
          <Text style={styles.subtitle}>Review all details before submitting</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border || '#E4E7EC' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction details</Text>
          {fields.map(([key, value]) => (
            <View key={key} style={styles.row}>
              <Text style={styles.label}>{fieldLabel(key)}</Text>
              <Text selectable style={[styles.value, { color: colors.text }]}>{String(value)}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border || '#E4E7EC' }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Price breakdown</Text>
          <View style={styles.row}><Text style={styles.label}>Selling / transaction amount</Text><Text style={[styles.value, { color: colors.text }]}>{money(summary.selling)}</Text></View>
          {/* The fee is listed on a payout always, and elsewhere only when there
              is one (Touch 'n Go); airtime, data and bills carry none. */}
          {(full || summary.fee > 0) && <View style={styles.row}><Text style={styles.label}>Service fee</Text><Text style={[styles.value, { color: colors.text }]}>{money(summary.fee)}</Text></View>}
          {full && <>
            {/* The original payout rows, unchanged. */}
            <View style={styles.row}><Text style={styles.label}>Provider cost price</Text><Text style={[styles.value, { color: colors.text }]}>{summary.cost == null ? 'Not provided by provider' : money(summary.cost)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Commission amount</Text><Text style={[styles.value, { color: colors.text }]}>{payout.commission == null ? 'Not provided by provider' : money(payout.commission)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Expected profit / loss</Text><Text style={[styles.value, { color: colors.text }]}>{payout.profit == null ? 'Not available' : money(payout.profit)}</Text></View>
          </>}
          {!full && <>
            <View style={styles.row}><Text style={styles.label}>Provider cost price</Text><Text style={[styles.value, { color: colors.text }]}>{summary.cost == null ? 'Not provided by provider' : money(summary.cost)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Commission amount</Text><Text style={[styles.value, { color: colors.text }]}>{summary.commission > 0 ? '- ' + money(summary.commission) : money(0)}</Text></View>
          </>}
          <View style={styles.row}><Text style={styles.label}>Wallet balance before</Text><Text style={[styles.value, { color: colors.text }]}>{money(balance, walletCurrency)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Wallet balance after (estimated)</Text><Text style={[styles.value, { color: colors.text }]}>{money(balance - deduction, walletCurrency)}</Text></View>
          <View style={[styles.totalRow, { borderTopColor: colors.border || '#E4E7EC' }]}><Text style={[styles.totalLabel, { color: colors.text }]}>Total wallet deduction</Text><Text style={[styles.totalValue, { color: colors.primary }]}>{money(deduction)}</Text></View>
        </View>
        <Text style={styles.note}>{!full && summary.commission > 0
          ? `${money(summary.charged)} is taken when you submit, and the ${money(summary.commission)} commission is credited back to your wallet as soon as the provider confirms. Final charges are validated by the server.`
          : 'Final charges and provider results are validated by the server.'}</Text>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border || '#E4E7EC' }]}>
        <TouchableOpacity style={[styles.cancel, { borderColor: colors.primary }]} onPress={returnToPrevious} disabled={submitting}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>Edit details</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.confirm, { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }]} onPress={confirm} disabled={submitting}>
          <Text style={styles.confirmText}>{submitting ? 'Submitting…' : 'Confirm and Submit'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { minHeight: 70, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
    back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
    backText: { color: '#fff', fontSize: 32, lineHeight: 34 },
    title: { color: '#fff', fontSize: 18, fontWeight: '800' },
    subtitle: { color: '#fff', opacity: 0.86, fontSize: 12, marginTop: 2 },
    content: { padding: 14, paddingBottom: 24, gap: 12 },
    card: { borderWidth: 1, borderRadius: 14, padding: 14 },
    sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 8 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E7EC' },
    label: { flex: 1, color: '#667085', fontSize: 12 },
    value: { flex: 1.2, fontSize: 13, fontWeight: '600', textAlign: 'right' },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 12, marginTop: 4, borderTopWidth: 1 },
    totalLabel: { flex: 1, fontWeight: '800', fontSize: 13 },
    totalValue: { fontSize: 17, fontWeight: '900' },
    note: { fontSize: 11, color: '#667085', lineHeight: 16, paddingHorizontal: 3 },
    footer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1 },
    cancel: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 10 },
    cancelText: { fontWeight: '800', fontSize: 13 },
    confirm: { flex: 1.5, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
    confirmText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  });
}
