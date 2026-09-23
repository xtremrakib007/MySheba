// Active 1-to-1 voice/video call UI. Group calling is retired.
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PermissionsAndroid, Platform } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { createAgoraRtcEngine, ChannelProfileType, ClientRoleType, RtcSurfaceView } from 'react-native-agora';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { fetchAgoraToken, subscribeCall, endCall } from '../firebase/callService';

const JOIN_TIMEOUT_MS = 20000;

async function requestAndroidPermissions(isVideo) {
  if (Platform.OS !== 'android') return true;
  const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (isVideo) permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const granted = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((permission) => granted[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

export default function CallScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { activeCall, goBackOrHome, authUser } = useApp();
  const engineRef = useRef(null);
  const [joined, setJoined] = useState(false);
  const [remoteUid, setRemoteUid] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(activeCall?.type !== 'video');
  const [usingFrontCamera, setUsingFrontCamera] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [status, setStatus] = useState('Connecting...');

  const isVideo = activeCall?.type === 'video';

  const leave = useCallback(async (markEnded = true) => {
    try {
      if (markEnded && activeCall?.id) await endCall(activeCall.id);
    } catch (_) {}
    try { await engineRef.current?.leaveChannel(); } catch (_) {}
    try { engineRef.current?.release(); } catch (_) {}
    goBackOrHome();
  }, [activeCall?.id, goBackOrHome]);

  useEffect(() => {
    let mounted = true;
    let timeoutId;
    let settled = false;

    const setup = async () => {
      if (!activeCall?.channelName) return;
      if (activeCall.isGroup === true) {
        setStatus('Group calls are no longer supported');
        return;
      }

      const permitted = await requestAndroidPermissions(isVideo);
      if (!mounted) return;
      if (!permitted) {
        setStatus('Microphone/camera permission denied');
        return;
      }

      timeoutId = setTimeout(() => {
        if (!mounted || settled) return;
        settled = true;
        setStatus('Could not connect the call');
        showAlert('MySheba', 'Could not connect the call. Please check your connection and try again.');
        leave(true);
      }, JOIN_TIMEOUT_MS);

      try {
        const { token, appId, uid } = await fetchAgoraToken(activeCall.channelName);
        if (!mounted) return;
        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId });
        engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        engine.enableAudio();
        if (isVideo) engine.enableVideo(); else engine.disableVideo();
        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            if (!mounted || settled) return;
            settled = true;
            clearTimeout(timeoutId);
            setJoined(true);
            setStatus('Ringing...');
          },
          onUserJoined: (_connection, uid2) => {
            if (!mounted) return;
            setRemoteUid(uid2);
            setStatus('Connected');
          },
          onUserOffline: () => {
            if (mounted) {
              setRemoteUid(null);
              leave(false);
            }
          },
          onError: () => {
            if (!mounted || settled) return;
            settled = true;
            clearTimeout(timeoutId);
            setStatus('Could not connect the call');
            showAlert('MySheba', 'Could not connect the call. Please check your connection and try again.');
            leave(true);
          },
        });
        await engine.joinChannel(token, activeCall.channelName, uid, { clientRoleType: ClientRoleType.ClientRoleBroadcaster });
      } catch (_) {
        if (mounted && !settled) {
          settled = true;
          clearTimeout(timeoutId);
          setStatus('Could not connect the call');
          leave(true);
        }
      }
    };

    setup();
    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      try { engineRef.current?.leaveChannel(); } catch (_) {}
      try { engineRef.current?.release(); } catch (_) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.channelName]);

  useEffect(() => {
    if (!activeCall?.id) return undefined;
    return subscribeCall(activeCall.id, (call) => {
      if (!call) return;
      if (['declined', 'ended', 'missed'].includes(call.status)) leave(false);
      else if (call.status === 'accepted') setStatus('Connected');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.id]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.muteLocalAudioStream(next);
  };

  const toggleCamera = () => {
    if (!isVideo) return;
    const next = !cameraOff;
    setCameraOff(next);
    engineRef.current?.muteLocalVideoStream(next);
  };

  const switchCamera = () => {
    if (!isVideo || cameraOff) return;
    try {
      engineRef.current?.switchCamera();
      setUsingFrontCamera((value) => !value);
    } catch (_) {}
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    engineRef.current?.setEnableSpeakerphone(next);
  };

  if (!activeCall) return null;

  const otherName = activeCall.callerUid === authUser?.uid ? activeCall.calleeName : activeCall.callerName;

  return (
    <View style={styles.container}>
      {isVideo && remoteUid != null ? (
        <RtcSurfaceView style={styles.remoteVideo} canvas={{ uid: remoteUid }} />
      ) : (
        <View style={[styles.remoteVideo, styles.center]}>
          <Text style={styles.name}>{otherName || 'Contact'}</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      )}

      {isVideo && joined && !cameraOff && <RtcSurfaceView style={styles.localVideo} canvas={{ uid: 0 }} zOrderMediaOverlay />}

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.btn, muted && styles.btnActive]} onPress={toggleMute}><Text style={styles.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text></TouchableOpacity>
        {isVideo && <TouchableOpacity style={[styles.btn, cameraOff && styles.btnActive]} onPress={toggleCamera}><Text style={styles.btnLabel}>{cameraOff ? 'Camera On' : 'Camera Off'}</Text></TouchableOpacity>}
        {isVideo && <TouchableOpacity style={[styles.btn, cameraOff && styles.btnDisabled]} onPress={switchCamera} disabled={cameraOff}><Text style={styles.btnLabel}>{usingFrontCamera ? 'Rear Cam' : 'Front Cam'}</Text></TouchableOpacity>}
        <TouchableOpacity style={[styles.btn, !speakerOn && styles.btnActive]} onPress={toggleSpeaker}><Text style={styles.btnLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.hangup} onPress={() => leave(true)}><Text style={styles.btnLabel}>End Call</Text></TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F14' },
    remoteVideo: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    localVideo: { position: 'absolute', top: 50, right: 16, width: 110, height: 150, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1c1c1e' },
    name: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 8 },
    status: { color: '#9AA5B1', fontSize: 14 },
    controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 12, paddingVertical: 24, paddingHorizontal: 12, backgroundColor: 'rgba(0,0,0,0.35)' },
    btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)' },
    btnActive: { backgroundColor: colors.primary },
    btnDisabled: { opacity: 0.4 },
    hangup: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24, backgroundColor: '#E53935' },
    btnLabel: { color: '#fff', fontWeight: '600', fontSize: 13 },
  });
}