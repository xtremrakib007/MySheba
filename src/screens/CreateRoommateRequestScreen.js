import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/appAlert';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as roommateService from '../firebase/roommateService';

export default function CreateRoommateRequestScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, openRoommateRequestDetail, authUser, profile } = useApp();

  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [moveInDate, setMoveInDate] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('1');
  const [preferences, setPreferences] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!location.trim()) return showAlert('MySheba', 'Please enter a preferred location.');
    if (!budget || Number(budget) <= 0) return showAlert('MySheba', 'Please enter a valid budget.');
    if (!authUser) return;

    setSubmitting(true);
    try {
      const requestId = await roommateService.createRoommateRequest(
        { uid: authUser.uid, name: profile?.name, role: profile?.role },
        { location, budget, moveInDate, numberOfPeople, preferences, description }
      );
      showAlert('MySheba', 'Your roommate request is live!');
      openRoommateRequestDetail(requestId);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not post your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find a Roommate</Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>Preferred Location</Text>
        <TextInput style={styles.input} placeholder="e.g. Kuala Lumpur, near LRT" value={location} onChangeText={setLocation} />

        <Text style={styles.label}>Budget (MYR / month)</Text>
        <TextInput style={styles.input} placeholder="0.00" value={budget} onChangeText={setBudget} keyboardType="decimal-pad" />

        <Text style={styles.label}>Move-in Date</Text>
        <TextInput style={styles.input} placeholder="e.g. 1 Sep 2026" value={moveInDate} onChangeText={setMoveInDate} />

        <Text style={styles.label}>Number of People</Text>
        <TextInput style={styles.input} placeholder="1" value={numberOfPeople} onChangeText={setNumberOfPeople} keyboardType="number-pad" />

        <Text style={styles.label}>Preferences</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. non-smoker, quiet, same gender"
          value={preferences}
          onChangeText={setPreferences}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Tell potential roommates a bit about yourself and what you're looking for"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={4}
        />

        <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.submitBtnText}>Post Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 40 },
    label: { fontSize: 12, fontWeight: '700', color: colors.navy, marginTop: 14, marginBottom: 6 },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.text },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    submitBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
    submitBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  });
}
