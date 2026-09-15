import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NitroFace, PerformanceMode } from '@nitro-mlkit/face-detection';
import { NitroRecognizer } from '@nitro-mlkit/face-recognition';
import { setLastFaceRecognition } from '../firebase/faceRecognitionState';

const FACE_MODEL_URL = 'https://raw.githubusercontent.com/hugocornellier/face_detection_tflite/main/assets/models/mobilefacenet.tflite';
const PROBE_ID = '__mysheba_kyc_probe__';

/**
 * Native KYC face capture.
 *
 * The photo is captured only by the live front camera. Before it is accepted,
 * the captured frame is checked for exactly one face and a MobileFaceNet
 * embedding is generated on-device. The embedding is returned to the KYC flow
 * so the server can enforce 1:N duplicate-face rules.
 *
 * This is face recognition, not a claim of biometric liveness. A production
 * KYC liveness/anti-spoof model is a separate control and must not be inferred
 * from the fact that a camera photo was captured.
 */
export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Position your face inside the frame.');

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  const capture = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    setError('');
    setStatus('Checking face…');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!photo?.uri) throw new Error('The camera did not return a selfie. Please try again.');

      const faces = await NitroFace.detect(photo.uri, {
        performanceMode: PerformanceMode.FAST,
        landmarks: false,
        classifications: true,
        minFaceSize: 0.12,
        tracking: false,
      });

      if (!Array.isArray(faces) || faces.length !== 1) {
        throw new Error(
          faces?.length === 0
            ? 'No face was detected. Center your face and try again.'
            : 'More than one face was detected. Only one person may be in the KYC camera.'
        );
      }

      setStatus('Generating secure face template…');

      if (!NitroRecognizer.isModelReady()) {
        const loaded = await NitroRecognizer.downloadModel(FACE_MODEL_URL);
        if (!loaded || !NitroRecognizer.isModelReady()) {
          throw new Error('The face-recognition model could not be loaded. Please try again with an internet connection.');
        }
      }

      NitroRecognizer.removePerson(PROBE_ID);
      const registered = await NitroRecognizer.registerPerson(PROBE_ID, 'KYC probe', photo.uri);
      if (!registered) throw new Error('A usable face template could not be generated. Please retake the photo.');

      const registry = NitroRecognizer.getRegistry();
      const probe = registry.find((item) => item.id === PROBE_ID);
      const embedding = Array.isArray(probe?.embedding) ? probe.embedding : null;
      NitroRecognizer.removePerson(PROBE_ID);

      if (!embedding || embedding.length < 64) {
        throw new Error('Face recognition did not return a valid template. Please try again.');
      }

      setStatus('Face recognized.');
      setLastFaceRecognition({ embedding, model: 'MobileFaceNet' });
      onCaptured?.(photo.uri, 'image/jpeg', {
        method: 'native_face_recognition',
        faceRecognitionVerified: true,
        faceEmbedding: embedding,
        faceEmbeddingModel: 'MobileFaceNet',
        faceCount: 1,
      });
    } catch (err) {
      setError(err?.message || 'Could not verify your face. Please try again.');
      setStatus('Position your face inside the frame.');
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
      <Text style={styles.text}>MySheba uses the live front camera for KYC face recognition. Gallery and file uploads are not accepted for the selfie.</Text>
      {permission.canAskAgain
        ? <TouchableOpacity style={styles.primary} onPress={requestPermission}><Text style={styles.primaryText}>Allow Camera</Text></TouchableOpacity>
        : <Text style={styles.error}>Camera permission is disabled. Enable Camera for MySheba in Android Settings, then try again.</Text>}
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
          <Text style={styles.badge}>FACE RECOGNITION KYC</Text>
          <TouchableOpacity onPress={onCancel} style={styles.close}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
        </View>
        <View style={styles.guideArea}>
          <View style={styles.faceGuide}><View style={styles.faceInner} /></View>
          <Text style={styles.instruction}>{status}</Text>
          <Text style={styles.subInstruction}>Only one face. Look directly at the camera and remove sunglasses.</Text>
        </View>
        <View style={styles.bottom}>
          <Text style={styles.security}>🔒 Live camera + on-device face recognition</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.capture, (!ready || busy) && styles.captureDisabled]}
            onPress={capture}
            disabled={!ready || busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <View style={styles.captureInner} />}
          </TouchableOpacity>
          <Text style={styles.hint}>Your face template is used to prevent duplicate KYC identities.</Text>
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
  hint: { color: '#fff', fontSize: 11, marginTop: 10, textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  icon: { fontSize: 42 },
  title: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  text: { color: '#4B5563', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 19 },
  primary: { backgroundColor: '#087F73', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800' },
  error: { color: '#B91C1C', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 },
  cancel: { padding: 14, marginTop: 6 },
});
