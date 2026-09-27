import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { FormLabel, FormInput, PrimaryButton } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import CopyButton from '../components/CopyButton';
import * as topupService from '../firebase/topupService';
import { formatWalletAmount } from '../firebase/walletExchangeRateService';

const METHOD_OPTIONS = [
  { key: 'transfer', label: 'Bank Transfer', icon: '🏦' },
  { key: 'deposit', label: 'Bank Deposit', icon: '💵' },
  { key: 'jompay', label: 'JomPay', icon: '🏢' },
  { key: 'duitnow', label: 'DuitNow QR', icon: '📱' },
];

function formatAmount(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Customer/Dealer > Top-Up: send money via bank transfer or bank deposit,
// upload the receipt, and submit a request for Admin review. Approved funds
// are credited directly to the user's MYR wallet balance.
export default function TopUpScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { goHome, goBackOrHome, authUser, profile, paymentSettings } = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [bankName, setBankName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [receiptUri, setReceiptUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const walletCurrency = profile?.walletCurrency || profile?.walletBalanceCurrency || 'MYR';
  const walletBalance = profile && typeof profile.walletBalance === 'number' ? profile.walletBalance : 0;
  const amountNum = parseFloat(amount) || 0;
  const isBankMethod = method === 'transfer' || method === 'deposit';

  const pickReceipt = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets[0]) setReceiptUri(result.assets[0].uri);
  };

  const onSubmit = async () => {
    if (!amountNum || amountNum <= 0) {
      showAlert('MySheba', 'Please enter a valid top-up amount.');
      return;
    }
    if (!bankName.trim() && isBankMethod) {
      showAlert('MySheba', 'Please enter the bank name.');
      return;
    }
    if (method === 'jompay' && !refNo.trim()) {
      showAlert('MySheba', 'Please enter the reference/transaction number you paid with.');
      return;
    }
    if (!receiptUri) {
      showAlert('MySheba', 'Please upload your bank transfer/deposit receipt.');
      return;
    }
    setSubmitting(true);
    try {
      const receiptUrl = await topupService.uploadReceipt(receiptUri, authUser.uid);
      await topupService.createTopupRequest(
        { amount: amountNum, method, bankName, refNo, receiptUrl },
        { uid: authUser.uid, phone: profile ? profile.phone : '', name: profile ? profile.name : '', role: profile ? profile.role : 'customer' }
      );
      showAlert(
        'Request Submitted',
        'Your top-up request has been sent to Admin for review. The approved amount will be added to your MYR wallet balance. You can check the status under History > Top-Ups.',
        [{ text: 'OK', onPress: goHome }]
      );
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your top-up request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Top-Up</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>{formatWalletAmount(walletBalance, walletCurrency)}</Text>
        </View>

        <FormLabel>Amount ({walletCurrency})</FormLabel>
        <FormInput
          placeholder="e.g. 100"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <FormLabel style={{ marginTop: 6 }}>Payment Method</FormLabel>
        <View style={styles.methodRow}>
          {METHOD_OPTIONS.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.methodOption, method === m.key && styles.methodOptionActive]}
              onPress={() => setMethod(m.key)}
            >
              <Text style={styles.methodIcon}>{m.icon}</Text>
              <Text style={[styles.methodLabel, method === m.key && styles.methodLabelActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!isBankMethod && (
          <>
            {(paymentSettings.bankAccounts || []).length > 0 ? (
              <View style={styles.payDetailsCard}>
                <Text style={styles.payDetailsTitle}>🏦 Send To</Text>
                {paymentSettings.bankAccounts.map((acc, i) => (
                  <View key={acc.id} style={[styles.bankAccountRow, i > 0 && styles.bankAccountRowDivider]}>
                    <Text style={styles.payDetailLabel}>{acc.bankName}</Text>
                    <View style={styles.payDetailRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.payDetailValue}>{acc.accountNumber}</Text>
                        <Text style={styles.payDetailsHint}>{acc.accountHolder}</Text>
                      </View>
                      <CopyButton value={acc.accountNumber} />
                    </View>
                  </View>
                ))}
                <Text style={styles.payDetailsHint}>
                  Transfer or deposit into one of the accounts above, then fill in the details below and upload your receipt.
                </Text>
              </View>
            ) : (
              <Text style={styles.payDetailsHint}>
                No receiving bank account has been set up yet - please choose another payment method or contact support.
              </Text>
            )}

            <FormLabel>Bank Name</FormLabel>
            <FormInput placeholder="e.g. Maybank" value={bankName} onChangeText={setBankName} />

            <FormLabel>Reference / Slip No. (optional)</FormLabel>
            <FormInput placeholder="Transaction reference number" value={refNo} onChangeText={setRefNo} />
          </>
        )}

        {method === 'jompay' && (
          <View style={styles.payDetailsCard}>
            <Text style={styles.payDetailsTitle}>🏢 Pay via JomPay</Text>
            <View style={styles.payDetailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payDetailLabel}>Biller ID</Text>
                <Text style={styles.payDetailValue}>{paymentSettings.jompayBillerId || 'Not set yet'}</Text>
              </View>
              {!!paymentSettings.jompayBillerId && <CopyButton value={paymentSettings.jompayBillerId} />}
            </View>
            <View style={styles.payDetailRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.payDetailLabel}>Reference Number</Text>
                <Text style={styles.payDetailValue}>{paymentSettings.jompayRefNo || 'Not set yet'}</Text>
              </View>
              {!!paymentSettings.jompayRefNo && <CopyButton value={paymentSettings.jompayRefNo} />}
            </View>
            <Text style={styles.payDetailsHint}>
              Pay this Biller ID/Reference from your bank's JomPay screen, then enter the transaction number below.
            </Text>
            <FormLabel style={{ marginTop: 10 }}>Your Transaction / Ref No.</FormLabel>
            <FormInput placeholder="From your bank's JomPay receipt" value={refNo} onChangeText={setRefNo} />
          </View>
        )}

        {method === 'duitnow' && (
          <View style={styles.payDetailsCard}>
            <Text style={styles.payDetailsTitle}>📱 Scan to Pay via DuitNow</Text>
            {paymentSettings.duitnowQrUrl ? (
              <Image source={{ uri: paymentSettings.duitnowQrUrl }} style={styles.duitnowQr} resizeMode="contain" />
            ) : (
              <Text style={styles.payDetailsHint}>QR code not set up yet - please choose another payment method.</Text>
            )}
            <FormLabel style={{ marginTop: 10 }}>Reference / Transaction No. (optional)</FormLabel>
            <FormInput placeholder="Transaction reference number" value={refNo} onChangeText={setRefNo} />
          </View>
        )}

        <FormLabel>Upload Receipt</FormLabel>
        <TouchableOpacity style={styles.uploadBox} onPress={pickReceipt}>
          {receiptUri ? (
            <Image source={{ uri: receiptUri }} style={styles.receiptPreview} resizeMode="cover" />
          ) : (
            <>
              <Text style={styles.uploadIcon}>📤</Text>
              <Text style={styles.uploadText}>Tap to upload bank transfer / deposit receipt</Text>
            </>
          )}
        </TouchableOpacity>
        {!!receiptUri && (
          <TouchableOpacity onPress={pickReceipt}>
            <Text style={styles.changeReceipt}>Change receipt</Text>
          </TouchableOpacity>
        )}

        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.submittingText}>Submitting...</Text>
            </View>
          ) : (
            <PrimaryButton label="Submit Top-Up Request" onPress={onSubmit} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    content: { padding: 16, paddingBottom: 40 },
    balanceCard: { backgroundColor: 'white', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 16, marginBottom: 18, alignItems: 'center' },
    balanceLabel: { fontSize: 11, color: '#999' },
    balanceValue: { fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 2 },
    methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    methodOption: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: 'white' },
    methodOptionActive: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
    methodIcon: { fontSize: 16 },
    methodLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    methodLabelActive: { color: colors.primary },
    uploadBox: { width: '100%', minHeight: 120, borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4 },
    uploadIcon: { fontSize: 26, marginBottom: 6 },
    uploadText: { color: '#999', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
    receiptPreview: { width: '100%', height: 180 },
    changeReceipt: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 10 },
    submittingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
    submittingText: { color: colors.primary, fontWeight: '600' },
    payDetailsCard: { backgroundColor: '#F7F8FA', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 },
    payDetailsTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
    payDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    payDetailLabel: { fontSize: 11, color: '#999', marginBottom: 2 },
    payDetailValue: { fontSize: 15, fontWeight: '700', color: colors.primary },
    payDetailsHint: { fontSize: 11, color: '#999', marginTop: 2 },
    bankAccountRow: { marginBottom: 8, paddingBottom: 8 },
    bankAccountRowDivider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    duitnowQr: { width: '100%', height: 220, backgroundColor: 'white', borderRadius: radius.md, marginBottom: 4 },
  });
}
