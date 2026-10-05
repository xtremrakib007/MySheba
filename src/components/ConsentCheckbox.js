import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { consentText, consentDetails } from '../utils/consentPolicy';

/**
 * The box somebody ticks before handing over personal data, and the full terms
 * behind it.
 *
 * One component rather than five, so every place that collects a document, an
 * IC number, a passport or a phone number asks the same way, in the same words,
 * from the one file the server validates against.
 *
 * "Read more" exists because agreeing to a sentence is not the same as being
 * able to find out what it means. The detail says what is collected, why, how
 * long it is kept, who sees it and what the person can do about it - and it is
 * reachable BEFORE the box is ticked, not buried in a policy page afterwards.
 *
 * The component only reports a tick. The agreement is recorded server-side when
 * the data is submitted, and refused there if missing, because a box in one
 * build of one app does not stop the callable behind it being called without
 * one.
 */
export default function ConsentCheckbox({ purpose, value, onChange, style }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const [showDetails, setShowDetails] = useState(false);
  const text = consentText(purpose);
  const details = consentDetails(purpose);
  if (!text) return null;

  return (
    <View style={style}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.tickTarget}
          onPress={() => onChange(!value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!value }}
          accessibilityLabel={text}
          activeOpacity={0.7}
        >
          <View style={[styles.box, !!value && styles.boxOn]}>
            {!!value && <Text style={styles.tick}>✓</Text>}
          </View>
        </TouchableOpacity>
        <View style={styles.textWrap}>
          <Text style={styles.text} onPress={() => onChange(!value)}>{text}</Text>
          {!!details && (
            <TouchableOpacity
              onPress={() => setShowDetails(true)}
              accessibilityRole="button"
              accessibilityLabel="Read the full terms"
            >
              <Text style={styles.readMore}>Read the full terms</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Modal visible={showDetails} animationType="slide" transparent onRequestClose={() => setShowDetails(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>What you are agreeing to</Text>
            <ScrollView style={styles.sheetScroll}>
              <Text style={styles.sheetSummary}>{text}</Text>
              <Text style={styles.sheetBody}>{details}</Text>
            </ScrollView>
            <View style={styles.sheetActions}>
              {/* Closing is not accepting. Somebody who reads this and is not
                  persuaded must be able to leave without having agreed. */}
              <TouchableOpacity style={styles.close} onPress={() => setShowDetails(false)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
              {!value && (
                <TouchableOpacity
                  style={styles.accept}
                  onPress={() => { onChange(true); setShowDetails(false); }}
                >
                  <Text style={styles.acceptText}>I agree</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  tickTarget: { paddingTop: 1 },
  box: {
    width: 22, height: 22, borderRadius: 5, borderWidth: 2,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  textWrap: { flex: 1 },
  text: { color: colors.text, fontSize: 12, lineHeight: 17 },
  readMore: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18, maxHeight: '80%' },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 10 },
  sheetScroll: { marginBottom: 14 },
  sheetSummary: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '600', marginBottom: 12 },
  sheetBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 20 },
  sheetActions: { flexDirection: 'row', gap: 10 },
  close: { flex: 1, padding: 13, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  closeText: { color: colors.text, fontWeight: '700' },
  accept: { flex: 1, padding: 13, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center' },
  acceptText: { color: '#fff', fontWeight: '700' },
});
