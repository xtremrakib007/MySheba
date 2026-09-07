import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import * as roommateService from '../firebase/roommateService';

function getStatusStyle(colors) {
  return {
    active: { label: 'Active', color: colors.success, bg: '#E8F5E9' },
    closed: { label: 'Filled', color: colors.textSecondary, bg: '#F1F3F4' },
    hidden: { label: 'Under Review', color: colors.error, bg: '#FDECEA' },
  };
}

export default function MyRoommateRequestsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const STATUS_STYLE = getStatusStyle(colors);
  const styles = createStyles(colors);
  const { goBackOrHome, openRoommateRequestDetail, authUser } = useApp();
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = roommateService.subscribeMyRoommateRequests(authUser.uid, (list) => {
      setMine(list);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser]);

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Requests</Text>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={mine}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const badge = STATUS_STYLE[item.status] || null;
            return (
              <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => openRoommateRequestDetail(item.id)}>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>📍 {item.location || 'Anywhere'}</Text>
                  <Text style={styles.cardMeta}>MYR {Number(item.budget || 0).toFixed(0)}/mo · {item.numberOfPeople} {item.numberOfPeople === 1 ? 'person' : 'people'}</Text>
                </View>
                {badge && (
                  <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize: 34, marginBottom: 8 }}>👥</Text>
              <Text style={styles.emptyText}>You haven't posted any roommate requests yet.</Text>
            </View>
          }
        />
      )}
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
    list: { padding: 16, paddingBottom: 30, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, paddingHorizontal: 30 },
    emptyText: { fontSize: 13, color: '#999', textAlign: 'center' },
    card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 12, marginBottom: 10, gap: 10 },
    cardBody: { flex: 1 },
    cardTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 3 },
    cardMeta: { fontSize: 12, fontWeight: '600', color: colors.primaryDark },
    badge: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: radius.sm },
    badgeText: { fontSize: 10, fontWeight: '700' },
  });
}
