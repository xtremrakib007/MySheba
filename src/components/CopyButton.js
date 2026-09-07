import React, { useState, useEffect, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { radius } from '../theme/theme';

import { useTheme } from "../theme/ThemeContext";

// Small tap-to-copy chip used on Dealer/Admin order cards. Copies `value`
// to the clipboard and flips its own label to "✓ Copied" for ~1.5s as
// feedback, then reverts - a confirmation this small doesn't need an Alert
// dialog the user has to dismiss.
export default function CopyButton({ value, label = 'Copy' }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const onPress = async () => {
    if (!value) return;
    try {
      await Clipboard.setStringAsync(String(value));
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // Not worth interrupting the user over - the text is still visible
      // on screen for them to copy by hand if the clipboard write fails.
    }
  };

  return (
    <TouchableOpacity style={[styles.btn, copied && styles.btnCopied]} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.text, copied && styles.textCopied]}>{copied ? '✓ Copied' : `📋 ${label}`}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    btn: {
      backgroundColor: '#F0F0F0',
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: radius.sm,
      alignSelf: 'flex-start',
    },
    btnCopied: { backgroundColor: '#E8F5E9' },
    text: { fontSize: 10, fontWeight: '600', color: '#555' },
    textCopied: { color: colors.success },
  });
}
