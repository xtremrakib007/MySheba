import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, Image, ActivityIndicator, StyleSheet, TextInput } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Shared attachment modal. Flight inquiries can still attach a ticket/photo.
// Remittance completion is intentionally different: staff enter the
// completion PIN supplied by the reseller/admin; no receipt upload is needed.
export default function AttachFileModal({ visible, title, allowPdf, uploadFn, onDone, onCancel }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const isRemittance = String(title || '').toLowerCase().includes('transfer receipt');
  const [file, setFile] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setPin(''); setBusy(false); };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
    });
    if (!result.canceled && result.assets && result.assets[0]) {
      const a = result.assets[0];
      setFile({ uri: a.uri, mimeType: a.mimeType || 'image/jpeg', isPdf: false });
    }
  };

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!result.canceled && result.assets && result.assets[0]) {
      const a = result.assets[0];
      setFile({ uri: a.uri, mimeType: a.mimeType || 'application/pdf', isPdf: true });
    }
  };

  const confirm = async () => {
    if (isRemittance) {
      const cleanPin = pin.replace(/\D/g, '');
      if (cleanPin.length !== 4) {
        showAlert('MySheba', 'Enter the 4-digit remittance completion PIN provided by the reseller/admin.');
        return;
      }
      setBusy(true);
      try {
        reset();
        onDone(cleanPin);
      } catch (e) {
        setBusy(false);
        showAlert('MySheba', e.message || 'Could not complete this order.');
      }
      return;
    }

    if (!file) {
      showAlert('MySheba', 'Please attach a file first.');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadFn(file.uri, file.mimeType);
      reset();
      onDone(url);
    } catch (e) {
      setBusy(false);
      showAlert('MySheba', e.message || 'Upload failed. Please try again.');
    }
  };

  const cancel = () => { reset(); onCancel(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{isRemittance ? 'Enter Remittance Completion PIN' : title}</Text>

          {isRemittance ? (
            <View>
              <Text style={styles.helper}>Enter the PIN provided by the reseller/admin after the remittance has been processed.</Text>
              <TextInput
                value={pin}
                onChangeText={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
                placeholder="4-digit PIN"
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry={false}
                style={styles.pinInput}
              />
            </View>
          ) : file ? (
            file.isPdf ? (
              <View style={styles.pdfPreview}>
                <Text style={styles.pdfPreviewText}>📄 PDF attached</Text>
              </View>
            ) : (
              <Image source={{ uri: file.uri }} style={styles.preview} resizeMode="cover" />
            )
          ) : (
            <View style={styles.pickRow}>
              <TouchableOpacity style={styles.pickBtn} onPress={pickImage}>
                <Text style={styles.pickBtnText}>📷 Photo</Text>
              </TouchableOpacity>
              {allowPdf && (
                <TouchableOpacity style={styles.pickBtn} onPress={pickPdf}>
                  <Text style={styles.pickBtnText}>📄 PDF</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {!isRemittance && !!file && (
            <TouchableOpacity onPress={() => setFile(null)} disabled={busy}>
              <Text style={styles.changeText}>Change file</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={cancel} disabled={busy}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={confirm}
              disabled={busy || (isRemittance ? pin.length !== 4 : !file)}
            >
              {busy ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.confirmText}>{isRemittance ? 'Complete Remittance' : 'Upload & Complete'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 20, width: '85%', maxWidth: 340 },
    title: { fontWeight: '600', fontSize: 15, marginBottom: 14 },
    helper: { color: colors.textSecondary || '#666', fontSize: 12, lineHeight: 18, marginBottom: 12 },
    pinInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 20, fontWeight: '700', letterSpacing: 5, textAlign: 'center', color: colors.text, marginBottom: 8 },
    pickRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
    pickBtn: { flex: 1, paddingVertical: 24, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#F7F8FA' },
    pickBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
    preview: { width: '100%', height: 160, borderRadius: radius.md, marginBottom: 6 },
    pdfPreview: { width: '100%', paddingVertical: 30, borderRadius: radius.md, backgroundColor: '#F7F8FA', alignItems: 'center', marginBottom: 6 },
    pdfPreviewText: { fontSize: 14, fontWeight: '600', color: colors.text },
    changeText: { color: colors.primary, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 14 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
    cancelBtn: { flex: 1, paddingVertical: 11, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    cancelText: { color: '#666', fontWeight: '600' },
    confirmBtn: { flex: 1.3, paddingVertical: 11, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    confirmText: { color: 'white', fontWeight: '600', fontSize: 12 },
  });
}