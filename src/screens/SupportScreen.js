import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, ActivityIndicator, PanResponder } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import { FormLabel, FormInput, FormTextArea, PrimaryButton } from '../components/ui';
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import SmartAd from '../components/SmartAd';
import * as supportTicketService from '../firebase/supportTicketService';

// Contact channels for MySheba customer support.
// Call/WhatsApp numbers are admin-editable (Admin > Support) and start
// blank until admin sets them - see supportContact in AppContext. Email
// stays fixed here since it doesn't need to change per-deployment.
const SUPPORT_EMAIL = 'info.mysheba@gmail.com';

// Us row below once an admin has actually set its URL - same "hide until
// configured" idea as the Call/WhatsApp support cards above.
const TABS = [
  { key: 'messages', label: 'Messages' },
  { key: 'tickets', label: 'Tickets' },
];

function getTicketStatusStyle(colors) {
  return {
    open: { label: 'Open', color: colors.warning, bg: '#FFF8E1' },
    in_progress: { label: 'In Progress', color: colors.primary, bg: '#E8F0FE' },
    resolved: { label: 'Resolved', color: colors.success, bg: '#E8F5E9' },
  };
}

const FAQS = [
  {
    q: 'How long does a recharge or top-up take?',
    a: 'Most recharge, mobile banking, and internet top-ups are processed by a dealer within a few minutes of submission. You can track status from History.',
  },
  {
    q: 'How do I check my remittance or transaction status?',
    a: 'Open History from your home screen to see the live status of any transaction you\u2019ve submitted - pending, processing, or completed.',
  },
  {
    q: 'I submitted a Flight/Bus/Train inquiry - what happens next?',
    a: 'These are inquiries, not instant bookings. Our admin team reviews your request and calls or messages you directly to confirm price and availability.',
  },
  {
    q: 'What if my payment or transaction fails?',
    a: 'Contact support with your transaction details below and our team will investigate and resolve it, including a refund if needed.',
  },
  {
    q: 'How do I update my profile or PIN?',
    a: 'Profile and PIN changes currently go through our support team - reach out using any of the options below and we\u2019ll help right away.',
  },
];

function FaqItem({ q, a }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity style={styles.faqItem} onPress={() => setOpen((o) => !o)} activeOpacity={0.8}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQ}>{q}</Text>
        <Text style={styles.faqChevron}>{open ? '\u25B4' : '\u25BE'}</Text>
      </View>
      {!!open && <Text style={styles.faqA}>{a}</Text>}
    </TouchableOpacity>
  );
}

/** One row in "My Support Requests" - subject, status pill, and (once
 * resolved) the admin's note back to the requester. */
function TicketRow({ item }) {
  const {
    colors
  } = useTheme();

  const TICKET_STATUS_STYLE = getTicketStatusStyle(colors);
  const styles = createStyles(colors);
  const style = TICKET_STATUS_STYLE[item.status] || TICKET_STATUS_STYLE.open;
  return (
    <View style={styles.ticketCard}>
      <View style={styles.faqHeader}>
        <Text style={styles.ticketSubject}>{item.subject}</Text>
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
          <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        </View>
      </View>
      <Text style={styles.ticketMessage}>{item.message}</Text>
      {item.status === 'resolved' && !!item.adminNote && (
        <View style={styles.ticketNoteBox}>
          <Text style={styles.ticketNoteLabel}>Support team reply</Text>
          <Text style={styles.ticketNoteText}>{item.adminNote}</Text>
        </View>
      )}
    </View>
  );
}

/** One row in "Assigned to You" - a ticket superadmin appointed this
 * admin/dealer/dealer to solve. Same start/resolve/reopen actions as
 * AdminSupportScreen, minus the ability to reassign it elsewhere - only
 * superadmin hands tickets off (see firestore.rules). */
function AssignedTicketRow({ item, busy, onStart, onResolve, onReopen }) {
  const {
    colors
  } = useTheme();

  const TICKET_STATUS_STYLE = getTicketStatusStyle(colors);
  const styles = createStyles(colors);
  const style = TICKET_STATUS_STYLE[item.status] || TICKET_STATUS_STYLE.open;
  return (
    <View style={styles.ticketCard}>
      <View style={styles.faqHeader}>
        <Text style={styles.ticketSubject}>{item.subject}</Text>
        <View style={[styles.badge, { backgroundColor: style.bg }]}>
          <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
        </View>
      </View>
      <Text style={styles.ticketRequester}>👤 {item.userName || 'Unknown'} ({item.userRole}) · 📞 {item.userPhone || 'N/A'}</Text>
      <Text style={styles.ticketMessage}>{item.message}</Text>
      {item.status === 'open' && (
        <View style={styles.ticketActions}>
          <TouchableOpacity style={styles.ticketPrimaryBtn} onPress={() => onStart(item)} disabled={busy}>
            <Text style={styles.ticketActionText}>{busy ? '…' : '▶ Start'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ticketSuccessBtn} onPress={() => onResolve(item)} disabled={busy}>
            <Text style={styles.ticketActionText}>✓ Resolve</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'in_progress' && (
        <View style={styles.ticketActions}>
          <TouchableOpacity style={styles.ticketSuccessBtn} onPress={() => onResolve(item)} disabled={busy}>
            <Text style={styles.ticketActionText}>{busy ? '…' : '✓ Resolve'}</Text>
          </TouchableOpacity>
        </View>
      )}
      {item.status === 'resolved' && (
        <View style={styles.ticketActions}>
          <TouchableOpacity style={styles.ticketErrorBtn} onPress={() => onReopen(item)} disabled={busy}>
            <Text style={styles.ticketActionText}>{busy ? '…' : '↺ Reopen'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function SupportScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, authUser, profile, supportContact, openHelp, helpPrefill, setHelpPrefill } = useApp();
  const hasPhone = !!supportContact?.phone;
  const hasWhatsapp = !!supportContact?.whatsapp;

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [myTickets, setMyTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);

  // Applies a subject/message handed over from MySheba Help (a question
  // with no direct feature, e.g. an employer pay dispute - see
  // AppContext.openSupportWithPrefill) into the ticket form below, then
  // clears it so a later plain visit to Support never sees stale data.
  useEffect(() => {
    if (!helpPrefill) return;
    setSubject(helpPrefill.subject);
    setMessage(helpPrefill.message);
    setHelpPrefill(null);
  }, [helpPrefill, setHelpPrefill]);

  // Tickets superadmin has appointed this admin/dealer/dealer to solve
  // - not shown to plain customers, who only ever have "My Support
  // Requests" below. See supportTicketService.subscribeAssignedTickets.
  const isAssignee = profile && ['dealer', 'admin'].includes(profile.role);
  const [assignedTickets, setAssignedTickets] = useState([]);
  const [assignedLoading, setAssignedLoading] = useState(true);
  const [assignedBusyId, setAssignedBusyId] = useState(null);
  const [assignedResolveId, setAssignedResolveId] = useState(null);

  useEffect(() => {
    if (!authUser || !isAssignee) { setAssignedLoading(false); return undefined; }
    const unsub = supportTicketService.subscribeAssignedTickets(
      authUser.uid,
      (list) => { setAssignedTickets(list); setAssignedLoading(false); },
      () => setAssignedLoading(false)
    );
    return unsub;
  }, [authUser, isAssignee]);

  const startAssigned = async (t) => {
    setAssignedBusyId(t.id);
    try {
      await supportTicketService.markTicketInProgress(t.id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this ticket.');
    } finally {
      setAssignedBusyId(null);
    }
  };

  const confirmResolveAssigned = async (note) => {
    const id = assignedResolveId;
    setAssignedResolveId(null);
    if (!id) return;
    setAssignedBusyId(id);
    try {
      await supportTicketService.resolveTicket(id, note);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not resolve this ticket.');
    } finally {
      setAssignedBusyId(null);
    }
  };

  const reopenAssigned = async (t) => {
    setAssignedBusyId(t.id);
    try {
      await supportTicketService.reopenTicket(t.id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reopen this ticket.');
    } finally {
      setAssignedBusyId(null);
    }
  };

  // My own support tickets only - this is a personal request/status
  // tracker for support requests submitted from this screen.
  // Admin sees the full queue on their own Support screen (AdminSupportScreen).
  useEffect(() => {
    if (!authUser) { setTicketsLoading(false); return undefined; }
    const unsub = supportTicketService.subscribeMySupportTickets(
      authUser.uid,
      (list) => { setMyTickets(list); setTicketsLoading(false); },
      () => setTicketsLoading(false)
    );
    return unsub;
  }, [authUser]);

  const submitTicket = async () => {
    if (!subject.trim()) {
      showAlert('MySheba', 'Please enter a subject for your request.');
      return;
    }
    if (!message.trim()) {
      showAlert('MySheba', 'Please describe your issue.');
      return;
    }
    setSubmitting(true);
    try {
      await supportTicketService.createSupportTicket(
        { subject, message },
        { uid: authUser.uid, phone: profile ? profile.phone : '', name: profile ? profile.name : '', role: profile ? profile.role : 'customer' }
      );
      setSubject('');
      setMessage('');
      showAlert('Request Submitted', 'Our support team will review your request and update its status here.');
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not submit your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };


  const openLink = async (url, label) => {
    try {
      // NOTE: Linking.canOpenURL() is unreliable for mailto:/tel: links on
      // Android 11+ - it can return false even when Gmail/Phone is
      // installed, because those schemes need a <queries> entry in the
      // manifest that a managed Expo app doesn't have. That false negative
      // is what was blocking Email support. Opening directly and only
      // alerting on a real failure fixes it without needing a native
      // config change.
      await Linking.openURL(url);
    } catch (err) {
      showAlert('MySheba', `Couldn't open ${label}. Please make sure you have an app installed that can handle this.`);
    }
  };

  const callSupport = () => {
    if (!hasPhone) {
      showAlert('MySheba', 'Call support isn\u2019t set up yet. Please use Message Support or Email in the meantime.');
      return;
    }
    openLink(`tel:${supportContact.phone}`, 'the dialer');
  };

  const whatsappSupport = () => {
    if (!hasWhatsapp) {
      showAlert('MySheba', 'WhatsApp support isn\u2019t set up yet. Please use Message Support or Email in the meantime.');
      return;
    }
    const name = profile?.name ? profile.name : '';
    const msg = encodeURIComponent(
      name ? `Hi, I'm ${name} and I need help with MySheba.` : `Hi, I need help with MySheba.`
    );
    openLink(`https://wa.me/${supportContact.whatsapp}?text=${msg}`, 'WhatsApp');
  };

  const emailSupport = () => {
    const emailSubject = encodeURIComponent('MySheba Support Request');
    const body = encodeURIComponent(
      profile?.phone ? `Account phone: ${profile.phone}\n\nDescribe your issue here:\n` : 'Describe your issue here:\n'
    );
    openLink(`mailto:${SUPPORT_EMAIL}?subject=${emailSubject}&body=${body}`, 'your email app');
  };


  // Swipe left/right across the tab content to move between Messages /
  // Tickets, same as tapping the segmented bar. Only claims the gesture
  // once a swipe is clearly more horizontal than vertical, so scrolling
  // the tab's own ScrollView is untouched.
  const [tab, setTab] = useState('messages'); // messages | tickets
  const tabIndex = TABS.findIndex((t) => t.key === tab);
  const swipeTo = (dx) => {
    if (dx <= 0 && tabIndex < TABS.length - 1) {
      setTab(TABS[tabIndex + 1].key);
    } else if (dx > 0 && tabIndex > 0) {
      setTab(TABS[tabIndex - 1].key);
    }
  };
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_evt, gesture) =>
      Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_evt, gesture) => {
      if (Math.abs(gesture.dx) > 60) swipeTo(gesture.dx);
    },
  });

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
      </LinearGradient>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {tab === 'messages' && (
        <ScrollView contentContainerStyle={styles.body}>
          <SmartAd placement="HELP_SUPPORT_TOP" feature="help_support" height={100} style={{ marginBottom: 12 }} />

          <TouchableOpacity style={styles.helpCard} onPress={openHelp}>
            <Text style={styles.helpIcon}>🤝</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.helpTitle}>MySheba Help</Text>
              <Text style={styles.helpSubtitle}>Ask a question - salary, documents, housing, jobs & more</Text>
            </View>
            <Text style={styles.helpChevron}>›</Text>
          </TouchableOpacity>



          <View style={styles.contactRow}>
            <TouchableOpacity style={[styles.contactCard, !hasPhone && styles.contactCardDisabled]} onPress={callSupport}>
              <Text style={styles.contactIcon}>📞</Text>
              <Text style={styles.contactLabel}>Call</Text>
              {!hasPhone && <Text style={styles.contactSoon}>Coming soon</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.contactCard, !hasWhatsapp && styles.contactCardDisabled]} onPress={whatsappSupport}>
              <Text style={styles.contactIcon}>💬</Text>
              <Text style={styles.contactLabel}>WhatsApp</Text>
              {!hasWhatsapp && <Text style={styles.contactSoon}>Coming soon</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.contactCard} onPress={emailSupport}>
              <Text style={styles.contactIcon}>✉️</Text>
              <Text style={styles.contactLabel}>Email</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hoursNote}>Support hours: 9:00 AM – 9:00 PM, daily.</Text>

          <SmartAd placement="HELP_SUPPORT_BOTTOM" feature="help_support" height={100} style={{ marginTop: 12 }} />
        </ScrollView>
      )}

      {tab === 'tickets' && (
        <ScrollView contentContainerStyle={styles.body}>
          {!!(isAssignee && (assignedLoading || assignedTickets.length > 0)) && (
            <>
              <Text style={styles.sectionTitle}>🧑‍💼 Assigned to You</Text>
              <Text style={styles.sectionSubtitle}>
                Tickets superadmin has appointed you to solve.
              </Text>
              {assignedLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
              ) : (
                assignedTickets.map((t) => (
                  <AssignedTicketRow
                    key={t.id}
                    item={t}
                    busy={assignedBusyId === t.id}
                    onStart={startAssigned}
                    onResolve={(item) => setAssignedResolveId(item.id)}
                    onReopen={reopenAssigned}
                  />
                ))
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Submit a Support Request</Text>
          <Text style={styles.sectionSubtitle}>
            Describe your issue and our team will review it here, so you can track its status anytime.
          </Text>
          <FormLabel>Subject</FormLabel>
          <FormInput
            placeholder="e.g. Recharge not received"
            value={subject}
            onChangeText={setSubject}
          />
          <FormLabel>Message</FormLabel>
          <FormTextArea
            placeholder="Describe what happened, including any order/reference details"
            value={message}
            onChangeText={setMessage}
          />
          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.submittingText}>Submitting...</Text>
            </View>
          ) : (
            <PrimaryButton label="Submit Request" onPress={submitTicket} />
          )}

          {(!!(ticketsLoading || myTickets.length > 0)) && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 22 }]}>My Support Requests</Text>
              {ticketsLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
              ) : (
                myTickets.map((t) => <TicketRow key={t.id} item={t} />)
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </ScrollView>
      )}
      </View>

      <PromptModal
        visible={!!assignedResolveId}
        title="Reply to requester (optional):"
        placeholder="e.g. Issue fixed, balance credited"
        onSubmit={confirmResolveAssigned}
        onCancel={() => setAssignedResolveId(null)}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    tabBar: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
    tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: colors.primary },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: colors.primary },
    body: { padding: 16, paddingBottom: 30 },
    helpCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 16, marginBottom: 12,
    },
    helpIcon: { fontSize: 24 },
    helpTitle: { fontWeight: '700', fontSize: 15, color: colors.text },
    helpSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    helpChevron: { fontSize: 20, color: '#999' },
    messageSupportCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: colors.primary, borderRadius: radius.lg, padding: 16, marginBottom: 16,
    },
    messageSupportIcon: { fontSize: 24 },
    messageSupportTitle: { color: 'white', fontWeight: '700', fontSize: 15 },
    messageSupportSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
    messageSupportBadge: {
      backgroundColor: colors.error, borderRadius: radius.pill, minWidth: 22, height: 22,
      alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
    },
    messageSupportBadgeText: { color: 'white', fontSize: 11, fontWeight: '700' },
    contactRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
    contactCard: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center' },
    contactCardDisabled: { opacity: 0.55 },
    contactIcon: { fontSize: 24, marginBottom: 6 },
    contactLabel: { fontSize: 12, fontWeight: '600', color: colors.text },
    contactSoon: { fontSize: 9, color: '#999', marginTop: 2 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 10 },
    sectionSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: -4, marginBottom: 12, lineHeight: 17 },
    faqItem: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 8 },
    faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    faqQ: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, marginRight: 8 },
    faqChevron: { fontSize: 14, color: '#999' },
    faqA: { fontSize: 12, color: colors.textSecondary, marginTop: 8, lineHeight: 18 },
    hoursNote: { textAlign: 'center', fontSize: 11, color: '#999', marginTop: 16 },
    followUsBlock: { marginTop: 24, alignItems: 'center' },
    followUsTitle: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    followUsRow: { flexDirection: 'row', gap: 12 },
    followUsBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    followUsIcon: { fontSize: 18 },
    submittingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
    submittingText: { color: colors.primary, fontWeight: '600' },
    ticketCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginBottom: 8 },
    ticketSubject: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text, marginRight: 8 },
    ticketRequester: { fontSize: 11, color: '#999', marginTop: 6 },
    ticketMessage: { fontSize: 12, color: colors.textSecondary, marginTop: 8, lineHeight: 18 },
    ticketActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
    ticketPrimaryBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    ticketSuccessBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    ticketErrorBtn: { flex: 1, backgroundColor: colors.error, paddingVertical: 8, borderRadius: radius.sm, alignItems: 'center' },
    ticketActionText: { color: 'white', fontSize: 11, fontWeight: '600' },
    ticketNoteBox: { backgroundColor: '#F0F7FF', borderRadius: radius.sm, padding: 10, marginTop: 10 },
    ticketNoteLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
    ticketNoteText: { fontSize: 12, color: colors.text, lineHeight: 17 },
    badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.md },
    badgeText: { fontSize: 10, fontWeight: '700' },
  });
}
