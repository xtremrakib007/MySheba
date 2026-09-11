import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { signInWithCredential, GoogleAuthProvider } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import * as securityPinService from '../firebase/securityPinService';
import { auth, functions } from '../firebase/config';
import { getGoogleIdToken } from '../firebase/googleAuth';

// New Google accounts follow one deterministic onboarding sequence:
// Google -> verify the real Google email (link OR 6-digit OTP) -> verify a
// phone number by SMS OTP -> create the MySheba profile -> set the security
// PIN. Profile creation must happen before setupSecurityPin because the PIN
// service also updates users/{uid}.
export default function GooglePhoneScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { completeGooglePhone, cancelGooglePhone, authError, authBusy } = useApp();
  const [step, setStep] = useState('email');
  const [emailCode, setEmailCode] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [email, setEmail] = useState(auth.currentUser?.email || '');
  const [emailProof, setEmailProof] = useState({ emailIdToken: '', emailOtpVerificationId: '' });
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneIdToken, setPhoneIdToken] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  const sendEmail = async () => {
    const address = String(email || auth.currentUser?.email || '').trim();
    if (!address) { setLocalError('We could not find your Google email. Please start Google sign-in again.'); return; }
    setLocalError(''); setBusy(true);
    try {
      await emailVerification.sendEmailOtp(address);
      setEmailSent(true); setEmailCode(''); setEmailProof({ emailIdToken: '', emailOtpVerificationId: '' });
    } catch (e) { setLocalError(e.message || 'Could not send the email verification. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifyEmailOtp = async () => {
    if (!/^\d{6}$/.test(emailCode.trim())) { setLocalError('Enter the 6-digit email verification code.'); return; }
    setLocalError(''); setBusy(true);
    try {
      const result = await emailVerification.verifyEmailOtp(email.trim(), emailCode.trim());
      setEmailProof({ emailIdToken: '', emailOtpVerificationId: result.verificationId });
      setEmailVerified(true); setStep('phone'); setLocalError('');
    } catch (e) { setLocalError(e.message || 'Could not verify the email code. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifyEmailLink = async (url) => {
    setLocalError(''); setBusy(true);
    try {
      const result = await emailVerification.confirmEmailLink(url, email.trim());
      // confirmEmailLink temporarily signs in with the email-link identity
      // and then signs out. Restore the original Google Auth identity before
      // continuing the Google onboarding flow, and retain the verified token
      // as proof for ensureGoogleProfile.
      const googleToken = await getGoogleIdToken();
      await signInWithCredential(auth, GoogleAuthProvider.credential(googleToken));
      setEmailProof({ emailIdToken: result.idToken, emailOtpVerificationId: '' });
      setEmailVerified(true); setStep('phone');
    } catch (e) { setLocalError(e.message || 'Could not verify your email link. Please try again.'); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (step !== 'email' || !emailSent) return undefined;
    const handleUrl = (url) => { if (emailVerification.isEmailSignInLink(url)) verifyEmailLink(url); };
    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, [step, emailSent, email]);

  const sendPhone = async () => {
    if (String(phone).replace(/[^0-9]/g, '').length < 8) { setLocalError('Please enter a valid phone number.'); return; }
    setLocalError(''); setBusy(true);
    try {
      const confirmation = await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial);
      setPhoneConfirmation(confirmation); setPhoneCode(''); setStep('phoneOtp');
    } catch (e) { setLocalError(e.message || 'Could not send the SMS verification code. Please try again.'); }
    finally { setBusy(false); }
  };

  const verifyPhone = async () => {
    if (!/^\d{6}$/.test(phoneCode.trim())) { setLocalError('Enter the 6-digit SMS verification code.'); return; }
    if (!phoneConfirmation) { setLocalError('This SMS verification session expired. Please resend.'); return; }
    setLocalError(''); setBusy(true);
    try {
      const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, phoneCode.trim());
      const token = result?.idToken || '';
      if (!token) throw new Error('The SMS verification result was incomplete. Please resend the code.');
      setPhoneCode('');
      setPhoneIdToken(token);

      // IMPORTANT: create the real users/{uid} profile now, but do not run
      // completeGooglePhone yet because it also performs device-session
      // routing. The PIN must be created before final Home navigation.
      const ensureProfileFn = httpsCallable(functions, 'ensureGoogleProfile');
      await ensureProfileFn({
        phone: phone.trim(),
        phoneE164: phoneVerification.phoneToE164(phone, phoneCountry.dial),
        phoneCountryCode: phoneCountry.dial,
        phoneIdToken: token,
        emailIdToken: emailProof.emailIdToken || undefined,
        emailOtpVerificationId: emailProof.emailOtpVerificationId || undefined,
      });

      setStep('pin');
      setLocalError('');
    } catch (e) { setLocalError(e.message || 'Could not complete phone verification. Please try again.'); }
    finally { setBusy(false); }
  };

  const finishPin = async () => {
    if (!/^\d{4,8}$/.test(pin.trim())) { setLocalError('PIN must be 4-8 digits.'); return; }
    if (pin !== confirmPin) { setLocalError('PINs do not match.'); return; }
    setLocalError(''); setBusy(true);
    try {
      // Profile already exists from the verified email + SMS step, so the
      // security PIN service can safely create securityPins/{uid} and update
      // users/{uid}.securityPinSet.
      await securityPinService.setupSecurityPin(pin.trim());
      setStep('done');
      // completeGooglePhone is intentionally LAST: it checks the device
      // session, stores the local session, and routes to the role dashboard.
      await completeGooglePhone(phone.trim());
    } catch (e) { setLocalError(e.message || 'Could not finish your Google account setup. Please try again.'); }
    finally { setBusy(false); }
  };

  const busyNow = busy || authBusy;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <Text style={styles.headerTitle}>Finish Google Sign-Up</Text>
      </LinearGradient>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {step === 'email' && <>
          <Text style={styles.stepTitle}>Verify Your Email</Text>
          <Text style={styles.intro}>Confirm your Google email before we create your MySheba account. We send one email containing a verification link and a 6-digit OTP. Either one works.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>Google Email</Text><TextInput style={styles.input} value={email} editable={false} autoCapitalize="none"/></View>
          {!emailSent ? <TouchableOpacity style={[styles.btn, busyNow && styles.btnDisabled]} onPress={sendEmail} disabled={busyNow}>{busyNow ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send Email Link + OTP</Text>}</TouchableOpacity> : <>
            <View style={styles.formGroup}><Text style={styles.label}>6-digit Email OTP</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={emailCode} onChangeText={setEmailCode}/></View>
            <TouchableOpacity style={[styles.btn, busyNow && styles.btnDisabled]} onPress={verifyEmailOtp} disabled={busyNow}>{busyNow ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify Email OTP</Text>}</TouchableOpacity>
            <Text style={styles.methodHint}>Or tap the verification link from the same email.</Text>
            <TouchableOpacity style={styles.resendBtn} onPress={sendEmail} disabled={busyNow}><Text style={styles.resendText}>Send link + OTP again</Text></TouchableOpacity>
          </>}
        </>}

        {step === 'phone' && <>
          <Text style={styles.stepTitle}>Add Your Phone Number</Text>
          <Text style={styles.intro}>Your phone number is required for your MySheba account and will be verified by SMS OTP.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>Phone Number</Text><View style={styles.phoneRow}>
            <TouchableOpacity onPress={() => setCountryPicker(true)} style={styles.countryButton}><Text style={styles.countryFlag}>{phoneCountry.flag}</Text><Text style={styles.countryName} numberOfLines={1}>{phoneCountry.name}</Text><Text style={styles.countryDial}>{phoneCountry.dial}</Text><Text style={styles.countryChevron}>▾</Text></TouchableOpacity>
            <TextInput style={styles.phoneInput} placeholder="Phone number" placeholderTextColor="#999" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/>
          </View></View>
          <TouchableOpacity style={[styles.btn, busyNow && styles.btnDisabled]} onPress={sendPhone} disabled={busyNow}>{busyNow ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Send SMS OTP</Text>}</TouchableOpacity>
        </>}

        {step === 'phoneOtp' && <>
          <Text style={styles.stepTitle}>Verify Your Phone</Text>
          <Text style={styles.intro}>Enter the 6-digit SMS code sent to {phoneCountry.dial} {phone}.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>SMS OTP</Text><TextInput style={styles.otpInput} placeholder="123456" placeholderTextColor="#999" keyboardType="number-pad" maxLength={6} value={phoneCode} onChangeText={setPhoneCode}/></View>
          <TouchableOpacity style={[styles.btn, busyNow && styles.btnDisabled]} onPress={verifyPhone} disabled={busyNow}>{busyNow ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Verify Phone & Continue</Text>}</TouchableOpacity>
          <TouchableOpacity style={styles.resendBtn} onPress={sendPhone} disabled={busyNow}><Text style={styles.resendText}>Resend SMS OTP</Text></TouchableOpacity>
        </>}

        {step === 'pin' && <>
          <Text style={styles.stepTitle}>Set Your MySheba PIN</Text>
          <Text style={styles.intro}>Create a 4-8 digit security PIN. You can use it to unlock protected actions and as a backup to biometric unlock.</Text>
          <View style={styles.formGroup}><Text style={styles.label}>PIN</Text><TextInput style={styles.otpInput} placeholder="••••" placeholderTextColor="#777" keyboardType="number-pad" secureTextEntry maxLength={8} value={pin} onChangeText={setPin}/></View>
          <View style={styles.formGroup}><Text style={styles.label}>Confirm PIN</Text><TextInput style={styles.otpInput} placeholder="••••" placeholderTextColor="#777" keyboardType="number-pad" secureTextEntry maxLength={8} value={confirmPin} onChangeText={setConfirmPin}/></View>
          <TouchableOpacity style={[styles.btn, busyNow && styles.btnDisabled]} onPress={finishPin} disabled={busyNow}>{busyNow ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Set PIN & Continue</Text>}</TouchableOpacity>
        </>}

        {step === 'done' && <View><Text style={styles.stepTitle}>Account Ready</Text><Text style={styles.intro}>Your Google account, email, phone number and PIN are now verified. MySheba will continue to your Home screen and offer biometric unlock if your device supports it.</Text></View>}

        {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}
        <TouchableOpacity style={styles.cancelBtn} onPress={cancelGooglePhone} disabled={busyNow}><Text style={styles.cancelText}>Cancel and sign out</Text></TouchableOpacity>
      </ScrollView>
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={(c) => { setPhoneCountry(c); setCountryPicker(false); }} onClose={() => setCountryPicker(false)} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen:{flex:1,backgroundColor:colors.bg},scroll:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:colors.primary,overflow:'hidden'},headerTitle:{color:colors.onPrimary,fontWeight:'700',fontSize:16},body:{padding:20,paddingBottom:40},stepTitle:{fontSize:19,fontWeight:'800',color:colors.text,textAlign:'center',marginBottom:10},intro:{fontSize:13,color:colors.textSecondary,marginBottom:20,textAlign:'center',lineHeight:20},formGroup:{marginBottom:14},label:{fontWeight:'700',marginBottom:7,fontSize:13,color:colors.text},input:{width:'100%',paddingVertical:13,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,backgroundColor:colors.inputBg,color:colors.text},phoneRow:{flexDirection:'row',alignItems:'stretch',gap:7},countryButton:{minHeight:48,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,backgroundColor:colors.inputBg,paddingHorizontal:9,flexDirection:'row',alignItems:'center',maxWidth:'58%'},countryFlag:{fontSize:19},countryName:{color:colors.text,fontSize:12,fontWeight:'700',marginLeft:6,flexShrink:1},countryDial:{color:colors.text,fontSize:12,fontWeight:'800',marginLeft:5},countryChevron:{color:colors.textSecondary,fontSize:14,marginLeft:5},phoneInput:{flex:1,minWidth:0,paddingVertical:13,paddingHorizontal:12,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,backgroundColor:colors.inputBg,color:colors.text},otpInput:{width:'100%',paddingVertical:15,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:20,letterSpacing:5,textAlign:'center',backgroundColor:colors.inputBg,color:colors.text},btn:{backgroundColor:colors.primary,paddingVertical:14,borderRadius:radius.md,alignItems:'center'},btnDisabled:{opacity:.6},btnText:{color:'#fff',fontWeight:'800',fontSize:14},methodHint:{fontSize:12,color:colors.textSecondary,marginVertical:14,textAlign:'center',lineHeight:19},resendBtn:{alignItems:'center',marginTop:15},resendText:{color:colors.primary,fontSize:13,fontWeight:'700',textDecorationLine:'underline'},errorText:{color:colors.error,fontSize:12,marginTop:10,textAlign:'center'},cancelBtn:{alignItems:'center',marginTop:28},cancelText:{color:colors.textSecondary,fontSize:12,fontWeight:'600'}});
}
