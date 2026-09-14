import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import BannerSlider from '../components/BannerSlider';
import ServiceGrid from '../components/ServiceGrid';
import HeaderDecor from '../components/HeaderDecor';
import InfoBar from '../components/InfoBar';

export default function CustomerHomeScreen() {
  const { colors, brandGradient } = useTheme();
  const { openSidebar, setScreen, hasUnreadNotifications, profile } = useApp();
  const styles = createStyles(colors);
  const balance = profile?.balance ?? profile?.walletBalance ?? profile?.wallet?.balance ?? 0;
  const name = profile?.displayName || profile?.name || 'Welcome back';
  const kycVerified = profile?.verified === true || profile?.verificationStatus === 'approved';

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <View style={styles.logoArea}>
          <TouchableOpacity style={styles.menuBtn} onPress={openSidebar}><Text style={styles.menuIcon}>☰</Text></TouchableOpacity>
          <View style={styles.logoBox}><Image source={require('../../assets/icon.png')} style={styles.logoImage} resizeMode="cover" /></View>
          <View><Text style={styles.brand}>MySheba</Text><Text style={styles.tagline}>{name}</Text></View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.bellBtn} onPress={() => setScreen('notifications')}>
            <Text style={styles.bell}>🔔</Text>{hasUnreadNotifications && <View style={styles.bellDot} />}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.walletCard}>
          <View><Text style={styles.walletCaption}>Available Balance</Text><Text style={styles.walletBalance}>RM {Number(balance || 0).toFixed(2)}</Text></View>
          <TouchableOpacity style={styles.topUpButton} onPress={() => setScreen('topup')}><Text style={styles.topUpText}>+ Top Up</Text></TouchableOpacity>
        </View>

        {!kycVerified && <View style={styles.kycCard}>
          <View style={styles.kycIcon}><Text>!</Text></View>
          <View style={styles.kycCopy}><Text style={styles.kycTitle}>Complete your KYC</Text><Text style={styles.kycText}>Verify your identity to unlock all finance services.</Text></View>
          <TouchableOpacity onPress={() => setScreen('profile')}><Text style={styles.kycAction}>Verify</Text></TouchableOpacity>
        </View>}

        {kycVerified && <View style={styles.verifiedCard}>
          <View style={styles.verifiedIcon}><Text>✓</Text></View>
          <View style={styles.kycCopy}><Text style={styles.kycTitle}>Identity verified</Text><Text style={styles.kycText}>Your account is ready for finance services.</Text></View>
        </View>}

        <InfoBar />
        <BannerSlider />
        <ServiceGrid />

        <TouchableOpacity style={styles.quickHistory} onPress={() => setScreen('history')}>
          <View><Text style={styles.quickTitle}>Recent transactions</Text><Text style={styles.quickText}>View your complete payment history</Text></View>
          <Text style={styles.quickArrow}>›</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen:{flex:1,backgroundColor:colors.bg},
    header:{paddingVertical:14,paddingHorizontal:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center',overflow:'hidden'},
    logoArea:{flexDirection:'row',alignItems:'center'},menuBtn:{padding:4,marginRight:10},menuIcon:{color:'white',fontSize:21},
    logoBox:{width:38,height:38,backgroundColor:'white',borderRadius:12,alignItems:'center',justifyContent:'center',marginRight:10,overflow:'hidden'},logoImage:{width:'100%',height:'100%'},
    brand:{color:'white',fontWeight:'800',fontSize:16},tagline:{color:'white',fontSize:11,opacity:0.85,marginTop:2},headerRight:{flexDirection:'row',alignItems:'center'},bellBtn:{padding:6},bell:{fontSize:19},
    bellDot:{position:'absolute',top:3,right:3,width:8,height:8,borderRadius:4,backgroundColor:'#FF5252',borderWidth:1,borderColor:colors.primary},content:{padding:14,paddingBottom:28},
    walletCard:{borderRadius:20,padding:20,marginBottom:12,backgroundColor:colors.primary,flexDirection:'row',justifyContent:'space-between',alignItems:'center',elevation:4},walletCaption:{color:'white',opacity:0.8,fontSize:12,marginBottom:5},walletBalance:{color:'white',fontSize:28,fontWeight:'800'},
    topUpButton:{backgroundColor:'white',paddingHorizontal:14,paddingVertical:9,borderRadius:12},topUpText:{color:colors.primary,fontWeight:'800',fontSize:12},
    kycCard:{backgroundColor:colors.card,borderRadius:16,padding:13,marginBottom:12,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:colors.border},
    verifiedCard:{backgroundColor:colors.card,borderRadius:16,padding:13,marginBottom:12,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:colors.border},
    kycIcon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#FFF3CD',marginRight:10},verifiedIcon:{width:34,height:34,borderRadius:17,alignItems:'center',justifyContent:'center',backgroundColor:'#E8F5E9',marginRight:10},
    kycCopy:{flex:1},kycTitle:{color:colors.text,fontWeight:'800',fontSize:13},kycText:{color:colors.muted||'#6B7280',fontSize:10,marginTop:2},kycAction:{color:colors.primary,fontWeight:'800',fontSize:12,paddingLeft:8},
    quickHistory:{backgroundColor:colors.card,borderRadius:16,padding:15,marginTop:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderWidth:1,borderColor:colors.border},quickTitle:{color:colors.text,fontWeight:'800',fontSize:13},quickText:{color:colors.muted||'#6B7280',fontSize:10,marginTop:3},quickArrow:{color:colors.primary,fontSize:28,lineHeight:28}
  });
}