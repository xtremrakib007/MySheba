import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';
import { PRE_AUTH_SCREENS } from '../utils/preAuthScreens';

// Shown once per fresh sign-in after the authentication/onboarding flow has
// reached a real home screen. Pre-auth screens intentionally hide the modal.
export default function BiometricOptInPrompt() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const { screen, showBiometricPrompt, dismissBiometricPrompt } = useApp();
  const [busy, setBusy] = useState(false);

  // The shared list - this one used to be its own, and the two disagreed.
  if (!showBiometricPrompt || PRE_AUTH_SCREENS.includes(screen)) return null;

  const onEnable = async () => {
    setBusy(true);
    try { await dismissBiometricPrompt(true); }
    finally { setBusy(false); }
  };

  const onNotNow = async () => {
    setBusy(true);
    try { await dismissBiometricPrompt(false); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={showBiometricPrompt} animationType="fade" transparent onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.icon}>👆</Text>
          <Text style={styles.title}>Enable Fingerprint / Face Unlock?</Text>
          <Text style={styles.subtitle}>Unlock MySheba faster next time using your fingerprint or face, instead of typing your PIN every time.</Text>
          <TouchableOpacity style={styles.enableBtn} onPress={onEnable} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={styles.enableText}>Enable</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.notNowBtn} onPress={onNotNow} disabled={busy}><Text style={styles.notNowText}>Not Now</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.5)',alignItems:'center',justifyContent:'center',padding:24},
    card:{width:'100%',maxWidth:360,backgroundColor:colors.bg,borderRadius:radius.lg,padding:24,alignItems:'center'},
    icon:{fontSize:36,marginBottom:10},title:{fontSize:17,fontWeight:'700',color:colors.text,marginBottom:8,textAlign:'center'},
    subtitle:{fontSize:13,color:colors.textSecondary,textAlign:'center',marginBottom:20,lineHeight:18},
    enableBtn:{width:'100%',backgroundColor:colors.primary,borderRadius:radius.md,paddingVertical:13,alignItems:'center'},enableText:{color:'white',fontWeight:'700',fontSize:15},
    notNowBtn:{marginTop:14,paddingVertical:8},notNowText:{color:colors.textSecondary,fontSize:13,fontWeight:'600'},
  });
}
