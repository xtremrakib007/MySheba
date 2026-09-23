import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, FlatList, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { radius, spacing } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import PromptModal from '../components/PromptModal';
import AssignChatModal from '../components/AssignChatModal';
import * as supportTicketService from '../firebase/supportTicketService';
import * as chatService from '../firebase/chatService';

// Superadmin's own Support screen - the full incoming queue every new
// ticket lands in first. Two tabs:
//   - "Tickets": the trackable open/in_progress/resolved queue, backed by
//     supportTicketService.js. Superadmin assigns each ticket to whichever
//     admin or dealer should solve it (see canAssign below) - that staff
//     member then sees it in their own "Assigned to You" queue on the
//     regular Support screen (SupportScreen.js), where they can work it
//     the same way, minus the ability to reassign it further.
//   - "Messages": every customer's live Support chat thread (the same data
//     ChatListScreen shows), backed by chatService.js, so a superadmin
//     doesn't have to leave Support to see who's messaged in. Each row can
//     be assigned to a specific admin/dealer via AssignChatModal so it's
//     clear who owns resolving it - tapping a row opens the full thread in
//     ChatScreen (see openChat's `returnTo` param), where that same
//     assignment can also be changed from the header.
// Separate either way from AdminHomeScreen's own "Support" tab, which just
// edits the Call/WhatsApp numbers shown to customers, not tickets or chats.
const TOP_TABS = [
  { key: 'tickets', label: '🎫 Tickets' },
  { key: 'messages', label: '💬 Messages' },
];

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'resolved', label: 'Resolved' },
];

function getStatusStyle(colors) {
  return {
    open: { label: 'Open', color: colors.warning, bg: '#FFF8E1' },
    in_progress: { label: 'In Progress', color: colors.primary, bg: '#E8F0FE' },
    resolved: { label: 'Resolved', color: colors.success, bg: '#E8F5E9' },
  };
}

function formatDate(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// Same short "today = time, otherwise = date" formatting as ChatListScreen.
function formatWhen(ts) {
  if (!ts || !ts.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const suffix = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${suffix}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

export default function AdminSupportScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const STATUS_STYLE = getStatusStyle(colors);
  const styles = createStyles(colors);
  const { goBackOrHome, openChat, profile } = useApp();
  const [topTab, setTopTab] = useState('tickets');
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [resolveId, setResolveId] = useState(null);

  // "Messages" tab: every customer's live Support chat thread.
  const [chats, setChats] = useState([]);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [assignChatId, setAssignChatId] = useState(null); // thread id currently open in the assign picker

  // "Tickets" tab assignment - kept as a separate id from assignChatId
  // since a ticket id and a chat thread id (customer uid) are different
  // things and the two "Assign to" modals are never open at the same time.
  const [assignTicketId, setAssignTicketId] = useState(null);

  const canAssign = profile && profile.role === 'superadmin';

  useEffect(() => {
    const unsub = supportTicketService.subscribeSupportTickets(
      (list) => { setTickets(list); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = chatService.subscribeAllChats(
      (list) => { setChats(list); setChatsLoading(false); },
      () => setChatsLoading(false)
    );
    return unsub;
  }, []);

  const visibleChats = chats.filter((c) => c.lastMessage);

  const handleAssignChat = async (staff) => {
    const chatId = assignChatId;
    setAssignChatId(null);
    if (!chatId) return;
    try {
      await chatService.assignChat(chatId, staff);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not assign this chat.');
    }
  };

  const handleUnassignChat = async (chatId) => {
    try {
      await chatService.unassignChat(chatId);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not clear this assignment.');
    }
  };

  const handleAssignTicket = async (staff) => {
    const ticketId = assignTicketId;
    setAssignTicketId(null);
    if (!ticketId) return;
    try {
      await supportTicketService.assignTicket(ticketId, staff);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not assign this ticket.');
    }
  };

  const handleUnassignTicket = async (ticketId) => {
    try {
      await supportTicketService.unassignTicket(ticketId);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not clear this assignment.');
    }
  };

  const counts = tickets.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter);

  const startTicket = async (t) => {
    setBusyId(t.id);
    try {
      await supportTicketService.markTicketInProgress(t.id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not update this ticket.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmResolve = async (note) => {
    const id = resolveId;
    setResolveId(null);
    if (!id) return;
    setBusyId(id);
    try {
      await supportTicketService.resolveTicket(id, note);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not resolve this ticket.');
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (t) => {
    setBusyId(t.id);
    try {
      await supportTicketService.reopenTicket(t.id);
    } catch (e) {
      showAlert('MySheba', e.message || 'Could not reopen this ticket.');
    } finally {
      setBusyId(null);
    }
  };

  const callRequester = (t) => {
    if (!t.userPhone) { showAlert('MySheba', 'No phone number on this ticket.'); return; }
    Linking.openURL(`tel:${t.userPhone}`).catch(() => {});
  };

  const whatsappRequester = (t) => {
    if (!t.userPhone) { showAlert('MySheba', 'No phone number on this ticket.'); return; }
    const digits = t.userPhone.replace(/[^\d]/g, '');
    const msg = encodeURIComponent(`Hi ${t.userName || ''}, this is MySheba Support regarding: "${t.subject}"`.trim());
    Linking.openURL(`https://wa.me/${digits}?text=${msg}`).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
      </LinearGradient>

      <View style={styles.topTabRow}>
        {TOP_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.topTab, topTab === t.key && styles.topTabActive]}
            onPress={() => setTopTab(t.key)}
          >
            <Text style={[styles.topTabText, topTab === t.key && styles.topTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {topTab === 'tickets' && (
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}{f.key !== 'all' && counts[f.key] ? ` (${counts[f.key]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      )}

      {topTab === 'tickets' && (loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {filtered.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyIcon}>🎧</Text>
              <Text style={styles.emptyText}>No {filter === 'all' ? '' : STATUS_STYLE[filter]?.label.toLowerCase() + ' '}tickets.</Text>
            </View>
          ) : (
            filtered.map((t) => {
              const style = STATUS_STYLE[t.status] || STATUS_STYLE.open;
              const isBusy = busyId === t.id;
              return (
                <View key={t.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.subject}>{t.subject}</Text>
                    <View style={[styles.badge, { backgroundColor: style.bg }]}>
                      <Text style={[styles.badgeText, { color: style.color }]}>{style.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.requester}>👤 {t.userName || 'Unknown'} ({t.userRole}) · 📞 {t.userPhone || 'N/A'}</Text>
                  <Text style={styles.message}>{t.message}</Text>
                  <Text style={styles.date}>{formatDate(t.createdAt)}</Text>

                  {t.status === 'resolved' && !!t.adminNote && (
                    <View style={styles.noteBox}>
                      <Text style={styles.noteLabel}>Your reply</Text>
                      <Text style={styles.noteText}>{t.adminNote}</Text>
                    </View>
                  )}

                  <View style={styles.assignRow}>
                    <Text style={styles.assignRowText} numberOfLines={1}>
                      {t.assignedToName
                        ? `🧑‍💼 ${t.assignedToName}${t.assignedToRole ? ` (${t.assignedToRole})` : ''}`
                        : '🧑‍💼 Unassigned'}
                    </Text>
                    {canAssign && (
                      <View style={styles.assignRowActions}>
                        <TouchableOpacity onPress={() => setAssignTicketId(t.id)}>
                          <Text style={styles.assignRowAction}>{t.assignedToName ? 'Reassign' : 'Assign'}</Text>
                        </TouchableOpacity>
                        {!!t.assignedToName && (
                          <TouchableOpacity onPress={() => handleUnassignTicket(t.id)}>
                            <Text style={styles.assignRowClear}>Clear</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={styles.actions}>
                    <TouchableOpacity style={styles.callBtn} onPress={() => callRequester(t)}>
                      <Text style={styles.actionBtnText}>📞 Call</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.whatsappBtn} onPress={() => whatsappRequester(t)}>
                      <Text style={styles.actionBtnText}>💬 WhatsApp</Text>
                    </TouchableOpacity>
                  </View>

                  {t.status === 'open' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.primaryBtn} onPress={() => startTicket(t)} disabled={isBusy}>
                        <Text style={styles.actionBtnText}>{isBusy ? '…' : '▶ Start'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.successBtn} onPress={() => setResolveId(t.id)} disabled={isBusy}>
                        <Text style={styles.actionBtnText}>✓ Resolve</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {t.status === 'in_progress' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.successBtn} onPress={() => setResolveId(t.id)} disabled={isBusy}>
                        <Text style={styles.actionBtnText}>{isBusy ? '…' : '✓ Resolve'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {t.status === 'resolved' && (
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.errorBtn} onPress={() => reopen(t)} disabled={isBusy}>
                        <Text style={styles.actionBtnText}>{isBusy ? '…' : '↺ Reopen'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      ))}

      {topTab === 'messages' && (
        chatsLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={visibleChats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.body}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>No messages yet.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const name = item.customerName || item.customerPhone || 'Customer';
              const unread = item.unreadForStaff || 0;
              return (
                <View style={styles.card}>
                  <TouchableOpacity onPress={() => openChat(item.id, name, 'adminSupport')}>
                    <View style={styles.cardTop}>
                      <Text style={styles.subject}>{name}</Text>
                      <Text style={styles.date}>{formatWhen(item.lastMessageAt)}</Text>
                    </View>
                    <Text style={styles.message} numberOfLines={2}>
                      {item.lastSenderRole === 'staff' ? 'You: ' : ''}{item.lastMessage}
                    </Text>
                    {unread > 0 && (
                      <View style={[styles.badge, { backgroundColor: '#E8F5E9', alignSelf: 'flex-start', marginTop: 6 }]}>
                        <Text style={[styles.badgeText, { color: colors.success }]}>{unread} new</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <View style={styles.assignRow}>
                    <Text style={styles.assignRowText} numberOfLines={1}>
                      {item.assignedToName
                        ? `🧑‍💼 ${item.assignedToName}${item.assignedToRole ? ` (${item.assignedToRole})` : ''}`
                        : '🧑‍💼 Unassigned'}
                    </Text>
                    {canAssign && (
                      <View style={styles.assignRowActions}>
                        <TouchableOpacity onPress={() => setAssignChatId(item.id)}>
                          <Text style={styles.assignRowAction}>{item.assignedToName ? 'Reassign' : 'Assign'}</Text>
                        </TouchableOpacity>
                        {!!item.assignedToName && (
                          <TouchableOpacity onPress={() => handleUnassignChat(item.id)}>
                            <Text style={styles.assignRowClear}>Clear</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      <PromptModal
        visible={!!resolveId}
        title="Reply to requester (optional):"
        placeholder="e.g. Issue fixed, points credited"
        onSubmit={confirmResolve}
        onCancel={() => setResolveId(null)}
      />

      {canAssign && (
        <AssignChatModal
          visible={!!assignChatId}
          currentUid={(chats.find((c) => c.id === assignChatId) || {}).assignedToUid || ''}
          onSelect={handleAssignChat}
          onCancel={() => setAssignChatId(null)}
        />
      )}

      {canAssign && (
        <AssignChatModal
          visible={!!assignTicketId}
          currentUid={(tickets.find((t) => t.id === assignTicketId) || {}).assignedToUid || ''}
          onSelect={handleAssignTicket}
          onCancel={() => setAssignTicketId(null)}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingHorizontal: spacing.lg, backgroundColor: colors.primary, overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '700', fontSize: 16, marginLeft: 10 },
    topTabRow: { flexDirection: 'row', backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    topTab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    topTabActive: { borderBottomColor: colors.primary },
    topTabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    topTabTextActive: { color: colors.primary },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
    filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterText: { fontSize: 11, fontWeight: '600', color: colors.text },
    filterTextActive: { color: 'white' },
    body: { padding: spacing.lg, paddingBottom: spacing.xl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { fontSize: 13, color: colors.textSecondary },
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 5,
      elevation: 1,
    },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 8 },
    subject: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
    requester: { fontSize: 11, color: colors.textSecondary, marginBottom: 6 },
    message: { fontSize: 12, color: colors.textSecondary, lineHeight: 18, marginBottom: 6 },
    date: { fontSize: 10, color: colors.textSecondary, marginBottom: 8 },
    noteBox: { backgroundColor: '#F0F7FF', borderRadius: radius.md, padding: 10, marginBottom: 8 },
    noteLabel: { fontSize: 10, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 },
    noteText: { fontSize: 12, color: colors.text, lineHeight: 17 },
    assignRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border,
    },
    assignRowText: { flex: 1, fontSize: 11, color: colors.textSecondary, marginRight: 8 },
    assignRowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    assignRowAction: { fontSize: 11, fontWeight: '700', color: colors.primary },
    assignRowClear: { fontSize: 11, fontWeight: '700', color: colors.error },
    badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill },
    badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    primaryBtn: { flex: 1, backgroundColor: colors.primary, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    successBtn: { flex: 1, backgroundColor: colors.success, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    errorBtn: { flex: 1, backgroundColor: colors.error, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    callBtn: { flex: 1, backgroundColor: colors.primaryDark, paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    whatsappBtn: { flex: 1, backgroundColor: '#25D366', paddingVertical: 9, borderRadius: radius.md, alignItems: 'center' },
    actionBtnText: { color: 'white', fontSize: 12, fontWeight: '600' },
  });
}
