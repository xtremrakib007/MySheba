import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import HeaderDecor from '../components/HeaderDecor';
import CountryFlag from '../components/CountryFlag';
import * as phoneVerification from '../firebase/phoneVerification';
import PhoneCountryPicker from '../components/PhoneCountryPicker';
import { DEFAULT_PHONE_COUNTRY } from '../data/phoneCountries';
import * as emailVerification from '../firebase/emailVerification';
import * as authService from '../firebase/authService';
import { friendlyMessage } from '../utils/signInErrorCopy';

export default function ForgotPasswordScreen() {
  const { colors, brandGradient } = useTheme();
  const styles = createStyles(colors);
  const { setScreen } = useApp();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [countryPicker, setCountryPicker] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);
  const [phoneIdToken, setPhoneIdToken] = useState(null);
  const [emailIdToken, setEmailIdToken] = useState(null);

  const backToLogin = () => setScreen('login');
  const onContinueFromPhone = () => {
    setError('');
    if (!phone.trim() || phone.replace(/[^0-9]/g, '').length < 8) return setError('Please enter a valid phone number.');
    setStep('choose');
  };
  const onSendSms = async () => {
    setError(''); setBusy(true);
    try { setPhoneConfirmation(await phoneVerification.sendPhoneOtp(phone, phoneCountry.dial)); setStep('sms'); }
    catch (e) { setError(friendlyMessage(e, 'Could not send the verification code. Please try again.')); }
    finally { setBusy(false); }
  };
  const completeEmailLink = async (url) => {
    if (!emailVerification.isEmailSignInLink(url)) return false;
    setBusy(true); setError('');
    try { const result = await emailVerification.confirmEmailLink(url, email); setEmailIdToken(result.idToken); setStep('newPassword'); }
    catch (e) { setError(friendlyMessage(e, 'Could not verify your email address. Please try again.')); }
    finally { setBusy(false); }
    return true;
  };
  const onSendEmail = async () => {
    setError('');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Please enter a valid email address.');
    setBusy(true);
    try { await emailVerification.sendPasswordResetEmail(phoneVerification.phoneToE164(phone, phoneCountry.dial), email); setStep('email'); }
    catch (e) { setError(friendlyMessage(e, 'Could not send the verification email. Please try again.')); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let mounted = true;
    const sub = Linking.addEventListener('url', ({ url }) => { if (mounted) completeEmailLink(url); });
    Linking.getInitialURL().then(url => { if (mounted && url && emailVerification.isEmailSignInLink(url)) completeEmailLink(url); }).catch(() => {});
    return () => { mounted = false; sub.remove(); };
  }, [email]);
  const onVerifySmsCode = async () => {
    setError('');
    if (!code.trim()) return setError('Please enter the code we sent you.');
    setBusy(true);
    try { const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, code.trim()); setPhoneIdToken(result.idToken); setStep('newPassword'); }
    catch (e) { setError(friendlyMessage(e, 'Incorrect code. Please try again.')); }
    finally { setBusy(false); }
  };
  const onSubmitNewPassword = async () => {
    setError('');
    if (newPassword.length < 6 || newPassword.length > 20) return setError('Password must be 6-20 characters.');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setBusy(true);
    try {
      await authService.resetPassword({ phone, phoneE164: phoneVerification.phoneToE164(phone, phoneCountry.dial), dialCode: phoneCountry.dial, email, newPassword, phoneIdToken, emailIdToken });
      showAlert('Password Reset', 'Your password has been reset. Please sign in with your new password.', [{ text: 'OK', onPress: backToLogin }]);
    } catch (e) { setError(friendlyMessage(e, 'Could not reset your password. Please try again.')); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}><HeaderDecor /><Text style={styles.headerTitle}>Forgot Password</Text></LinearGradient>
      <View style={styles.body}>
        {step === 'phone' && <><Text style={styles.intro}>Enter the phone number on your account to reset your password.</Text><View style={styles.formGroup}><Text style={styles.label}>Phone Number</Text><View style={{flexDirection:'row',alignItems:'center'}}><TouchableOpacity onPress={()=>setCountryPicker(true)} style={{padding:12,borderWidth:1,borderColor:colors.border,borderRadius:8,marginRight:6,flexDirection:'row',alignItems:'center'}}><CountryFlag code={phoneCountry.code} emoji={phoneCountry.flag} size={24} /><Text style={{marginLeft:5,fontWeight:'600'}}>{phoneCountry.dial}</Text></TouchableOpacity><TextInput style={styles.input} placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone}/></View></View><TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onContinueFromPhone} disabled={busy}><Text style={styles.btnText}>Continue</Text></TouchableOpacity></>}
        {step === 'choose' && <><Text style={styles.intro}>How would you like to verify it's you?</Text><TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSendSms} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>Send SMS Code</Text>}</TouchableOpacity><View style={styles.formGroup}><Text style={styles.label}>Or verify via the email on your account</Text><TextInput style={styles.input} placeholder="Email address" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail}/></View><TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSendEmail} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>Send Email Link</Text>}</TouchableOpacity></>}
        {step === 'sms' && <><Text style={styles.intro}>Enter the code we texted to {phone}.</Text><View style={styles.formGroup}><Text style={styles.label}>Verification Code</Text><TextInput style={styles.input} placeholder="123456" keyboardType="number-pad" maxLength={6} value={code} onChangeText={setCode}/></View><TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onVerifySmsCode} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>Verify Code</Text>}</TouchableOpacity><TouchableOpacity style={styles.resendBtn} onPress={onSendSms} disabled={busy}><Text style={styles.resendText}>Didn't get a code? Resend</Text></TouchableOpacity></>}
        {step === 'email' && <><Text style={styles.intro}>Tap the link we emailed to {email} to continue. This screen will move on automatically once you do.</Text>{busy&&<ActivityIndicator color={colors.primary} style={{marginBottom:14}}/>}<TouchableOpacity style={styles.resendBtn} onPress={onSendEmail} disabled={busy}><Text style={styles.resendText}>Didn't get a link? Resend</Text></TouchableOpacity></>}
        {step === 'newPassword' && <><Text style={styles.intro}>Choose a new password for your account.</Text><View style={styles.formGroup}><Text style={styles.label}>New Password</Text><TextInput style={styles.input} placeholder="6-20 characters" secureTextEntry value={newPassword} onChangeText={setNewPassword}/></View><View style={styles.formGroup}><Text style={styles.label}>Confirm New Password</Text><TextInput style={styles.input} placeholder="Re-enter new password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword}/></View><TouchableOpacity style={[styles.btn,busy&&styles.btnDisabled]} onPress={onSubmitNewPassword} disabled={busy}>{busy?<ActivityIndicator color="white"/>:<Text style={styles.btnText}>Reset Password</Text>}</TouchableOpacity></>}
        {!!error&&<Text style={styles.errorText}>{error}</Text>}
        <TouchableOpacity style={styles.cancelBtn} onPress={backToLogin} disabled={busy}><Text style={styles.cancelText}>Back to Login</Text></TouchableOpacity>
      </View>
      <PhoneCountryPicker visible={countryPicker} value={phoneCountry} onSelect={c=>{setPhoneCountry(c);setCountryPicker(false);}} onClose={()=>setCountryPicker(false)}/>
    </View>
  );
}
function createStyles(colors){return StyleSheet.create({screen:{flex:1,backgroundColor:colors.bg},header:{flexDirection:'row',alignItems:'center',gap:10,padding:12,backgroundColor:colors.primary,overflow:'hidden'},headerTitle:{color:'white',fontWeight:'600',fontSize:16},body:{padding:20},intro:{fontSize:13,color:'#666',marginBottom:20,textAlign:'center',lineHeight:19},formGroup:{marginBottom:14},label:{fontWeight:'500',marginBottom:5,fontSize:13},input:{width:'100%',paddingVertical:12,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:radius.md,fontSize:14,backgroundColor:'white'},btn:{backgroundColor:colors.primary,paddingVertical:12,borderRadius:radius.md,alignItems:'center',marginBottom:14},btnDisabled:{opacity:0.6},btnText:{color:'white',fontWeight:'600',fontSize:14},errorText:{color:colors.error,fontSize:12,marginTop:4,marginBottom:10,textAlign:'center'},resendBtn:{alignItems:'center',marginTop:4,marginBottom:14},resendText:{color:colors.primary,fontSize:12,fontWeight:'500'},cancelBtn:{alignItems:'center',marginTop:10},cancelText:{color:'#999',fontSize:12,fontWeight:'500'}});}
