import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import PayslipPreview from '../components/payslip/PayslipPreview';
import PayslipActionButtons from '../components/payslip/PayslipActionButtons';
import { getPayslip, deletePayslip } from '../firebase/payslipService';
import { generatePayslipPdf, sharePayslipPdf, printPayslipPdf } from '../utils/payslipPdfService';

/**
 * Payslip Details (PRD sections 22-24) - View / Share / Print / Delete /
 * Edit for one saved payslip. "Edit" routes back into
 * CreatePayslipScreen via AppContext.editPayslipId (PRD section 23);
 * this screen itself only regenerates the PDF on demand (from the
 * already-saved numbers) rather than duplicating the create form.
 */
export default function PayslipDetailsScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, activePayslipId, openEditPayslip, openPayslipHistory } = useApp();

  const [payslip, setPayslip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);

  useEffect(() => {
    if (!authUser || !activePayslipId) return;
    getPayslip(authUser.uid, activePayslipId).then((p) => {
      setPayslip(p);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [authUser, activePayslipId]);

  const ensurePdf = async () => {
    if (pdfFile) return pdfFile;
    setGenerating(true);
    try {
      const file = await generatePayslipPdf(payslip);
      setPdfFile(file);
      return file;
    } finally {
      setGenerating(false);
    }
  };

  const handleShare = async () => {
    try {
      const file = await ensurePdf();
      await sharePayslipPdf(file.uri);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not share this payslip.');
    }
  };

  const handlePrint = async () => {
    try {
      const file = await ensurePdf();
      await printPayslipPdf(file.uri);
    } catch (err) {
      showAlert('MySheba', err.message);
    }
  };

  const handleDelete = () => {
    showAlert('Delete Payslip', 'This will remove the payslip record. This does not delete a copy already saved to My Documents.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePayslip(authUser.uid, activePayslipId);
          openPayslipHistory();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!payslip) {
    return (
      <View style={styles.screen}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
          <HeaderDecor />
          <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
            <Text style={styles.backText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payslip</Text>
        </LinearGradient>
        <View style={[styles.body, styles.center]}>
          <Text style={styles.emptyText}>This payslip could not be found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payslip Details</Text>
        <TouchableOpacity style={styles.editBtn} onPress={() => openEditPayslip(activePayslipId)}>
          <Text style={styles.editIcon}>✎</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.body}>
        <PayslipPreview payslip={payslip} />

        {!!payslip.fileReference && <Text style={styles.savedNote}>✓ Saved to My Documents</Text>}
        {!!payslip.savedToSalaryHistory && <Text style={styles.savedNote}>✓ Linked to Salary History</Text>}

        <PayslipActionButtons
          onOpen={handleShare}
          onShare={handleShare}
          onPrint={handlePrint}
        />

        {!!generating && <ActivityIndicator style={{ marginTop: 12 }} color={colors.primary} />}

        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete Payslip</Text>
        </TouchableOpacity>
      </ScrollView>
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
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10, flex: 1 },
    editBtn: { padding: 4 },
    editIcon: { color: 'white', fontSize: 16 },
    body: { padding: 16, paddingBottom: 40, flexGrow: 1 },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    savedNote: { fontSize: 12, color: colors.success, fontWeight: '700', marginTop: 12 },
    deleteBtn: { marginTop: 24, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: 'center' },
    deleteBtnText: { color: colors.error, fontWeight: '700', fontSize: 13 },
  });
}
