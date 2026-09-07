import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Switch, Modal, FlatList } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { showAlert } from '../utils/appAlert';
import HeaderDecor from '../components/HeaderDecor';
import StepBar from '../components/StepBar';
import { FormLabel, FormInput, FormTextArea, DateField, PrimaryButton, OutlineButton } from '../components/ui';
import LineItemEditor from '../components/payslip/LineItemEditor';
import PayslipPreview from '../components/payslip/PayslipPreview';
import PayslipActionButtons from '../components/payslip/PayslipActionButtons';
import {
  PAYSLIP_TEMPLATES,
  PAYSLIP_TEMPLATE_LABELS,
  PAYSLIP_TEMPLATE_DESCRIPTIONS,
  SUGGESTED_EARNINGS,
  SUGGESTED_PAYSLIP_DEDUCTIONS,
  CURRENCY,
  emptyEmployer,
  emptyEmployee,
} from '../data/payslipConstants';
import { calculatePayslipTotals, validatePayslipDraft } from '../utils/payslipCalculationService';
import {
  createPayslip,
  updatePayslip,
  getPayslip,
  listPayslips,
  findPayslipForPeriod,
  getDefaultEmployer,
  saveDefaultEmployer,
  attachFileReference,
  markSavedToSalaryHistory,
} from '../firebase/payslipService';
import { generatePayslipPdf, sharePayslipPdf, printPayslipPdf } from '../utils/payslipPdfService';
import { listSalaryHistory, attachPayslip as attachPayslipToSalaryRecord, recordId as buildSalaryRecordId } from '../firebase/salaryRecordService';
import { createDocument, replaceDocumentFiles } from '../firebase/documentService';
import { uploadDocumentFile, deleteFile } from '../firebase/documentStorageService';
import { DOCUMENT_TYPES } from '../data/documentConstants';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STEP_LABELS = ['Employer', 'Employee', 'Pay Period', 'Earnings', 'Deductions'];

function money(n) {
  return `${CURRENCY} ${(Number(n) || 0).toFixed(2)}`;
}

function todayYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Create Payslip (PRD sections 3-24). One screen driving a small
 * multi-step form, same "each step is a section, not a separate route"
 * spirit as SalarySettingsScreen/AddDocumentScreen, rather than a
 * separate screen per PRD section 33 sub-bullet - simpler to keep in
 * sync and matches how the rest of this app builds multi-field forms.
 *
 * Entry points (see AppContext.openCreatePayslip):
 *  - plain "Create Payslip" tap -> shows the New / Use Existing choice
 *  - "Use for Payslip" from a Salary History record -> skips the choice,
 *    pre-fills from that record (PRD section 19)
 *  - "Edit" from Payslip History/Details -> skips the choice, loads the
 *    existing payslip for editing (PRD section 23)
 */
export default function CreatePayslipScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, payslipSourceRecordId, editPayslipId, openPayslipDetails } = useApp();

  const [phase, setPhase] = useState(editPayslipId || payslipSourceRecordId ? 'form' : 'choose');
  const [step, setStep] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(!!editPayslipId);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [salaryHistory, setSalaryHistory] = useState([]);

  const [employer, setEmployer] = useState(emptyEmployer());
  const [employee, setEmployee] = useState(emptyEmployee());
  const [payPeriod, setPayPeriod] = useState({ ...todayYearMonth(), startDate: '', endDate: '' });
  const [paymentDate, setPaymentDate] = useState('');
  const [earnings, setEarnings] = useState([{ description: 'Basic Salary', amount: '' }]);
  const [deductions, setDeductions] = useState([]);
  const [template, setTemplate] = useState(PAYSLIP_TEMPLATES.STANDARD);
  const [sourceSalaryRecordId, setSourceSalaryRecordId] = useState(payslipSourceRecordId || null);

  const [saving, setSaving] = useState(false);
  const [savedPayslipId, setSavedPayslipId] = useState(null);
  const [pdfFile, setPdfFile] = useState(null); // { uri, fileName }
  const [savedToDocuments, setSavedToDocuments] = useState(false);
  const [fileReference, setFileReference] = useState(null); // { documentId, url, storagePath }
  const [savedToHistory, setSavedToHistory] = useState(false);

  // ---- load defaults / existing data ----
  useEffect(() => {
    if (!authUser) return;
    if (editPayslipId) {
      getPayslip(authUser.uid, editPayslipId).then((p) => {
        if (p) {
          setEmployer({ ...emptyEmployer(), ...p.employer });
          setEmployee({ ...emptyEmployee(), ...p.employee });
          setPayPeriod({ startDate: '', endDate: '', ...p.payPeriod });
          setPaymentDate(p.paymentDate || '');
          setEarnings(p.earnings.length ? p.earnings : [{ description: 'Basic Salary', amount: '' }]);
          setDeductions(p.deductions);
          setTemplate(p.template);
          setSourceSalaryRecordId(p.sourceSalaryRecordId);
          setSavedPayslipId(p.id);
          setSavedToDocuments(!!p.fileReference);
          setFileReference(p.fileReference || null);
          setSavedToHistory(!!p.savedToSalaryHistory);
        }
        setLoadingExisting(false);
      }).catch(() => setLoadingExisting(false));
    } else {
      getDefaultEmployer(authUser.uid).then((def) => {
        if (def) setEmployer({ ...emptyEmployer(), ...def, saveAsDefault: true });
      }).catch(() => {});
    }
  }, [authUser, editPayslipId]);

  // Pre-fill from an existing Salary & OT record (PRD section 19).
  useEffect(() => {
    if (!authUser || !payslipSourceRecordId || editPayslipId) return;
    listSalaryHistory(authUser.uid).then((records) => {
      const record = records.find((r) => r.id === payslipSourceRecordId);
      if (!record) return;
      setPayPeriod((prev) => ({ ...prev, year: record.year, month: record.month }));
      const imported = [{ description: 'Basic Salary', amount: String(record.basicPay || 0) }];
      // PRD section 9: "Clearly mark 'Estimated' when the OT amount
      // comes from the MySheba calculator" - record.otPay is exactly
      // that, so it's flagged right in the line item description
      // (visible in the editor, preview, and PDF alike) rather than
      // silently presented as a confirmed figure.
      if (record.otPay) imported.push({ description: 'Overtime (Estimated)', amount: String(record.otPay) });
      if (record.allowances) imported.push({ description: 'Allowances', amount: String(record.allowances) });
      setEarnings(imported);
      if (record.deductions) setDeductions([{ description: 'Deductions', amount: String(record.deductions) }]);
    }).catch(() => {});
  }, [authUser, payslipSourceRecordId, editPayslipId]);

  const totals = useMemo(() => calculatePayslipTotals(earnings, deductions), [earnings, deductions]);

  const draft = {
    employer,
    employee,
    payPeriod,
    paymentDate: paymentDate || null,
    earnings,
    deductions,
    template,
    currency: CURRENCY,
    sourceSalaryRecordId,
    ...totals,
  };

  // ---- "Use Existing Salary Record" picker (PRD section 4) ----
  const openPicker = async () => {
    if (!authUser) return;
    const records = await listSalaryHistory(authUser.uid).catch(() => []);
    setSalaryHistory(records);
    setPickerVisible(true);
  };

  const pickRecord = (record) => {
    setPickerVisible(false);
    setSourceSalaryRecordId(record.id);
    setPayPeriod((prev) => ({ ...prev, year: record.year, month: record.month }));
    const imported = [{ description: 'Basic Salary', amount: String(record.basicPay || 0) }];
    if (record.otPay) imported.push({ description: 'Overtime (Estimated)', amount: String(record.otPay) });
    if (record.allowances) imported.push({ description: 'Allowances', amount: String(record.allowances) });
    setEarnings(imported);
    if (record.deductions) setDeductions([{ description: 'Deductions', amount: String(record.deductions) }]);
    setPhase('form');
  };

  const startFresh = () => {
    setSourceSalaryRecordId(null);
    setPhase('form');
  };

  // ---- step navigation ----
  const goNextStep = () => {
    if (step < STEP_LABELS.length - 1) {
      setStep(step + 1);
    } else {
      goToPreview();
    }
  };
  const goPrevStep = () => {
    if (step > 0) setStep(step - 1);
    else if (!editPayslipId && !payslipSourceRecordId) setPhase('choose');
    else goBackOrHome();
  };

  const goToPreview = async () => {
    const errors = validatePayslipDraft({ employeeName: employee.name, payPeriod, earnings, deductions });
    if (errors.length) {
      showAlert('Check your entries', errors.join('\n'));
      return;
    }
    // PRD section 24 - duplicate handling.
    const existingList = await listPayslips(authUser.uid).catch(() => []);
    const duplicate = findPayslipForPeriod(existingList, employee.name, payPeriod.year, payPeriod.month, savedPayslipId);
    if (duplicate) {
      showAlert('A payslip already exists for this period.', `${employee.name} - ${MONTH_NAMES[payPeriod.month - 1]} ${payPeriod.year}`, [
        { text: 'Edit Existing', onPress: () => openPayslipDetails(duplicate.id) },
        { text: 'Continue Anyway', onPress: () => setPhase('preview') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setPhase('preview');
  };

  // ---- generate ----
  const handleGenerate = async () => {
    if (!authUser) return;
    setSaving(true);
    try {
      if (employer.saveAsDefault) {
        // Strip saveAsDefault before persisting - it's a UI-only checkbox
        // flag, not part of the employer profile itself. Spreading
        // `{ ...employer, saveAsDefault: undefined }` looks like it removes
        // the key but doesn't - it keeps the key with a literal `undefined`
        // value, and Firestore's setDoc() rejects any field that's
        // `undefined` outright ("Unsupported field value: undefined").
        // Destructuring it out of the object actually omits the key.
        const { saveAsDefault: _saveAsDefault, ...employerToSave } = employer;
        await saveDefaultEmployer(authUser.uid, employerToSave);
      }
      let id = savedPayslipId;
      if (editPayslipId || savedPayslipId) {
        id = savedPayslipId || editPayslipId;
        await updatePayslip(authUser.uid, id, draft);
      } else {
        id = await createPayslip(authUser.uid, draft);
      }
      setSavedPayslipId(id);

      const file = await generatePayslipPdf({ ...draft, id });
      setPdfFile(file);
      // A freshly generated PDF hasn't been saved yet, even if an older
      // version of this payslip was previously saved to My Documents -
      // re-enable Save so handleSaveToDocuments can update that record
      // with the new file rather than leaving a stale one linked.
      setSavedToDocuments(false);
      setPhase('done');
    } catch (err) {
      showAlert('Could not generate payslip', err.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    try {
      await sharePayslipPdf(pdfFile.uri);
    } catch (err) {
      showAlert('MySheba', err.message);
    }
  };

  const handlePrint = async () => {
    try {
      await printPayslipPdf(pdfFile.uri);
    } catch (err) {
      showAlert('MySheba', err.message);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!authUser || !pdfFile) return;
    try {
      const info = await FileSystem.getInfoAsync(pdfFile.uri).catch(() => null);
      // Guard against uploading a missing or empty PDF. Previously `info`
      // was fetched but never checked, so if generatePayslipPdf produced
      // a uri that didn't exist (or a 0-byte file - e.g. generation was
      // interrupted), uploadDocumentFile's fetch(uri) would still resolve
      // (a 0-byte local file fetches fine, it just has no content), and a
      // real-but-empty file would upload to Storage with no error at any
      // step. The result was a legitimate, reachable download URL that
      // resolves to nothing renderable - "Saved to My Documents" fires,
      // but DocumentViewerScreen's WebView shows a blank gray page for
      // it, with no error surfaced anywhere to explain why.
      if (!info || !info.exists || !info.size) {
        showAlert('Could not save', "The generated PDF couldn't be found or is empty. Please tap Generate Payslip again before saving.");
        return;
      }
      // Reuse the same My Documents record's storage folder on a
      // regenerate-and-resave, instead of a fresh temp id every time -
      // needed so the branch below can update that same record in place.
      const documentId = fileReference?.documentId || `tmp-${Date.now()}`;
      const uploaded = await uploadDocumentFile(authUser.uid, documentId, {
        uri: pdfFile.uri,
        type: 'application/pdf',
        size: info.size,
        name: pdfFile.fileName,
      });
      const notes = `Generated payslip for ${MONTH_NAMES[payPeriod.month - 1]} ${payPeriod.year}`;

      let resolvedDocumentId = documentId;
      if (fileReference?.documentId) {
        // PRD section 23 - regenerating should update the existing My
        // Documents record, not create a duplicate one.
        await replaceDocumentFiles(fileReference.documentId, [uploaded], { documentName: pdfFile.fileName, notes });
        if (fileReference.storagePath) {
          await deleteFile(fileReference.storagePath).catch(() => {
            // Old file may already be gone - not worth failing the save over.
          });
        }
      } else {
        resolvedDocumentId = await createDocument(authUser.uid, {
          documentType: DOCUMENT_TYPES.PAYSLIP,
          documentName: pdfFile.fileName,
          notes,
        }, [uploaded]);
      }

      const nextFileReference = { documentId: resolvedDocumentId, url: uploaded.url, storagePath: uploaded.storagePath };
      await attachFileReference(authUser.uid, savedPayslipId, nextFileReference);
      setFileReference(nextFileReference);
      setSavedToDocuments(true);
      showAlert('Saved', 'This payslip has been saved to My Documents.');
    } catch (err) {
      showAlert('Could not save', err.message || 'Please try again.');
    }
  };

  const handleSaveToSalaryHistory = async () => {
    if (!authUser) return;
    try {
      const id = sourceSalaryRecordId || buildSalaryRecordId(payPeriod.year, payPeriod.month);
      if (pdfFile) {
        await attachPayslipToSalaryRecord(authUser.uid, id, { fileName: pdfFile.fileName, netSalary: totals.netSalary });
      }
      await markSavedToSalaryHistory(authUser.uid, savedPayslipId);
      setSavedToHistory(true);
      showAlert('Saved', 'Linked to your Salary History for this month.');
    } catch (err) {
      showAlert('Could not save', err.message || 'Please try again.');
    }
  };

  if (loadingExisting) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={phase === 'form' ? goPrevStep : goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editPayslipId ? 'Edit Payslip' : 'Create Payslip'}</Text>
      </LinearGradient>

      {phase === 'choose' && (
        <View style={styles.body}>
          <Text style={styles.chooseTitle}>Create Payslip</Text>
          <Text style={styles.chooseSubtitle}>Create a salary record and generate a PDF payslip.</Text>
          <PrimaryButton label="Create New Payslip" onPress={startFresh} style={{ marginBottom: 12 }} />
          <OutlineButton label="Use Existing Salary Record" onPress={openPicker} />
        </View>
      )}

      {phase === 'form' && (
        <>
          <StepBar totalSteps={STEP_LABELS.length} currentStep={step} />
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.stepLabel}>{STEP_LABELS[step]}</Text>

            {step === 0 && (
              <View>
                <FormLabel>Company Name</FormLabel>
                <FormInput placeholder="e.g. ABC Company Sdn Bhd" value={employer.name} onChangeText={(v) => setEmployer({ ...employer, name: v })} />
                <FormLabel>Company Registration Number (optional)</FormLabel>
                <FormInput placeholder="Registration No." value={employer.registrationNumber} onChangeText={(v) => setEmployer({ ...employer, registrationNumber: v })} />
                <FormLabel>Company Address</FormLabel>
                <FormTextArea placeholder="Company address" value={employer.address} onChangeText={(v) => setEmployer({ ...employer, address: v })} />
                <FormLabel>Phone Number (optional)</FormLabel>
                <FormInput placeholder="Phone number" keyboardType="phone-pad" value={employer.phone} onChangeText={(v) => setEmployer({ ...employer, phone: v })} />
                <FormLabel>Email (optional)</FormLabel>
                <FormInput placeholder="Email" keyboardType="email-address" autoCapitalize="none" value={employer.email} onChangeText={(v) => setEmployer({ ...employer, email: v })} />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Save as Default Employer</Text>
                  <Switch value={employer.saveAsDefault} onValueChange={(v) => setEmployer({ ...employer, saveAsDefault: v })} trackColor={{ true: colors.primary }} />
                </View>
              </View>
            )}

            {step === 1 && (
              <View>
                <FormLabel>Employee Name</FormLabel>
                <FormInput placeholder="Full name" value={employee.name} onChangeText={(v) => setEmployee({ ...employee, name: v })} />
                <FormLabel>Employee ID (optional)</FormLabel>
                <FormInput placeholder="Employee ID" value={employee.employeeId} onChangeText={(v) => setEmployee({ ...employee, employeeId: v })} />
                <FormLabel>Position / Job Title</FormLabel>
                <FormInput placeholder="e.g. Factory Worker" value={employee.position} onChangeText={(v) => setEmployee({ ...employee, position: v })} />
                <FormLabel>Department (optional)</FormLabel>
                <FormInput placeholder="Department" value={employee.department} onChangeText={(v) => setEmployee({ ...employee, department: v })} />
                <FormLabel>Nationality (optional)</FormLabel>
                <FormInput placeholder="Nationality" value={employee.nationality} onChangeText={(v) => setEmployee({ ...employee, nationality: v })} />
                <FormLabel>Bank Account (optional)</FormLabel>
                <FormInput placeholder="Bank account number" value={employee.bankAccount} onChangeText={(v) => setEmployee({ ...employee, bankAccount: v })} />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Show bank account on payslip</Text>
                  <Switch value={employee.includeBankAccount} onValueChange={(v) => setEmployee({ ...employee, includeBankAccount: v })} trackColor={{ true: colors.primary }} />
                </View>
              </View>
            )}

            {step === 2 && (
              <View>
                <FormLabel>Pay Month</FormLabel>
                <View style={styles.monthGrid}>
                  {MONTH_NAMES.map((m, i) => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.monthChip, payPeriod.month === i + 1 && styles.monthChipActive]}
                      onPress={() => setPayPeriod({ ...payPeriod, month: i + 1 })}
                    >
                      <Text style={[styles.monthChipText, payPeriod.month === i + 1 && styles.monthChipTextActive]}>{m.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <FormLabel>Pay Year</FormLabel>
                <FormInput
                  placeholder="Year"
                  keyboardType="number-pad"
                  value={String(payPeriod.year)}
                  onChangeText={(v) => setPayPeriod({ ...payPeriod, year: Number(v) || payPeriod.year })}
                />
                <FormLabel>Pay Period Start Date (optional)</FormLabel>
                <DateField placeholder="Start date" value={payPeriod.startDate} onChange={(v) => setPayPeriod({ ...payPeriod, startDate: v })} />
                <FormLabel>Pay Period End Date (optional)</FormLabel>
                <DateField placeholder="End date" value={payPeriod.endDate} onChange={(v) => setPayPeriod({ ...payPeriod, endDate: v })} />
                <FormLabel>Payment Date (optional)</FormLabel>
                <DateField placeholder="Payment date" value={paymentDate} onChange={setPaymentDate} />
              </View>
            )}

            {step === 3 && (
              <LineItemEditor items={earnings} onChange={setEarnings} suggestions={SUGGESTED_EARNINGS} addLabel="+ Add Earnings" />
            )}

            {step === 4 && (
              <LineItemEditor items={deductions} onChange={setDeductions} suggestions={SUGGESTED_PAYSLIP_DEDUCTIONS} addLabel="+ Add Deduction" />
            )}

            <View style={styles.liveTotals}>
              <TotalLine label="Gross Salary" value={money(totals.grossSalary)} />
              <TotalLine label="Total Deductions" value={money(totals.totalDeductions)} />
              <TotalLine label="Net Salary" value={money(totals.netSalary)} bold />
            </View>

            <PrimaryButton label={step === STEP_LABELS.length - 1 ? 'Preview Payslip' : 'Next'} onPress={goNextStep} style={{ marginTop: 20 }} />
          </ScrollView>
        </>
      )}

      {phase === 'preview' && (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.stepLabel}>Choose a Template</Text>
          <View style={styles.templateRow}>
            {Object.values(PAYSLIP_TEMPLATES).map((t) => (
              <TouchableOpacity key={t} style={[styles.templateCard, template === t && styles.templateCardActive]} onPress={() => setTemplate(t)}>
                <Text style={[styles.templateName, template === t && styles.templateNameActive]}>{PAYSLIP_TEMPLATE_LABELS[t]}</Text>
                <Text style={styles.templateDesc}>{PAYSLIP_TEMPLATE_DESCRIPTIONS[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.stepLabel}>Preview</Text>
          <PayslipPreview payslip={draft} />

          <View style={styles.previewActions}>
            <OutlineButton label="Back to Edit" onPress={() => setPhase('form')} style={{ marginRight: 10 }} />
            <PrimaryButton label={saving ? 'Generating…' : 'Generate PDF'} onPress={handleGenerate} disabled={saving} />
          </View>
        </ScrollView>
      )}

      {phase === 'done' && (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.doneTitle}>Payslip Generated</Text>
          <PayslipPreview payslip={draft} />
          <PayslipActionButtons
            onOpen={handleShare}
            onShare={handleShare}
            onPrint={handlePrint}
            onSaveToDocuments={handleSaveToDocuments}
            savedToDocuments={savedToDocuments}
            onCreateAnother={() => {
              setPhase('choose');
              setStep(0);
              setSavedPayslipId(null);
              setPdfFile(null);
              setSavedToDocuments(false);
              setFileReference(null);
              setSavedToHistory(false);
              setEmployee(emptyEmployee());
              setEarnings([{ description: 'Basic Salary', amount: '' }]);
              setDeductions([]);
              setSourceSalaryRecordId(null);
            }}
          />
          <TouchableOpacity style={styles.historyLink} onPress={handleSaveToSalaryHistory} disabled={savedToHistory}>
            <Text style={styles.historyLinkText}>{savedToHistory ? '✓ Saved to Salary History' : 'Save to Salary History'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={pickerVisible} animationType="slide" transparent onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select a Month</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={salaryHistory}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<Text style={styles.modalEmpty}>No saved salary records yet.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.modalRow} onPress={() => pickRecord(item)}>
                  <Text style={styles.modalRowName}>{MONTH_NAMES[item.month - 1]} {item.year}</Text>
                  <Text style={styles.modalRowState}>{money(item.estimatedTakeHome)}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TotalLine({ label, value, bold }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.totalLine}>
      <Text style={[styles.totalLineLabel, bold && styles.totalLineBold]}>{label}</Text>
      <Text style={[styles.totalLineValue, bold && styles.totalLineBold]}>{value}</Text>
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
    chooseTitle: { fontSize: 18, fontWeight: '700', color: colors.navy, marginBottom: 6, marginTop: 20 },
    chooseSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 24 },
    stepLabel: { fontSize: 14, fontWeight: '700', color: colors.navy, marginBottom: 12 },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 10 },
    switchLabel: { fontSize: 13, color: colors.text, flex: 1, marginRight: 10 },
    monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    monthChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    monthChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    monthChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    monthChipTextActive: { color: 'white' },
    liveTotals: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginTop: 20, borderWidth: 1, borderColor: '#E8E8E8' },
    totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    totalLineLabel: { fontSize: 12, color: colors.textSecondary },
    totalLineValue: { fontSize: 12, color: colors.text },
    totalLineBold: { fontSize: 14, fontWeight: '700', color: colors.navy },
    templateRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    templateCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.border },
    templateCardActive: { borderColor: colors.primary, backgroundColor: '#F0F7FB' },
    templateName: { fontSize: 12, fontWeight: '700', color: colors.navy },
    templateNameActive: { color: colors.primaryDark },
    templateDesc: { fontSize: 10, color: colors.textSecondary, marginTop: 4 },
    previewActions: { flexDirection: 'row', marginTop: 20 },
    doneTitle: { fontSize: 18, fontWeight: '700', color: colors.navy, marginBottom: 14, textAlign: 'center' },
    historyLink: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
    historyLinkText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: 'white', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: '75%', paddingTop: 12 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 10 },
    modalTitle: { fontSize: 16, fontWeight: '700' },
    modalClose: { fontSize: 18, color: '#999', padding: 4 },
    modalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    modalRowName: { fontSize: 14, fontWeight: '500', color: colors.text },
    modalRowState: { fontSize: 12, color: '#999' },
    modalEmpty: { textAlign: 'center', color: '#999', paddingVertical: 30, fontSize: 13 },
  });
}
