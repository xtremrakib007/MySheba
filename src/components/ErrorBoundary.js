// Without this, an uncaught render error anywhere below just unmounts
// the tree and leaves a blank white screen with nothing in the UI to
// go on - LogBox only shows in dev, and even then it's easy to miss.
// This catches it, prints the full stack to the console (so `npx expo
// start` / device logs show exactly what threw and from where), and
// renders the message on-screen with a Try Again button that just
// resets the boundary (cheaper than a full app reload for state that's
// only broken on one screen).
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { colors, radius } from '../theme/theme';
import { logError } from '../firebase/logService';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.log('[ErrorBoundary] caught:', error?.message || error);
    if (info?.componentStack) console.log(info.componentStack);
    // Fire-and-forget - same errorLog collection the call-start error and
    // every other manual logError() call feeds, so a render crash shows up
    // on the Admin > Error Logs screen (superadmin-only) exactly like any
    // other client error, instead of only being visible in device logs.
    logError('ErrorBoundary', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>{String(this.state.error?.message || this.state.error)}</Text>
            {!!this.state.error?.stack && (
              <Text style={styles.stack} selectable>{this.state.error.stack}</Text>
            )}
            <TouchableOpacity style={styles.btn} onPress={() => this.setState({ error: null })}>
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, paddingTop: 60 },
  emoji: { fontSize: 40, marginBottom: 10 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 8 },
  message: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 14 },
  stack: { fontSize: 10, color: '#B00020', backgroundColor: '#FDECEA', padding: 10, borderRadius: radius.md, marginBottom: 16, width: '100%' },
  btn: { backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 24, borderRadius: radius.pill },
  btnText: { color: 'white', fontWeight: '700', fontSize: 13 },
});
