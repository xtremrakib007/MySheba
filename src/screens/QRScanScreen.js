import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/theme';
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

export default function QRScanScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { authUser, setScreen } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  const [adding, setAdding] = useState(false);

  const handleScanned = useCallback(async ({ data }) => {
    if (locked) return;
    setLocked(true); setLoading(true);
    try {
      const parsed = JSON.parse(data);
      if (!parsed || parsed.app !== 'mysheba' || !parsed.uid) throw new Error('invalid');
      const user = await contactsService.getUserByUid(parsed.uid);
      if (!user || user.uid === authUser?.uid) throw new Error('not-found');
      setMatchedUser(user);
    } catch (err) {
      showAlert('MySheba', err?.message === 'not-found' ? 'Contact not found.' : 'That QR code is not a valid MySheba contact code.');
      setLocked(false);
    } finally { setLoading(false); }
  }, [locked, authUser?.uid]);

  const addContact = async () => {
    if (!matchedUser || !authUser?.uid) return;
    setAdding(true);
    try {
      await contactsService.addFriend(authUser.uid, matchedUser);
      showAlert('MySheba', 'Contact added to your Friends list.');
      setScreen('friendsList');
    } catch { showAlert('MySheba', 'Could not add this contact. Please try again.'); }
    finally { setAdding(false); }
  };

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor />
      <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('addContact')}><Text style={styles.backText}>←</Text></TouchableOpacity>
      <Text style={styles.headerTitle}>Scan QR Code</Text>
    </LinearGradient>
    {!permission ? <View style={styles.center}><ActivityIndicator color={colors.primary}/></View> : !permission.granted ?
      <View style={styles.center}><Text style={styles.permText}>Camera access is required to scan a MySheba contact QR code.</Text><TouchableOpacity style={styles.permBtn} onPress={requestPermission}><Text style={styles.btnText}>Allow Camera</Text></TouchableOpacity></View> :
      <View style={styles.cameraWrap}>
        <CameraView style={StyleSheet.absoluteFillObject} facing="back" barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={locked ? undefined : handleScanned}/>
        <View style={styles.overlay}><View style={styles.frame}/><Text style={styles.hint}>Point at a MySheba QR code</Text></View>
        {loading && <View style={styles.loading}><ActivityIndicator size="large" color="#fff"/></View>}
        {matchedUser && <View style={styles.resultOverlay}><View style={styles.card}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(matchedUser.name || matchedUser.phone || '?').charAt(0).toUpperCase()}</Text></View>
          <Text style={styles.name}>{matchedUser.name || matchedUser.phone || 'User'}</Text>
          <Text style={styles.meta}>{ROLE_LABEL[matchedUser.role] || matchedUser.role || 'MySheba User'}{matchedUser.phone ? ` · ${matchedUser.phone}` : ''}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={addContact} disabled={adding}>{adding ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Add Contact</Text>}</TouchableOpacity>
          <TouchableOpacity onPress={() => {setMatchedUser(null); setLocked(false);}}><Text style={styles.scanAgain}>Scan another code</Text></TouchableOpacity>
        </View></View>}
      </View>}
  </View>;
}

function createStyles(colors) { return StyleSheet.create({
  screen:{flex:1,backgroundColor:'#000'}, header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,overflow:'hidden'}, backBtn:{padding:4},backText:{color:'#fff',fontSize:20},headerTitle:{color:'#fff',fontWeight:'600',fontSize:16},center:{flex:1,backgroundColor:colors.bg,alignItems:'center',justifyContent:'center',padding:24},permText:{color:colors.text,textAlign:'center',marginBottom:16},permBtn:{backgroundColor:colors.primary,padding:12,borderRadius:radius.pill},btnText:{color:'#fff',fontWeight:'700'},cameraWrap:{flex:1},overlay:{flex:1,alignItems:'center',justifyContent:'center'},frame:{width:240,height:240,borderWidth:2,borderColor:'#fff',borderRadius:radius.lg},hint:{color:'#fff',marginTop:16},loading:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.4)',alignItems:'center',justifyContent:'center'},resultOverlay:{...StyleSheet.absoluteFillObject,backgroundColor:'rgba(0,0,0,.6)',alignItems:'center',justifyContent:'center',padding:24},card:{width:'100%',backgroundColor:colors.card,borderRadius:radius.lg,padding:20,alignItems:'center'},avatar:{width:56,height:56,borderRadius:28,backgroundColor:colors.primary,alignItems:'center',justifyContent:'center'},avatarText:{color:'#fff',fontSize:22,fontWeight:'700'},name:{color:colors.text,fontWeight:'700',fontSize:16,marginTop:8},meta:{color:colors.textSecondary,fontSize:12,marginTop:3},primaryBtn:{width:'100%',backgroundColor:colors.primary,padding:12,borderRadius:radius.pill,alignItems:'center',marginTop:18},scanAgain:{color:colors.textSecondary,fontSize:12,marginTop:16}
}); }
