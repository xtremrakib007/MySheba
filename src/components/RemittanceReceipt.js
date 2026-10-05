import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { printHtml } from '../utils/printService';
import { countries } from '../data/countries';
import { useTheme } from '../theme/ThemeContext';

const COMPANY_NAME = 'SatuLink Solutions Sdn Bhd (1641555-U)';
const COMPANY_ADDRESS = 'Address: To be set';
const POWERED_BY = 'Powered by OTR';
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
  const curr = raw.currency || raw.receiveCurrency || raw.curr || tx.receiveCurrency || '';
  const send = num(raw.sendAmt ?? tx.amount);
  const fee = num(raw.transferFee ?? raw.serviceCharge ?? tx.transferFee ?? tx.fee);
  const gst = num(raw.gst ?? tx.gst);
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
  // collectionPin is the spent code, kept by completeTransaction after the
  // live pin is deleted. Without it a completed order's receipt showed "-"
  // for the one field that records how the handover was authorised.
  const pin = tx.pin || tx.pinNo || tx.collectionPin || raw.pin || '';
  const rows = [
    ['Senders Name', sender], ['Cust ID', raw.customerId || profile.customerId || profile.custId || tx.customerId],
    ['PASSPORT', raw.senderPassportNo || tx.senderPassportNo], ['Place of Issue', raw.senderPassportIssuePlace || raw.passportPlaceOfIssue || raw.nationality],
    ['Expire Date', raw.senderPassportExpiry], ['Issue Date', raw.senderPassportIssueDate], ['Skilled labor', raw.skill || raw.skilledLabor],
    ['Address', raw.senderAddress], ['Mobile No.', raw.senderPhone || tx.senderPhone || profile.phone], ['Date of Birth', raw.senderDob || raw.dateOfBirth],
    ['Name of Employer', raw.employerName || raw.employer], ['Gender', raw.gender], ['Occupation', raw.occupation],
    ['Source of funds', raw.sourceOfFunds || raw.sourceFunds], ['Nationality', raw.nationality], ['Purpose', raw.purpose], ['Relation', raw.receiverRelationship],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  const receiverRows = [
    ['Payout Country', countryName(raw.country || tx.country)], ['Mobile No', raw.receiverPhone || tx.receiverPhone], ["Receiver's Name", receiver],
    ['Address', raw.receiverAddress || raw.receiverCountry || countryName(raw.country || tx.country)], ['Bank Name', raw.receiverBankName], ['Branch', raw.receiverBranch],
    ['Bank Account No', raw.receiverAccountNumber], ['Place of Issue', raw.receiverPlaceOfIssue], ['Routing Number', raw.receiverRoutingNumber],
    ['Pickup Network', raw.receiverPickupNetwork], ['Pickup City', raw.receiverPickupCity], ['Wallet Provider', raw.receiverWalletProvider], ['Wallet Number', raw.receiverWalletNumber],
    ['Payout Method', method],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '');
  return { curr, send, fee, gst, total, rate, receive, method, sender, receiver, txId, created, pin, approvedBy, approvedRole, completedBy, completedRole, rows, receiverRows };
}

export function buildReceiptHtml(tx = {}, profile = {}, operator = '') {
  const d = getReceiptData(tx, profile, operator);
  const rows = (items) => items.map(([label, value]) => `<div class="row"><span>${esc(label)}</span><b>${esc(val(value))}</b></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:A5 landscape;margin:5mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#123b72;font-size:7.5px}.receipt{border:1px solid #b7d8f5;border-radius:5px;overflow:hidden}.header{background:#0757b9;color:#fff;padding:6mm 7mm;display:flex;justify-content:space-between;align-items:center}.brand{font-size:18px;font-weight:800}.company{font-size:7px;margin-top:1mm}.title{text-align:right;font-size:13px;font-weight:800}.subtitle{font-size:7px;font-weight:400;margin-top:1.5mm}.body{padding:4mm 5mm}.meta{display:grid;grid-template-columns:1fr 1.2fr 1fr;border:1px solid #b7d8f5;border-radius:4px;margin-bottom:3mm}.meta div{padding:2.5mm 3mm;border-right:1px solid #b7d8f5}.meta div:last-child{border:0}.meta span,.summary span,.staff span{display:block;color:#6683a6;font-size:6.5px;margin-bottom:1mm}.meta b{font-size:8px}.meta .pin{font-size:10px;color:#0764c8}.columns{display:grid;grid-template-columns:1.05fr 1.05fr 1fr;gap:3mm}.card,.summary{border:1px solid #a9d3f4;border-radius:4px;overflow:hidden}.card h2,.summary h2{margin:0;padding:2.5mm 3mm;background:#eef7ff;color:#0764c8;font-size:9px}.cardbody{padding:2mm 3mm}.row{display:flex;padding:1.1mm 0;line-height:1.15}.row span{width:40%;color:#5c7ba1}.row b{width:60%;color:#123f78}.amount{padding:2mm 3mm}.amount>div{display:flex;justify-content:space-between;border-bottom:1px solid #d7e9f8;padding:1.2mm 0}.amount b{color:#064d9f}.total{background:#0873d5;color:#fff;border-radius:3px;padding:2mm 3mm!important;border:0!important;margin-top:1mm}.total span,.total b{color:#fff!important;font-size:8.5px!important}.staff{display:grid;grid-template-columns:1fr 1fr;margin:0 3mm 3mm;background:#f0f8ff;border-radius:3px}.staff>div{padding:2mm 3mm;border-right:1px solid #c7e1f5}.staff>div:last-child{border:0}.staff b{font-size:7.5px}.footer{display:flex;justify-content:space-between;align-items:center;background:#eef8ff;padding:2.5mm 5mm;border-top:1px solid #c9e2f5}.footer b{font-size:8px;color:#0764c8}.footer span{display:block;margin-top:1mm;font-size:6.5px}.powered{font-size:5.5px;margin-top:1mm}.bottom{background:#0757b9;color:#fff;text-align:center;padding:2mm;font-size:7px;font-weight:700}
</style></head><body><div class="receipt"><div class="header"><div><div class="brand">MySheba</div><div class="company">${esc(COMPANY_NAME)}<br>${esc(COMPANY_ADDRESS)}</div></div><div class="title">Remittance Transaction Receipt<div class="subtitle">Send Money • Connect People • Build a Better Tomorrow</div></div></div><div class="body"><div class="meta"><div><span>Date &amp; Time</span><b>${esc(d.created)}</b></div><div><span>Transaction ID</span><b>${esc(val(d.txId))}</b></div><div><span>PIN</span><b class="pin">${esc(val(d.pin))}</b></div></div><div class="columns"><div class="card"><h2>SENDER DETAILS</h2><div class="cardbody">${rows(d.rows)}</div></div><div class="card"><h2>RECEIVER DETAILS</h2><div class="cardbody">${rows(d.receiverRows)}</div></div><div class="summary"><h2>TRANSACTION SUMMARY</h2><div class="amount"><div><span>Transfer Amount</span><b>${esc(money(d.send,'MYR'))}</b></div><div><span>Service Charge</span><b>${esc(money(d.fee,'MYR'))}</b></div><div><span>GST</span><b>${esc(money(d.gst,'MYR'))}</b></div><div><span>Exchange Rate</span><b>1 MYR = ${esc(val(d.rate))} ${esc(d.curr)}</b></div><div><span>Receive Amount</span><b>${esc(money(d.receive,d.curr))}</b></div><div class="total"><span>Total Collected</span><b>${esc(money(d.total,'MYR'))}</b></div></div><div class="staff"><div><span>Operator</span><b>${esc(d.completedBy ? `${d.completedBy}${d.completedRole ? ` (${d.completedRole})` : ''}` : '-')}</b></div><div><span>Approved By</span><b>${esc(d.approvedBy ? `${d.approvedBy}${d.approvedRole ? ` (${d.approvedRole})` : ''}` : '-')}</b></div></div></div></div></div><div class="footer"><div><b>Thank you for choosing MySheba!</b><span>${esc(EMAIL)}</span><div class="powered">${esc(POWERED_BY)}</div></div><div style="text-align:right"><b>MySheba</b><span>${esc(WEBSITE)}</span></div></div><div class="bottom">${esc(WEBSITE)}</div></div></body></html>`;
}

function Section({ title, rows }) { return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{rows.map(([label,value], i) => <View key={`${label}-${i}`} style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{val(value)}</Text></View>)}</View>; }
function Summary({ d }) { return <View style={styles.summary}><Text style={styles.sectionTitle}>TRANSACTION SUMMARY</Text><Row label="Transfer Amount" value={money(d.send,'MYR')}/><Row label="Service Charge" value={money(d.fee,'MYR')}/><Row label="GST" value={money(d.gst,'MYR')}/><Row label="Exchange Rate" value={`1 MYR = ${val(d.rate)} ${d.curr}`}/><Row label="Receive Amount" value={money(d.receive,d.curr)}/><View style={styles.totalRow}><Text style={styles.totalLabel}>Total Collected</Text><Text style={styles.totalValue}>{money(d.total,'MYR')}</Text></View><Row label="Operator" value={d.completedBy ? `${d.completedBy}${d.completedRole ? ` (${d.completedRole})` : ''}` : '-'}/><Row label="Approved By" value={d.approvedBy ? `${d.approvedBy}${d.approvedRole ? ` (${d.approvedRole})` : ''}` : '-'}/></View>; }
function Row({ label, value }) { return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{val(value)}</Text></View>; }

export default function RemittanceReceipt({ transaction = {}, profile = {}, operator = '', onClose }) {
  const { colors } = useTheme();
  const [printing, setPrinting] = useState(false);
  const d = useMemo(() => getReceiptData(transaction, profile, operator), [transaction, profile, operator]);
  const html = useMemo(() => buildReceiptHtml(transaction, profile, operator), [transaction, profile, operator]);
  const printReceipt = async () => { try { setPrinting(true); await printHtml(html); } catch (e) { console.warn('Receipt print failed', e); } finally { setPrinting(false); } };
  return <View style={[styles.container,{backgroundColor:colors.bg}]}><ScrollView contentContainerStyle={styles.content}><View style={styles.preview}><View style={styles.previewHeader}><Text style={styles.brand}>MySheba</Text><View><Text style={styles.company}>{COMPANY_NAME}</Text><Text style={styles.company}>{COMPANY_ADDRESS}</Text></View><Text style={styles.title}>Remittance Transaction Receipt</Text></View><View style={styles.meta}><Row label="Date & Time" value={d.created}/><Row label="Transaction ID" value={val(d.txId)}/><Row label="PIN" value={val(d.pin)}/></View><View style={styles.columns}><Section title="SENDER DETAILS" rows={d.rows}/><Section title="RECEIVER DETAILS" rows={d.receiverRows}/><Summary d={d}/></View><View style={styles.footer}><Text>{EMAIL}  •  {WEBSITE}</Text><Text>{POWERED_BY}</Text></View></View><TouchableOpacity style={styles.printButton} onPress={printReceipt} disabled={printing}>{printing ? <ActivityIndicator color="#fff"/> : <Text style={styles.printText}>Print / Save Receipt PDF</Text>}</TouchableOpacity></ScrollView></View>;
}

const styles = StyleSheet.create({
  container:{flex:1}, content:{padding:12,paddingBottom:20}, preview:{backgroundColor:'#fff',borderWidth:1,borderColor:'#b7d8f5',borderRadius:10,overflow:'hidden'}, previewHeader:{backgroundColor:'#0757b9',padding:16,flexDirection:'row',alignItems:'center',gap:12}, brand:{color:'#fff',fontSize:20,fontWeight:'800'}, title:{color:'#fff',fontSize:15,fontWeight:'800',marginLeft:'auto'}, company:{color:'#fff',fontSize:8,opacity:.9}, meta:{margin:12,borderWidth:1,borderColor:'#b7d8f5',borderRadius:8,padding:8,flexDirection:'row',gap:12}, columns:{flexDirection:'row',gap:8,padding:12,paddingTop:0}, section:{flex:1,borderWidth:1,borderColor:'#a9d3f4',borderRadius:8,overflow:'hidden'}, summary:{flex:1,borderWidth:1,borderColor:'#a9d3f4',borderRadius:8,overflow:'hidden'}, sectionTitle:{backgroundColor:'#eef7ff',color:'#0764c8',fontSize:10,fontWeight:'800',padding:8}, row:{flexDirection:'row',justifyContent:'space-between',gap:8,paddingVertical:5}, label:{color:'#6683a6',fontSize:9,flex:1}, value:{color:'#123f78',fontSize:9,fontWeight:'600',flex:1.5,textAlign:'right'}, totalRow:{backgroundColor:'#0873d5',borderRadius:5,padding:8,marginTop:4,flexDirection:'row',justifyContent:'space-between'}, totalLabel:{color:'#fff',fontWeight:'800',fontSize:10}, totalValue:{color:'#fff',fontWeight:'800',fontSize:10}, footer:{backgroundColor:'#eef8ff',padding:10,flexDirection:'row',justifyContent:'space-between'}, footerText:{fontSize:9,color:'#456a95'}, printButton:{marginTop:10,minHeight:44,borderRadius:9,backgroundColor:'#0757b9',alignItems:'center',justifyContent:'center'}, printText:{color:'#fff',fontWeight:'800',fontSize:13}
});