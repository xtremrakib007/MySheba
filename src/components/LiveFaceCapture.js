import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import { processFace } from '@rdnf-magiba/expo-face-recognition';
import { auth } from '../firebase/config';
import { verifyNativeKycFace } from '../firebase/verificationService';
import {
  IDLE_MESSAGE,
  SAMPLE_INTERVAL_MS,
  isRetryableVerificationFailure,
  nextCaptureStep,
} from '../utils/faceCapture';

/**
 * KYC selfie from an ordinary camera, captured automatically once a live human
 * face is in frame.
 *
 * One expo-camera CameraView does everything. Every SAMPLE_INTERVAL_MS it takes
 * a frame and asks the face models, through processFace, whether that frame
 * holds a live face; the first frame that does is the one submitted. No custom
 * native camera view, no handing the camera between two views mid-flow, and no
 * shutter button - see src/utils/faceCapture.js for why.
 */
export default function LiveFaceCapture({ onCaptured, onCancel }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(IDLE_MESSAGE);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  // Bumped by "Try again" to restart the loop after it has stopped.
  const [attempt, setAttempt] = useState(0);
  const [cameraError, setCameraError] = useState('');

  const failures = useRef(0);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  // Frames are written to the cache directory. Only one of them is ever kept,
  // so the rest are removed rather than left to pile up across attempts.
  const discard = useCallback(async (uri) => {
    if (!uri) return;
    try {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch {
      // A leftover cache file is not worth surfacing to the person.
    }
  }, []);

  useEffect(() => {
    if (!permission?.granted || !ready || error) return undefined;

    let active = true;
    let timer = null;
    let shooting = false;

    const schedule = () => {
      if (active) timer = setTimeout(tick, SAMPLE_INTERVAL_MS);
    };

    const stop = (message) => {
      active = false;
      setVerifying(false);
      setError(message);
    };

    const tick = async () => {
      if (!active || !cameraRef.current || shooting) return schedule();
      shooting = true;

      let photo = null;
      try {
        // skipProcessing stays off: this frame is the selfie that gets
        // submitted, so it needs the correct orientation, not just enough
        // pixels to detect a face.
        photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          skipProcessing: false,
          shutterSound: false,
        });
      } catch {
        // The camera can be momentarily busy. Not a detector failure.
        shooting = false;
        return schedule();
      }

      if (!photo?.uri) {
        shooting = false;
        return schedule();
      }
      if (!active) return discard(photo.uri);

      let sample;
      try {
        sample = { ok: true, result: await processFace(photo.uri) };
      } catch (err) {
        sample = { ok: false, error: err };
      }
      if (!active) return discard(photo.uri);

      const step = nextCaptureStep(sample, failures.current);
      failures.current = step.failures;
      setStatus(step.message);

      if (step.action !== 'submit') {
        shooting = false;
        discard(photo.uri);
        if (step.action === 'abort') return stop(step.message);
        return schedule();
      }

      // A live face. Check it is not already registered to someone else, then
      // hand on this exact frame.
      setVerifying(true);
      try {
        if (!auth.currentUser?.uid) {
          throw new Error('Your sign-in session expired. Please sign in again.');
        }
        const result = await verifyNativeKycFace(step.embedding, true);
        if (!result?.ok) {
          const message = result?.duplicate
            ? 'This face is already registered to another verified account.'
            : 'Face verification could not be completed. Please try again.';
          if (!isRetryableVerificationFailure(result)) {
            discard(photo.uri);
            return stop(message);
          }
          throw new Error(message);
        }
        if (!active) return discard(photo.uri);
        active = false;
        onCaptured?.(photo.uri, 'image/jpeg', {
          method: 'native_face_recognition',
          livenessPassed: true,
        });
      } catch (err) {
        discard(photo.uri);
        // Retrying on a timer would hammer a rate-limited callable, so stop and
        // let the person decide.
        return stop(err?.message || 'Face verification failed. Please try again.');
      } finally {
        shooting = false;
      }
      return undefined;
    };

    schedule();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [permission?.granted, ready, error, attempt, discard, onCaptured]);

  const handleCameraMountError = useCallback((event) => {
    const message = event?.message || 'The camera could not be started. Please try again.';
    setReady(false);
    setCameraError(message);
  }, []);

  const retry = () => {
    failures.current = 0;
    setStatus(IDLE_MESSAGE);
    setVerifying(false);
    setError('');
    setCameraError('');
    setReady(false);
    setAttempt((n) => n + 1);
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.title}>Preparing camera…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.title}>Camera access is required</Text>
        <Text style={styles.text}>
          MySheba uses the front camera to take your KYC selfie automatically. Gallery and file
          uploads are not accepted for the selfie.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity style={styles.primary} onPress={requestPermission}>
            <Text style={styles.primaryText}>Allow Camera</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.errorLight}>
            Camera permission is disabled. Enable Camera for MySheba in Android Settings, then try
            again.
          </Text>
        )}
        <TouchableOpacity style={styles.cancel} onPress={onCancel}>
          <Text>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        key={`kyc-camera-${attempt}`}
        ref={cameraRef}
        style={styles.camera}
        facing="front"
        mode="picture"
        onCameraReady={() => { setCameraError(''); setReady(true); }}
        onMountError={handleCameraMountError}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <Text style={styles.badge}>KYC SELFIE</Text>
          <TouchableOpacity onPress={onCancel} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.guideArea} pointerEvents="none">
          <View style={styles.faceGuide}>
            <View style={styles.faceInner} />
          </View>
          <Text style={styles.instruction}>
            {verifying ? 'Verifying your face…' : cameraError ? 'Camera could not start' : !ready ? 'Starting the camera…' : status}
          </Text>
          <Text style={styles.subInstruction}>
            Hold your face inside the oval in good light — the photo is taken automatically.
          </Text>
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {cameraError ? <Text style={styles.error}>{cameraError}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {verifying ? <ActivityIndicator color="#fff" size="large" /> : null}
          {(cameraError || error) ? (
            <TouchableOpacity style={styles.primary} onPress={retry}>
              <Text style={styles.primaryText}>Try again</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.security}>🔒 Live face check • automatic capture</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1, width: '100%' },
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
  security: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 12, textShadowColor: '#000', textShadowRadius: 4, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  icon: { fontSize: 42 },
  title: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  text: { color: '#4B5563', textAlign: 'center', marginTop: 8, fontSize: 13, lineHeight: 19 },
  primary: { backgroundColor: '#087F73', paddingHorizontal: 24, paddingVertical: 13, borderRadius: 24, marginTop: 20 },
  primaryText: { color: '#fff', fontWeight: '800' },
  error: { color: '#FFD5D5', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 },
  errorLight: { color: '#B91C1C', textAlign: 'center', marginTop: 12, fontSize: 12, lineHeight: 18 },
  cancel: { padding: 14, marginTop: 6 },
});
