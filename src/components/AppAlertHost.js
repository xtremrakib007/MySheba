import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { useApp } from '../context/AppContext';
import { _registerAlertHandler, _unregisterAlertHandler } from '../utils/appAlert';
import AppModalHeader from './AppModalHeader';

export default function AppAlertHost() {
  const { colors } = useTheme();
  const { screen, authUser } = useApp();
  const styles = createStyles(colors);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    const handler = (cfg) => setConfig(cfg);
    _registerAlertHandler(handler);
    return () => _unregisterAlertHandler(handler);
  }, []);

  // Login is a terminal screen when there is no authenticated user.
  // Prevent Android Back from reaching AppContext's generic home fallback.
  useEffect(() => {
    if (Platform.OS !== 'android' || screen !== 'login' || authUser) return undefined;
    const onBackPress = () => {
      BackHandler.exitApp();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [screen, authUser]);

  const close = useCallback(() => setConfig(null), []);
  if (!config) return null;

  const { title, message, options } = config;
  const buttons = config.buttons && config.buttons.length ? config.buttons : [{ text: 'OK' }];
  const cancelable = options?.cancelable !== false;
  const handlePress = (btn) => {
    close();
    if (btn.onPress) setTimeout(btn.onPress, 0);
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => { if (cancelable) close(); }}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => { if (cancelable) close(); }}
        />
        <View style={styles.card}>
          <AppModalHeader />
          <View style={styles.body}>
            {!!title && <Text style={styles.title}>{title}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}
          </View>
          <View style={[styles.actions, buttons.length > 2 && styles.actionsStacked]}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.btn, buttons.length > 2 && styles.btnStacked, isCancel && styles.btnCancel]}
                  onPress={() => handlePress(btn)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.btnText, isCancel && styles.btnTextCancel, isDestructive && styles.btnTextDestructive]}>
                    {btn.text ?? 'OK'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(11,36,71,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    card: { width: '100%', maxWidth: 340, backgroundColor: colors.card, borderRadius: radius.xl, overflow: 'hidden', shadowColor: '#0B2447', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
    title: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 6 },
    message: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 10, paddingVertical: 10, gap: 4 },
    actionsStacked: { flexDirection: 'column', alignItems: 'stretch' },
    btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md },
    btnStacked: { alignItems: 'center' },
    btnCancel: {},
    btnText: { fontSize: 14, fontWeight: '700', color: colors.secondary },
    btnTextCancel: { color: colors.textSecondary, fontWeight: '600' },
    btnTextDestructive: { color: colors.error },
  });
}
