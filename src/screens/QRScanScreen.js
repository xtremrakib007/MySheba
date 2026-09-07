import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as contactsService from '../firebase/contactsService';
import * as directChatService from '../firebase/directChatService';

const ROLE_LABEL = { customer: 'Customer', dealer: 'Dealer', reseller: 'Reseller', admin: 'Admin', superadmin: 'Super Admin' };

// WhatsApp-style "scan to add contact": opens the camera, reads a MySheba
// QR code (produced by MyQRCodeScreen.js, which encodes just the owner's
// uid), then looks that uid up fresh via getUserByUid before showing an
// Add Contact / Start Chat card - never trusts fields embedded in the code
// itself. `locked` stops onBarcodeScanned from firing repeatedly for the
// same code while a lookup is in flight or a result card is showing.
export default function QRScanScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { authUser, profile, setScreen, openDirectChat } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matchedUser, setMatchedUser] = useState(null);
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState(false);

  const handleScanned = useCallback(async ({ data }) => {
    if (locked) return;
    setLocked(true);
    setLoading(true);
    try {
      const parsed = JSON.parse(data);
      if (!parsed || parsed.app !== 'mysheba' || !parsed.uid) {
        throw new Error('not-mysheba-code');
      }
      const user = await contactsService.getUserByUid(parsed.uid);
      if (!user) throw new Error('not-found');
      setMatchedUser(user);
    } catch (err) {
      const message = err?.message === 'not-mysheba-code'
        ? 'That QR code is not a MySheba contact code.'
        : (err?.message || 'This code could not be recognized.');
      showAlert('MySheba', message);
      setLocked(false);
    } finally {
      setLoading(false);
    }
  }, [locked]);

  const scanAgain = () => {
    setMatchedUser(null);
    setLocked(false);
  };

  const addContact = async () => {
    if (!matchedUser) return;
    setAdding(true);
    try {
      await contactsService.addFriend(authUser.uid, matchedUser);
      showAlert('MySheba', `${matchedUser.name || matchedUser.phone || 'Contact'} added to your Friends list.`);
      setScreen('addContact');
    } catch (err) {
      showAlert('MySheba', 'Could not add this contact. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const startChat = async () => {
    if (!matchedUser) return;
    setStarting(true);
    try {
      const chatId = await directChatService.ensureDirectChat(
        { uid: authUser.uid, name: profile?.name || '' },
        { uid: matchedUser.uid, name: matchedUser.name || matchedUser.phone || 'User' }
      );
      openDirectChat(chatId, matchedUser.name || matchedUser.phone || 'User', matchedUser.uid);
    } catch (err) {
      showAlert('MySheba', 'Could not start this conversation. Please try again.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={() => setScreen('addContact')}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan QR Code</Text>
      </LinearGradient>

      {!permission ? (
        <View style={styles.centerBody}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : !permission.granted ? (
        <View style={styles.centerBody}>
          <Text style={styles.permText}>MySheba needs camera access to scan a contact's QR code.</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={locked ? undefined : handleScanned}
          />
          <View style={styles.frameOverlay} pointerEvents="none">
            <View style={styles.frame} />
            <Text style={styles.frameHint}>Point your camera at a MySheba QR code</Text>
          </View>

          {loading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#fff" />
            </View>
          )}

          {!!matchedUser && (
            <View style={styles.resultOverlay}>
              <View style={styles.resultCard}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(matchedUser.name || matchedUser.phone || '?').trim().charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.resultName}>{matchedUser.name || matchedUser.phone || 'User'}</Text>
                <Text style={styles.resultMeta}>
                  {ROLE_LABEL[matchedUser.role] || matchedUser.role}
                  {matchedUser.phone ? ` · ${matchedUser.phone}` : ''}
                  {matchedUser.userId ? ` · ID ${matchedUser.userId}` : ''}
                </Text>

                <View style={styles.resultActions}>
                  <TouchableOpacity style={styles.primaryBtn} onPress={addContact} disabled={adding}>
                    {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.primaryBtnText}>Add Contact</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={startChat} disabled={starting}>
                    {starting ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.secondaryBtnText}>Start Chat</Text>}
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.scanAgainBtn} onPress={scanAgain}>
                  <Text style={styles.scanAgainText}>Scan another code</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    centerBody: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
    permText: { textAlign: 'center', color: colors.text, fontSize: 14, marginBottom: 16 },
    permBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: radius.pill },
    permBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    cameraWrap: { flex: 1 },
    frameOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    frame: { width: 240, height: 240, borderRadius: radius.lg, borderWidth: 2, borderColor: '#fff' },
    frameHint: { color: '#fff', marginTop: 16, fontSize: 13 },
    loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
    resultOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    resultCard: { width: '100%', backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, alignItems: 'center' },
    avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    avatarText: { color: 'white', fontWeight: '700', fontSize: 22 },
    resultName: { fontSize: 16, fontWeight: '700', color: colors.text },
    resultMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
    resultActions: { flexDirection: 'row', gap: 10, marginTop: 18, width: '100%' },
    primaryBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
    primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
    secondaryBtn: { flex: 1, borderWidth: 1, borderColor: colors.primary, paddingVertical: 12, borderRadius: radius.pill, alignItems: 'center' },
    secondaryBtnText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    scanAgainBtn: { marginTop: 14 },
    scanAgainText: { color: '#999', fontSize: 12 },
  });
}
