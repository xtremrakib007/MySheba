import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { auth } from '../firebase/config';
import { verifyNativeKycFace } from '../firebase/verificationService';
import { ExpoFaceRecognitionView } from '@rdnf-magiba/expo-face-recognition';
import { readFaceEvent, FACE_STATES } from '../utils/faceEvent';

/** Native KYC biometric capture with automatic selfie capture after the live face challenge. */
export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const cameraRef = useRef(null);
  const captureStarted = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState('recognition');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Look straight at the camera');
  // The models load asynchronously and can fail. Nothing listened for that,
  // so a failure left the person staring at a frame that never responded
  // with no idea why.
  const [modelStatus, setModelStatus] = useState('LOADING');
  const lastVerification = useRef(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  const onModelStatus = (event) => {
    const next = event?.nativeEvent?.status;
    if (!next) return;
    setModelStatus(String(next));
    const detail = String(event?.nativeEvent?.error || '');
    // A failed model is a dead end, not a transient hiccup - say so rather
    // than leaving the person turning their head at an unresponsive frame.
    if (String(next) === 'FAILED') {
      setError(detail
        ? `Face verification is unavailable on this device: ${detail}`
        : 'Face verification could not start on this device. Please try another device or contact support.');
    }
  };

  const onFaceDetected = async (event) => {
    if (busy || phase !== 'recognition') return;

    // The event is a flat object, not a list of faces with head angles -
    // see src/utils/faceEvent.js for what the native view actually sends.
    const { state, message, embedding } = readFaceEvent(event?.nativeEvent || event);
    setStatus(message);
    if (state !== FACE_STATES.READY || !embedding) return;

    // The library runs its own spoof check on every frame, so liveness is
    // already established by the time an embedding arrives. Throttled so a
    // steady face does not fire the callable on every frame.
    if (Date.now() - lastVerification.current < 2500) return;
    lastVerification.current = Date.now();
    setBusy(true); setError('');
    try {
      if (!auth.currentUser?.uid) throw new Error('Your sign-in session expired. Please sign in again.');
      const result = await verifyNativeKycFace(embedding, true);
      if (!result?.ok) {
        if (result?.duplicate) throw new Error('This face is already registered to another verified account.');
        throw new Error('Face verification could not be completed. Please try again.');
      }
      setPhase('capture');
      setStatus('Face verified — keep still');
    } catch (err) {
      setError(err?.message || 'Face verification failed. Please try again.');
      setStatus('Look straight at the camera');
    } finally { setBusy(false); }
  };

  // No capture button. Once the biometric challenge passes, capture automatically.
  useEffect(() => {
    if (phase !== 'capture' || captureStarted.current) return undefined;
    captureStarted.current = true;
    const timer = setTimeout(async () => {
      if (!cameraRef.current) { captureStarted.current = false; return; }
      setBusy(true); setError('');
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false, shutterSound: false });
        if (!photo?.uri) throw new Error('The camera did not return a selfie. Please try again.');
        onCaptured?.(photo.uri, 'image/jpeg', { method: 'native_face_recognition', livenessPassed: true });
      } catch (err) {
        captureStarted.current = false;
        setError(err?.message || 'Could not capture the selfie. Please try again.');
        setPhase('recognition'); setStatus('Look straight at the camera');
      } finally { setBusy(false); }
    }, 900);
    return () => clearTimeout(timer);
  }, [phase, onCaptured]);

  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.title}>Preparing secure camera…</Text></View>;

  if (!permission.granted) return <View style={styles.center}>
    <Text style={styles.icon}>📷</Text><Text style={styles.title}>Camera access is required</Text>
    <Text style={styles.text}>MySheba uses the front camera for live face recognition and automatic KYC selfie capture. Gallery and file uploads are not accepted for the selfie.</Text>
    {permission.canAskAgain ? <TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Allow Camera</Text></TouchableOpacity> : <Text style={styles.errorLight}>Camera permission is disabled. Enable Camera for MySheba in Android Settings, then try again.</Text>}
    <TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity>
  </View>;

  if (phase === 'capture') return <View style={styles.container}>
    <CameraView ref={cameraRef} style={styles.camera} facing="front" mode="picture">
      <View style={styles.overlay}>
        <View style={styles.topBar}><Text style={styles.badge}>KYC SELFIE</Text><TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View>
        <View style={styles.guideArea}><View style={styles.faceGuide}><View style={styles.faceInner} /></View><Text style={styles.instruction}>{busy ? 'Capturing your verified selfie…' : 'Keep your face centered'}</Text><Text style={styles.subInstruction}>Hold still — capture is automatic.</Text></View>
        <View style={styles.bottom}>{error ? <Text style={styles.error}>{error}</Text> : null}{busy ? <ActivityIndicator color="#fff" size="large" /> : null}<Text style={styles.security}>🔒 Verified live face • automatic camera capture</Text></View>
      </View>
    </CameraView>
  </View>;

  return <View style={styles.container}>
    {/* isGPUEnabled is what triggers the native setIsGPUEnabled, and that
        is the only path that calls specsDetector.initialize() and reports
        model status. Without the prop the setter never runs, so the glasses
        detector stayed uninitialised and detectSpecs was called on it for
        every frame. CPU rather than GPU because it is the more compatible
        of the two and this runs once per person, not continuously. */}
    <ExpoFaceRecognitionView
      style={styles.camera}
      isGPUEnabled={false}
      onFaceDetected={onFaceDetected}
      onModelStatus={onModelStatus}
    />
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.topBar}><Text style={styles.badge}>LIVE FACE VERIFICATION</Text><TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity></View>
      <View style={styles.guideArea} pointerEvents="none"><View style={styles.faceGuide}><View style={styles.faceInner} /></View><Text style={styles.instruction}>{status}</Text><Text style={styles.subInstruction}>Hold your face inside the oval in good light</Text></View>
      <View style={styles.bottom} pointerEvents="none"><Text style={styles.security}>🔒 Live face recognition + duplicate check</Text>{error ? <Text style={styles.error}>{error}</Text> : null}{busy ? <ActivityIndicator color="#fff" size="large" /> : null}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' }, camera: { flex: 1, width: '100%' }, overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  topBar: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, badge: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 }, close: { padding: 8 }, closeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  guideArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }, faceGuide: { width: 245, height: 310, borderRadius: 125, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }, faceInner: { width: 220, height: 285, borderRadius: 112, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' }, instruction: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 22, textShadowColor: '#000', textShadowRadius: 5 }, subInstruction: { color: '#fff', fontSize: 12, textAlign: 'center', marginTop: 7, textShadowColor: '#000', textShadowRadius: 4 },
  bottom: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28 }, security: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 12, textShadowColor: '#000', textShadowRadius: 4, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' }, icon: { fontSize: 42 }, title: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 14 }, text: { color: '#4B5563', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 19 }, primary: { backgroundColor: '#087F73', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 20 }, primaryText: { color: '#fff', fontWeight: '800' }, error: { color: '#FFD5D5', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 }, errorLight: { color: '#B91C1C', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 }, cancel: { padding: 14, marginTop: 6 },
});
