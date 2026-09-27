import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import * as Print from 'expo-print';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import { showAlert } from '../utils/appAlert';
import { rechargeOperators } from '../data/countries';
import { getOperatorBrand } from '../data/operatorBrand';
import { purchaseRechargePin } from '../firebase/rechargePinService';
import { radius } from '../theme/theme';

const MALAYSIA_OPERATORS = rechargeOperators.MY || ['Celcom', 'CelcomDigi', 'U Mobile', 'Hotlink', 'XOX', 'Tunetalk', 'Unifi', 'Yes'];
const AMOUNTS = [10, 20, 30, 50, 100];

export default function RechargePinScreen() {
  const { colors, brandGradient } = useTheme();
  const { goBackOrHome, profile } = useApp();
  const styles = createStyles(colors);
  const [operator, setOperator] = useState('');
  const [amount, setAmount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [voucher, setVoucher] = useState(null);

  const buy = async () => {
    if (busy) return;
    if (!operator) return showAlert('Recharge PIN', 'Please select a Malaysian operator.');
    if (!(amount > 0)) return showAlert('Recharge PIN', 'Please select a denomination.');
    setBusy(true);
    try { setVoucher(await purchaseRechargePin({ operator, amount })); }
    catch (err) { showAlert('Recharge PIN', err?.message || 'Could not purchase the Recharge PIN.'); }
    finally { setBusy(false); }
  };

  const printVoucher = async () => {
    if (!voucher?.pin) return;
    try {
      await Print.printAsync({ html:
        '<html><body style="font-family:Arial;padding:16px;text-align:center">' +
        '<h2>MySheba</h2><h3>Malaysia Recharge PIN</h3><hr/>' +
        '<p><b>Operator:</b> ' + escapeHtml(voucher.operator) + '</p>' +
        '<p><b>Value:</b> MYR ' + Number(voucher.amount).toFixed(2) + '</p>' +
        '<div style="margin:22px 0;font-size:28px;letter-spacing:5px"><b>' + escapeHtml(voucher.pin) + '</b></div>' +
        '<p>Keep this voucher PIN private.</p><p style="font-size:10px">Transaction: ' + escapeHtml(voucher.id) + '</p>' +
        '</body></html>'
      });
    } catch (err) { showAlert('Printer', err?.message || 'Could not open the system printer.'); }
  };

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor /><TouchableOpacity onPress={goBackOrHome} style={styles.back}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>Malaysia Recharge PIN</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}><Text style={styles.title}>Buy a Recharge PIN</Text><Text style={styles.subtitle}>Purchase a real Malaysian telco voucher from the configured provider. MySheba never generates a fake telco PIN.</Text></View>
      <Text style={styles.label}>Operator</Text>
      {/* The same logos the recharge flow already ships - this screen was
          the only operator picker in the app still showing bare names. */}
      <View style={styles.grid}>{MALAYSIA_OPERATORS.map((item) => { const brand = getOperatorBrand(item); return (
        <TouchableOpacity key={item} onPress={() => { setOperator(item); setVoucher(null); }} style={[styles.option, styles.operatorOption, operator === item && styles.optionSelected]}>
          {brand.logo
            ? <View style={styles.operatorLogoWrap}><Image source={brand.logo} style={styles.operatorLogo} resizeMode="contain" /></View>
            : <View style={[styles.operatorBadge, { backgroundColor: brand.color }]}><Text style={styles.operatorBadgeText}>{brand.initials}</Text></View>}
          <Text style={[styles.optionText, operator === item && styles.optionTextSelected]} numberOfLines={2}>{item}</Text>
        </TouchableOpacity>
      ); })}</View>
      <Text style={styles.label}>Denomination</Text>
      <View style={styles.grid}>{AMOUNTS.map((item) => <TouchableOpacity key={item} onPress={() => { setAmount(item); setVoucher(null); }} style={[styles.amount, amount === item && styles.amountSelected]}><Text style={[styles.amountText, amount === item && styles.amountTextSelected]}>MYR {item}</Text></TouchableOpacity>)}</View>
      <TouchableOpacity disabled={busy} onPress={buy} style={styles.buy}><Text style={styles.buyText}>{busy ? 'Processing…' : 'Buy Recharge PIN'}</Text></TouchableOpacity>
      {!!voucher?.pin && <View style={styles.voucher}><Text style={styles.voucherTitle}>Recharge PIN Ready</Text><Text style={styles.voucherMeta}>{voucher.operator} • MYR {Number(voucher.amount).toFixed(2)}</Text><Text selectable style={styles.pin}>{voucher.pin}</Text><Text style={styles.warning}>Keep this PIN private. It is shown only after successful provider fulfillment.</Text><TouchableOpacity onPress={printVoucher} style={styles.print}><Text style={styles.printText}>🖨 Print Voucher</Text></TouchableOpacity></View>}
      <Text style={styles.balance}>Wallet: MYR {Number(profile?.walletBalance || 0).toFixed(2)}</Text>
    </ScrollView>
  </View>;
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg}, header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'}, back:{padding:4},backText:{color:'#fff',fontSize:22},headerTitle:{color:'#fff',fontSize:17,fontWeight:'800',marginLeft:8},
  content:{padding:16,paddingBottom:40}, intro:{backgroundColor:colors.card,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,padding:16,marginBottom:16}, title:{fontSize:21,fontWeight:'800',color:colors.text}, subtitle:{fontSize:12,lineHeight:18,color:colors.textSecondary,marginTop:6}, label:{fontSize:14,fontWeight:'800',color:colors.text,marginTop:6,marginBottom:8},
  grid:{flexDirection:'row',flexWrap:'wrap',gap:9,marginBottom:14}, option:{width:'31%',minHeight:58,alignItems:'center',justifyContent:'center',padding:7,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card},
  operatorOption:{minHeight:84,paddingVertical:9},
  // Several logos are opaque JPEGs, so on this screen's dark card they would
  // read as white rectangles. A white chip makes that deliberate and keeps
  // every logo legible in either theme.
  operatorLogoWrap:{width:'90%',height:34,borderRadius:7,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',paddingHorizontal:4,marginBottom:7},
  operatorLogo:{width:'100%',height:26},
  operatorBadge:{width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',marginBottom:7},
  operatorBadgeText:{color:'#FFFFFF',fontWeight:'800',fontSize:11}, optionSelected:{borderColor:colors.primary,borderWidth:2,backgroundColor:colors.surfaceElevated || colors.card}, optionText:{fontSize:11,fontWeight:'700',textAlign:'center',color:colors.text}, optionTextSelected:{color:colors.primary},
  amount:{width:'31%',minHeight:52,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.card}, amountSelected:{backgroundColor:colors.primary,borderColor:colors.primary}, amountText:{fontSize:13,fontWeight:'800',color:colors.text},amountTextSelected:{color:colors.onPrimary},
  buy:{marginTop:6,backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:14,alignItems:'center'}, buyText:{color:colors.onPrimary,fontWeight:'800',fontSize:14}, voucher:{marginTop:18,backgroundColor:colors.card,borderRadius:radius.lg,borderWidth:1.5,borderColor:colors.primary,padding:18,alignItems:'center'}, voucherTitle:{fontSize:18,fontWeight:'800',color:colors.text},voucherMeta:{marginTop:5,color:colors.textSecondary,fontSize:12},pin:{marginVertical:18,fontSize:27,fontWeight:'900',letterSpacing:4,color:colors.primary},warning:{fontSize:11,lineHeight:16,textAlign:'center',color:colors.textSecondary},print:{marginTop:14,borderRadius:radius.md,borderWidth:1,borderColor:colors.primary,paddingVertical:11,paddingHorizontal:20},printText:{color:colors.primary,fontWeight:'800'},balance:{marginTop:18,textAlign:'center',fontSize:11,color:colors.textSecondary}
});}
