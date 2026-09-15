import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

/**
 * Native KYC selfie capture.
 *
 * Important: this component deliberately does not claim biometric liveness or
 * face matching. It only guarantees that the selfie came from the live front
 * camera, not the gallery. A production biometric match/liveness engine must
 * be added before this result is used for automatic KYC approval.
 */
export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  useEffect(() => {
    if (!ready) return undefined;
    setStep(1);
    const timer = setTimeout(() => setStep(2), 1800);
    return () => clearTimeout(timer);
  }, [ready]);

  const capture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError('');
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!photo?.uri) throw new Error('The camera did not return a selfie. Please try again.');
      onCaptured?.(photo.uri, 'image/jpeg', { method: 'native_camera_capture' });
    } catch (err) {
      setError(err?.message || 'Could not capture the selfie. Please try again.');
      setBusy(false);
    }
  };

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" /><Text style={styles.title}>Preparing camera…</Text></View>;
  }

  if (!permission.granted) {
    return <View style={styles.center}>
      <Text style={styles.icon}>📷</Text>
      <Text style={styles.title}>Camera access is required</Text>
      <Text style={styles.text}>MySheba needs the front camera to capture your live KYC selfie. Gallery and file uploads are not used for this step.</Text>
      {permission.canAskAgain ? <TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Allow Camera</Text></TouchableOpacity> : <Text style={styles.error}>Camera permission is disabled. Enable Camera for MySheba in Android Settings, then try again.</Text>}
      <TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity>
    </View>;
  }

  return <View style={styles.container}>
    <CameraView
      ref={cameraRef}
      style={styles.camera}
      facing="front"
      mode="picture"
      onCameraReady={() => { setReady(true); setError(''); }}
    >
      <View style={styles.overlay}>
        <View style={styles.topBar}>
          <Text style={styles.badge}>NATIVE CAMERA KYC</Text>
          <TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
        </View>
        <View style={styles.guideArea}>
          <View style={styles.faceGuide}><View style={styles.faceInner} /></View>
          <Text style={styles.instruction}>{step === 1 ? 'Center your face inside the frame' : 'Look directly at the camera'}</Text>
          <Text style={styles.subInstruction}>Remove sunglasses and keep your face clearly visible.</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.security}>🔒 Live front-camera capture only</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity style={[styles.capture, (!ready || busy) && styles.captureDisabled]} onPress={capture} disabled={!ready || busy} activeOpacity={0.85}>
            {busy ? <ActivityIndicator color="#fff" /> : <View style={styles.captureInner} />}
          </TouchableOpacity>
          <Text style={styles.hint}>Tap the button to capture your selfie</Text>
        </View>
      </View>
    </CameraView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
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
  security: { color: '#fff', fontSize: 12, fontWeight: '700', marginBottom: 14, textShadowColor: '#000', textShadowRadius: 4 },
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
  error: { color: '#B91C1C', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 },
  cancel: { padding: 14, marginTop: 6 },
});
