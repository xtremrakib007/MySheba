import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { showAlert } from '../utils/appAlert';
import { respondToWebSignIn } from '../firebase/webSignInService';

/**
 * "Somebody is signing in to the admin site as you. Was it you?"
 *
 * Shown when the phone receives the request, which is also the point: if it was
 * not them, this is the moment they find out, with an answer attached. That is
 * why Reject is a real button and not just a way to dismiss the prompt - the
 * server records a rejection, and "somebody tried to sign in as me and I said
 * no" is the most useful line there is in an audit log.
 *
 * Dismissing without answering leaves the request pending; it expires on its
 * own in five minutes. Nothing here grants anything - the server decides
 * whether the answer counts, against the browser that asked and the deadline it
 * was given.
 */
export default function WebSignInApprovalPrompt() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { webSignInRequest, clearWebSignInRequest } = useApp();
  const [busy, setBusy] = useState('');

  if (!webSignInRequest || !webSignInRequest.approvalId) return null;
  const { approvalId, label, ip } = webSignInRequest;

  const answer = async (approve) => {
    if (busy) return;
    setBusy(approve ? 'approve' : 'reject');
    try {
      await respondToWebSignIn(approvalId, approve);
      clearWebSignInRequest();
      if (!approve) {
        showAlert('Sign-in rejected', 'That sign-in was blocked. If it was not you, change your password now.');
      }
    } catch (error) {
      showAlert('Web sign-in', error?.message || 'Could not send your answer.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clearWebSignInRequest}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Approve web sign-in?</Text>
          <Text style={styles.body}>Someone is signing in to the MySheba admin site using your account.</Text>
          {/* The two facts that let somebody recognise themselves - or not. */}
          {!!label && <Text style={styles.detail}>{label}</Text>}
          {!!ip && <Text style={styles.detail}>From {ip}</Text>}
          <Text style={styles.warn}>If this was not you, reject it and change your password.</Text>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.reject]} disabled={!!busy} onPress={() => answer(false)}>
              {busy === 'reject' ? <ActivityIndicator color="#DC2626" /> : <Text style={styles.rejectText}>Not me</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.approve]} disabled={!!busy} onPress={() => answer(true)}>
              {busy === 'approve' ? <ActivityIndicator color="#fff" /> : <Text style={styles.approveText}>Approve</Text>}
            </TouchableOpacity>
          </View>

          {/* Leaving without answering is allowed. The request expires on its
              own, so saying nothing is the same as saying no, just slower. */}
          <TouchableOpacity onPress={clearWebSignInRequest} disabled={!!busy}>
            <Text style={styles.later}>Decide later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', backgroundColor: colors.card, borderRadius: radius.lg || 16, padding: 20 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  detail: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },
  warn: { color: '#B45309', fontSize: 12, lineHeight: 17, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btn: { flex: 1, padding: 13, borderRadius: radius.md || 10, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  approve: { backgroundColor: colors.primary },
  approveText: { color: '#fff', fontWeight: '700' },
  reject: { borderWidth: 1, borderColor: '#DC2626' },
  rejectText: { color: '#DC2626', fontWeight: '700' },
  later: { color: colors.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 14 },
});
