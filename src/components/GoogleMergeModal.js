import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import AppModalHeader from './AppModalHeader';

// Settings screen's "Link Google Account" flow, merge branch - shown
// instead of a plain error when linkGoogleAccount() finds the picked
// Google account already backs a separate MySheba account (see
// authService.linkGoogleAccount's mergeAvailable flag and
// functions/accountMergeService.js for what actually happens server-side).
//
// Two steps in one modal:
//   'confirm' - person sees both accounts' wallet/game-point balances and
//     what they'd add up to, and decides whether to proceed. Pressing
//     "Send code" calls startGoogleAccountMerge, which emails a code to
//     the OTHER account and returns this preview.
//   'otp' - person enters the code from that email. Submitting calls
//     confirmGoogleAccountMerge, which performs the merge.
//
// googleEmail is passed in already known (from the Google picker result -
// see authService.linkGoogleAccount) so this modal can kick off step
// 'confirm' immediately on open, without asking the person to retype it.
export default function GoogleMergeModal({ visible, googleEmail, onStartMerge, onConfirmMerge, onDone, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  const [stage, setStage] = useState('loading'); // 'loading' | 'confirm' | 'otp' | 'sending' | 'confirming'
  const [preview, setPreview] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStage('loading');
    setPreview(null);
    setCode('');
    setError('');
    (async () => {
      try {
        const data = await onStartMerge(googleEmail);
        setPreview(data);
        setStage('confirm');
      } catch (err) {
        setError(err?.message || 'Could not start the merge. Please try again.');
        setStage('confirm');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, googleEmail]);

  const resendCode = async () => {
    setError('');
    setStage('sending');
    try {
      const data = await onStartMerge(googleEmail);
      setPreview(data);
      setStage('otp');
    } catch (err) {
      setError(err?.message || 'Could not send the code. Please try again.');
      setStage(preview ? 'otp' : 'confirm');
    }
  };

  const submitCode = async () => {
    setError('');
    if (!code || code.trim().length === 0) {
      setError('Enter the code we sent.');
      return;
    }
    setStage('confirming');
    try {
      const result = await onConfirmMerge(code.trim());
      onDone(result);
    } catch (err) {
      setError(err?.message || 'Could not confirm the merge. Please try again.');
      setStage('otp');
    }
  };

  const busy = stage === 'loading' || stage === 'sending' || stage === 'confirming';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={busy ? undefined : onCancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <AppModalHeader />
          <View style={styles.content}>
            {stage === 'loading' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Checking that Google account...</Text>
              </View>
            ) : stage === 'otp' || stage === 'confirming' ? (
              <>
                <Text style={styles.title}>Enter confirmation code</Text>
                <Text style={styles.sub}>
                  We emailed a 6-digit code to {preview?.emailMasked || 'that account'} to confirm it's really you.
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={code}
                  onChangeText={setCode}
                  placeholder="6-digit code"
                  editable={stage !== 'confirming'}
                  autoFocus
                />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <TouchableOpacity onPress={resendCode} disabled={stage === 'confirming'}>
                  <Text style={styles.resend}>Resend code</Text>
                </TouchableOpacity>
                <View style={styles.row}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={stage === 'confirming'}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.okBtn, stage === 'confirming' && styles.okBtnDisabled]}
                    onPress={submitCode}
                    disabled={stage === 'confirming'}
                  >
                    {stage === 'confirming' ? <ActivityIndicator color="white" /> : <Text style={styles.okText}>Confirm merge</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.title}>Merge Google account?</Text>
                <Text style={styles.sub}>
                  {googleEmail || 'This Google account'} is already linked to a different MySheba account. You can
                  merge it into this one instead - your points are combined, nothing is lost.
                </Text>
                {preview && (
                  <View style={styles.previewBox}>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>This account</Text>
                      <Text style={styles.previewValue}>{preview.yourWalletBalance} pts</Text>
                    </View>
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabel}>{preview.emailMasked}</Text>
                      <Text style={styles.previewValue}>{preview.targetWalletBalance} pts</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.previewRow}>
                      <Text style={styles.previewLabelStrong}>Combined total</Text>
                      <Text style={styles.previewValueStrong}>{preview.combinedWalletBalance} pts</Text>
                    </View>
                  </View>
                )}
                {!!error && <Text style={styles.error}>{error}</Text>}
                <View style={styles.row}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={stage === 'sending'}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.okBtn, stage === 'sending' && styles.okBtnDisabled]}
                    onPress={() => {
                      if (preview) setStage('otp');
                      else resendCode();
                    }}
                    disabled={stage === 'sending'}
                  >
                    {stage === 'sending' ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.okText}>{preview ? "I've got the code" : 'Send code'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, width: '88%', maxWidth: 380, overflow: 'hidden' },
    content: { padding: 20 },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 8 },
    sub: { fontSize: 12.5, color: '#666', lineHeight: 18, marginBottom: 14 },
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    loadingText: { fontSize: 13, color: '#666' },
    previewBox: { backgroundColor: '#F7F8FA', borderRadius: radius.md, padding: 12, marginBottom: 6 },
    previewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    previewLabel: { fontSize: 12.5, color: '#666' },
    previewValue: { fontSize: 12.5, color: '#333', fontWeight: '500' },
    previewLabelStrong: { fontSize: 13, color: '#333', fontWeight: '700' },
    previewValueStrong: { fontSize: 13, color: colors.primary, fontWeight: '700' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 18, letterSpacing: 4, textAlign: 'center', marginTop: 4 },
    resend: { color: colors.primary, fontSize: 12.5, fontWeight: '600', marginTop: 10 },
    error: { color: colors.error, fontSize: 12, marginTop: 12 },
    row: { flexDirection: 'row', gap: 10, marginTop: 20 },
    cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    okBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    okBtnDisabled: { opacity: 0.7 },
    okText: { color: 'white', fontWeight: '600' },
  });
}
