import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const CHALLENGES = [
  'Look straight at the camera',
  'Slowly turn your head to the left',
  'Slowly turn your head to the right',
];

export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [step, setStep] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) requestPermission();
  }, [permission, requestPermission]);

  useEffect(() => {
    if (!permission?.granted) return undefined;
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [permission?.granted, countdown]);

  const capture = async () => {
    if (busy || !cameraRef.current || countdown > 0) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, skipProcessing: false });
      if (!photo?.uri) throw new Error('Camera did not return a face image.');
      if (step < CHALLENGES.length - 1) {
        setStep((value) => value + 1);
        setCountdown(3);
      } else {
        await onCaptured(photo.uri, 'image/jpeg');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!permission) return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  if (!permission.granted) {
    return <View style={styles.center}>
      <Text style={styles.title}>Camera access is required</Text>
      <Text style={styles.text}>KYC selfie verification does not accept gallery, file-manager or imported photos.</Text>
      <TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Allow Camera</Text></TouchableOpacity>
      <TouchableOpacity style={styles.cancel} onPress={onCancel}><Text>Cancel</Text></TouchableOpacity>
    </View>;
  }

  return <View style={styles.container}>
    <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
    <View style={styles.overlay}>
      <View style={styles.top}>
        <Text style={styles.badge}>LIVE CAMERA ONLY</Text>
        <Text style={styles.title}>{CHALLENGES[step]}</Text>
        <Text style={styles.text}>Keep only your face in the frame. No gallery or file upload is available.</Text>
      </View>
      <View style={styles.faceGuide} />
      <View style={styles.bottom}>
        <Text style={styles.step}>Step {step + 1} of {CHALLENGES.length}</Text>
        {countdown > 0 ? <Text style={styles.countdown}>{countdown}</Text> : <TouchableOpacity style={styles.capture} onPress={capture} disabled={busy}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureText}>{step === CHALLENGES.length - 1 ? 'Capture Live Face' : 'Done — Next'}</Text>}</TouchableOpacity>}
        <TouchableOpacity style={styles.cancel} onPress={onCancel}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 22, backgroundColor: 'rgba(0,0,0,0.18)' },
  top: { alignItems: 'center', marginTop: 18 },
  badge: { color: '#fff', backgroundColor: '#087F73', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, fontWeight: '800', fontSize: 12 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  text: { color: '#fff', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 18 },
  faceGuide: { alignSelf: 'center', width: 230, height: 300, borderWidth: 3, borderColor: '#fff', borderRadius: 120, opacity: 0.9 },
  bottom: { alignItems: 'center', paddingBottom: 8 },
  step: { color: '#fff', fontWeight: '700', marginBottom: 8 },
  countdown: { color: '#fff', fontSize: 46, fontWeight: '900', marginBottom: 8 },
  capture: { minWidth: 190, minHeight: 52, borderRadius: 26, backgroundColor: '#087F73', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  captureText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  primary: { backgroundColor: '#087F73', paddingHorizontal: 22, paddingVertical: 13, borderRadius: 24, marginTop: 18 },
  primaryText: { color: '#fff', fontWeight: '800' },
  cancel: { padding: 12, marginTop: 6 },
  cancelText: { color: '#fff', fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
