import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { FormLabel, FormInput, PrimaryButton } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import CopyButton from '../components/CopyButton';
import * as topupService from '../firebase/topupService';

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

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Admin/superadmin > Top-Up: buying points for their OWN account. Unlike
// the customer/dealer TopUpScreen, this is never reviewed by anyone -
// staff are trusted, so submitting here credits walletBalance instantly
// (topupService.createSelfTopup, 'selfTopups' collection) and never shows
// up in AdminHomeScreen's Top-Ups approval queue. Receipt/reference are
// optional here since there's no reviewer who needs them - they're just
// kept for the requester's own record.
export default function SuperAdminTopUpScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goHome, goBackOrHome, authUser, profile, paymentSettings } = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('transfer');
  const [bankName, setBankName] = useState('');
  const [refNo, setRefNo] = useState('');
  const [receiptUri, setReceiptUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [myTopups, setMyTopups] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const walletBalance = profile && typeof profile.walletBalance === 'number' ? profile.walletBalance : 0;
  const amountNum = parseFloat(amount) || 0;

  useEffect(() => {
    if (!authUser) { setHistoryLoading(false); return undefined; }
    const unsub = topupService.subscribeMySelfTopups(
      authUser.uid,
      (list) => { setMyTopups(list); setHistoryLoading(false); },
      () => setHistoryLoading(false)
    );
    return unsub;
  }, [authUser]);

  const pickReceipt = async () => {
const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      setReceiptUri(result.assets[0].uri);
    }
  };

  const onSubmit = async () => {
    if (!amountNum || amountNum <= 0) {
      showAlert('MySheba', 'Please enter a valid top-up amount.');
      return;
    }
    setSubmitting(true);
    try {
      let receiptUrl = '';
      if (receiptUri) {
        receiptUrl = await topupService.uploadReceipt(receiptUri, authUser.uid);
      }
      await topupService.createSelfTopup(
        { amount: amountNum, method, bankName, refNo, receiptUrl }
      );
      setAmount(''); setBankName(''); setRefNo(''); setReceiptUri(null);
      showAlert(
        'Points Credited',
        `MYR ${formatAmount(amountNum)} (${formatAmount(amountNum)} points) has been credited to your account instantly.`,
        [{ text: 'OK', onPress: goHome }]
      );
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not complete your top-up. Please try again.');
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
        <Text style={styles.headerTitle}>Top-Up (Staff)</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceValue}>MYR {formatAmount(walletBalance)}</Text>
          <Text style={styles.balanceHint}>1 RM = 1 point · credited instantly, no review needed</Text>
        </View>

        <FormLabel>Amount (RM)</FormLabel>
        <FormInput
          placeholder="e.g. 100"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />
        {amountNum > 0 && (
          <Text style={styles.pointsPreview}>= {formatAmount(amountNum)} points, credited instantly</Text>
        )}

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

        <FormLabel>Bank Name (optional)</FormLabel>
        <FormInput
          placeholder="e.g. Maybank"
          value={bankName}
          onChangeText={setBankName}
        />

        <FormLabel>Reference / Slip No. (optional)</FormLabel>
        <FormInput
          placeholder="Transaction reference number"
          value={refNo}
          onChangeText={setRefNo}
        />

        {(method === 'transfer' || method === 'deposit') && (
          <View style={styles.payDetailsCard}>
            <Text style={styles.payDetailsTitle}>🏦 Send To</Text>
            {(paymentSettings.bankAccounts || []).length > 0 ? (
              paymentSettings.bankAccounts.map((acc) => (
                <View key={acc.id} style={styles.payDetailRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payDetailLabel}>{acc.bankName}</Text>
                    <Text style={styles.payDetailValue}>{acc.accountNumber}</Text>
                    <Text style={styles.payDetailsHint}>{acc.accountHolder}</Text>
                  </View>
                  <CopyButton value={acc.accountNumber} />
                </View>
              ))
            ) : (
              <Text style={styles.payDetailsHint}>No receiving bank account has been set up yet.</Text>
            )}
          </View>
        )}

        {method === 'jompay' && (
          <View style={styles.payDetailsCard}>
            <Text style={styles.payDetailsTitle}>🏢 JomPay Details</Text>
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
          </View>
        )}

        {method === 'duitnow' && (
          <View style={styles.payDetailsCard}>
            <Text style={styles.payDetailsTitle}>📱 Scan to Pay via DuitNow</Text>
            {paymentSettings.duitnowQrUrl ? (
              <Image source={{ uri: paymentSettings.duitnowQrUrl }} style={styles.duitnowQr} resizeMode="contain" />
            ) : (
              <Text style={styles.payDetailsHint}>QR code not set up yet.</Text>
            )}
          </View>
        )}

        <FormLabel>Receipt (optional, for your own record)</FormLabel>
        <TouchableOpacity style={styles.uploadBox} onPress={pickReceipt}>
          {receiptUri ? (
            <Image source={{ uri: receiptUri }} style={styles.receiptPreview} resizeMode="cover" />
          ) : (
            <>
              <Text style={styles.uploadIcon}>📤</Text>
              <Text style={styles.uploadText}>Tap to attach a receipt (not required)</Text>
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
              <Text style={styles.submittingText}>Crediting...</Text>
            </View>
          ) : (
            <PrimaryButton label="Top Up Instantly" onPress={onSubmit} />
          )}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>My Top-Up History</Text>
        {historyLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
        ) : myTopups.length === 0 ? (
          <Text style={styles.empty}>No top-ups yet.</Text>
        ) : (
          myTopups.map((tp) => (
            <View key={tp.id} style={styles.historyCard}>
              <View style={styles.historyTop}>
                <Text style={styles.historyMethod}>{topupService.METHODS[tp.method] || tp.method}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>APPROVED</Text>
                </View>
              </View>
              {!!tp.bankName && <Text style={styles.historyDetail}>{tp.bankName}{tp.refNo ? ` · Ref: ${tp.refNo}` : ''}</Text>}
              <View style={styles.historyBottom}>
                <Text style={styles.historyDate}>{formatDate(tp.createdAt)}</Text>
                <Text style={styles.historyAmount}>MYR {formatAmount(tp.amount)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: spacing.lg, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    content: { padding: spacing.lg, paddingBottom: spacing.xl + 12 },
    balanceCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginBottom: spacing.lg,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 6,
      elevation: 2,
    },
    balanceLabel: { fontSize: 11, color: colors.textSecondary },
    balanceValue: { fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 2 },
    balanceHint: { fontSize: 11, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
    pointsPreview: { fontSize: 12, color: colors.success, fontWeight: '600', marginTop: -4, marginBottom: 10 },
    methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
    methodOption: { flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card },
    methodOptionActive: { borderColor: colors.primary, backgroundColor: '#F0F7FF' },
    methodIcon: { fontSize: 16 },
    methodLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    methodLabelActive: { color: colors.primary },
    uploadBox: { width: '100%', minHeight: 120, borderWidth: 2, borderColor: '#CCC', borderStyle: 'dashed', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 4 },
    uploadIcon: { fontSize: 26, marginBottom: 6 },
    uploadText: { color: colors.textSecondary, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 },
    receiptPreview: { width: '100%', height: 180 },
    changeReceipt: { color: colors.primary, fontSize: 12, fontWeight: '600', marginTop: 6, marginBottom: 10 },
    submittingRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
    submittingText: { color: colors.primary, fontWeight: '600' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
    empty: { textAlign: 'center', color: colors.textSecondary, paddingVertical: 20 },
    historyCard: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 1,
    },
    historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    historyMethod: { fontSize: 13, fontWeight: '700', color: colors.text },
    historyDetail: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
    historyBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    historyDate: { fontSize: 11, color: colors.textSecondary },
    historyAmount: { fontSize: 14, fontWeight: '700', color: colors.primary },
    badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: '#E8F5E9' },
    badgeText: { fontSize: 10, fontWeight: '700', color: colors.success, letterSpacing: 0.3 },
    payDetailsCard: { backgroundColor: '#F7F8FA', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: 10 },
    payDetailsTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 10 },
    payDetailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    payDetailLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 2 },
    payDetailValue: { fontSize: 15, fontWeight: '700', color: colors.primary },
    payDetailsHint: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
    duitnowQr: { width: '100%', height: 220, backgroundColor: 'white', borderRadius: radius.md, marginBottom: 4 },
  });
}
