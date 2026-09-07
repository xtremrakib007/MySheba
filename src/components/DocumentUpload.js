import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { validateFile } from '../firebase/documentStorageService';

/**
 * Presents Take Photo / Choose From Gallery / Choose File, returns picked
 * files up via onFilesPicked. Actual upload to Storage happens in the
 * parent screen via documentStorageService - this stays a pure picker +
 * local preview, same as AttachFileModal's split for chat attachments.
 */
export default function DocumentUpload({ multiple = false, onFilesPicked }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [busy, setBusy] = useState(false);

  const handlePicked = (assets) => {
    const files = assets.map((a) => ({
      uri: a.uri,
      type: a.mimeType ?? guessMimeFromUri(a.uri),
      size: a.fileSize ?? a.size ?? 0,
      name: a.fileName ?? a.name,
    }));

    for (const f of files) {
      const check = validateFile(f);
      if (!check.valid) {
        showAlert('MySheba', check.reason ?? 'Please try again.');
        return;
      }
    }
    onFilesPicked(files);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showAlert('Camera permission needed', 'Please enable camera access to scan a document.');
      return;
    }
    setBusy(true);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
      if (!result.canceled) handlePicked(result.assets);
    } finally {
      setBusy(false);
    }
  };

  const chooseFromGallery = async () => {
setBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.85, allowsMultipleSelection: multiple });
      if (!result.canceled) handlePicked(result.assets);
    } finally {
      setBusy(false);
    }
  };

  const chooseFile = async () => {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple });
      if (!result.canceled) handlePicked(result.assets);
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <View style={styles.busyRow}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.busyText}>Opening…</Text>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.button} onPress={takePhoto}>
        <Text style={styles.buttonText}>📷 Take Photo</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={chooseFromGallery}>
        <Text style={styles.buttonText}>🖼️ Choose From Gallery</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={chooseFile}>
        <Text style={styles.buttonText}>📎 Choose File</Text>
      </TouchableOpacity>
    </View>
  );
}

function guessMimeFromUri(uri = '') {
  if (uri.endsWith('.png')) return 'image/png';
  if (uri.endsWith('.webp')) return 'image/webp';
  if (uri.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}

function createStyles(colors) {
  return StyleSheet.create({
    row: { gap: 10 },
    button: { backgroundColor: colors.bg, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    buttonText: { fontWeight: '700', fontSize: 15, color: colors.text },
    busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 20 },
    busyText: { color: colors.textSecondary },
  });
}
