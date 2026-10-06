import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HeaderDecor from '../components/HeaderDecor';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import * as referralService from '../firebase/referralService';

export default function ReferralScreen() {
  const { goBackOrHome, profile } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { referralService.getReferralInfo().then(setInfo).catch(() => setError('Referral service is temporarily unavailable.')); }, []);

  const share = async () => {
    if (!info?.code) return;
    const message = `Join me on MySheba. Use my referral code ${info.code} when you register and start using recharge, bills, remittance and more.`;
    try { await Share.share({ message }); } catch (_) {}
  };

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor />
      <TouchableOpacity style={styles.back} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.title}>Invite & Earn</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🎁</Text>
        <Text style={styles.heroTitle}>Invite friends to MySheba</Text>
        <Text style={styles.heroText}>Share your code with friends. MySheba can reward qualifying referrals when the growth program is enabled.</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>YOUR REFERRAL CODE</Text>
        {info ? <Text style={styles.code}>{info.code}</Text> : <ActivityIndicator color={colors.primary} />}
        <TouchableOpacity style={styles.share} onPress={share} disabled={!info?.code}><Text style={styles.shareText}>Share invite</Text></TouchableOpacity>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.number}>{info?.inviteCount ?? 0}</Text><Text style={styles.statLabel}>Registered invites</Text></View>
        <View style={styles.stat}><Text style={styles.number}>{info?.qualifiedCount ?? 0}</Text><Text style={styles.statLabel}>Qualified</Text></View>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.note}>Referral rewards are controlled by MySheba's current campaign rules. Never pay anyone to join.</Text>
    </ScrollView>
  </View>;
}
function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg}, header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'}, back:{padding:4},backText:{color:'#fff',fontSize:22},title:{color:'#fff',fontSize:17,fontWeight:'800'},content:{padding:16,paddingBottom:40},
  hero:{backgroundColor:colors.card,borderRadius:radius.card,padding:20,borderWidth:1,borderColor:colors.border,alignItems:'center'},heroIcon:{fontSize:42},heroTitle:{fontSize:20,fontWeight:'900',color:colors.text,marginTop:8,textAlign:'center'},heroText:{fontSize:12.5,color:colors.textSecondary,textAlign:'center',lineHeight:19,marginTop:8},
  card:{backgroundColor:colors.card,borderRadius:radius.card,padding:18,borderWidth:1,borderColor:colors.border,marginTop:14,alignItems:'center'},label:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.textSecondary},code:{fontSize:28,fontWeight:'900',letterSpacing:3,color:colors.primary,marginVertical:12},share:{backgroundColor:colors.primary,paddingVertical:11,paddingHorizontal:24,borderRadius:radius.pill},shareText:{color:colors.onPrimary,fontWeight:'900'},stats:{flexDirection:'row',gap:12,marginTop:14},stat:{flex:1,backgroundColor:colors.card,borderRadius:radius.card,padding:16,alignItems:'center',borderWidth:1,borderColor:colors.border},number:{fontSize:24,fontWeight:'900',color:colors.text},statLabel:{fontSize:11,color:colors.textSecondary,marginTop:4,textAlign:'center'},error:{color:colors.danger||'#c62828',marginTop:12,textAlign:'center'},note:{fontSize:11,color:colors.textSecondary,textAlign:'center',marginTop:16,lineHeight:17}
});}
