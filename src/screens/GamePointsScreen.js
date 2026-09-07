import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { Grid3, AmountButton, FormLabel, FormInput, SummaryCard, PrimaryButton } from '../components/ui';
import * as settingsService from '../firebase/settingsService';
import { subscribeMyGamePoints, rechargeGamePoints, withdrawGamePoints, STARTING_POINTS } from '../firebase/gamePointsService';

const AMOUNTS = [50, 100, 200, 500, 1000];

function fmt(n) {
  return `MYR ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Customer/Dealer/Admin > Game Points: converts real wallet points into the
// play-money gamePoints/{uid} balance functions-gamebot uses for the room
// games (dice, lowcard, highcard, cricket, 29 - no real money ever moves
// through those games themselves, see roomChatService.js's GameBot
// comments). Unlike Top-Up, this is instant - no admin review - since it's
// just the user moving their own points from one bucket to another (see
// chargeGamePoints in functions/walletService.js).
export default function GamePointsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, setScreen, authUser, profile, pricing } = useApp();

  const walletBalance = profile && typeof profile.walletBalance === 'number' ? profile.walletBalance : 0;
  const perUnit = settingsService.priceForRole(pricing, 'gamePointsCostPerUnit', profile?.role) ?? 1;
  // GameBot payout fee (settings/pricing.gamePointsFeePercent, editable
  // from Admin > Pricing) - cut from a withdrawal before it's credited
  // back to walletBalance, see withdrawGamePoints in
  // functions/walletService.js, the real enforcement point.
  const feePercent = Number(pricing?.gamePointsFeePercent) || 0;

  const [tab, setTab] = useState('recharge'); // 'recharge' | 'withdraw'
  const [gamePoints, setGamePoints] = useState(null);
  const [amount, setAmount] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authUser?.uid) return undefined;
    const unsub = subscribeMyGamePoints(authUser.uid, setGamePoints, () => {});
    return unsub;
  }, [authUser?.uid]);

  const myGamePoints = gamePoints == null ? STARTING_POINTS : gamePoints;
  const amountNum = Number(amount) || 0;
  const cost = Math.round(amountNum * perUnit * 100) / 100;
  const withdrawFee = Math.round(amountNum * (feePercent / 100) * 100) / 100;
  const withdrawCredit = Math.round((amountNum - withdrawFee) * 100) / 100;

  const switchTab = (t) => {
    setTab(t);
    setAmount(null);
  };

  const onRecharge = async () => {
    if (!(amountNum > 0)) {
      showAlert('MySheba', 'Please select or enter an amount of Game Points.');
      return;
    }
    if (cost > walletBalance) {
      showAlert('MySheba', `You need ${fmt(cost)} - top up your wallet first.`);
      return;
    }
    setSubmitting(true);
    try {
      const result = await rechargeGamePoints(amountNum);
      showAlert('MySheba', `${result.amount} Game Points added. ${fmt(result.cost)} deducted from your wallet.`);
      setAmount(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not recharge Game Points right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const onWithdraw = async () => {
    if (!(amountNum > 0)) {
      showAlert('MySheba', 'Please select or enter an amount of Game Points.');
      return;
    }
    if (amountNum > myGamePoints) {
      showAlert('MySheba', "You don't have that many Game Points to withdraw.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await withdrawGamePoints(amountNum);
      showAlert('MySheba', `${fmt(result.credited)} added to your wallet${result.fee > 0 ? ` (after a ${fmt(result.fee)} fee)` : ''}.`);
      setAmount(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not withdraw Game Points right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = tab === 'recharge' ? onRecharge : onWithdraw;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Game Points</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
        <View style={styles.balanceRow}>
          <View style={[styles.balanceCard, { marginRight: 8 }]}>
            <Text style={styles.balanceLabel}>Wallet Balance</Text>
            <Text style={styles.balanceValue}>{fmt(walletBalance)}</Text>
          </View>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Game Points</Text>
            <Text style={styles.balanceValue}>🎮 {gamePoints == null ? STARTING_POINTS : gamePoints}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.transferLink} onPress={() => setScreen('gamePointsTransfer')}>
          <Text style={styles.transferLinkText}>🎁 Transfer Game Points to a Friend ›</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.transferLink} onPress={() => setScreen('gamePointsGift')}>
          <Text style={styles.transferLinkText}>🎉 Gift Game Points (80/20) ›</Text>
        </TouchableOpacity>

        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tabBtn, tab === 'recharge' && styles.tabBtnActive]} onPress={() => switchTab('recharge')}>
            <Text style={[styles.tabText, tab === 'recharge' && styles.tabTextActive]}>Recharge</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, tab === 'withdraw' && styles.tabBtnActive]} onPress={() => switchTab('withdraw')}>
            <Text style={[styles.tabText, tab === 'withdraw' && styles.tabTextActive]}>Withdraw</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.helperText}>
          {tab === 'recharge'
            ? 'Recharge Game Points to play dice, LowCard, HighCard, Cricket, and 29 with GameBot in chat rooms. No real money is wagered in these games.'
            : `Withdraw Game Points back into your wallet balance${feePercent > 0 ? ` (a ${feePercent}% payout fee applies)` : ''}.`}
        </Text>

        <FormLabel>{tab === 'recharge' ? 'Select Amount (Game Points)' : 'Amount to Withdraw (Game Points)'}</FormLabel>
        <Grid3>
          {AMOUNTS.map((a) => (
            <AmountButton
              key={a}
              label={String(a)}
              selected={amount === a}
              onPress={() => setAmount(a)}
            />
          ))}
        </Grid3>
        <FormInput
          placeholder="Custom amount"
          keyboardType="numeric"
          style={{ marginTop: 10 }}
          value={amount != null ? String(amount) : ''}
          onChangeText={(v) => setAmount(parseFloat(v) || 0)}
        />

        {amountNum > 0 && tab === 'recharge' && (
          <SummaryCard
            rows={[
              { label: 'Game Points', value: String(amountNum) },
              { label: 'Rate', value: `1 pt = ${perUnit} wallet pt${perUnit === 1 ? '' : 's'}` },
            ]}
            totalLabel="Wallet points to be deducted"
            totalValue={fmt(cost)}
          />
        )}

        {amountNum > 0 && tab === 'withdraw' && (
          <SummaryCard
            rows={[
              { label: 'Game Points', value: String(amountNum) },
              { label: 'Payout Fee', value: `${feePercent}% (${fmt(withdrawFee)})` },
            ]}
            totalLabel="Credited to your wallet"
            totalValue={fmt(withdrawCredit)}
          />
        )}

        <PrimaryButton
          label={submitting ? (tab === 'recharge' ? 'Recharging…' : 'Withdrawing…') : (tab === 'recharge' ? 'Recharge Game Points' : 'Withdraw to Wallet')}
          onPress={onSubmit}
          disabled={submitting || !(amountNum > 0)}
          style={{ marginTop: 16 }}
        />
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
    balanceRow: { flexDirection: 'row', marginBottom: 14 },
    balanceCard: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16 },
    balanceLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
    balanceValue: { color: 'white', fontSize: 18, fontWeight: '700', marginTop: 4 },
    helperText: { fontSize: 12, color: '#999', marginBottom: 16, lineHeight: 17 },
    transferLink: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 16, alignItems: 'center' },
    transferLinkText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    tabRow: { flexDirection: 'row', marginBottom: 12 },
    tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabBtnActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
  });
}
