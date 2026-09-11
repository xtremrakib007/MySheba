import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import * as securityPinService from '../firebase/securityPinService';
import * as deviceSessionService from '../firebase/deviceSessionService';
import { functions } from '../firebase/config';

export default function DeviceVerifyScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const {
    profile,
    pendingDeviceVerification,
    setScreen,
    authError,
    authBusy,
    cancelDeviceVerification,
  } = useApp();

  const email = pendingDeviceVerification?.email || profile?.email || '';
  const phone = pendingDeviceVerification?.phone || profile?.phone || '';
  const [method, setMethod] = useState('email');
  const [step, setStep] = useState('verify');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [verifiedCredential, setVerifiedCredential] = useState(null);

  const needsPin = !!profile?.securityPinSet;

  const homeForRole = (role) => {
    if (role === 'admin' || role === 'superadmin') return 'adminHome';
    if (role === 'dealer') return 'dealerHome';
    if (role === 'reseller') return 'resellerHome';
    return 'customerHome';
  };

  const sendEmail = async () => {
    setLocalError(''); setBusy(true);
    try {
      const deviceId = await deviceSessionService.getDeviceId();
      await httpsCallable(functions, 'sendDeviceVerification')({ deviceId });
      setSent(true);
      setCode('');
    } catch (e) {
      setLocalError(e.message || 'Could not send the verification email. Please try again.');
    } finally { setBusy(false); }
  };

  const sendSms = async () => {
    setLocalError(''); setBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone);
      setPhoneConfirmation(confirmation);
      setSent(true);
      setCode('');
    } catch (e) {
      setLocalError(e.message || 'Could not send the SMS verification code. Please try again.');
    } finally { setBusy(false); }
  };

  const verifyEmailOtp = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Enter the 6-digit email verification code.'); return; }
    setLocalError(''); setBusy(true);
    try {
      setVerifiedCredential({ emailOtp: code.trim() });
      setStep(needsPin ? 'pin' : 'complete');
      if (!needsPin) await approveDevice({ emailOtp: code.trim() });
    } catch (e) { setLocalError(e.message || 'Could not verify the email code. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifyEmailLink = async (url) => {
    setLocalError(''); setBusy(true);
    try {
      const result = await emailVerification.confirmEmailLink(url, email);
      setVerifiedCredential({ emailIdToken: result.idToken });
      if (needsPin) setStep('pin');
      else await approveDevice({ emailIdToken: result.idToken });
    } catch (e) { setLocalError(e.message || 'Could not verify your email link. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifySms = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Enter the 6-digit SMS verification code.'); return; }
    setLocalError(''); setBusy(true);
    try {
      const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, code.trim());
      setVerifiedCredential({ phoneIdToken: result.idToken });
      if (needsPin) setStep('pin');
      else await approveDevice({ phoneIdToken: result.idToken });
    } catch (e) { setLocalError(e.message || 'Could not verify the SMS code. Please try again.'); }
    finally { setBusy(false); }
  };

  async function approveDevice(credential = verifiedCredential) {
    setLocalError(''); setBusy(true);
    try {
      if (needsPin && step === 'pin') {
        if (!/^\d{4,8}$/.test(pin.trim())) {
          setLocalError('Enter your 4-8 digit security PIN.');
          setBusy(false);
          return;
        }
        await securityPinService.verifySecurityPin(pin.trim());
      }

      const deviceId = await deviceSessionService.getDeviceId();
      const fn = httpsCallable(functions, 'confirmDeviceEmailOtp');
      const { data } = await fn({
        deviceId,
        code: credential?.emailOtp || undefined,
        emailIdToken: credential?.emailIdToken || undefined,
        phoneIdToken: credential?.phoneIdToken || undefined,
      });
      if (!data?.sessionId) throw new Error('Device verification did not return a valid session.');
      await deviceSessionService.setLocalSessionId(data.sessionId);
      setStep('complete');
      setScreen(homeForRole(profile?.role));
    } catch (e) {
      setLocalError(e.message || 'Could not complete device verification. Please try again.');
    } finally { setBusy(false); }
  }

  useEffect(() => {
    const handleUrl = (url) => {
      if (method === 'email' && sent && emailVerification.isEmailSignInLink(url)) verifyEmailLink(url);
    };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [method, sent, email]);

  const switchMethod = (next) => {
    if (busy || step !== 'verify') return;
    setMethod(next); setSent(false); setCode(''); setPhoneConfirmation(null); setLocalError('');
  };

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor />
      <Text style={styles.headerTitle}>Verify This Device</Text>
    </LinearGradient>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {step === 'verify' ? <>
        <View style={styles.methodToggle}>
          <TouchableOpacity style={[styles.methodBtn, method === 'email' && styles.methodBtnActive]} onPress={() => switchMethod('email')} disabled={busy}>
            <Text style={[styles.methodBtnText, method === 'email' && styles.methodBtnTextActive]}>Email</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.methodBtn, method === 'sms' && styles.methodBtnActive]} onPress={() => switchMethod('sms')} disabled={busy}>
            <Text style={[styles.methodBtnText, method === 'sms' && styles.methodBtnTextActive]}>SMS</Text>
          </TouchableOpacity>
        </View>

        {method === 'email' ? <>
          <Text style={styles.intro}>We will send one email containing a verification link and a 6-digit code to {email || 'your email'}. Use either one.</Text>
          {!sent ? <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={sendEmail} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send Email Verification</Text>}
          </TouchableOpacity> : <>
            <Text style={styles.methodHint}>Tap the link in the email, or enter the 6-digit code below.</Text>
            <View style={styles.formGroup}><Text style={styles.label}>Email verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
            <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={verifyEmailOtp} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify Email Code</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.resendBtn} onPress={sendEmail} disabled={busy}><Text style={styles.resendText}>Send link + code again</Text></TouchableOpacity>
          </>}
        </> : <>
          <Text style={styles.intro}>We will send a 6-digit SMS verification code to {phone || 'your phone number'}.</Text>
          {!sent ? <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={sendSms} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send SMS Code</Text>}
          </TouchableOpacity> : <>
            <View style={styles.formGroup}><Text style={styles.label}>SMS verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
            <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={verifySms} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify SMS</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.resendBtn} onPress={sendSms} disabled={busy}><Text style={styles.resendText}>Resend SMS</Text></TouchableOpacity>
          </>}
        </>}
      </> : step === 'pin' ? <>
        <Text style={styles.stepTitle}>Verify Your Security PIN</Text>
        <Text style={styles.intro}>Your account already has a security PIN. Enter it to finish approving this device.</Text>
        <View style={styles.formGroup}><Text style={styles.label}>Security PIN</Text><TextInput style={styles.otpInput} placeholder="••••" placeholderTextColor="#777" keyboardType="number-pad" secureTextEntry maxLength={8} value={pin} onChangeText={setPin}/></View>
        <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={() => approveDevice()} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify PIN & Continue</Text>}
        </TouchableOpacity>
      </> : <ActivityIndicator color={colors.primary} style={{marginTop:30}}/>}

      {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
      <TouchableOpacity style={styles.cancelBtn} onPress={cancelDeviceVerification} disabled={busy}><Text style={styles.cancelText}>Cancel and sign out</Text></TouchableOpacity>
    </ScrollView>
  </View>;
}

function createStyles(colors){return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},scroll:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,overflow:'hidden',borderBottomWidth:1,borderBottomColor:colors.border},headerTitle:{color:colors.onPrimary,fontWeight:'700',fontSize:16},body:{padding:20,paddingBottom:40,backgroundColor:colors.bg},methodToggle:{flexDirection:'row',backgroundColor:colors.inputBg,borderRadius:radius.md,padding:4,marginBottom:18,borderWidth:1,borderColor:colors.border},methodBtn:{flex:1,paddingVertical:10,borderRadius:radius.md-2,alignItems:'center'},methodBtnActive:{backgroundColor:colors.primary},methodBtnText:{fontSize:13,fontWeight:'700',color:colors.textSecondary},methodBtnTextActive:{color:'#fff'},intro:{fontSize:13,color:colors.textSecondary,marginBottom:20,textAlign:'center',lineHeight:20},stepTitle:{fontSize:19,fontWeight:'800',color:colors.text,textAlign:'center',marginBottom:10},methodHint:{fontSize:12,color:colors.textSecondary,marginBottom:16,textAlign:'center',lineHeight:19},formGroup:{marginBottom:14},label:{fontWeight:'700',marginBottom:7,fontSize:13,color:colors.text},otpInput:{width:'100%',paddingVertical:15,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:20,letterSpacing:5,textAlign:'center',backgroundColor:colors.inputBg,color:colors.text},btn:{backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:.6},btnText:{color:'#fff',fontWeight:'800',fontSize:14},errorText:{color:colors.error,fontSize:12,marginTop:10,textAlign:'center'},resendBtn:{alignItems:'center',marginTop:15},resendText:{color:colors.primary,fontSize:13,fontWeight:'700',textDecorationLine:'underline'},cancelBtn:{alignItems:'center',marginTop:28},cancelText:{color:colors.textSecondary,fontSize:12,fontWeight:'600'}});}
