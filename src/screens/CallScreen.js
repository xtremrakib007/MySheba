// Active call UI: joins the Agora channel, renders local/remote video (or a
// simple avatar/roster for audio-only), and exposes mute/camera/speaker/
// hang-up. Handles both 1:1 calls (activeCall.isGroup falsy) and group
// calls (activeCall.isGroup === true, started from a group chat - see
// startGroupCall in AppContext.js).
//
// Requires a native build (EAS development build) - this will NOT run in
// Expo Go, since react-native-agora ships native iOS/Android code.
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PermissionsAndroid, Platform, ScrollView } from 'react-native';
import { showAlert } from '../utils/appAlert';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  RtcSurfaceView,
} from 'react-native-agora';

import { useApp } from '../context/AppContext';
import { useTheme } from "../theme/ThemeContext";
import {
  fetchAgoraToken, subscribeCall, endCall, declineCall,
  leaveGroupCall, cancelGroupCall,
} from '../firebase/callService';
import { agoraUidFor, buildAgoraUidMap } from '../utils/agoraUid';

// How long to wait for onJoinChannelSuccess before giving up and telling the
// person the call failed, instead of leaving them stuck on "Connecting..."
// forever with no feedback (e.g. a bad/expired token that Agora silently
// keeps retrying against, or the device losing its network mid-dial).
const JOIN_TIMEOUT_MS = 20000;

// Audio-only calls never touch the camera, so don't make camera permission
// a requirement for them - a person who's denied camera access (or has no
// camera) should still be able to make a voice call.
async function requestAndroidPermissions(isVideo) {
  if (Platform.OS !== 'android') return true;
  const perms = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
  if (isVideo) perms.push(PermissionsAndroid.PERMISSIONS.CAMERA);
  const granted = await PermissionsAndroid.requestMultiple(perms);
  return perms.every((p) => granted[p] === PermissionsAndroid.RESULTS.GRANTED);
}

export default function CallScreen() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { activeCall, goBackOrHome, authUser } = useApp();
  const engineRef = useRef(null);
  const [joined, setJoined] = useState(false);
  // Agora numeric uids currently publishing into the channel. For a 1:1
  // call this only ever holds 0 or 1 entries; group calls can hold several.
  const [remoteUids, setRemoteUids] = useState([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(activeCall?.type !== 'video');
  // Agora starts every video call on the front camera, so this tracks which
  // one is active purely for the button label - Agora has no "which camera
  // is this" getter, only the fire-and-forget switchCamera() toggle below.
  const [usingFrontCamera, setUsingFrontCamera] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [status, setStatus] = useState('Connecting...');
  // Live copy of the call doc (ringingUids/activeUids/status) - the
  // roster for a group call comes from here, not from Agora's join events,
  // since it's accurate even for members who haven't enabled their mic/cam.
  const [liveCall, setLiveCall] = useState(activeCall);

  const isVideo = activeCall?.type === 'video';
  const isGroup = !!activeCall?.isGroup;
  const isCaller = !!authUser && activeCall?.callerUid === authUser.uid;

  // My own deterministic Agora uid for a group call, and the reverse
  // lookup {agoraUid -> firebaseUid} for everyone invited - both derived
  // the same way on every participant's device, so no coordination round
  // trip is needed before joining (see src/utils/agoraUid.js).
  const myAgoraUid = useMemo(
    () => (isGroup && authUser?.uid ? agoraUidFor(authUser.uid) : 0),
    [isGroup, authUser?.uid]
  );
  const agoraUidMap = useMemo(
    () => (isGroup ? buildAgoraUidMap(activeCall?.participantUids) : {}),
    [isGroup, activeCall?.participantUids]
  );
  const nameFor = useCallback(
    (uid) => (activeCall?.participantNames && activeCall.participantNames[uid]) || 'Member',
    [activeCall?.participantNames]
  );

  const leave = useCallback(
    async (markEnded = true) => {
      try {
        if (markEnded && activeCall?.id) {
          if (isGroup) {
            // If nobody else has joined yet, hanging up is the caller
            // cancelling the whole call - stop it ringing for every
            // invitee still waiting, not just leave for myself.
            const stillOnlyRinging = isCaller && (liveCall?.status || activeCall.status) === 'ringing';
            if (stillOnlyRinging) await cancelGroupCall(activeCall.id);
            else if (authUser?.uid) await leaveGroupCall(activeCall.id, authUser.uid);
          } else {
            await endCall(activeCall.id);
          }
        }
        await engineRef.current?.leaveChannel();
        engineRef.current?.release();
      } catch (e) {
        // best-effort cleanup - nothing the user can do about this
      }
      // Return to whatever screen the call interrupted (e.g. a WebView the
      // user was working in, or a dealer/admin dashboard) instead of always
      // dropping back to the customer home screen. answerIncomingCall()
      // pushes that screen onto the back-history when it switches to
      // 'call', so goBackOrHome() pops straight back to it; it only falls
      // back to each role's home screen when there's no history (e.g. the
      // call was answered from a killed-app cold start).
      goBackOrHome();
    },
    [activeCall, goBackOrHome, isGroup, isCaller, liveCall, authUser]
  );

  useEffect(() => {
    let mounted = true;
    let timeoutId = null;
    let settled = false; // guards against the timeout firing after a late success/error

    async function setup() {
      if (!activeCall?.channelName) return;

      const hasPerms = await requestAndroidPermissions(isVideo);
      if (!hasPerms) {
        setStatus('Microphone/camera permission denied');
        return;
      }

      // If Agora never calls back at all (bad token silently rejected,
      // dropped connection, carrier blocking the ports it needs) there's no
      // error event to catch - just silence. Without this, the person is
      // stuck staring at "Connecting..." indefinitely. Give it 20s, then
      // fail loudly and back out instead.
      timeoutId = setTimeout(() => {
        if (!mounted || settled) return;
        settled = true;
        setStatus('Could not connect the call');
        showAlert('MySheba', 'Could not connect the call. Please check your connection and try again.');
        leave(true);
      }, JOIN_TIMEOUT_MS);

      try {
        const { token, appId, uid } = await fetchAgoraToken(activeCall.channelName, myAgoraUid || undefined);
        if (!mounted) return;

        const engine = createAgoraRtcEngine();
        engineRef.current = engine;
        engine.initialize({ appId });
        engine.setChannelProfile(ChannelProfileType.ChannelProfileCommunication);
        engine.enableAudio();
        if (isVideo) engine.enableVideo();
        else engine.disableVideo();

        engine.registerEventHandler({
          onJoinChannelSuccess: () => {
            if (mounted && !settled) {
              settled = true;
              if (timeoutId) clearTimeout(timeoutId);
              setJoined(true);
              setStatus('Ringing...');
            }
          },
          onUserJoined: (_connection, uid2) => {
            if (mounted) {
              setRemoteUids((prev) => (prev.includes(uid2) ? prev : [...prev, uid2]));
              setStatus('Connected');
            }
          },
          onUserOffline: (_connection, uid2) => {
            if (mounted) {
              setRemoteUids((prev) => prev.filter((u) => u !== uid2));
              // A 1:1 call ends the moment the other side drops off; a
              // group call just loses that one tile and carries on for
              // whoever's left.
              if (!isGroup) leave(false);
            }
          },
          // Fires for things like an invalid/expired token, a channel name
          // mismatch, or the network dropping before join completes -
          // exactly the cases that used to leave the screen stuck on
          // "Connecting..." with no feedback.
          onError: (err) => {
            if (!mounted || settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            setStatus('Could not connect the call');
            showAlert('MySheba', 'Could not connect the call. Please check your connection and try again.');
            leave(true);
          },
        });

        await engine.joinChannel(token, activeCall.channelName, uid, {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
        });
      } catch (e) {
        // Token fetch or join failed (network, misconfigured Agora secret,
        // etc) - tell the person instead of leaving them stuck on
        // "Connecting..." with no way to know what happened.
        if (mounted && !settled) {
          settled = true;
          if (timeoutId) clearTimeout(timeoutId);
          setStatus('Could not connect the call');
          leave(true);
        }
      }
    }

    setup();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      engineRef.current?.leaveChannel();
      engineRef.current?.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.channelName]);

  // Watches the call doc so both sides (1:1) or the whole group follow
  // suit when it wraps up, and so the group roster below stays live.
  useEffect(() => {
    if (!activeCall?.id) return undefined;
    const unsub = subscribeCall(activeCall.id, (call) => {
      if (!call) return;
      setLiveCall(call);
      if (isGroup) {
        if (call.status === 'ended') leave(false);
      } else if (['declined', 'ended', 'missed'].includes(call.status)) {
        leave(false);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCall?.id, isGroup]);

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

  // Flips local capture between front/rear. Disabled while the camera is
  // off since there's no preview to show the effect on, and Agora only
  // guarantees the switch applies to an actively-capturing camera.
  const switchCamera = () => {
    if (!isVideo || cameraOff) return;
    try {
      engineRef.current?.switchCamera();
      setUsingFrontCamera((prev) => !prev);
    } catch (e) {
      // best-effort - a device/emulator exposing only one camera can reject this
    }
  };

  const toggleSpeaker = () => {
    const next = !speakerOn;
    setSpeakerOn(next);
    engineRef.current?.setEnableSpeakerphone(next);
  };

  if (!activeCall) return null;

  // ---- group call ----
  if (isGroup) {
    const otherParticipants = (activeCall.participantUids || []).filter((uid) => uid !== authUser?.uid);
    const ringingUids = liveCall?.ringingUids || activeCall.ringingUids || [];
    const activeUids = liveCall?.activeUids || activeCall.activeUids || [];
    const videoTileUids = remoteUids.filter((agoraUid) => agoraUidMap[agoraUid]);

    const statusFor = (uid) => {
      if (activeUids.includes(uid)) return 'Connected';
      if (ringingUids.includes(uid)) return 'Ringing...';
      return 'Left';
    };

    return (
      <View style={styles.container}>
        {isVideo && videoTileUids.length > 0 ? (
          <View style={styles.videoGrid}>
            {videoTileUids.map((agoraUid) => (
              <View key={agoraUid} style={styles.gridTile}>
                <RtcSurfaceView style={StyleSheet.absoluteFill} canvas={{ uid: agoraUid }} />
                <Text style={styles.gridTileLabel}>{nameFor(agoraUidMap[agoraUid])}</Text>
              </View>
            ))}
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.roster}>
            <Text style={styles.name}>{activeCall.groupName || 'Group call'}</Text>
            <Text style={styles.status}>{status}</Text>
            {otherParticipants.map((uid) => (
              <View key={uid} style={styles.rosterRow}>
                <Text style={styles.rosterName}>{nameFor(uid)}</Text>
                <Text style={styles.rosterStatus}>{statusFor(uid)}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {isVideo && joined && !cameraOff && (
          <RtcSurfaceView style={styles.localVideo} canvas={{ uid: 0 }} zOrderMediaOverlay />
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={[styles.btn, muted && styles.btnActive]} onPress={toggleMute}>
            <Text style={styles.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>

          {isVideo && (
            <TouchableOpacity style={[styles.btn, cameraOff && styles.btnActive]} onPress={toggleCamera}>
              <Text style={styles.btnLabel}>{cameraOff ? 'Camera On' : 'Camera Off'}</Text>
            </TouchableOpacity>
          )}

          {isVideo && (
            <TouchableOpacity
              style={[styles.btn, cameraOff && styles.btnDisabled]}
              onPress={switchCamera}
              disabled={cameraOff}
            >
              <Text style={styles.btnLabel}>{usingFrontCamera ? 'Rear Cam' : 'Front Cam'}</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.btn, !speakerOn && styles.btnActive]} onPress={toggleSpeaker}>
            <Text style={styles.btnLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.hangup} onPress={() => leave(true)}>
            <Text style={styles.btnLabel}>Leave Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ---- 1:1 call ----
  const remoteUid = remoteUids.length > 0 ? remoteUids[0] : null;

  return (
    <View style={styles.container}>
      {isVideo && remoteUid != null ? (
        <RtcSurfaceView style={styles.remoteVideo} canvas={{ uid: remoteUid }} />
      ) : (
        <View style={[styles.remoteVideo, styles.center]}>
          <Text style={styles.name}>
            {activeCall.callerUid === authUser?.uid ? activeCall.calleeName : activeCall.callerName}
          </Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      )}

      {isVideo && joined && !cameraOff && (
        <RtcSurfaceView style={styles.localVideo} canvas={{ uid: 0 }} zOrderMediaOverlay />
      )}

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.btn, muted && styles.btnActive]} onPress={toggleMute}>
          <Text style={styles.btnLabel}>{muted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>

        {isVideo && (
          <TouchableOpacity style={[styles.btn, cameraOff && styles.btnActive]} onPress={toggleCamera}>
            <Text style={styles.btnLabel}>{cameraOff ? 'Camera On' : 'Camera Off'}</Text>
          </TouchableOpacity>
        )}

        {isVideo && (
          <TouchableOpacity
            style={[styles.btn, cameraOff && styles.btnDisabled]}
            onPress={switchCamera}
            disabled={cameraOff}
          >
            <Text style={styles.btnLabel}>{usingFrontCamera ? 'Rear Cam' : 'Front Cam'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.btn, !speakerOn && styles.btnActive]} onPress={toggleSpeaker}>
          <Text style={styles.btnLabel}>{speakerOn ? 'Speaker' : 'Earpiece'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.hangup} onPress={() => leave(true)}>
          <Text style={styles.btnLabel}>End Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B0F14' },
    remoteVideo: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    localVideo: {
      position: 'absolute',
      top: 50,
      right: 16,
      width: 110,
      height: 150,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#1c1c1e',
    },
    name: { color: '#fff', fontSize: 22, fontWeight: '600', marginBottom: 8 },
    status: { color: '#9AA5B1', fontSize: 14 },
    // ---- group call ----
    videoGrid: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingTop: 40,
    },
    gridTile: {
      width: '50%',
      aspectRatio: 3 / 4,
      backgroundColor: '#1c1c1e',
      borderWidth: 1,
      borderColor: '#0B0F14',
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    gridTileLabel: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
      padding: 6,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    roster: { flexGrow: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 24 },
    rosterRow: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    rosterName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    rosterStatus: { color: '#9AA5B1', fontSize: 13 },
    controls: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-around',
      rowGap: 12,
      paddingVertical: 24,
      paddingHorizontal: 12,
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    btn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    btnActive: { backgroundColor: colors.primary },
    btnDisabled: { opacity: 0.4 },
    hangup: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 24,
      backgroundColor: '#E53935',
    },
    btnLabel: { color: '#fff', fontWeight: '600', fontSize: 13 },
  });
}
