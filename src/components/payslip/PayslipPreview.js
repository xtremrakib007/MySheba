import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius } from '../../theme/theme';
import { useTheme } from "../../theme/ThemeContext";
import { GENERATED_BY_NOTICE, USER_GENERATED_DISCLAIMER } from '../../data/payslipConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function money(currency, n) {
  return `${currency} ${(Number(n) || 0).toFixed(2)}`;
}

/**
 * On-screen mirror of the generated PDF (PRD section 13's example
 * structure) - shown before generating so the user can catch a typo
 * without spending a PDF render on it. Reads the same Payslip shape the
 * PDF/Firestore layers use, so nothing here is computed independently.
 */
export default function PayslipPreview({ payslip }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const { employer, employee, payPeriod, paymentDate, earnings, deductions, grossSalary, totalDeductions, netSalary, currency } = payslip;
  const monthLabel = payPeriod?.month ? `${MONTH_NAMES[payPeriod.month - 1]} ${payPeriod.year}` : '-';

  return (
    <View style={styles.card}>
      <Text style={styles.brand}>MYSHEBA</Text>
      <Text style={styles.brandSub}>PAYSLIP</Text>

      {!!employer?.name && (
        <View style={styles.companyBlock}>
          <Text style={styles.companyName}>{employer.name}</Text>
          {!!employer.address && <Text style={styles.companyAddr}>{employer.address}</Text>}
        </View>
      )}

      <View style={styles.divider} />

      <MetaRow label="Employee" value={employee?.name || '-'} />
      {!!employee?.employeeId && <MetaRow label="Employee ID" value={employee.employeeId} />}
      {!!employee?.position && <MetaRow label="Position" value={employee.position} />}
      <MetaRow label="Pay Period" value={monthLabel} />
      {!!paymentDate && <MetaRow label="Payment Date" value={paymentDate} />}
      {!!employee?.includeBankAccount && !!employee?.bankAccount && <MetaRow label="Bank Account" value={employee.bankAccount} />}

      <View style={styles.divider} />

      <Text style={styles.section}>Earnings</Text>
      {(earnings || []).length === 0 ? (
        <Text style={styles.muted}>No earnings added yet.</Text>
      ) : (
        earnings.map((e, i) => <ItemRow key={i} label={e.description} value={money(currency, e.amount)} />)
      )}
      <TotalRow label="Gross Salary" value={money(currency, grossSalary)} />

      <Text style={styles.section}>Deductions</Text>
      {(deductions || []).length === 0 ? (
        <Text style={styles.muted}>No deductions added.</Text>
      ) : (
        deductions.map((d, i) => <ItemRow key={i} label={d.description} value={money(currency, d.amount)} />)
      )}
      <TotalRow label="Total Deductions" value={money(currency, totalDeductions)} />

      <View style={styles.netCard}>
        <Text style={styles.netLabel}>NET SALARY</Text>
        <Text style={styles.netValue}>{money(currency, netSalary)}</Text>
      </View>

      <View style={styles.noticeBlock}>
        <Text style={styles.noticeTitle}>{GENERATED_BY_NOTICE}</Text>
        <Text style={styles.noticeText}>{USER_GENERATED_DISCLAIMER}</Text>
      </View>
    </View>
  );
}

function MetaRow({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ItemRow({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.itemRow}>
      <Text style={styles.itemLabel}>{label}</Text>
      <Text style={styles.itemValue}>{value}</Text>
    </View>
  );
}

function TotalRow({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.totalRow}>
      <Text style={styles.totalLabel}>{label}</Text>
      <Text style={styles.totalValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, borderWidth: 1, borderColor: '#E8E8E8' },
    brand: { textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.primary, letterSpacing: 1 },
    brandSub: { textAlign: 'center', fontSize: 11, color: colors.textSecondary, letterSpacing: 2, marginTop: 2, marginBottom: 10 },
    companyBlock: { alignItems: 'center', marginBottom: 6 },
    companyName: { fontSize: 14, fontWeight: '700', color: colors.navy },
    companyAddr: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
    divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
    metaLabel: { fontSize: 11, color: colors.textSecondary },
    metaValue: { fontSize: 12, fontWeight: '600', color: colors.text },
    section: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 14, marginBottom: 6 },
    muted: { fontSize: 12, color: '#999', fontStyle: 'italic' },
    itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
    itemLabel: { fontSize: 12, color: colors.text },
    itemValue: { fontSize: 12, color: colors.text },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 2, borderTopColor: colors.navy },
    totalLabel: { fontSize: 13, fontWeight: '700', color: colors.navy },
    totalValue: { fontSize: 13, fontWeight: '700', color: colors.navy },
    netCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0F7FB', borderRadius: radius.md, padding: 14, marginTop: 16 },
    netLabel: { fontSize: 13, fontWeight: '700', color: colors.navy },
    netValue: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
    noticeBlock: { alignItems: 'center', marginTop: 20, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
    noticeTitle: { fontSize: 11, fontWeight: '700', color: colors.primary },
    noticeText: { fontSize: 9, color: '#999', textAlign: 'center', marginTop: 4, lineHeight: 14, paddingHorizontal: 10 },
  });
}
