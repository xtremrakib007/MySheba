import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';

// Shown mid-login for two distinct reasons (see checkDeviceSession's doc
// comment, functions/deviceSessionService.js):
//   'new_device' - this account is already active on a different device.
//                  Uses the real Firebase email-link flow
//                  (emailVerification.js), same as RegisterScreen's
//                  email-verify step - tap the link, this screen moves on
//                  automatically.
//   'admin_mfa'  - this is an admin/superadmin account, which requires
//                  fresh phone verification on every login, regardless of
//                  device. Uses real Firebase Phone Auth (SMS - see
//                  phoneVerification.js), the same mechanism registration
//                  uses to confirm a phone number, rather than an emailed
//                  link.
// Either way: send the code/link, confirm it, then confirmDeviceVerification()
// (AppContext.js) picks the right follow-up call per reason and lands on
// the normal role-based dashboard.
export default function DeviceVerifyScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const {
    pendingDeviceVerification, confirmDeviceVerification, cancelDeviceVerification,
    authError, authBusy,
  } = useApp();
  const email = pendingDeviceVerification?.email || '';
  const phone = pendingDeviceVerification?.phone || '';
  const isAdminMfa = pendingDeviceVerification?.reason === 'admin_mfa';
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [sent, setSent] = useState(false);
  // Only used for the admin_mfa (phone) path - the confirmation object
  // rnfbAuth().signInWithPhoneNumber returns, needed to check the code the
  // admin types in against the SMS that was actually sent.
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);

  // Only relevant for the non-admin (email link) path: a link tapped while
  // this screen is mounted arrives via this 'url' event.
  useEffect(() => {
    if (isAdminMfa || !sent) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (emailVerification.isEmailSignInLink(url)) {
        onConfirmEmailLink(url);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMfa, sent]);

  const onSendCode = async () => {
    setLocalError('');
    setOtpBusy(true);
    try {
      if (isAdminMfa) {
        const confirmation = await phoneVerification.sendPhoneOtp(phone);
        setPhoneConfirmation(confirmation);
      } else {
        await emailVerification.sendEmailLink(email);
      }
      setSent(true);
    } catch (e) {
      setLocalError(e.message || 'Could not send the verification code. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  // admin_mfa only - the phone code is typed in, unlike the email path
  // below which resolves itself once the link is tapped.
  const onVerifyPhoneCode = async () => {
    if (!code.trim()) {
      setLocalError('Please enter the code we sent you.');
      return;
    }
    setLocalError('');
    setOtpBusy(true);
    let phoneIdToken;
    try {
      const result = await phoneVerification.confirmPhoneOtp(phoneConfirmation, code.trim());
      phoneIdToken = result.idToken;
    } catch (e) {
      setLocalError(e.message || 'Incorrect code. Please try again.');
      setOtpBusy(false);
      return;
    }
    setOtpBusy(false);
    // confirmDeviceVerification sets authBusy/authError and, on success,
    // navigates itself (same contract as doLogin/doRegister).
    await confirmDeviceVerification(phoneIdToken);
  };

  // new_device only - fired by the Linking listener above once the person
  // taps the emailed link.
  const onConfirmEmailLink = async (url) => {
    setLocalError('');
    setOtpBusy(true);
    let emailIdToken;
    try {
      const result = await emailVerification.confirmEmailLink(url, email);
      emailIdToken = result.idToken;
    } catch (e) {
      setLocalError(e.message || 'Could not verify your email address. Please try again.');
      setOtpBusy(false);
      return;
    }
    setOtpBusy(false);
    await confirmDeviceVerification(undefined, emailIdToken);
  };

  const busy = otpBusy || authBusy;

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <Text style={styles.headerTitle}>{isAdminMfa ? 'Verify Your Sign-In' : 'Verify This Device'}</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.intro}>
          {isAdminMfa
            ? `Admin accounts require a verification code at every sign-in. Enter the code we text to ${phone || 'your phone'}.`
            : `Your account is already signed in on another device. To switch to this one, verify it's you by tapping the link we send to ${email || 'your email'}.`}
        </Text>

        {!sent ? (
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onSendCode} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{isAdminMfa ? 'Send Verification Code' : 'Send Verification Link'}</Text>}
          </TouchableOpacity>
        ) : isAdminMfa ? (
          <>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Verification Code</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
            </View>

            <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerifyPhoneCode} disabled={busy}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Verify & Continue</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}>
              <Text style={styles.resendText}>Didn't get a code? Resend</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.intro}>Tap the link on this device to continue - this screen will move on automatically once you do.</Text>
            {busy && <ActivityIndicator color={colors.primary} style={{ marginBottom: 14 }} />}
            <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}>
              <Text style={styles.resendText}>Didn't get a link? Resend</Text>
            </TouchableOpacity>
          </>
        )}

        {!!(localError || authError) && <Text style={styles.errorText}>{localError || authError}</Text>}

        <TouchableOpacity style={styles.cancelBtn} onPress={cancelDeviceVerification} disabled={busy}>
          <Text style={styles.cancelText}>Cancel and sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16 },
    body: { padding: 20 },
    intro: { fontSize: 13, color: '#666', marginBottom: 20, textAlign: 'center', lineHeight: 19 },
    formGroup: { marginBottom: 14 },
    label: { fontWeight: '500', marginBottom: 5, fontSize: 13 },
    input: { width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, fontSize: 14, backgroundColor: 'white' },
    btn: { backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: 'center' },
    btnDisabled: { opacity: 0.6 },
    btnText: { color: 'white', fontWeight: '600', fontSize: 14 },
    errorText: { color: colors.error, fontSize: 12, marginTop: 10, textAlign: 'center' },
    resendBtn: { alignItems: 'center', marginTop: 14 },
    resendText: { color: colors.primary, fontSize: 12, fontWeight: '500' },
    cancelBtn: { alignItems: 'center', marginTop: 24 },
    cancelText: { color: '#999', fontSize: 12, fontWeight: '500' },
  });
}
