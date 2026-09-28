import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { friendlyMessage, authErrorMessage } from '../utils/signInErrorCopy';

// AppContext stores the raw err.message in authError; this is what is
// shown in its place, so a callable's UNAUTHENTICATED never reaches the screen.
const AUTH_ERROR_FALLBACK = 'Could not verify this device. Please try again.';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import * as authService from '../firebase/authService';
import * as deviceSessionService from '../firebase/deviceSessionService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import { verifyCallableFor } from '../utils/devicePolicy';

// The staff role list lives in src/utils/devicePolicy.js. A second copy here
// is how this broke: the list itself was right, what it was tested against
// was null.

export default function DeviceVerifyScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { profile, pendingDeviceVerification, setScreen, authError, cancelDeviceVerification } = useApp();
  const email = pendingDeviceVerification?.email || profile?.email || '';
  const phone = pendingDeviceVerification?.phone || profile?.phone || '';
  const uid = pendingDeviceVerification?.uid || profile?.uid || profile?.userId || '';
  const [method, setMethod] = useState('email');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);

  const homeForRole = (role) => {
    if (role === 'admin' || role === 'superadmin') return 'adminHome';
    if (role === 'dealer') return 'dealerHome';
    if (role === 'reseller') return 'resellerHome';
    return 'customerHome';
  };

  const finish = async (credential) => {
    setLocalError(''); setBusy(true);
    try {
      const deviceId = await deviceSessionService.getDeviceId();
      const deviceLabel = deviceSessionService.getDeviceLabel();
      // Never guess this. The two callables are not interchangeable, and the
      // wrong one cannot be recovered from - see src/utils/devicePolicy.js.
      // pendingDeviceVerification carries the role now, profile is the
      // fallback, and if neither has it, ask the server rather than assume.
      let role = pendingDeviceVerification?.role || profile?.role;
      if (!role && uid) {
        try { role = (await authService.fetchProfile(uid))?.role || null; } catch (_) { role = null; }
      }
      const callable = verifyCallableFor(role);
      if (!callable) throw new Error('Could not confirm your account type. Please sign in again.');
      const staff = callable === 'checkDeviceSession';
      const payload = { uid, deviceId, deviceLabel, phoneIdToken: credential?.phoneIdToken || undefined, emailIdToken: credential?.emailIdToken || undefined, emailOtp: credential?.emailOtp || undefined };
      const fn = httpsCallable(functions, callable);
      const { data } = await fn(payload);
      if (data?.requiresOtp || (!staff && !data?.sessionId)) throw new Error('Verification is still pending. Please enter the latest code.');
      await deviceSessionService.setLocalSessionId(data.sessionId);
      const refreshed = await authService.fetchProfile(uid);
      setScreen(homeForRole(refreshed?.role || role));
    } catch (e) { setLocalError(friendlyMessage(e, 'Could not complete device verification. Please try again.')); }
    finally { setBusy(false); }
  };

  const sendEmail = async () => {
    setLocalError(''); setBusy(true);
    try {
      const deviceId = await deviceSessionService.getDeviceId();
      const fn = httpsCallable(functions, 'checkDeviceSession');
      const { data } = await fn({ uid, deviceId, deviceLabel: deviceSessionService.getDeviceLabel(), resendEmailChallenge: true });
      if (!data?.requiresOtp) throw new Error('This device no longer needs verification. Please sign in again.');
      setSent(true); setCode('');
    } catch (e) { setLocalError(friendlyMessage(e, 'Could not send the verification email. Please try again.')); }
    finally { setBusy(false); }
  };

  // Ask for the code ourselves when the server has not said it sent one.
  //
  // Signing in on a device that is not the account's active one raises a
  // new-device challenge, and the deployed copy of checkDeviceSession only
  // mails the code when resendEmailChallenge is set - which nothing does on
  // a first sign-in. So this screen said "we emailed you a code", no email
  // existed, and no code could work: logging out of one account and into
  // another on the same phone had no path through at all. The fix for that
  // is in functions/ and cannot ship over the air, so the client asks.
  //
  // emailChallengeSent is the server's own report. A copy new enough to
  // send it on the first challenge sets it, and this does nothing; an older
  // one leaves it undefined, and one resend request gets the mail sent.
  // Once for the life of the screen, so it cannot loop.
  const [autoAsked, setAutoAsked] = useState(false);
  useEffect(() => {
    if (autoAsked || sent || busy) return;
    if (method !== 'email' || !email || !uid) return;
    if (pendingDeviceVerification?.emailChallengeSent) return;
    setAutoAsked(true);
    sendEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, email, uid, autoAsked, sent]);

  const sendSms = async () => {
    setLocalError(''); setBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone);
      setPhoneConfirmation(confirmation); setSent(true); setCode('');
    } catch (e) { setLocalError(friendlyMessage(e, 'Could not send the SMS verification code. Please try again.')); }
    finally { setBusy(false); }
  };

  const verifyEmailOtp = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Enter the 6-digit email verification code.'); return; }
    await finish({ emailOtp: code.trim() });
  };

  const verifyEmailLink = async (url) => {
    setLocalError(''); setBusy(true);
    try { const result = await emailVerification.confirmEmailLink(url, email); await finish({ emailIdToken: result.idToken }); }
    catch (e) { setLocalError(friendlyMessage(e, 'Could not verify your email link. Please try again.')); }
    finally { setBusy(false); }
  };

  const verifySms = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setLocalError('Enter the 6-digit SMS verification code.'); return; }
    setLocalError(''); setBusy(true);
    try { const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, code.trim()); await finish({ phoneIdToken: result.idToken }); }
    catch (e) { setLocalError(friendlyMessage(e, 'Could not verify the SMS code. Please try again.')); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    const handleUrl = (url) => { if (method === 'email' && sent && emailVerification.isEmailSignInLink(url)) verifyEmailLink(url); };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [method, sent, email]);

  const switchMethod = (next) => { if (busy) return; setMethod(next); setSent(false); setCode(''); setPhoneConfirmation(null); setLocalError(''); };

  return <View style={styles.screen}>
    <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.header}>
      <HeaderDecor /><Text style={styles.headerTitle}>Verify This Device</Text>
    </LinearGradient>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <View style={styles.methodToggle}>
        <TouchableOpacity style={[styles.methodBtn, method === 'email' && styles.methodBtnActive]} onPress={() => switchMethod('email')} disabled={busy}><Text style={[styles.methodBtnText, method === 'email' && styles.methodBtnTextActive]}>Email</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.methodBtn, method === 'sms' && styles.methodBtnActive]} onPress={() => switchMethod('sms')} disabled={busy}><Text style={[styles.methodBtnText, method === 'sms' && styles.methodBtnTextActive]}>SMS</Text></TouchableOpacity>
      </View>
      {method === 'email' ? <>
        <Text style={styles.intro}>For a new device, we will send one verification email to {email || 'your email'}. Use the link or the 6-digit code. No security PIN is required.</Text>
        {!sent ? <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={sendEmail} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send Email Verification</Text>}</TouchableOpacity> : <>
          <Text style={styles.methodHint}>Tap the verification link in the email, or enter the 6-digit code below.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>Email verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={verifyEmailOtp} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify Email Code</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={sendEmail} disabled={busy}><Text style={styles.resendText}>Send link + code again</Text></TouchableOpacity>
        </>}
      </> : <>
        <Text style={styles.intro}>We will send one 6-digit SMS verification code to {phone || 'your phone number'}.</Text>
        {!sent ? <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={sendSms} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send SMS Code</Text>}</TouchableOpacity> : <>
          <View style={styles.formGroup}><Text style={styles.label}>SMS verification code</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View>
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={verifySms} disabled={busy}>{busy ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify SMS</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={sendSms} disabled={busy}><Text style={styles.resendText}>Resend SMS</Text></TouchableOpacity>
        </>}
      </>}
      {!!(localError || authError) && <Text style={styles.errorText}>{localError || authErrorMessage(authError, AUTH_ERROR_FALLBACK)}</Text>}
      <TouchableOpacity style={styles.cancelBtn} onPress={cancelDeviceVerification} disabled={busy}><Text style={styles.cancelText}>Cancel and sign out</Text></TouchableOpacity>
    </ScrollView>
  </View>;
}

function createStyles(colors){return StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg},scroll:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,overflow:'hidden',borderBottomWidth:1,borderBottomColor:colors.border},headerTitle:{color:colors.onPrimary,fontWeight:'700',fontSize:16},body:{padding:20,paddingBottom:40,backgroundColor:colors.bg},methodToggle:{flexDirection:'row',backgroundColor:colors.inputBg,borderRadius:radius.md,padding:4,marginBottom:18,borderWidth:1,borderColor:colors.border},methodBtn:{flex:1,paddingVertical:10,borderRadius:radius.md-2,alignItems:'center'},methodBtnActive:{backgroundColor:colors.primary},methodBtnText:{fontSize:13,fontWeight:'700',color:colors.textSecondary},methodBtnTextActive:{color:'#fff'},intro:{fontSize:13,color:colors.textSecondary,marginBottom:20,textAlign:'center',lineHeight:20},methodHint:{fontSize:12,color:colors.textSecondary,marginBottom:16,textAlign:'center',lineHeight:19},formGroup:{marginBottom:14},label:{fontWeight:'700',marginBottom:7,fontSize:13,color:colors.text},otpInput:{width:'100%',paddingVertical:15,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:20,letterSpacing:5,textAlign:'center',backgroundColor:colors.inputBg,color:colors.text},btn:{backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:.6},btnText:{color:'#fff',fontWeight:'800',fontSize:14},errorText:{color:colors.error,fontSize:12,marginTop:10,textAlign:'center'},resendBtn:{alignItems:'center',marginTop:15},resendText:{color:colors.primary,fontSize:13,fontWeight:'700',textDecorationLine:'underline'},cancelBtn:{alignItems:'center',marginTop:28},cancelText:{color:colors.textSecondary,fontSize:12,fontWeight:'600'}});}
