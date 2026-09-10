import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import * as deviceSessionService from '../firebase/deviceSessionService';
import * as authService from '../firebase/authService';

export default function DeviceVerifyScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { pendingDeviceVerification, confirmDeviceVerification, cancelDeviceVerification, authError, authBusy } = useApp();
  const email = pendingDeviceVerification?.email || '';
  const phone = pendingDeviceVerification?.phone || '';
  const isAdminMfa = pendingDeviceVerification?.reason === 'admin_mfa';
  const availableMfaMethods = pendingDeviceVerification?.availableMfaMethods?.length ? pendingDeviceVerification.availableMfaMethods : ['email'];
  const canChooseMfaMethod = isAdminMfa && availableMfaMethods.length > 1;
  const [mfaMethod, setMfaMethod] = useState(availableMfaMethods.includes('email') ? 'email' : availableMfaMethods[0]);
  const isEmail = mfaMethod === 'email';
  const isSms = mfaMethod === 'sms';
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [sent, setSent] = useState(isEmail);
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);

  const switchMethod = (method) => { if (method === mfaMethod) return; setMfaMethod(method); setSent(false); setCode(''); setPhoneConfirmation(null); setLocalError(''); };

  useEffect(() => {
    if (isSms || !sent) return undefined;
    const handleUrl = (url) => { if (emailVerification.isEmailSignInLink(url)) onConfirmEmailLink(url); };
    Linking.getInitialURL().then(url => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [isSms, sent]);

  const onSendCode = async () => {
    setLocalError(''); setOtpBusy(true);
    try {
      if (isSms) setPhoneConfirmation(await phoneVerification.sendPhoneOtp(phone));
      else if (isAdminMfa) await authService.retryDeviceSession(pendingDeviceVerification?.uid, undefined, undefined, undefined, true);
      else {
        const deviceId = await deviceSessionService.getDeviceId();
        await emailVerification.sendDeviceVerificationEmail(deviceId);
      }
      setSent(true);
    } catch (e) { setLocalError(e.message || 'Could not send the verification code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onVerifyPhoneCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Please enter the 6-digit SMS code.'); return; }
    setLocalError(''); setOtpBusy(true);
    try { const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, code.trim()); await confirmDeviceVerification(result.idToken); }
    catch (e) { setLocalError(e.message || 'Incorrect code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onVerifyEmailOtp = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Please enter the 6-digit email code.'); return; }
    setLocalError(''); setOtpBusy(true);
    try { await confirmDeviceVerification(undefined, undefined, code.trim()); }
    catch (e) { setLocalError(e.message || 'Incorrect code. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const onConfirmEmailLink = async (url) => {
    setLocalError(''); setOtpBusy(true);
    try { const result = await emailVerification.confirmEmailLink(url, email); await confirmDeviceVerification(undefined, result.idToken); }
    catch (e) { setLocalError(e.message || 'Could not verify your email address. Please try again.'); }
    finally { setOtpBusy(false); }
  };

  const busy = otpBusy || authBusy;
  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}><HeaderDecor/><Text style={styles.headerTitle}>{isAdminMfa?'Verify Your Sign-In':'Verify This Device'}</Text></LinearGradient>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {canChooseMfaMethod && <View style={styles.methodToggle}>
        <TouchableOpacity style={[styles.methodBtn,isEmail&&styles.methodBtnActive]} onPress={()=>switchMethod('email')} disabled={busy}><Text style={[styles.methodBtnText,isEmail&&styles.methodBtnTextActive]}>Email</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.methodBtn,isSms&&styles.methodBtnActive]} onPress={()=>switchMethod('sms')} disabled={busy}><Text style={[styles.methodBtnText,isSms&&styles.methodBtnTextActive]}>SMS</Text></TouchableOpacity>
      </View>}
      <Text style={styles.intro}>{isSms?`Enter the 6-digit code sent to ${phone || 'your phone'}.`:isEmail?`We sent one email with a verification link and a 6-digit code to ${email || 'your email'}. Use either one.`:`Verify this device using the link sent to ${email || 'your email'}.`}</Text>
      {!sent ? <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSendCode} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>{isSms?'Send Verification Code':'Send Verification Email'}</Text>}</TouchableOpacity> : isSms ? <>
        <View style={styles.formGroup}><Text style={styles.label}>6-digit verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
        <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onVerifyPhoneCode} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>Verify & Continue</Text>}</TouchableOpacity>
        <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}><Text style={styles.resendText}>Didn't get a code? Resend</Text></TouchableOpacity>
      </> : isAdminMfa ? <>
        <Text style={styles.methodHint}>Tap the email verification link, or enter the 6-digit code from the same email.</Text>
        <View style={styles.formGroup}><Text style={styles.label}>6-digit verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
        <TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onVerifyEmailOtp} disabled={busy}>{busy?<ActivityIndicator color="#fff"/>:<Text style={styles.btnText}>Verify with Code</Text>}</TouchableOpacity>
        <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}><Text style={styles.resendText}>Didn't get the email? Resend</Text></TouchableOpacity>
      </> : <>
        <Text style={styles.methodHint}>Tap the verification link on this device. This screen will continue automatically.</Text>
        {busy&&<ActivityIndicator color="#fff" style={{marginBottom:12}}/>}
        <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}><Text style={styles.resendText}>Didn't get a link? Resend</Text></TouchableOpacity>
      </>}
      {!!(localError||authError)&&<Text style={styles.errorText}>{localError||authError}</Text>}
      <TouchableOpacity style={styles.cancelBtn} onPress={cancelDeviceVerification} disabled={busy}><Text style={styles.cancelText}>Cancel and sign out</Text></TouchableOpacity>
    </ScrollView>
  </View>;
}

function createStyles(colors){return StyleSheet.create({
  screen:{flex:1,backgroundColor:'#050505'},scroll:{flex:1,backgroundColor:'#050505'},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:'#080808',overflow:'hidden',borderBottomWidth:1,borderBottomColor:'#292929'},headerTitle:{color:'#fff',fontWeight:'700',fontSize:16},body:{padding:20,paddingBottom:40,backgroundColor:'#050505'},methodToggle:{flexDirection:'row',backgroundColor:'#161616',borderRadius:radius.md,padding:4,marginBottom:18,borderWidth:1,borderColor:'#333'},methodBtn:{flex:1,paddingVertical:9,borderRadius:radius.md-2,alignItems:'center'},methodBtnActive:{backgroundColor:colors.primary},methodBtnText:{fontSize:13,fontWeight:'700',color:'#ccc'},methodBtnTextActive:{color:'#fff'},intro:{fontSize:13,color:'#ddd',marginBottom:20,textAlign:'center',lineHeight:20},methodHint:{fontSize:12,color:'#aaa',marginBottom:16,textAlign:'center',lineHeight:19},formGroup:{marginBottom:14},label:{fontWeight:'700',marginBottom:7,fontSize:13,color:'#fff'},input:{width:'100%',paddingVertical:13,paddingHorizontal:14,borderWidth:1,borderColor:'#444',borderRadius:radius.md,fontSize:14,backgroundColor:'#111',color:'#fff'},otpInput:{width:'100%',paddingVertical:15,paddingHorizontal:14,borderWidth:1,borderColor:'#666',borderRadius:radius.md,fontSize:20,letterSpacing:5,textAlign:'center',backgroundColor:'#111',color:'#fff'},btn:{backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:.6},btnText:{color:'#fff',fontWeight:'800',fontSize:14},errorText:{color:'#ff7777',fontSize:12,marginTop:10,textAlign:'center'},resendBtn:{alignItems:'center',marginTop:15},resendText:{color:'#fff',fontSize:13,fontWeight:'700',textDecorationLine:'underline'},cancelBtn:{alignItems:'center',marginTop:28},cancelText:{color:'#888',fontSize:12,fontWeight:'600'}});}
