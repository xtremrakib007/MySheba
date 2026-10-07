import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Share, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HeaderDecor from '../components/HeaderDecor';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import * as referralService from '../firebase/referralService';

function money(value) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}
function dateText(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleDateString(); } catch (_) { return ''; }
}

export default function ReferralScreen() {
  const { goBackOrHome } = useApp();
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    referralService.getReferralInfo().then(setInfo).catch(() => setError('Referral service is temporarily unavailable.'));
  };
  useEffect(() => { load(); }, []);

  const share = async () => {
    if (!info?.code || info?.enabled === false) return;
    const inviteLink = `https://mysheba.top/register?ref=${info.code}`;
    const message = `Join me on MySheba and earn more with MySheba services. Use my invite link: ${inviteLink}\n\nInvite code: ${info.code}\n\nI can earn ${money(info.reward)} after you complete ${money(info.minimumSpend)} in successful mobile top-ups.`;
    try { await Share.share({ message }); } catch (_) {}
  };

  const referrals = useMemo(() => Array.isArray(info?.referrals) ? info.referrals.slice(0, 20) : [], [info]);
  const enabled = info?.enabled !== false;
  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor />
      <TouchableOpacity style={styles.back} onPress={goBackOrHome}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.title}>Invite & Earn</Text>
    </LinearGradient>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroIcon}>🎁</Text>
        <Text style={styles.heroTitle}>Invite friends. Earn RM{Number(info?.reward || 5).toFixed(0)}.</Text>
        <Text style={styles.heroText}>
          Your friend registers with your link and completes at least {money(info?.minimumSpend || 50)} in successful domestic or international mobile top-ups. Once the backend verifies the requirement, the reward is credited to your MySheba wallet automatically.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>YOUR REFERRAL CODE</Text>
        {info ? <Text style={styles.code}>{info.code}</Text> : <ActivityIndicator color={colors.primary} />}
        <TouchableOpacity style={[styles.share, (!info?.code || !enabled) && styles.disabled]} onPress={share} disabled={!info?.code || !enabled}>
          <Text style={styles.shareText}>{enabled ? 'Share invite' : 'Referral program paused'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}><Text style={styles.number}>{info?.inviteCount ?? 0}</Text><Text style={styles.statLabel}>Registered invites</Text></View>
        <View style={styles.stat}><Text style={styles.number}>{info?.qualifiedCount ?? 0}</Text><Text style={styles.statLabel}>Qualified</Text></View>
        <View style={styles.stat}><Text style={styles.number}>{info?.rewardedCount ?? 0}</Text><Text style={styles.statLabel}>Rewarded</Text></View>
      </View>

      <View style={styles.terms}>
        <Text style={styles.sectionTitle}>How your friend qualifies</Text>
        <Text style={styles.term}>• Minimum qualifying spend: {money(info?.minimumSpend || 50)}</Text>
        <Text style={styles.term}>• Domestic and international mobile top-ups count.</Text>
        <Text style={styles.term}>• Multiple successful top-ups can be combined.</Text>
        <Text style={styles.term}>• Failed, cancelled, pending, refunded or reversed transactions do not count.</Text>
        <Text style={styles.term}>• Qualification period: {info?.qualificationDays || 30} days from registration.</Text>
        <Text style={styles.term}>• One reward per referred customer. Self-referrals and abusive activity are not eligible.</Text>
      </View>

      <View style={styles.referrals}>
        <View style={styles.rowBetween}><Text style={styles.sectionTitle}>Your referrals</Text><TouchableOpacity onPress={load}><Text style={styles.refresh}>Refresh</Text></TouchableOpacity></View>
        {!referrals.length && <Text style={styles.empty}>No referrals yet. Share your link to get started.</Text>}
        {referrals.map(item => {
          const progress = Math.min(100, Number(item.progressPercent || 0));
          const status = item.rewardStatus === 'rewarded' ? 'Rewarded' : item.status === 'qualified' ? 'Qualified' : item.status === 'expired' ? 'Expired' : 'In progress';
          return <View key={item.uid} style={styles.referralItem}>
            <View style={styles.rowBetween}><Text style={styles.refName}>{item.name}</Text><Text style={styles.status}>{status}</Text></View>
            <Text style={styles.progressText}>{money(item.qualifyingSpend)} / {money(item.minimumSpend)}</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress}%` }]} /></View>
            <Text style={styles.remaining}>{status === 'Rewarded' ? `Reward credited: ${money(item.rewardAmount)}` : item.qualificationDeadlineAt ? `Deadline: ${dateText(item.qualificationDeadlineAt)}` : `${money(item.remainingSpend)} remaining`}</Text>
          </View>;
        })}
      </View>

      {!!error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.note}>Terms apply. MySheba may withhold rewards where fraud, duplicate accounts, self-referral or reversed transactions are detected.</Text>
    </ScrollView>
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},
  header:{flexDirection:'row',alignItems:'center',padding:12,gap:10,overflow:'hidden'},
  back:{padding:4},backText:{color:'#fff',fontSize:22},title:{color:'#fff',fontSize:17,fontWeight:'800'},
  content:{padding:16,paddingBottom:40},
  hero:{backgroundColor:colors.card,borderRadius:radius.card,padding:20,borderWidth:1,borderColor:colors.border,alignItems:'center'},
  heroIcon:{fontSize:42},heroTitle:{fontSize:20,fontWeight:'900',color:colors.text,marginTop:8,textAlign:'center'},
  heroText:{fontSize:12.5,color:colors.textSecondary,textAlign:'center',lineHeight:19,marginTop:8},
  card:{backgroundColor:colors.card,borderRadius:radius.card,padding:18,borderWidth:1,borderColor:colors.border,marginTop:14,alignItems:'center'},
  label:{fontSize:10,fontWeight:'900',letterSpacing:1,color:colors.textSecondary},
  code:{fontSize:28,fontWeight:'900',letterSpacing:3,color:colors.primary,marginVertical:12},
  share:{backgroundColor:colors.primary,paddingVertical:11,paddingHorizontal:24,borderRadius:radius.pill},
  disabled:{opacity:0.5},shareText:{color:colors.onPrimary,fontWeight:'900'},
  stats:{flexDirection:'row',gap:8,marginTop:14},
  stat:{flex:1,backgroundColor:colors.card,borderRadius:radius.card,padding:14,alignItems:'center',borderWidth:1,borderColor:colors.border},
  number:{fontSize:22,fontWeight:'900',color:colors.text},statLabel:{fontSize:10,color:colors.textSecondary,marginTop:4,textAlign:'center'},
  terms:{backgroundColor:colors.card,borderRadius:radius.card,padding:16,borderWidth:1,borderColor:colors.border,marginTop:14},
  sectionTitle:{fontSize:15,fontWeight:'900',color:colors.text},term:{fontSize:12,color:colors.textSecondary,lineHeight:19,marginTop:7},
  referrals:{backgroundColor:colors.card,borderRadius:radius.card,padding:16,borderWidth:1,borderColor:colors.border,marginTop:14},
  rowBetween:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  refresh:{fontSize:12,fontWeight:'800',color:colors.primary},empty:{fontSize:12,color:colors.textSecondary,marginTop:12,textAlign:'center'},
  referralItem:{marginTop:14,paddingTop:12,borderTopWidth:1,borderTopColor:colors.border},
  refName:{fontSize:13,fontWeight:'800',color:colors.text},status:{fontSize:11,fontWeight:'800',color:colors.primary},
  progressText:{fontSize:11,color:colors.textSecondary,marginTop:8},track:{height:8,borderRadius:8,backgroundColor:colors.border,overflow:'hidden',marginTop:6},
  fill:{height:'100%',backgroundColor:colors.primary,borderRadius:8},remaining:{fontSize:10,color:colors.textSecondary,marginTop:6},
  error:{color:colors.danger||'#c62828',marginTop:12,textAlign:'center'},note:{fontSize:11,color:colors.textSecondary,textAlign:'center',marginTop:16,lineHeight:17}
});}
