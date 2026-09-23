import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';

// Compatibility guard: Google customer onboarding is no longer part of
// MySheba Finance. Any stale navigation into this route returns to login.
export default function GooglePhoneScreen() {
  const { colors } = useTheme();
  const { setScreen } = useApp();

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]}>
      <Text style={[styles.title, { color: colors.text }]}>Google Sign-In Unavailable</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>Google sign-in is no longer used in MySheba Finance. Please sign in with your phone number and password.</Text>
      <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={() => setScreen('login')} accessibilityRole="button">
        <Text style={styles.buttonText}>Go to Login</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  message: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});