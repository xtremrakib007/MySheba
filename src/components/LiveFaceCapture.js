import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { auth } from '../firebase/config';
import { verifyNativeKycFace } from '../firebase/verificationService';
import { ExpoFaceRecognitionView } from '@rdnf-magiba/expo-face-recognition';

/**
 * Native KYC biometric capture.
 *
 * Flow:
 * 1. Native ML face detection/embedding runs on Android.
 * 2. User completes an active head-turn challenge to reduce simple photo replay.
 * 3. The 512-d embedding is sent to a callable function for 1:N duplicate-face
 *    comparison against approved biometric templates.
 * 4. Only after the server accepts the face do we capture the KYC selfie with
 *    Expo Camera. Gallery/file imports are never accepted by this component.
 */
export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState('recognition');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Look straight at the camera');
  const [leftSeen, setLeftSeen] = useState(false);
  const [rightSeen, setRightSeen] = useState(false);
  const lastVerification = useRef(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  const getEmbedding = (value) => {
    const candidate = value?.recognition?.embedding || value?.recognition || value?.embedding;
    if (!Array.isArray(candidate)) return null;
    const values = candidate.map(Number);
    return values.length === 512 && values.every(Number.isFinite) ? values : null;
  };

  const getPrimaryFace = (value) => {
    const faces = Array.isArray(value?.faces) ? value.faces : [];
    return faces.length === 1 ? faces[0] : null;
  };

  const onFaceDetected = async (event) => {
    if (busy || phase !== 'recognition') return;
    const value = event?.nativeEvent || event || {};
    const faces = Array.isArray(value.faces) ? value.faces : [];
    if (faces.length === 0) {
      setStatus('No face detected — move into the frame');
      return;
    }
    if (faces.length !== 1) {
      setStatus('Only one face is allowed');
      return;
    }

    const face = getPrimaryFace(value);
    const yaw = Number(face?.headEulerAngleY ?? face?.rotationY ?? 0);
    const embedding = getEmbedding(value);

    if (yaw < -12) {
      setLeftSeen(true);
      setStatus('Good — now turn your face to the right');
    } else if (yaw > 12) {
      setRightSeen(true);
      setStatus('Good — now look straight at the camera');
    } else if (!leftSeen) {
      setStatus('Slowly turn your face to the left');
    } else if (!rightSeen) {
      setStatus('Slowly turn your face to the right');
    } else {
      setStatus('Look straight at the camera');
    }

    if (!embedding || !leftSeen || !rightSeen || Math.abs(yaw) > 10) return;
    if (Date.now() - lastVerification.current < 2500) return;
    lastVerification.current = Date.now();
    setBusy(true);
    setError('');
    try {
      if (!auth.currentUser?.uid) throw new Error('Your sign-in session expired. Please sign in again.');
      const result = await verifyNativeKycFace(embedding, true);
      if (!result?.ok) {
        if (result?.duplicate) throw new Error('This face is already registered to another verified account.');
        throw new Error('Face verification could not be completed. Please try again.');
      }
      setPhase('capture');
      setStatus('Face verified — take your KYC selfie');
    } catch (err) {
      setError(err?.message || 'Face verification failed. Please try again.');
      setLeftSeen(false);
      setRightSeen(false);
      setStatus('Look straight at the camera');
    } finally {
      setBusy(false);
    }
  };

  const capture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError('');
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false, shutterSound: false });
      if (!photo?.uri) throw new Error('The camera did not return a selfie. Please try again.');
      onCaptured?.(photo.uri, 'image/jpeg', { method: 'native_face_recognition', livenessPassed: true });
    } catch (err) {
      setError(err?.message || 'Could not capture the selfie. Please try again.');
      setBusy(false);
    }
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.title}>Preparing secure camera…</Text></View>;
  }

  if (!permission.granted) {
    return <View style={styles.center}>
      <Text style={styles.icon}>📷</Text>
      <Text style={styles.title}>Camera access is required</Text>
      <Text style={styles.text}>MySheba uses the front camera for live face recognition and KYC selfie capture. Gallery and file uploads are not accepted.</Text>
      {permission.canAskAgain ? <TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Allow Camera</Text></TouchableOpacity> : <Text style={styles.error}>Camera permission is disabled. Enable Camera for MySheba in Android Settings, then try again.</Text>}
      <TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity>
    </View>;
  }

  if (phase === 'capture') {
    return <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="front" mode="picture" onCameraReady={() => setError('')}>
        <View style={styles.overlay}>
          <View style={styles.topBar}>
            <Text style={styles.badge}>KYC SELFIE</Text>
            <TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
          </View>
          <View style={styles.guideArea}>
            <View style={styles.faceGuide}><View style={styles.faceInner} /></View>
            <Text style={styles.instruction}>Keep your face centered</Text>
            <Text style={styles.subInstruction}>Use the same face that passed the live check.</Text>
          </View>
          <View style={styles.bottom}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={[styles.capture, busy && styles.captureDisabled]} onPress={capture} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color="#fff" /> : <View style={styles.captureInner} />}
            </TouchableOpacity>
            <Text style={styles.hint}>Tap once to capture</Text>
          </View>
        </View>
      </CameraView>
    </View>;
  }

  return <View style={styles.container}>
    <ExpoFaceRecognitionView style={styles.camera} onFaceDetected={onFaceDetected} />
    <View style={styles.overlay} pointerEvents="box-none">
      <View style={styles.topBar}>
        <Text style={styles.badge}>LIVE FACE VERIFICATION</Text>
        <TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
      </View>
      <View style={styles.guideArea} pointerEvents="none">
        <View style={styles.faceGuide}><View style={styles.faceInner} /></View>
        <Text style={styles.instruction}>{status}</Text>
        <Text style={styles.subInstruction}>One face only • keep your eyes visible • no photos or screens</Text>
      </View>
      <View style={styles.bottom} pointerEvents="none">
        <Text style={styles.security}>🔒 On-device face embedding + server duplicate check</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator color="#fff" size="large" /> : null}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.18)' },
  topBar: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  close: { padding: 8 },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  guideArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  faceGuide: { width: 245, height: 310, borderRadius: 125, borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  faceInner: { width: 220, height: 285, borderRadius: 112, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)' },
  instruction: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 22, textShadowColor: '#000', textShadowRadius: 5 },
  subInstruction: { color: '#fff', fontSize: 12, textAlign: 'center', marginTop: 7, textShadowColor: '#000', textShadowRadius: 4 },
  bottom: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 28 },
  security: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 14, textShadowColor: '#000', textShadowRadius: 4, textAlign: 'center' },
  capture: { width: 76, height: 76, borderRadius: 38, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  captureDisabled: { opacity: 0.55 },
  captureInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  hint: { color: '#fff', fontSize: 11, marginTop: 10, textShadowColor: '#000', textShadowRadius: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  icon: { fontSize: 42 },
  title: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  text: { color: '#4B5563', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 19 },
  primary: { backgroundColor: '#087F73', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800' },
  error: { color: '#FFD5D5', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 },
  cancel: { padding: 14, marginTop: 6 },
});
