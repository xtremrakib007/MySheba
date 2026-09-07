import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Downloads a remote file (Remittance receipt / Flight ticket) into the
// app's cache, then hands it to the OS share sheet - that's what actually
// lets someone "save" it, since RN has no direct "save to Downloads" API
// for arbitrary file types without extra media-library permissions. The
// share sheet's "Save to Files"/"Save to device" option covers that.
export default function DownloadButton({ url, filename, label = 'Download' }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [busy, setBusy] = useState(false);

  const onPress = async () => {
    if (!url || busy) return;
    setBusy(true);
    try {
      const localUri = FileSystem.cacheDirectory + (filename || `file-${Date.now()}`);
      const { uri } = await FileSystem.downloadAsync(url, localUri);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri);
      } else {
        showAlert('MySheba', 'Sharing/saving files is not available on this device.');
      }
    } catch (e) {
      showAlert('MySheba', 'Could not download this file. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.7} disabled={busy}>
      <Text style={styles.text}>{busy ? 'Downloading…' : `⬇ ${label}`}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    btn: {
      backgroundColor: colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: radius.sm,
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    text: { fontSize: 11, fontWeight: '700', color: 'white' },
  });
}
