import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Print from 'expo-print';
import { countries } from '../data/countries';
import { useTheme } from '../theme/ThemeContext';

const COMPANY_NAME = 'SatuLink Solutions Sdn Bhd (1641555-U)';
const COMPANY_ADDRESS = 'Address: To be set';
const POWERED_BY = 'Powered by OTR';
const LOGO_URL = 'https://mysheba.top/assets/images/logo.png';
const WEBSITE = 'www.mysheba.top';
const EMAIL = 'info@mysheba.top';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;');
const val = (v) => v == null || v === '' ? '-' : String(v);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v, c = 'MYR') => `${num(v).toFixed(2)} ${c || ''}`.trim();
const countryName = (code) => countries.find((x) => x.code === code)?.name || code || '';
const formatDate = (v) => { if (!v) return '-'; try { const d = v?.toDate ? v.toDate() : new Date(v); return Number.isNaN(d.getTime()) ? val(v) : d.toLocaleString(); } catch (_) { return val(v); } };

function getReceiptData(tx = {}, profile = {}, operator = '') {
  const raw = tx.raw || tx.serviceData || {};
  const country = countryName(raw.country || tx.country);
  const curr = raw.currency || raw.receiveCurrency || raw.curr || tx.receiveCurrency || '';
  const send = num(raw.sendAmt ?? tx.amount);
  const fee = num(raw.transferFee ?? raw.serviceCharge ?? tx.transferFee ?? tx.fee);
  const gst = num(raw.gst ?? tx.gst);
  // Customer collection is calculated from the transfer amount plus charges.
  const total = send + fee + gst;
  const rate = raw.receivingRate ?? tx.receivingRate ?? tx.exchangeRate ?? '';
  const receive = raw.receiveAmount ?? tx.receiveAmount ?? (num(rate) ? send * num(rate) : 0);
  const method = raw.method === 'deposit' ? 'BANK DEPOSIT' : raw.method === 'cash' ? 'CASH PICKUP' : raw.method === 'ewallet' ? 'EWALLET' : val(raw.method || tx.method);
  const receiver = `${raw.receiverFirstName || ''} ${raw.receiverLastName || ''}`.trim() || tx.receiverName || '';
  const sender = raw.senderName || tx.senderName || profile.name || profile.fullName || '';
  const txId = tx.txId || tx.id || tx.reference || raw.reference || '';
  const created = formatDate(tx.completedAt || tx.createdAt || tx.updatedAt || raw.createdAt);
  const approvedBy = tx.approvedByName || tx.approvedBy || '';
  const completedBy = tx.completedByName || operator || tx.operatorName || tx.operator || '';
  const approvedRole = tx.approvedByRole || '';
  const completedRole = tx.completedByRole || tx.claimedByRole || '';
  const approvedLabel = approvedBy ? `${approvedBy}${approvedRole ? ` (${approvedRole})` : ''}` : '-';
  const operatorLabel = completedBy ? `${completedBy}${completedRole ? ` (${completedRole})` : ''}` : '-';
  const pin = tx.pin || tx.pinNo || raw.pin || '';

  const senderRows = [
    ['Senders Name', sender], ['Cust ID', raw.customerId || profile.customerId || profile.custId || tx.customerId],
    ['PASSPORT', raw.senderPassportNo || tx.senderPassportNo], ['Place of Issue', raw.senderPassportIssuePlace || raw.passportPlaceOfIssue || raw.nationality],
    ['Expire Date', raw.senderPassportExpiry], ['Issue Date', raw.senderPassportIssueDate], ['Skilled labor', raw.skill || raw.skilledLabor],
    ['Address', raw.senderAddress], ['Mobile No.', raw.senderPhone || tx.senderPhone || profile.phone], ['Date of Birth', raw.senderDob || raw.dateOfBirth],
    ['Name of Employer', raw.employerName || raw.employer], ['Gender', raw.gender], ['Occupation', raw.occupation],
    ['Source of funds', raw.sourceOfFunds || raw.sourceFunds], ['Nationality', raw.nationality], ['Purpose', raw.purpose], ['Relation', raw.receiverRelationship],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  const receiverRows = [
    ['Payout Country', country], ['Mobile No', raw.receiverPhone || tx.receiverPhone], ["Receiver's Name", receiver],
    ['Address', raw.receiverAddress || raw.receiverCountry || country], ['Bank Name', raw.receiverBankName], ['Branch', raw.receiverBranch],
    ['Bank Account No', raw.receiverAccountNumber], ['Place of Issue', raw.receiverPlaceOfIssue], ['Routing Number', raw.receiverRoutingNumber],
    ['Pickup Network', raw.receiverPickupNetwork], ['Pickup City', raw.receiverPickupCity],
    ['Wallet Provider', raw.receiverWalletProvider], ['Wallet Number', raw.receiverWalletNumber], ['Payout Method', method],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');

  return { raw, country, curr, send, fee, gst, total, rate, receive, method, sender, receiver, txId, created, approvedLabel, operatorLabel, pin, senderRows, receiverRows };
}

export function buildReceiptHtml(tx = {}, profile = {}, operator = '') {
  const d = getReceiptData(tx, profile, operator);
  const rows = (rs) => rs.map(([label, value]) => `<div class="row"><span class="label">${esc(label)}</span><span class="value">${esc(val(value))}</span></div>`).join('');
  const top = `<div class="meta"><div><span>Date &amp; Time</span><b>${esc(d.created)}</b></div><div><span>Transaction ID</span><b>${esc(val(d.txId))}</b></div><div><span>PIN</span><b class="pin">${esc(val(d.pin))}</b></div></div>`;
  const summary = `<div class="summary"><h2>TRANSACTION SUMMARY</h2><div class="amountGrid"><div><span>Transfer Amount</span><b>${esc(money(d.send, 'MYR'))}</b></div><div><span>Service Charge</span><b>${esc(money(d.fee, 'MYR'))}</b></div><div><span>GST</span><b>${esc(money(d.gst, 'MYR'))}</b></div><div><span>Exchange Rate</span><b>1 MYR = ${esc(val(d.rate))} ${esc(d.curr)}</b></div><div><span>Receive Amount</span><b>${esc(money(d.receive, d.curr))}</b></div><div class="total"><span>Total Collected</span><b>${esc(money(d.total, 'MYR'))}</b></div></div><div class="staff"><div><span>Operator</span><b>${esc(d.operatorLabel)}</b></div><div><span>Approved By</span><b>${esc(d.approvedLabel)}</b></div></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
@page{size:A5 landscape;margin:5mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#123b72;margin:0;background:#fff;font-size:7.5px}.receipt{border:1px solid #b7d8f5;border-radius:5px;overflow:hidden;background:#fff}.header{height:35mm;background:linear-gradient(120deg,#0757b9,#087ee8);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:6mm 7mm;position:relative}.header:after{content:'';position:absolute;right:0;top:0;width:35%;height:100%;background:radial-gradient(circle at 90% 20%,rgba(255,255,255,.18),transparent 60%)}.brand{display:flex;align-items:center;gap:4mm;z-index:1}.logo{width:30mm;height:18mm;object-fit:contain}.brandName{font-size:17px;font-weight:800}.tagline{font-size:7px;margin-top:1mm}.title{text-align:right;z-index:1}.title b{font-size:14px}.title span{display:block;font-size:7px;margin-top:1.5mm}.body{padding:4mm 5mm}.complete{display:flex;align-items:center;gap:3mm;margin-bottom:3mm}.check{width:12mm;height:12mm;border-radius:50%;background:#18b58b;color:#fff;font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center}.complete h1{font-size:13px;color:#12a37c;margin:0}.complete p{font-size:7px;margin:1mm 0 0;color:#4e7098}.meta{margin-left:auto;display:flex;gap:8mm;align-items:center}.completeLine{display:flex;align-items:center;justify-content:space-between}.meta>div{border-left:1px solid #b7d8f5;padding-left:3mm;min-width:30mm}.meta span,.summary span,.staff span{display:block;color:#6683a6;font-size:6.5px;margin-bottom:1mm}.meta b{font-size:8px;color:#123b72}.meta .pin{color:#0a6dcc;font-size:10px}.columns{display:grid;grid-template-columns:1.05fr 1.05fr 1fr;gap:3mm}.card{border:1px solid #a9d3f4;border-radius:4px;overflow:hidden;min-height:65mm}.card h2,.summary h2{margin:0;padding:2.5mm 3mm;background:#eef7ff;color:#0764c8;font-size:9px}.cardBody{padding:2mm 3mm}.row{display:flex;padding:1.1mm 0;line-height:1.15}.label{width:38%;color:#5c7ba1}.value{width:62%;font-weight:600;color:#123f78}.subcard{background:#eef7ff;border-radius:3px;margin-top:2mm;padding:2mm}.subcard b{display:block;font-size:7px;color:#0764c8;margin-bottom:1mm}.summary{border:1px solid #a9d3f4;border-radius:4px;overflow:hidden}.amountGrid{padding:2mm 3mm;display:grid;grid-template-columns:1fr 1fr;gap:1.2mm 5mm}.amountGrid>div{display:flex;justify-content:space-between;border-bottom:1px solid #d7e9f8;padding:1mm 0}.amountGrid b{font-size:8px;color:#064d9f}.amountGrid .total{grid-column:1/3;background:#0873d5;color:#fff;border-radius:3px;padding:2mm 3mm;border:0;margin-top:1mm}.amountGrid .total span,.amountGrid .total b{color:#fff;font-size:8.5px}.staff{display:grid;grid-template-columns:1fr 1fr;margin:0 3mm 3mm;background:#f0f8ff;border-radius:3px}.staff>div{padding:2mm 3mm;border-right:1px solid #c7e1f5}.staff>div:last-child{border-right:0}.staff b{font-size:7.5px;color:#123f78}.footer{display:flex;align-items:center;justify-content:space-between;background:#eef8ff;padding:2.5mm 5mm;border-top:1px solid #c9e2f5}.qr{width:16mm;height:16mm;background:#fff;border:1px solid #c4dff5;display:flex;align-items:center;justify-content:center;font-size:7px;color:#123b72}.support b{font-size:8px;color:#0764c8}.support span{display:block;margin-top:1mm;font-size:6.5px;color:#456a95}.web{text-align:right}.web b{font-size:8px;color:#0764c8}.powered{font-size:5.5px;color:#718aa8;margin-top:1mm}.bottom{background:#0757b9;color:#fff;text-align:center;padding:2mm;font-size:7px;font-weight:700}
</style></head><body><div class="receipt"><div class="header"><div class="brand"><img class="logo" src="${esc(LOGO_URL)}"><div><div class="brandName">MySheba</div><div class="tagline">Fast • Safe • Reliable</div></div></div><div class="title"><b>Remittance Transaction Receipt</b><span>Send Money • Connect People • Build a Better Tomorrow</span></div></div><div class="body"><div class="completeLine"><div class="complete"><div class="check">✓</div><div><h1>Transaction Completed</h1><p>Your remittance has been successfully processed. Thank you for using MySheba.</p></div></div>${top}</div><div class="columns"><div class="card"><h2>SENDER DETAILS</h2><div class="cardBody">${rows(d.senderRows)}</div></div><div class="card"><h2>RECEIVER DETAILS</h2><div class="cardBody">${rows(d.receiverRows.filter(([l]) => !['Payout Method'].includes(l)))}<div class="subcard"><b>BANK / PAYOUT DETAILS</b>${rows(d.receiverRows.filter(([l]) => ['Bank Name','Branch','Bank Account No','Routing Number','Payout Method'].includes(l)))}</div><div class="subcard"><b>RECEIVER CURRENCY</b>${esc(val(d.curr))}</div></div></div><div>${summary}</div></div></div><div class="footer"><div class="qr">QR</div><div class="support"><b>Thank you for choosing MySheba!</b><span>For enquiries: +60 3 1234 5678 &nbsp; • &nbsp; ${EMAIL}</span><div class="powered">${esc(POWERED_BY)}</div></div><div class="web"><b>MySheba</b><span>Trusted Remittance Partner</span><div>${WEBSITE}</div></div></div><div class="bottom">${WEBSITE}</div></div></body></html>`;
}

export default function RemittanceReceipt({ transaction = {}, profile = {}, operator = '', onClose }) {
  const { colors } = useTheme();
  const [printing, setPrinting] = useState(false);
  const html = useMemo(() => buildReceiptHtml(transaction, profile, operator), [transaction, profile, operator]);
  const d = useMemo(() => getReceiptData(transaction, profile, operator), [transaction, profile, operator]);

  const printReceipt = async () => {
    try { setPrinting(true); await Print.printAsync({ html }); } catch (e) { console.warn('Receipt print failed', e); } finally { setPrinting(false); }
  };

  const senderRows = d.senderRows;
  const receiverRows = d.receiverRows;

  return <View style={[styles.container, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.content}><View style={styles.preview}><View style={styles.previewHeader}><Text style={styles.brand}>MySheba</Text><Text style={styles.title}>Remittance Transaction Receipt</Text></View><View style={styles.previewMeta}><Text style={styles.completed}>✓ Transaction Completed</Text><Text style={styles.metaText}>Date & Time: {d.created}</Text><Text style={styles.metaText}>Transaction ID: {val(d.txId)}</Text><Text style={styles.pinText}>PIN: {val(d.pin)}</Text></View><View style={styles.previewColumns}><Section title="SENDER DETAILS" rows={senderRows}/><Section title="RECEIVER DETAILS" rows={receiverRows}/><View style={styles.summaryPreview}><Text style={styles.sectionTitle}>TRANSACTION SUMMARY</Text><Row label="Transfer Amount" value={money(d.send, 'MYR')}/><Row label="Service Charge" value={money(d.fee, 'MYR')}/><Row label="GST" value={money(d.gst, 'MYR')}/><Row label="Exchange Rate" value={`1 MYR = ${val(d.rate)} ${d.curr}`}/><Row label="Receive Amount" value={money(d.receive, d.curr)}/><View style={styles.totalRow}><Text style={styles.totalLabel}>Total Collected</Text><Text style={styles.totalValue}>{money(d.total, 'MYR')}</Text></View><Row label="Operator" value={d.operatorLabel}/><Row label="Approved By" value={d.approvedLabel}/></View></View><View style={styles.previewFooter}><Text>Thank you for choosing MySheba!  •  {EMAIL}</Text><Text>{WEBSITE}</Text></View></View><TouchableOpacity style={styles.button} onPress={printReceipt} disabled={printing}>{printing ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Print / Save Receipt PDF</Text>}</TouchableOpacity>{onClose && <TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity>}</ScrollView></View>;
}

function Section({ title, rows }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{rows.map(([l, v], i) => <Row key={`${l}-${i}`} label={l} value={v}/>)}</View>; }
function Row({ label, value }) { return <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowValue}>{val(value)}</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 10 }, preview: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#b7d8f5', borderRadius: 8, overflow: 'hidden' }, previewHeader: { backgroundColor: '#0766c9', padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, brand: { color: '#fff', fontSize: 22, fontWeight: '800' }, title: { color: '#fff', fontSize: 15, fontWeight: '800' }, previewMeta: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }, completed: { color: '#0ba37c', fontWeight: '800', fontSize: 14 }, metaText: { color: '#123f78', fontSize: 10, fontWeight: '600' }, pinText: { color: '#0764c8', fontSize: 11, fontWeight: '800' }, previewColumns: { flexDirection: 'row', gap: 6, padding: 8 }, section: { flex: 1, borderWidth: 1, borderColor: '#a9d3f4', borderRadius: 5, overflow: 'hidden' }, summaryPreview: { flex: 1, borderWidth: 1, borderColor: '#a9d3f4', borderRadius: 5, overflow: 'hidden', paddingBottom: 5 }, sectionTitle: { backgroundColor: '#eef7ff', color: '#0764c8', fontSize: 11, fontWeight: '800', padding: 7 }, row: { flexDirection: 'row', paddingHorizontal: 7, paddingVertical: 3 }, rowLabel: { width: '43%', color: '#6683a6', fontSize: 9 }, rowValue: { flex: 1, color: '#123f78', fontSize: 9, fontWeight: '600' }, totalRow: { margin: 7, padding: 8, borderRadius: 4, backgroundColor: '#0873d5', flexDirection: 'row', justifyContent: 'space-between' }, totalLabel: { color: '#fff', fontWeight: '800', fontSize: 10 }, totalValue: { color: '#fff', fontWeight: '800', fontSize: 10 }, previewFooter: { backgroundColor: '#eef8ff', padding: 10, flexDirection: 'row', justifyContent: 'space-between', color: '#0764c8' }, button: { marginTop: 12, padding: 14, borderRadius: 8, backgroundColor: '#0766c9', alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '800' }, close: { textAlign: 'center', padding: 14, fontWeight: '700' }
});
