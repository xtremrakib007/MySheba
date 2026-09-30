import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Linking, Image, StyleSheet } from 'react-native';
import * as Print from 'expo-print';
import { showAlert } from '../utils/appAlert';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import CopyButton from './CopyButton';
import DownloadButton from './DownloadButton';
import * as topupService from '../firebase/topupService';
import * as supportTicketService from '../firebase/supportTicketService';
import { useApp } from '../context/AppContext';
import RemittanceReceipt from './RemittanceReceipt';

const BADGE_COLORS = {
  pending: { bg: '#FFF8E1', text: '#F57F17' },
  processing: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#E8F5E9', text: '#2E7D32' },
  new: { bg: '#FFF8E1', text: '#F57F17' },
  contacted: { bg: '#E3F2FD', text: '#1565C0' },
  closed: { bg: '#E8F5E9', text: '#2E7D32' },
  approved: { bg: '#E8F5E9', text: '#2E7D32' },
  rejected: { bg: '#FDECEA', text: '#C62828' },
  open: { bg: '#FFF8E1', text: '#F57F17' },
  in_progress: { bg: '#E3F2FD', text: '#1565C0' },
  resolved: { bg: '#E8F5E9', text: '#2E7D32' },
};

const TYPE_ICON = { flight: '✈️', bus: '🚌', train: '🚂' };
const ZERO_DECIMAL_CURRENCIES = new Set(['IDR', 'KHR', 'MMK']);
function txCurrency(item) { return String(item?.currency || item?.walletCurrency || 'MYR').toUpperCase(); }
function isRemittanceTransaction(item) {
  const service = String(item?.service || item?.chargedServiceKind || item?.serviceType || '').trim().toLowerCase().replace(/[ _-]+/g, '');
  return service === 'remittance' || service === 'moneytransfer' || service === 'internationaltransfer';
}
function txAmount(value, currency) { const digits = ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2; return `${currency} ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`; }

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** One label/value line inside the modal body. */
function Row({ label, value }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatTxCopy(tx) {
  const currency = txCurrency(tx);
  return [
    `Service: ${tx.service || ''}`,
    `Customer: ${tx.customerPhone || 'Unknown'}`,
    `Details: ${tx.details || ''}`,
    `Amount: ${txAmount(tx.total, currency)}`,
    `Status: ${(tx.status || '').toUpperCase()}`,
  ].join('\n');
}

function formatInquiryCopy(inq) {
  const lines = [
    `Type: ${inq.type || ''}`,
    `Route: ${inq.from || ''} → ${inq.to || ''}`,
    `Date: ${inq.date || ''}${inq.time ? ` · ${inq.time}` : ''}`,
    `Passengers: ${inq.passengers || ''}`,
    `Name: ${inq.name || ''}`,
    `Phone: ${inq.phone || ''}`,
  ];
  if (inq.email) lines.push(`Email: ${inq.email}`);
  if (inq.notes) lines.push(`Notes: ${inq.notes}`);
  lines.push(`Status: ${(inq.status || 'new').toUpperCase()}`);
  return lines.join('\n');
}

function formatTopupCopy(tp) {
  const currency = txCurrency(tp);
  const lines = [
    `Method: ${topupService.METHODS[tp.method] || tp.method || ''}`,
    `User: ${tp.userName || 'Unknown'} (${tp.userRole || ''})`,
    `Phone: ${tp.userPhone || ''}`,
  ];
  if (tp.bankName) lines.push(`Bank: ${tp.bankName}${tp.refNo ? ` · Ref: ${tp.refNo}` : ''}`);
  lines.push(`Amount: ${txAmount(tp.amount, currency)}`);
  lines.push(`Credited: ${txAmount(tp.points, currency)}`);
  if (tp.rejectReason) lines.push(`Reject reason: ${tp.rejectReason}`);
  lines.push(`Status: ${(tp.status || 'pending').toUpperCase()}`);
  return lines.join('\n');
}

function formatTicketCopy(t) {
  const lines = [
    `Subject: ${t.subject || ''}`,
    `From: ${t.userName || 'Unknown'} (${t.userRole || ''})`,
    `Phone: ${t.userPhone || ''}`,
    `Message: ${t.message || ''}`,
  ];
  if (t.adminNote) lines.push(`Admin note: ${t.adminNote}`);
  lines.push(`Status: ${supportTicketService.STATUS_LABELS[t.status] || t.status || 'open'}`);
  return lines.join('\n');
}

function TxBody({ item, showCost, pinOverride }) {
  const currency = txCurrency(item);
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const raw = item.raw || {};
  return (
    <>
      <Row label="Service" value={item.service} />
      <Row label="Customer" value={item.customerPhone || 'Unknown'} />
      <Row label="Details" value={item.details} />
      {item.service === 'Mobile Banking' && !!(item.raw && item.raw.phone) && (
        <Row label="Receiver" value={item.raw.phone} />
      )}
      {!!raw.senderName && <Row label="Sender" value={raw.senderName} />}
      {!!raw.senderPhone && <Row label="Sender Phone" value={raw.senderPhone} />}
      {!!raw.senderCompany && <Row label="Sender Company" value={raw.senderCompany} />}
      {!!raw.senderPassportNo && <Row label="Sender Passport No." value={raw.senderPassportNo} />}
      {!!raw.senderPassportExpiry && <Row label="Passport Expiry" value={raw.senderPassportExpiry} />}
      {!!raw.senderAddress && <Row label="Sender Address" value={raw.senderAddress} />}
      {!!(raw.receiverFirstName || raw.receiverLastName) && (
        <Row label="Receiver Name" value={`${raw.receiverFirstName || ''} ${raw.receiverLastName || ''}`.trim()} />
      )}
      {!!raw.receiverRelationship && <Row label="Relationship" value={raw.receiverRelationship} />}
      {!!raw.receiverPhone && <Row label="Receiver Mobile" value={raw.receiverPhone} />}
      {!!raw.receiverBankName && <Row label="Bank" value={raw.receiverBankName} />}
      {!!raw.receiverAccountNumber && <Row label="Account No." value={raw.receiverAccountNumber} />}
      {!!raw.receiverBranch && <Row label="Branch" value={raw.receiverBranch} />}
      {!!raw.receiverRoutingNumber && <Row label="Routing No." value={raw.receiverRoutingNumber} />}
      {!!raw.receiverPickupNetwork && <Row label="Pickup Network" value={raw.receiverPickupNetwork} />}
      {!!raw.receiverIdType && <Row label="Receiver ID" value={`${raw.receiverIdType} - ${raw.receiverIdNumber || ''}`} />}
      {!!raw.receiverPickupCity && <Row label="Pickup City" value={raw.receiverPickupCity} />}
      {!!raw.receiverWalletProvider && <Row label="Wallet Provider" value={raw.receiverWalletProvider} />}
      {!!raw.receiverWalletNumber && <Row label="Wallet Number" value={raw.receiverWalletNumber} />}
      <Row label="Amount" value={txAmount(item.total, currency)} />
      {!!(showCost && !!(item.cost || item.profit)) && (
        <>
          <Row label="Cost" value={txAmount(item.cost, currency)} />
          <Row label="Profit" value={txAmount(item.profit, currency)} />
        </>
      )}
      {!!(item.collectionPin || pinOverride || item.pin) && (item.service === 'Mobile Banking' || item.service === 'Remittance') && (
        <View style={styles.pinBlock}>
          <Text style={styles.pinLabel}>COLLECTION PIN</Text>
          <View style={styles.pinRow}>
            <Text style={styles.pinValue}>{item.collectionPin || pinOverride || item.pin}</Text>
            <CopyButton value={item.collectionPin || pinOverride || item.pin} label="Copy PIN" />
          </View>
        </View>
      )}
      <Row label="Order ID" value={item.id} />
      <Row label="Created" value={formatDate(item.createdAt)} />
      <Row label="Updated" value={formatDate(item.updatedAt)} />
      {!!item.rejected && <Row label="Reject reason" value={item.rejectReason} />}
      {!!item.receiptUrl && (
        <>
          <Text style={styles.rowLabel}>TRANSFER RECEIPT</Text>
          <TouchableOpacity onPress={() => Linking.openURL(item.receiptUrl).catch(() => {})}>
            <Image source={{ uri: item.receiptUrl }} style={styles.receiptThumb} resizeMode="cover" />
          </TouchableOpacity>
          <DownloadButton url={item.receiptUrl} filename={`receipt-${item.id}.jpg`} label="Download Receipt" />
        </>
      )}
      {!!raw.passportUrl && (
        <>
          <Text style={styles.rowLabel}>PASSPORT PHOTO</Text>
          <TouchableOpacity onPress={() => Linking.openURL(raw.passportUrl).catch(() => {})}>
            <Image source={{ uri: raw.passportUrl }} style={styles.receiptThumb} resizeMode="cover" />
          </TouchableOpacity>
        </>
      )}
    </>
  );
}

function InquiryBody({ item }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <>
      <Row label="Type" value={item.type} />
      <Row label="Route" value={`${item.from || '?'} → ${item.to || '?'}`} />
      <Row label="Date" value={`${item.date || ''}${item.time ? ` · ${item.time}` : ''}`} />
      <Row label="Passengers" value={item.passengers} />
      <Row label="Name" value={item.name} />
      <Row label="Phone" value={item.phone} />
      <Row label="Email" value={item.email} />
      <Row label="Notes" value={item.notes} />
      <Row label="Inquiry ID" value={item.id} />
      <Row label="Created" value={formatDate(item.createdAt)} />
      {!!item.ticketUrl && (
        item.ticketUrl.toLowerCase().includes('.pdf') ? (
          <>
            <TouchableOpacity onPress={() => Linking.openURL(item.ticketUrl).catch(() => {})}>
              <Text style={styles.pdfLink}>📄 View attached ticket (PDF)</Text>
            </TouchableOpacity>
            <DownloadButton url={item.ticketUrl} filename={`ticket-${item.id}.pdf`} label="Download Ticket" />
          </>
        ) : (
          <>
            <TouchableOpacity onPress={() => Linking.openURL(item.ticketUrl).catch(() => {})}>
              <Image source={{ uri: item.ticketUrl }} style={styles.receiptThumb} resizeMode="cover" />
            </TouchableOpacity>
            <DownloadButton url={item.ticketUrl} filename={`ticket-${item.id}.jpg`} label="Download Ticket" />
          </>
        )
      )}
    </>
  );
}

function TopupBody({ item }) {
  const currency = txCurrency(item);
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <>
      <Row label="Method" value={topupService.METHODS[item.method] || item.method} />
      <Row label="User" value={`${item.userName || 'Unknown'} (${item.userRole || ''})`} />
      <Row label="Phone" value={item.userPhone} />
      <Row label="Bank" value={item.bankName} />
      <Row label="Reference" value={item.refNo} />
      <Row label="Amount" value={txAmount(item.amount, currency)} />
      <Row label="Wallet credit" value={txAmount(item.walletAmount ?? item.amount, currency)} />
      <Row label="Top-up ID" value={item.id} />
      <Row label="Created" value={formatDate(item.createdAt)} />
      {item.status === 'rejected' && <Row label="Reject reason" value={item.rejectReason} />}
      {!!item.receiptUrl && (
        <TouchableOpacity onPress={() => Linking.openURL(item.receiptUrl).catch(() => {})}>
          <Image source={{ uri: item.receiptUrl }} style={styles.receiptThumb} resizeMode="cover" />
        </TouchableOpacity>
      )}
    </>
  );
}

function TicketBody({ item }) {
  return (
    <>
      <Row label="Subject" value={item.subject} />
      <Row label="From" value={`${item.userName || 'Unknown'} (${item.userRole || ''})`} />
      <Row label="Phone" value={item.userPhone} />
      <Row label="Message" value={item.message} />
      {!!item.adminNote && <Row label="Admin reply" value={item.adminNote} />}
      <Row label="Ticket ID" value={item.id} />
      <Row label="Created" value={formatDate(item.createdAt)} />
      <Row label="Updated" value={formatDate(item.updatedAt)} />
    </>
  );
}

/** Full-detail popup for a tap on any transaction/inquiry/top-up card,
 * across both the Admin dashboard and the customer History screen.
 * `type` selects which fields to render and which copy-block to build;
 * `item` is the raw Firestore-backed record for that row. */
export default function TransactionDetailModal({ visible, type, item, onClose, showCost }) {
  const { colors } = useTheme();
  const { profile, authUser } = useApp();
  const [pinOverride, setPinOverride] = React.useState('');
  const [showRemittanceReceipt, setShowRemittanceReceipt] = React.useState(false);
  React.useEffect(() => {
    setPinOverride('');
    setShowRemittanceReceipt(false);
  }, [item?.id, item?.pin]);

  const styles = createStyles(colors);
  if (!item) return null;

  const title = type === 'inquiry' ? `${TYPE_ICON[item.type] || '🗺️'} Travel Inquiry`
    : type === 'topup' ? `💰 ${topupService.METHODS[item.method] || item.method || 'Top-Up'}`
    : type === 'supportTicket' ? `🎧 ${item.subject || 'Support Request'}`
    : `📋 ${item.service || 'Transaction'}`;

  const status = type === 'inquiry' ? (item.status || 'new') : type === 'supportTicket' ? (item.status || 'open') : (item.status || 'pending');
  const badge = BADGE_COLORS[item.rejected ? 'rejected' : status] || BADGE_COLORS.pending;
  const statusLabel = type === 'supportTicket' ? (supportTicketService.STATUS_LABELS[status] || status) : (item.rejected ? 'rejected' : status).toUpperCase();
  const copyValue = type === 'inquiry' ? formatInquiryCopy(item)
    : type === 'topup' ? formatTopupCopy(item)
    : type === 'supportTicket' ? formatTicketCopy(item)
    : formatTxCopy(item);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.text }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {type === 'inquiry' ? <InquiryBody item={item} />
              : type === 'topup' ? <TopupBody item={item} />
              : type === 'supportTicket' ? <TicketBody item={item} />
              : <TxBody item={item} showCost={showCost} pinOverride={pinOverride} />}
          </ScrollView>

          <View style={styles.footer}>
            {type === 'tx' && isRemittanceTransaction(item) && (
              <TouchableOpacity
                style={styles.printBtn}
                onPress={() => setShowRemittanceReceipt(true)}
                accessibilityRole="button"
                accessibilityLabel="View and print remittance receipt"
              >
                <Text style={styles.printText}>View / Print Remittance Receipt</Text>
              </TouchableOpacity>
            )}
            {type === 'tx' && (
              <TouchableOpacity style={styles.printBtn} onPress={async () => {
                try {
                  const safe = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                  // collectionPin after completion, when the live pin is gone.
                  // Without it a completed order printed "Not generated" for a
                  // PIN that had very much been generated and used.
                  const requiresCollectionPin = item.service === 'Mobile Banking' || item.service === 'Remittance';
                  const pin = requiresCollectionPin ? (pinOverride || item.collectionPin || item.pin || '') : '';
                  const currency = txCurrency(item);
                  const raw = item.raw || {};
                  const esc = (v) => safe(v);
                  const rows = [
                    ['Service', item.service],
                    ['Order ID', item.id],
                    ['Customer', item.customerPhone || item.customerId || ''],
                    ['Phone / Number', raw.phone || item.customerPhone || ''],
                    ['Operator', raw.operator || item.operator || ''],
                    ['Country', raw.country || item.country || ''],
                    ['Package', raw.package || item.package || ''],
                    ['Package ID', raw.packageId || item.packageId || ''],
                    ['Amount', txAmount(item.total, currency)],
                    ['Status', String(item.status || '').toUpperCase()],
                    ['Transaction ID', raw.trxid || raw.transactionId || item.trxid || item.transactionId || ''],
                    ['Provider', raw.provider || item.provider || ''],
                    ['Details', item.details || ''],
                    ['Sender', raw.senderName || ''],
                    ['Sender Phone', raw.senderPhone || ''],
                    ['Sender Company', raw.senderCompany || ''],
                    ['Sender Passport No.', raw.senderPassportNo || ''],
                    ['Passport Expiry', raw.senderPassportExpiry || ''],
                    ['Sender Address', raw.senderAddress || ''],
                    ['Receiver Name', [raw.receiverFirstName, raw.receiverLastName].filter(Boolean).join(' ')],
                    ['Receiver Relationship', raw.receiverRelationship || ''],
                    ['Receiver Mobile', raw.receiverPhone || ''],
                    ['Receiver Bank', raw.receiverBankName || ''],
                    ['Account No.', raw.receiverAccountNumber || ''],
                    ['Branch', raw.receiverBranch || ''],
                    ['Routing No.', raw.receiverRoutingNumber || ''],
                    ['Pickup Network', raw.receiverPickupNetwork || ''],
                    ['Receiver ID', [raw.receiverIdType, raw.receiverIdNumber].filter(Boolean).join(' - ')],
                    ['Pickup City', raw.receiverPickupCity || ''],
                    ['Wallet Provider', raw.receiverWalletProvider || ''],
                    ['Wallet Number', raw.receiverWalletNumber || ''],
                    ['Created', formatDate(item.createdAt)],
                    ['Updated', formatDate(item.updatedAt)],
                    ['Completed By', item.completedByName || item.operatorName || ''],
                  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');

                  const rowsHtml = rows.map(([label, value]) =>
                    `<tr><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;color:#555;font-weight:600;width:38%">${esc(label)}</td><td style="padding:7px 6px;border-bottom:1px solid #e5e7eb;word-break:break-word">${esc(value)}</td></tr>`
                  ).join('');

                  const pinBlock = requiresCollectionPin && pin
                    ? `<div style="margin:16px 0;padding:14px;border:2px solid #0B8A94;text-align:center"><div style="font-size:11px;font-weight:700">COLLECTION PIN</div><div style="font-size:28px;font-weight:bold;letter-spacing:6px;margin-top:5px">${esc(pin)}</div></div>`
                    : '';

                  const receiptImage = item.receiptUrl
                    ? `<div style="margin-top:18px"><b>TRANSFER RECEIPT</b><br><img src="${esc(item.receiptUrl)}" style="max-width:100%;max-height:420px;margin-top:8px;object-fit:contain"></div>`
                    : '';

                  const passportImage = raw.passportUrl
                    ? `<div style="margin-top:18px"><b>PASSPORT PHOTO</b><br><img src="${esc(raw.passportUrl)}" style="max-width:100%;max-height:420px;margin-top:8px;object-fit:contain"></div>`
                    : '';

                  html = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{margin:12mm}body{font-family:Arial,sans-serif;color:#111;font-size:12px;margin:0}
h1{font-size:20px;text-align:center;margin:0 0 4px}.sub{text-align:center;color:#666;margin-bottom:14px}
table{width:100%;border-collapse:collapse}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #ddd;text-align:center;color:#666;font-size:10px}
</style></head><body>
<h1>MySheba</h1><div class="sub">Transaction Receipt</div>
<table>${rowsHtml}</table>
${pinBlock}${receiptImage}${passportImage}
<div class="footer">Please keep this receipt for your records.</div>
</body></html>`;                  await Print.printAsync({ html });
                } catch (err) { showAlert('Printer', err?.message || 'Printing is not available on this device.'); }
              }}>
                <Text style={styles.printText}>🖨 Print</Text>
              </TouchableOpacity>
            )}
            <CopyButton value={copyValue} label="Copy Details" />
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    <Modal
      visible={showRemittanceReceipt}
      animationType="slide"
      onRequestClose={() => setShowRemittanceReceipt(false)}
    >
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>MySheba Remittance Receipt</Text>
          <TouchableOpacity onPress={() => setShowRemittanceReceipt(false)} accessibilityRole="button" accessibilityLabel="Close remittance receipt">
            <Text style={{ color: colors.primary, fontWeight: '700', padding: 8 }}>Close</Text>
          </TouchableOpacity>
        </View>
        <RemittanceReceipt
          transaction={item}
          profile={profile || {}}
          operator={item.completedByName || item.operatorName || ''}
          onClose={() => setShowRemittanceReceipt(false)}
        />
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box: { backgroundColor: 'white', borderRadius: radius.lg, padding: 18, width: '100%', maxWidth: 400, maxHeight: '80%' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
    title: { fontWeight: '700', fontSize: 16, flex: 1, color: colors.text },
    badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.md },
    badgeText: { fontSize: 10, fontWeight: '700' },
    body: { marginBottom: 14 },
    row: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    rowLabel: { fontSize: 11, color: '#999', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
    rowValue: { fontSize: 14, color: colors.text, fontWeight: '500' },
    receiptThumb: { width: '100%', height: 160, borderRadius: radius.md, marginTop: 10, backgroundColor: '#F0F0F0' },
    pdfLink: { color: colors.primary, fontWeight: '600', fontSize: 13, marginTop: 10 },
    pinBlock: { backgroundColor: '#FFF8E1', borderRadius: radius.md, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: '#FFE9A8' },
    pinLabel: { fontSize: 10, fontWeight: '700', color: '#B8860B', letterSpacing: 0.5, marginBottom: 6 },
    pinRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pinValue: { fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: 4 },
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    printBtn: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: '#EAF7F2' },
    printText: { color: colors.primaryDark, fontWeight: '700', fontSize: 12 },
    closeBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 13 },
  });
}
