import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Print from 'expo-print';
import { countries } from '../data/countries';
import { useTheme } from '../theme/ThemeContext';

const COMPANY_NAME = 'SatuLink Solutions Sdn Bhd (1641555-U)';
const COMPANY_ADDRESS = 'Address: To be set';
const POWERED_BY = 'Powered by OTR';
const LOGO_URL = 'https://mysheba.top/assets/images/logo.png';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function value(value, fallback = '—') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function money(number, currency = 'MYR') {
  const n = Number(number || 0);
  return `${n.toFixed(2)} [${currency}]`;
}

function dateText(createdAt) {
  if (!createdAt) return '—';
  try {
    return new Date(createdAt).toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return '—';
  }
}

function Field({ label, fieldValue, large = false }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.fieldValue, large && styles.largeValue]}>{value(fieldValue)}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SideBox({ label, fieldValue, emphasis = false }) {
  return (
    <View style={styles.sideBox}>
      <Text style={styles.sideLabel}>{label}</Text>
      <Text style={[styles.sideValue, emphasis && styles.sideEmphasis]}>{value(fieldValue)}</Text>
    </View>
  );
}

export function buildRemittanceReceiptHtml(serviceData = {}, meta = {}) {
  const country = countries.find((c) => c.code === serviceData.country);
  const destination = country?.name || value(serviceData.country);
  const curr = country?.curr || serviceData.currency || '';
  const sendAmt = Number(serviceData.sendAmt || 0);
  const fee = Number(serviceData.transferFee || 0);
  const total = sendAmt + fee;
  const rate = Number(serviceData.receivingRate || 0);
  const receive = sendAmt * rate;
  const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
  const method = ({ deposit: 'BANK DEPOSIT', cash: 'CASH PICKUP', ewallet: 'E-WALLET' })[serviceData.method] || value(serviceData.method);
  const payment = ({ ewallet: 'eWallet', fpx: 'FPX', debit: 'Debit Card', cash: 'Pay in Cash' })[serviceData.paymentMethod] || value(serviceData.paymentMethod);
  const gst = serviceData.gstAmount ?? serviceData.gst ?? '';
  const approvedBy = serviceData.approvedBy || meta.approvedBy || '';
  const operator = serviceData.operator || meta.operator || '';
  const serial = serviceData.serial || meta.serial || meta.txId || '';

  const row = (label, val, cls = '') => `<div class="row ${cls}"><span class="label">${esc(label)}</span><span class="val">${esc(value(val))}</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
  <style>
    *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:18px;background:#fff;color:#111;font-size:10px}
    .paper{border:1.5px solid #111;padding:9px;max-width:760px;margin:auto}.header{display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid #111;padding-bottom:6px}
    .logo{width:92px;height:44px;object-fit:contain}.brand{flex:1}.brand h1{font-size:15px;margin:1px 0 2px}.brand p{margin:0;font-size:9px}.copy{width:125px}.copy b{font-size:13px;text-decoration:underline}.copy span{display:block;font-size:12px;margin-top:4px}
    .columns{display:grid;grid-template-columns:1fr 190px;gap:10px;margin-top:8px}.section{border:1px solid #111;margin-bottom:9px}.section-title{font-weight:700;padding:5px;background:#f7f7f7;border-bottom:1px solid #111;font-size:11px}.section-body{padding:5px}.grid3{display:grid;grid-template-columns:1fr 1fr 1fr}.cell{padding:3px 4px;min-height:27px}.cell .label{font-weight:700;display:inline-block;margin-right:5px}.cell .val{display:inline}.side{border:1px solid #111}.side .row{border-bottom:1px solid #555;padding:6px 6px}.side .row:last-child{border-bottom:0}.side .label{font-weight:700;display:block;margin-bottom:2px}.side .val{font-size:11px}.side .big .val{font-size:16px;font-weight:700}.terms{border:1px solid #111;padding:6px;font-size:8px;line-height:1.35}.sign{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;border:1px solid #111;border-top:0;padding:9px 6px 4px;font-weight:700;font-size:11px}.line{border-top:1px dotted #111;margin-top:17px}.powered{text-align:right;font-size:8px;margin-top:5px;color:#555}
    @media print{body{padding:0}.paper{border:1px solid #111}}
  </style></head><body><div class="paper">
    <div class="header"><img class="logo" src="${LOGO_URL}"/><div class="brand"><h1>MySheba — ${esc(COMPANY_NAME)}</h1><p>${esc(COMPANY_ADDRESS)}</p></div><div class="copy"><b>Customer Copy</b><span>To Send Form</span></div></div>
    <div class="columns"><div>
      <div class="section"><div class="section-title">SENDER INFORMATION</div><div class="section-body"><div class="grid3">
        <div class="cell">${row('Senders Name', serviceData.senderName)}</div><div class="cell">${row('Cust ID', serviceData.customerId || meta.customerId)}</div><div class="cell">${row('PASSPORT', serviceData.senderPassportNo)}</div>
        <div class="cell">${row('Place of Issue', serviceData.senderPassportPlaceOfIssue || serviceData.passportPlaceOfIssue)}</div><div class="cell">${row('Expire Date', serviceData.senderPassportExpiry)}</div><div class="cell">${row('Issue Date', serviceData.senderPassportIssueDate)}</div>
        <div class="cell">${row('Address', serviceData.senderAddress)}</div><div class="cell">${row('Mobile No.', serviceData.senderPhone)}</div><div class="cell">${row('Date of Birth', serviceData.senderDateOfBirth)}</div>
        <div class="cell">${row('Name of Employer', serviceData.senderEmployer || serviceData.senderCompany)}</div><div class="cell">${row('Gender', serviceData.senderGender)}</div><div class="cell">${row('Occupation', serviceData.senderOccupation)}</div>
        <div class="cell">${row('Source of funds', serviceData.senderSourceOfFunds)}</div><div class="cell">${row('Nationality', serviceData.senderNationality)}</div><div class="cell">${row('Purpose', serviceData.senderPurpose)}</div>
        <div class="cell">${row('Relation', serviceData.receiverRelationship)}</div><div class="cell">${row('Passport Photo', serviceData.passportUrl ? 'Attached' : '')}</div><div class="cell">${row('Status', meta.status || 'PROCESSING')}</div>
      </div></div></div>
      <div class="section"><div class="section-title">RECEIVER INFORMATION</div><div class="section-body"><div class="grid3">
        <div class="cell">${row('Payout Country', `${destination} - ${method}`)}</div><div class="cell">${row('Mobile No', serviceData.receiverPhone)}</div><div class="cell">${row("Receiver's Name", receiverName)}</div>
        <div class="cell">${row('Address', serviceData.receiverAddress)}</div><div class="cell">${row('Bank Name', serviceData.receiverBankName || serviceData.receiverWalletProvider)}</div><div class="cell">${row('Branch', serviceData.receiverBranch)}</div>
        <div class="cell">${row('Bank Account No', serviceData.receiverAccountNumber || serviceData.receiverWalletNumber)}</div><div class="cell">${row('Routing No.', serviceData.receiverRoutingNumber)}</div><div class="cell">${row('Place of Issue', serviceData.receiverPlaceOfIssue)}</div>
        <div class="cell">${row('ID Type', serviceData.receiverIdType)}</div><div class="cell">${row('ID Number', serviceData.receiverIdNumber)}</div><div class="cell">${row('Pickup City', serviceData.receiverPickupCity)}</div>
      </div></div></div>
    </div><div class="side">
      ${row('GST Registration ID', serviceData.gstRegistrationId || meta.gstRegistrationId)}
      ${row('PINNO / REF', meta.txId)}
      ${row('Approved By', approvedBy)}
      ${row('Date / Time', dateText(meta.createdAt))}
      ${row('Collected Amount', money(total, 'MYR'))}
      ${row('Service Charge', money(fee, 'MYR'))}
      ${row('GST', gst === '' ? '' : money(gst, 'MYR'))}
      ${row('Transfer Amount', money(sendAmt, 'MYR'), 'big')}
      ${row(`1 MYR =`, `${rate || '—'} [${curr || '—'}]`)}
      ${row('Receive Amount', money(receive, curr || 'BDT'), 'big')}
      ${row('Serial', serial)}
      ${row('Payout / Payment', `${method} / ${payment}`)}
    </div></div>
    <div class="terms">THE TERMS AND CONDITIONS GOVERNING THE MONEY TRANSFER SERVICE ARE DISPLAYED AT MySheba / SatuLink Solutions Sdn Bhd. BY SIGNING THIS FORM YOU ARE AGREEING TO THOSE TERMS AND CONDITIONS.</div>
    <div class="sign"><div>Customer's Signature<div class="line"></div></div><div>Operator: ${esc(value(operator))}<div class="line"></div></div><div>Customer Copy<div class="line"></div></div></div>
    <div class="powered">${esc(POWERED_BY)}</div>
  </div></body></html>`;
}

export default function RemittanceReceipt({ serviceData = {}, txId = '', createdAt = null, status = 'PROCESSING', onClose }) {
  const { colors } = useTheme();
  const [printing, setPrinting] = useState(false);
  const country = countries.find((c) => c.code === serviceData.country);
  const destination = country?.name || value(serviceData.country);
  const curr = country?.curr || serviceData.currency || '—';
  const sendAmt = Number(serviceData.sendAmt || 0);
  const fee = Number(serviceData.transferFee || 0);
  const total = sendAmt + fee;
  const rate = Number(serviceData.receivingRate || 0);
  const receive = sendAmt * rate;
  const receiverName = `${serviceData.receiverFirstName || ''} ${serviceData.receiverLastName || ''}`.trim();
  const methodLabel = ({ deposit: 'Bank Deposit', cash: 'Cash Pickup', ewallet: 'E-Wallet' })[serviceData.method] || value(serviceData.method);
  const paymentLabel = ({ ewallet: 'eWallet', fpx: 'FPX', debit: 'Debit Card', cash: 'Pay in Cash' })[serviceData.paymentMethod] || value(serviceData.paymentMethod);
  const date = useMemo(() => dateText(createdAt), [createdAt]);

  const printReceipt = async () => {
    setPrinting(true);
    try {
      const html = buildRemittanceReceiptHtml(serviceData, { txId, createdAt, status });
      await Print.printAsync({ html });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.paper} contentContainerStyle={styles.paperContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Image source={{ uri: LOGO_URL }} style={styles.logo} resizeMode="contain" />
          <View style={styles.brand}>
            <Text style={styles.company}>{COMPANY_NAME}</Text>
            <Text style={styles.address}>{COMPANY_ADDRESS}</Text>
          </View>
          <View style={styles.copy}><Text style={styles.copyTitle}>Customer Copy</Text><Text style={styles.copySub}>To Send Form</Text></View>
        </View>

        <View style={styles.columns}>
          <View style={styles.main}>
            <Section title="SENDER INFORMATION">
              <View style={styles.grid}>
                <Field label="Senders Name" fieldValue={serviceData.senderName} />
                <Field label="Cust ID" fieldValue={serviceData.customerId} />
                <Field label="PASSPORT" fieldValue={serviceData.senderPassportNo} />
                <Field label="Place of Issue" fieldValue={serviceData.senderPassportPlaceOfIssue || serviceData.passportPlaceOfIssue} />
                <Field label="Expire Date" fieldValue={serviceData.senderPassportExpiry} />
                <Field label="Issue Date" fieldValue={serviceData.senderPassportIssueDate} />
                <Field label="Address" fieldValue={serviceData.senderAddress} />
                <Field label="Mobile No." fieldValue={serviceData.senderPhone} />
                <Field label="Date of Birth" fieldValue={serviceData.senderDateOfBirth} />
                <Field label="Name of Employer" fieldValue={serviceData.senderEmployer || serviceData.senderCompany} />
                <Field label="Gender" fieldValue={serviceData.senderGender} />
                <Field label="Occupation" fieldValue={serviceData.senderOccupation} />
                <Field label="Source of funds" fieldValue={serviceData.senderSourceOfFunds} />
                <Field label="Nationality" fieldValue={serviceData.senderNationality} />
                <Field label="Purpose" fieldValue={serviceData.senderPurpose} />
                <Field label="Relation" fieldValue={serviceData.receiverRelationship} />
              </View>
            </Section>

            <Section title="RECEIVER INFORMATION">
              <View style={styles.grid}>
                <Field label="Payout Country" fieldValue={`${destination} - ${methodLabel}`} />
                <Field label="Mobile No" fieldValue={serviceData.receiverPhone} />
                <Field label="Receiver's Name" fieldValue={receiverName} />
                <Field label="Address" fieldValue={serviceData.receiverAddress} />
                <Field label="Bank Name" fieldValue={serviceData.receiverBankName || serviceData.receiverWalletProvider} />
                <Field label="Branch" fieldValue={serviceData.receiverBranch} />
                <Field label="Bank Account No" fieldValue={serviceData.receiverAccountNumber || serviceData.receiverWalletNumber} />
                <Field label="Routing No." fieldValue={serviceData.receiverRoutingNumber} />
                <Field label="Place of Issue" fieldValue={serviceData.receiverPlaceOfIssue} />
                <Field label="ID Type" fieldValue={serviceData.receiverIdType} />
                <Field label="ID Number" fieldValue={serviceData.receiverIdNumber} />
                <Field label="Pickup City" fieldValue={serviceData.receiverPickupCity} />
              </View>
            </Section>
          </View>

          <View style={styles.side}>
            <SideBox label="GST Registration ID" fieldValue={serviceData.gstRegistrationId} />
            <SideBox label="PINNO / REF" fieldValue={txId} emphasis />
            <SideBox label="Approved By" fieldValue={serviceData.approvedBy} />
            <SideBox label="Date / Time" fieldValue={date} />
            <SideBox label="Collected Amount" fieldValue={money(total, 'MYR')} />
            <SideBox label="Service Charge" fieldValue={money(fee, 'MYR')} />
            <SideBox label="GST" fieldValue={serviceData.gstAmount != null ? money(serviceData.gstAmount, 'MYR') : ''} />
            <SideBox label="Transfer Amount" fieldValue={money(sendAmt, 'MYR')} emphasis />
            <SideBox label="1 MYR =" fieldValue={`${rate || '—'} [${curr}]`} />
            <SideBox label="Receive Amount" fieldValue={money(receive, curr)} emphasis />
            <SideBox label="Serial" fieldValue={txId} />
            <SideBox label="Payout / Payment" fieldValue={`${methodLabel} / ${paymentLabel}`} />
          </View>
        </View>

        <View style={styles.terms}><Text style={styles.termsText}>THE TERMS AND CONDITIONS GOVERNING THE MONEY TRANSFER SERVICE ARE DISPLAYED AT MySheba / SatuLink Solutions Sdn Bhd. BY SIGNING THIS FORM YOU ARE AGREEING TO THOSE TERMS AND CONDITIONS.</Text></View>
        <View style={styles.signatures}>
          <View style={styles.sign}><Text style={styles.signTitle}>Customer's Signature</Text><View style={styles.line} /></View>
          <View style={styles.sign}><Text style={styles.signTitle}>Operator: {value(serviceData.operator)}</Text><View style={styles.line} /></View>
          <View style={styles.sign}><Text style={styles.signTitle}>Status: {value(status).toUpperCase()}</Text><View style={styles.line} /></View>
        </View>
        <Text style={styles.powered}>{POWERED_BY}</Text>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.button, { borderColor: colors.primary }]} onPress={printReceipt} disabled={printing}>
          {printing ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.buttonText, { color: colors.primary }]}>Print / Save PDF</Text>}
        </TouchableOpacity>
        {!!onClose && <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={onClose}><Text style={styles.closeText}>Close</Text></TouchableOpacity>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#eee' },
  paper: { flex: 1, backgroundColor: '#fff', margin: 10, borderWidth: 1.2, borderColor: '#111' },
  paperContent: { padding: 8, paddingBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#111', paddingBottom: 6, gap: 8 },
  logo: { width: 78, height: 42 },
  brand: { flex: 1, paddingTop: 1 },
  company: { fontSize: 14, fontWeight: '800' },
  address: { fontSize: 8, marginTop: 3 },
  copy: { width: 95 },
  copyTitle: { fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  copySub: { fontSize: 10, marginTop: 3 },
  columns: { flexDirection: 'row', gap: 7, marginTop: 7 },
  main: { flex: 1 },
  side: { width: 116, borderWidth: 1, borderColor: '#111' },
  section: { borderWidth: 1, borderColor: '#111', marginBottom: 7 },
  sectionTitle: { fontSize: 10, fontWeight: '800', padding: 4, borderBottomWidth: 1, borderBottomColor: '#111', backgroundColor: '#f5f5f5' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 3 },
  field: { width: '33.333%', minHeight: 32, paddingHorizontal: 3, paddingVertical: 2 },
  fieldLabel: { fontSize: 7.5, fontWeight: '800' },
  fieldValue: { fontSize: 8, marginTop: 2 },
  largeValue: { fontSize: 10, fontWeight: '800' },
  sideBox: { borderBottomWidth: 1, borderBottomColor: '#555', padding: 5 },
  sideLabel: { fontSize: 7.5, fontWeight: '800' },
  sideValue: { fontSize: 9, marginTop: 2 },
  sideEmphasis: { fontSize: 11, fontWeight: '800' },
  terms: { borderWidth: 1, borderColor: '#111', padding: 5 },
  termsText: { fontSize: 6.5, lineHeight: 9 },
  signatures: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#111', padding: 6, gap: 12 },
  sign: { flex: 1 },
  signTitle: { fontSize: 9, fontWeight: '800' },
  line: { borderTopWidth: 1, borderStyle: 'dotted', borderTopColor: '#111', marginTop: 18 },
  powered: { textAlign: 'right', fontSize: 7, color: '#555', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#ddd' },
  button: { flex: 1, minHeight: 44, borderWidth: 1.5, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  buttonText: { fontSize: 13, fontWeight: '800' },
  closeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
