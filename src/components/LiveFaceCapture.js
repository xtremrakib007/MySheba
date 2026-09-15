import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase/config';

const DIDIT_RETURN_PREFIX = 'mysheba://kyc/complete';

export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(true);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Not Started');
  const [retryKey, setRetryKey] = useState(0);
  const completedRef = useRef(false);
  const onCapturedRef = useRef(onCaptured);

  useEffect(() => { onCapturedRef.current = onCaptured; }, [onCaptured]);

  useEffect(() => {
    let unsubscribe = () => {};
    let mounted = true;
    const start = async () => {
      try {
        if (!auth.currentUser?.uid) throw new Error('Please sign in again before starting KYC.');
        const createSession = httpsCallable(functions, 'createDiditKycSession');
        const result = await createSession({});
        const session = result.data || {};
        if (!session.url || !session.sessionId) throw new Error('Didit did not return a verification session.');
        if (!mounted) return;
        setUrl(session.url);
        setStatus(session.status || 'Not Started');
        unsubscribe = onSnapshot(doc(db, 'verificationRequests', auth.currentUser.uid), (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          const diditStatus = data.diditStatus || 'Not Started';
          setStatus(diditStatus);
          if (!completedRef.current && data.diditSessionId === session.sessionId && data.diditVerified === true && data.diditReferenceImageUrl) {
            completedRef.current = true;
            onCapturedRef.current(data.diditReferenceImageUrl, 'image/jpeg');
          } else if (!completedRef.current && data.diditSessionId === session.sessionId && (data.status === 'rejected' || diditStatus === 'Declined')) {
            setError(data.note || 'Didit declined the identity verification. Please try again.');
          }
        }, () => {});
      } catch (err) {
        if (mounted) setError(err.message || 'Could not start live identity verification.');
      } finally {
        if (mounted) { setStarting(false); setLoading(false); }
      }
    };
    start();
    return () => { mounted = false; unsubscribe(); };
  }, [retryKey]);

  const handleNavigation = (request) => {
    const nextUrl = request.url || '';
    if (nextUrl.startsWith(DIDIT_RETURN_PREFIX)) return false;
    return true;
  };

  if (starting || loading) return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.title}>Starting secure live verification…</Text><Text style={styles.text}>MySheba is opening Didit. The verification is performed by Didit, not by a gallery photo.</Text><TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity></View>;

  if (error) return <View style={styles.center}><Text style={styles.badge}>LIVE LIVENESS REQUIRED</Text><Text style={styles.title}>Verification not completed</Text><Text style={styles.text}>{error}</Text><TouchableOpacity style={styles.primary} onPress={() => { completedRef.current = false; setError(''); setLoading(true); setStarting(true); setUrl(''); setRetryKey((value) => value + 1); }}><Text style={styles.primaryText}>Try Again</Text></TouchableOpacity><TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity></View>;

  if (!url) return <View style={styles.center}><Text style={styles.title}>Live verification unavailable</Text><Text style={styles.text}>Didit is not configured on the MySheba server yet.</Text><TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Close</Text></TouchableOpacity></View>;

  return <View style={styles.container}>
    <View style={styles.header}><Text style={styles.badge}>DIDIT LIVE KYC</Text><Text style={styles.headerStatus}>{status}</Text><TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View>
    <WebView source={{ uri: url }} style={styles.webview} originWhitelist={['*']} javaScriptEnabled domStorageEnabled mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback onShouldStartLoadWithRequest={handleNavigation} onLoadStart={() => setLoading(false)} onError={() => setError('The secure Didit verification page could not be loaded. Check your internet connection and try again.')} />
    <View style={styles.footer}><Text style={styles.footerText}>Your camera/liveness check is performed inside Didit. Gallery, file-manager and imported selfie images are not used.</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
  header: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: '#087F73' },
  badge: { color: '#fff', fontWeight: '900', fontSize: 12 },
  headerStatus: { color: '#D9FFFA', fontSize: 11, marginLeft: 10, flex: 1 },
  close: { padding: 8 },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  footer: { padding: 10, backgroundColor: '#F3F4F6' },
  footerText: { color: '#4B5563', textAlign: 'center', fontSize: 11, lineHeight: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  text: { color: '#4B5563', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 19 },
  primary: { backgroundColor: '#087F73', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800' },
  cancel: { padding: 14, marginTop: 6 },
});
