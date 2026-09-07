import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import { subscribePayslips } from '../firebase/payslipService';
import { CURRENCY } from '../data/payslipConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * Payslip History (PRD section 22) - lists every generated payslip,
 * newest pay period first (subscribePayslips already orders by
 * payPeriod.year/month desc). Tapping a row opens PayslipDetailsScreen,
 * which owns View/Share/Print/Delete/Edit (PRD keeps those on the detail
 * screen rather than duplicating per-row action buttons here).
 */
export default function PayslipHistoryScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, openPayslipDetails, openCreatePayslip } = useApp();
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authUser) return undefined;
    const unsub = subscribePayslips(authUser.uid, (list) => {
      setPayslips(list);
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
        <Text style={styles.headerTitle}>Payslip History</Text>
      </LinearGradient>

      {loading ? (
        <View style={[styles.body, styles.center]}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : payslips.length === 0 ? (
        <View style={[styles.body, styles.center]}>
          <Text style={styles.emptyText}>No payslips created yet.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => openCreatePayslip()}>
            <Text style={styles.emptyBtnText}>Create Payslip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={payslips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => openPayslipDetails(item.id)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowMonth}>{MONTH_NAMES[item.payPeriod.month - 1]} {item.payPeriod.year}</Text>
                <Text style={styles.rowDetail}>{item.employee?.name || 'Unnamed employee'}</Text>
                <Text style={styles.rowNet}>Net Salary {money(item.netSalary)}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
    emptyBtn: { backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: radius.md },
    emptyBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
    list: { padding: 16, paddingBottom: 40 },
    row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8E8E8' },
    rowMonth: { fontSize: 14, fontWeight: '700', color: colors.navy },
    rowDetail: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    rowNet: { fontSize: 12, color: colors.primary, fontWeight: '600', marginTop: 2 },
    chevron: { fontSize: 18, color: colors.textSecondary },
  });
}
