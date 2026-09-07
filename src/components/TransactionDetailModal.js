import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, Linking, Image, StyleSheet } from 'react-native';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import CopyButton from './CopyButton';
import DownloadButton from './DownloadButton';
import * as topupService from '../firebase/topupService';
import * as supportTicketService from '../firebase/supportTicketService';

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
  return [
    `Service: ${tx.service || ''}`,
    `Customer: ${tx.customerPhone || 'Unknown'}`,
    `Details: ${tx.details || ''}`,
    `Amount: MYR ${Number(tx.total || 0).toFixed(2)}`,
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
  const lines = [
    `Method: ${topupService.METHODS[tp.method] || tp.method || ''}`,
    `User: ${tp.userName || 'Unknown'} (${tp.userRole || ''})`,
    `Phone: ${tp.userPhone || ''}`,
  ];
  if (tp.bankName) lines.push(`Bank: ${tp.bankName}${tp.refNo ? ` · Ref: ${tp.refNo}` : ''}`);
  lines.push(`Amount: MYR ${Number(tp.amount || 0).toFixed(2)}`);
  lines.push(`Points: ${Number(tp.points || 0).toFixed(2)}`);
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

function TxBody({ item, showCost }) {
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
      <Row label="Amount" value={`MYR ${Number(item.total || 0).toFixed(2)}`} />
      {showCost && !!(item.cost || item.profit) && (
        <>
          <Row label="Cost" value={`MYR ${Number(item.cost || 0).toFixed(2)}`} />
          <Row label="Profit" value={`MYR ${Number(item.profit || 0).toFixed(2)}`} />
        </>
      )}
      {!!item.pin && (
        <View style={styles.pinBlock}>
          <Text style={styles.pinLabel}>COLLECTION PIN</Text>
          <View style={styles.pinRow}>
            <Text style={styles.pinValue}>{item.pin}</Text>
            <CopyButton value={item.pin} label="Copy PIN" />
          </View>
        </View>
      )}
      <Row label="Order ID" value={item.id} />
      <Row label="Created" value={formatDate(item.createdAt)} />
      <Row label="Updated" value={formatDate(item.updatedAt)} />
      {item.rejected && <Row label="Reject reason" value={item.rejectReason} />}
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
      <Row label="Amount" value={`MYR ${Number(item.amount || 0).toFixed(2)}`} />
      <Row label="Points" value={Number(item.points || 0).toFixed(2)} />
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
  const {
    colors
  } = useTheme();

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
              : <TxBody item={item} showCost={showCost} />}
          </ScrollView>

          <View style={styles.footer}>
            <CopyButton value={copyValue} label="Copy Details" />
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    closeBtn: { flex: 1, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
    closeText: { color: 'white', fontWeight: '600', fontSize: 13 },
  });
}
