import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from "../theme/ThemeContext";

// Shared pop-up header: MySheba logo + app name. Used at the top of every
// in-app dialog (AppAlertHost, ResultModal, PromptModal) so all pop-ups -
// alerts, confirmations, and prompts alike - carry consistent branding
// instead of a bare title.
export default function AppModalHeader() {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.header}>
      <Image
        source={require('../../assets/icon-transparent.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.brand}>MySheba</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    logo: { width: 26, height: 26 },
    brand: { fontSize: 15, fontWeight: '700', color: colors.navy },
  });
}
