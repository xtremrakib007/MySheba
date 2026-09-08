import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as emailVerification from '../firebase/emailVerification';
import * as phoneVerification from '../firebase/phoneVerification';
import * as authService from '../firebase/authService';

// Shown mid-login for two distinct reasons (see checkDeviceSession's doc
// comment, functions/deviceSessionService.js):
//   'new_device' - this account is already active on a different device.
//                  Always uses the real Firebase email-link flow
//                  (emailVerification.js), same as RegisterScreen's
//                  email-verify step - tap the link, this screen moves on
//                  automatically. No method choice here.
//   'admin_mfa'  - this is an admin/superadmin account, which requires
//                  fresh verification on every login, regardless of
//                  device - via EITHER real Firebase Phone Auth (SMS -
//                  phoneVerification.js) or the same email-link flow
//                  new_device uses (emailVerification.js), whichever the
//                  account has on file. pendingDeviceVerification.
//                  availableMfaMethods (['sms', 'email'], one or both)
//                  says which to offer - a toggle when both are
//                  available, or straight to the only option when just
//                  one is. SMS requires the Firebase Console Phone
//                  provider to be enabled; email has no such dependency,
//                  so it's picked by default when both are on offer (see
//                  chat history 2026-09-08).
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
  // Defaults to ['email'] rather than ['sms'] for logins from an OLDER
  // client build that predates this field (checkDeviceSession simply
  // won't have sent it) - email has no external Firebase Console
  // dependency, so it's the safer assumption if we don't actually know.
  const availableMfaMethods = pendingDeviceVerification?.availableMfaMethods
    && pendingDeviceVerification.availableMfaMethods.length
    ? pendingDeviceVerification.availableMfaMethods
    : ['email'];
  const canChooseMfaMethod = isAdminMfa && availableMfaMethods.length > 1;
  // Which method the admin is currently using, for admin_mfa specifically.
  // Defaults to email when both are offered (see file header) or to
  // whichever single method is actually available.
  const [mfaMethod, setMfaMethod] = useState(
    availableMfaMethods.includes('email') ? 'email' : availableMfaMethods[0]
  );
  const isAdminEmailMethod = isAdminMfa && mfaMethod === 'email';
  const isAdminSmsMethod = isAdminMfa && mfaMethod === 'sms';

  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [sent, setSent] = useState(isAdminEmailMethod);
  // Only used for the admin_mfa SMS path - the confirmation object
  // rnfbAuth().signInWithPhoneNumber returns, needed to check the code the
  // admin types in against the SMS that was actually sent.
  const [phoneConfirmation, setPhoneConfirmation] = useState(null);

  // Switching method (when both are available) resets any in-progress
  // send/code state from the method just left, so e.g. a typed SMS code
  // doesn't linger after switching to email.
  const onSwitchMfaMethod = (method) => {
    if (method === mfaMethod) return;
    setMfaMethod(method);
    setSent(false);
    setCode('');
    setPhoneConfirmation(null);
    setLocalError('');
  };

  // Relevant whenever this screen resolves via a tapped email link -
  // new_device always, admin_mfa only when email was the chosen method.
  useEffect(() => {
    if (isAdminSmsMethod || !sent) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (emailVerification.isEmailSignInLink(url)) {
        onConfirmEmailLink(url);
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminSmsMethod, sent]);

  const onSendCode = async () => {
    setLocalError('');
    setOtpBusy(true);
    try {
      if (isAdminSmsMethod) {
        const confirmation = await phoneVerification.sendPhoneOtp(phone);
        setPhoneConfirmation(confirmation);
      } else if (isAdminEmailMethod) {
        // The server sends one email containing both the Firebase link and
        // the 6-digit OTP. This call is only used for resend.
        await authService.retryDeviceSession(pendingDeviceVerification?.uid, undefined, undefined, undefined, true);
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

  // admin_mfa + SMS only - the phone code is typed in, unlike the email
  // path below which resolves itself once the link is tapped.
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

  // Admin email verification can be completed either by tapping the link
  // or by entering the 6-digit OTP from that same email.
  const onVerifyEmailOtp = async () => {
    const otp = code.trim();
    if (!/^\d{6}$/.test(otp)) {
      setLocalError('Please enter the 6-digit code from the email.');
      return;
    }
    setLocalError('');
    setOtpBusy(true);
    try {
      await confirmDeviceVerification(undefined, undefined, otp);
    } catch (e) {
      setLocalError(e.message || 'Incorrect verification code. Please try again.');
    } finally {
      setOtpBusy(false);
    }
  };

  // new_device, and admin_mfa + email - fired by the Linking listener
  // above once the person taps the emailed link.
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
        {canChooseMfaMethod && (
          <View style={styles.methodToggle}>
            <TouchableOpacity
              style={[styles.methodBtn, mfaMethod === 'email' && styles.methodBtnActive]}
              onPress={() => onSwitchMfaMethod('email')}
              disabled={busy}
            >
              <Text style={[styles.methodBtnText, mfaMethod === 'email' && styles.methodBtnTextActive]}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, mfaMethod === 'sms' && styles.methodBtnActive]}
              onPress={() => onSwitchMfaMethod('sms')}
              disabled={busy}
            >
              <Text style={[styles.methodBtnText, mfaMethod === 'sms' && styles.methodBtnTextActive]}>SMS</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.intro}>
          {isAdminSmsMethod
            ? `Admin accounts require a verification code at every sign-in. Enter the code we text to ${phone || 'your phone'}.`
            : isAdminEmailMethod
            ? `Admin accounts require a verification code at every sign-in. Verify it's you by tapping the link we send to ${email || 'your email'}.`
            : `Your account is already signed in on another device. To switch to this one, verify it's you by tapping the link we send to ${email || 'your email'}.`}
        </Text>

        {!sent ? (
          <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onSendCode} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>{isAdminSmsMethod ? 'Send Verification Code' : 'Send Verification Link'}</Text>}
          </TouchableOpacity>
        ) : isAdminSmsMethod ? (
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
        ) : isAdminEmailMethod ? (
          <>
            <Text style={styles.intro}>
              We sent one email with two ways to verify. Tap the verification link,
              or enter the 6-digit code below.
            </Text>
            <View style={styles.formGroup}>
              <Text style={styles.label}>6-digit verification code</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
            </View>
            <TouchableOpacity style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerifyEmailOtp} disabled={busy}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Verify with Code</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.resendBtn} onPress={onSendCode} disabled={busy}>
              <Text style={styles.resendText}>Didn't get the email? Resend</Text>
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
    methodToggle: { flexDirection: 'row', backgroundColor: colors.border || '#eee', borderRadius: radius.md, padding: 4, marginBottom: 18 },
    methodBtn: { flex: 1, paddingVertical: 8, borderRadius: radius.md - 2, alignItems: 'center' },
    methodBtnActive: { backgroundColor: colors.primary },
    methodBtnText: { fontSize: 13, fontWeight: '600', color: colors.navy || '#333' },
    methodBtnTextActive: { color: 'white' },
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
