// MySheba push notifications - the SERVER half.
//
// The app's client side (src/notifications/pushService.js) only registers a
// device for push and saves the resulting Expo push token onto
// users/{uid}.pushToken. Actually *sending* a notification happens here,
// triggered by the same Firestore writes the app already makes (creating a
// transaction, a dealer accepting an order, an admin approving a top-up,
// etc) - no changes needed anywhere else for this to work once deployed.
//
// Requires Node 18+ (for global fetch) - see package.json engines.
//
// Deploy with: firebase deploy --only functions
// (requires `firebase login` + `firebase use satulink-solutions` first -
// see functions/README.md)

const { onDocumentCreated, onDocumentUpdated, onDocumentWritten, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const progressionService = require('./progressionService');

// Service labels that count toward Tier progress when their transaction
// reaches 'completed' - see onTransactionUpdated below. Kept as an
// explicit allowlist (not "every service") so a future new chargeable
// service doesn't silently start granting Tier progress until someone
// decides it should.
const TIER_QUALIFYING_SERVICES = ['Recharge', 'Internet', 'Mobile Banking', 'Remittance'];

exports.generateAgoraToken = require('./agoraToken').generateAgoraToken;
exports.manageUser = require('./userManagement').manageUser;
exports.searchUsers = require('./userSearch').searchUsers;
exports.getUserByUid = require('./userSearch').getUserByUid;
exports.matchContactsByPhone = require('./matchContactsByPhone').matchContactsByPhone;
exports.registerWithDealerCode = require('./customerRegistration').registerWithDealerCode;
exports.resetPassword = require('./passwordReset').resetPassword;
exports.ensureGoogleProfile = require('./googleAuth').ensureGoogleProfile;
exports.startAccountMerge = require('./accountMergeService').startAccountMerge;
exports.confirmAccountMerge = require('./accountMergeService').confirmAccountMerge;
exports.ensureUserId = require('./ensureUserId').ensureUserId;
exports.checkDeviceSession = require('./deviceSessionService').checkDeviceSession;
exports.confirmDeviceSwitch = require('./deviceSessionService').confirmDeviceSwitch;
exports.clearActiveSession = require('./deviceSessionService').clearActiveSession;
exports.listTrustedDevices = require('./deviceSessionService').listTrustedDevices;
exports.revokeTrustedDevice = require('./deviceSessionService').revokeTrustedDevice;
exports.sendAnnouncement = require('./announcements').sendAnnouncement;
exports.approveTopup = require('./walletService').approveTopup;
exports.rejectTopup = require('./walletService').rejectTopup;
exports.createSelfTopup = require('./walletService').createSelfTopup;
exports.transferPoints = require('./walletService').transferPoints;
exports.chargeWallet = require('./walletService').chargeWallet;
exports.boostListing = require('./walletService').boostListing;
exports.chargeRecharge = require('./walletService').chargeRecharge;
exports.chargeInternetPackage = require('./walletService').chargeInternetPackage;
exports.rejectRechargeTransaction = require('./walletService').rejectRechargeTransaction;
exports.rejectInternetPackageTransaction = require('./walletService').rejectInternetPackageTransaction;
exports.chargeMobileBanking = require('./walletService').chargeMobileBanking;
exports.chargeRemittance = require('./walletService').chargeRemittance;
exports.rejectMobileBankingTransaction = require('./walletService').rejectMobileBankingTransaction;
exports.rejectRemittanceTransaction = require('./walletService').rejectRemittanceTransaction;
exports.chargeGamePoints = require('./walletService').chargeGamePoints;
exports.withdrawGamePoints = require('./walletService').withdrawGamePoints;
exports.transferGamePoints = require('./walletService').transferGamePoints;
exports.giftGamePoints = require('./walletService').giftGamePoints;
exports.approveVerification = require('./verificationService').approveVerification;
exports.rejectVerification = require('./verificationService').rejectVerification;
exports.setBusinessProfileStatus = require('./businessProfileService').setBusinessProfileStatus;
exports.setupSecurityPin = require('./securityPinService').setupSecurityPin;
exports.verifySecurityPin = require('./securityPinService').verifySecurityPin;
exports.resetSecurityPin = require('./securityPinService').resetSecurityPin;
exports.listingPreview = require('./listingPreview').listingPreview;
exports.updateAdSettings = require('./adControlsService').updateAdSettings;
exports.updateAdFeatureControl = require('./adControlsService').updateAdFeatureControl;
exports.bulkUpdateAdFeatureControls = require('./adControlsService').bulkUpdateAdFeatureControls;
exports.deleteAdCreative = require('./adCreativeService').deleteAdCreative;
// PHASE 7 - AD TRACKING: the only writer of advertisements/{adId}.
// totalImpressions/totalClicks - see functions/adTrackingService.js's
// own header comment for the trust model this enforces.
exports.onAdImpressionCreated = require('./adTrackingService').onAdImpressionCreated;
exports.onAdClickCreated = require('./adTrackingService').onAdClickCreated;

// PHASE 10 - Advertising Packages and Payments. The only write path to
// ad_payments/{paymentId} (firestore.rules: allow write: if false) -
// see functions/adPaymentService.js's own header comment.
exports.createAdPayment = require('./adPaymentService').createAdPayment;
exports.updateAdPaymentStatus = require('./adPaymentService').updateAdPaymentStatus;

exports.listApiProviders = require('./apiProviderService').listApiProviders;
exports.saveApiProvider = require('./apiProviderService').saveApiProvider;
exports.deleteApiProvider = require('./apiProviderService').deleteApiProvider;
exports.getServiceApiSettings = require('./apiProviderService').getServiceApiSettings;
exports.saveServiceApiSettings = require('./apiProviderService').saveServiceApiSettings;

admin.initializeApp();
const db = admin.firestore();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const STAFF_ROLES = ['dealer', 'reseller', 'admin', 'superadmin'];
const ADMIN_ROLES = ['admin', 'superadmin'];

// ---------------------------------------------------------------------------
// Expo push helpers
// ---------------------------------------------------------------------------

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Sends a batch of Expo push messages (each: {to, title, body, data}), chunked into groups of 100 per Expo's guidance. */
async function sendExpoPush(messages) {
  const valid = messages.filter((m) => m && m.to);
  if (valid.length === 0) return;

  for (const batch of chunk(valid, 100)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(batch.map((m) => ({ sound: 'default', ...m }))),
      });
      if (!res.ok) {
        console.error('Expo push HTTP error', res.status, await res.text());
      }
    } catch (e) {
      console.error('Expo push send failed', e);
    }
  }
}

/**
 * Sends a data-only (no `notification` key) FCM message straight to a
 * user's raw device token — used only for incoming calls. This is what lets
 * the app's background handler (index.js) fire and show a Notifee
 * full-screen ringing notification even with the app fully killed, which
 * Expo's push API (sendExpoPush above) can't reliably trigger. See
 * src/notifications/pushService.js (getFcmToken) and callPush.js for the
 * client half. Silently no-ops if the user has no fcmToken saved (e.g. iOS,
 * or hasn't opened the rebuilt app yet) — callers should also send the
 * regular Expo push as a fallback.
 */
async function sendCallDataMessage(uid, data) {
  if (!uid) return;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return;
  const { fcmToken, notifPrefs, callSettings } = snap.data();
  if (!fcmToken) return;
  if (notifPrefs && notifPrefs.pushEnabled === false) return;
  if (callSettings && callSettings.notificationsEnabled === false) return;

  try {
    await admin.messaging().send({
      token: fcmToken,
      data,
      android: { priority: 'high' },
    });
  } catch (e) {
    console.error('Call data message send failed', e);
  }
}

/** Reads one user's push token + prefs. Returns null if they have no token or have push disabled. */
async function getUserPushTarget(uid) {
  if (!uid) return null;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) return null;
  const data = snap.data();
  if (!data.pushToken) return null;
  if (data.notifPrefs && data.notifPrefs.pushEnabled === false) return null;
  return data.pushToken;
}

/** Sends one push to one user (a customer, usually), respecting their notifPrefs.pushEnabled.
 * `extra` merges straight into the Expo push message - used for call pushes
 * to set channelId/priority so Android routes them through the MAX-importance
 * 'calls' channel instead of the quieter default one (see pushService.js). */
async function notifyUser(uid, title, body, data, extra) {
  const token = await getUserPushTarget(uid);
  if (!token) return;
  await sendExpoPush([{ to: token, title, body, data: data || {}, ...(extra || {}) }]);
}

/** Sends the same push to every user with one of the given roles (e.g. every dealer, or every admin), respecting each user's notifPrefs.pushEnabled. */
async function notifyRoles(roles, title, body, data) {
  const snap = await db.collection('users').where('role', 'in', roles).get();
  const messages = [];
  snap.forEach((doc) => {
    const u = doc.data();
    if (!u.pushToken) return;
    if (u.notifPrefs && u.notifPrefs.pushEnabled === false) return;
    messages.push({ to: u.pushToken, title, body, data: data || {} });
  });
  await sendExpoPush(messages);
}

// ---------------------------------------------------------------------------
// Transactions (recharge / mobile banking / internet / remittance)
// ---------------------------------------------------------------------------

// A reseller-first order (resellerId set, dealerId still null) isn't
// actually visible to any dealer yet - firestore.rules only lets a dealer
// read an order once resource.data.dealerId == their own scope. So it only
// makes sense to ping that one reseller here, not blast every dealer for
// an order they can't open. A plain order (no reseller in front) keeps the
// original behavior of notifying every dealer, since it lands straight in
// the shared dealer pool.
exports.onTransactionCreated = onDocumentCreated('transactions/{id}', async (event) => {
  const tx = event.data.data();
  const body = `${tx.service} - MYR ${Number(tx.total || 0).toFixed(2)}`;
  if (tx.resellerId) {
    await notifyUser(tx.resellerId, '🆕 New order', body, { type: 'transaction', id: event.params.id });
  } else {
    await notifyRoles(
      ['dealer'],
      '🆕 New order',
      body,
      { type: 'transaction', id: event.params.id }
    );
  }
});

exports.onTransactionUpdated = onDocumentUpdated('transactions/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // A reseller forwarding an order (or admin appointing one) only ever
  // changes dealerId - status/rejected stay untouched at that moment (the
  // dealer still has to Accept it themselves). That transition never hits
  // the customer-status branch below, so it needs its own check: the first
  // time dealerId goes from unset to set, ping that specific dealer - same
  // "new order" push a plain (no-reseller) order gets on create, just
  // scoped to the one dealer it just landed with instead of every dealer.
  if (!before.dealerId && after.dealerId) {
    await notifyUser(
      after.dealerId,
      '🆕 New order',
      `${after.service} - MYR ${Number(after.total || 0).toFixed(2)}`,
      { type: 'transaction', id: event.params.id }
    );
  }

  // Tier progression: +1 tierPoints the instant a qualifying paid service
  // order is completed (see progressionService.js's TIER_QUALIFYING_SERVICES
  // note above and incrementTierPoints). Checked on every update, not just
  // status changes generally, so this only ever fires once per order (the
  // before/after guard means a later no-op update to an already-completed
  // order can't double-count it).
  if (before.status !== 'completed' && after.status === 'completed' && TIER_QUALIFYING_SERVICES.includes(after.service)) {
    await progressionService.incrementTierPoints(after.customerId);
  }

  if (before.status === after.status && before.rejected === after.rejected) return;

  let title = 'Order update';
  let body = `${after.service} is now ${after.status}.`;
  if (after.rejected) {
    title = '❌ Order rejected';
    body = `${after.service}: ${after.rejectReason || 'Rejected by dealer.'}`;
  } else if (after.status === 'processing') {
    title = '🔄 Order accepted';
    body = `${after.service} is being processed.`;
  } else if (after.status === 'completed') {
    title = '✅ Order completed';
    body = after.pin
      ? `${after.service} is ready. Collection PIN: ${after.pin}`
      : `${after.service} has been completed.`;
  }

  await notifyUser(after.customerId, title, body, { type: 'transaction', id: event.params.id });
});

// ---------------------------------------------------------------------------
// Tier/Level progression trigger for game spends (see progressionService.js)
// - the other qualifying events (transaction completion, flight inquiry
// close, chat message) are handled by merging into the existing
// onTransactionUpdated/onInquiryUpdated/onChatMessageCreated triggers below,
// since those collections already have notification triggers of their own.
// ---------------------------------------------------------------------------

exports.onGamePointsLedgerCreated = onDocumentCreated('gamePointsLedger/{id}', async (event) => {
  const entry = event.data.data();
  // Only an actual spend (entry_fee) grants Level progress - a
  // pot_winnings credit is money coming back, not new engagement, so it's
  // deliberately excluded (see functions-gamebot/pointsLedger.js for both
  // reasons this ledger gets written).
  if (entry.reason === 'entry_fee') {
    await progressionService.incrementLevelPoints(entry.uid);
  }
});

// ---------------------------------------------------------------------------
// Top-ups (wallet point requests)
// ---------------------------------------------------------------------------

exports.onTopupCreated = onDocumentCreated('topups/{id}', async (event) => {
  const tp = event.data.data();
  await notifyRoles(
    ADMIN_ROLES,
    '💰 New top-up request',
    `${tp.userName || 'A user'} requested MYR ${Number(tp.amount || 0).toFixed(2)}`,
    { type: 'topup', id: event.params.id }
  );
});

exports.onTopupUpdated = onDocumentUpdated('topups/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;
  if (after.status === 'approved') {
    await notifyUser(
      after.userId,
      '✅ Top-up approved',
      `MYR ${Number(after.amount || 0).toFixed(2)} (${Number(after.points || 0).toFixed(2)} pts) has been credited to your wallet.`,
      { type: 'topup', id: event.params.id }
    );
  } else if (after.status === 'rejected') {
    await notifyUser(
      after.userId,
      '❌ Top-up rejected',
      after.rejectReason || 'Your top-up request was rejected.',
      { type: 'topup', id: event.params.id }
    );
  }
});

// ---------------------------------------------------------------------------
// Support tickets (customer/dealer support requests, admin-review model -
// separate from the live chats/{uid} thread further below, which has its
// own onChatMessageCreated trigger). selfTopups has no trigger here: it's
// staff-only, auto-approved on write, and nobody needs to be notified of it.
// ---------------------------------------------------------------------------

exports.onSupportTicketCreated = onDocumentCreated('supportTickets/{id}', async (event) => {
  const ticket = event.data.data();
  await notifyRoles(
    ADMIN_ROLES,
    '🎧 New support request',
    `${ticket.userName || 'A user'}: ${ticket.subject || 'Support request'}`,
    { type: 'supportTicket', id: event.params.id }
  );
});

exports.onSupportTicketUpdated = onDocumentUpdated('supportTickets/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;

  if (after.status === 'in_progress') {
    await notifyUser(
      after.userId,
      '🔄 Support request update',
      `We're looking into "${after.subject || 'your request'}".`,
      { type: 'supportTicket', id: event.params.id }
    );
  } else if (after.status === 'resolved') {
    await notifyUser(
      after.userId,
      '✅ Support request resolved',
      after.adminNote || `Your request "${after.subject || ''}" has been resolved.`,
      { type: 'supportTicket', id: event.params.id }
    );
  }
});

// ---------------------------------------------------------------------------
// Travel inquiries (flight / bus / train - admin-contact model)
// ---------------------------------------------------------------------------

exports.onInquiryCreated = onDocumentCreated('inquiries/{id}', async (event) => {
  const inq = event.data.data();
  await notifyRoles(
    ADMIN_ROLES,
    '✈️ New travel inquiry',
    `${inq.type}: ${inq.from} → ${inq.to} (${inq.date})`,
    { type: 'inquiry', id: event.params.id }
  );
});

exports.onInquiryUpdated = onDocumentUpdated('inquiries/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();

  // Tier progression: a Flight inquiry closed with a ticket attached counts
  // as a qualifying "order" the same as a completed transaction (see
  // TIER_QUALIFYING_SERVICES note near the top of this file) - Bus/Train
  // inquiries never reach this (they're WebView bookings, see
  // inquiryService.js), and a plain close with no ticket (the old Bus/Train
  // path, kept for legacy rows) doesn't count since it's not a confirmed
  // booking. Checked before the status-unchanged early return below since
  // that guard only applies to the notification logic that follows.
  if (before.status !== 'closed' && after.status === 'closed' && after.type === 'flight' && after.ticketUrl) {
    await progressionService.incrementTierPoints(after.customerId);
  }

  if (before.status === after.status) return;
  if (after.status === 'contacted') {
    await notifyUser(
      after.customerId,
      '📞 We called about your inquiry',
      `An agent has reached out about your ${after.type} inquiry.`,
      { type: 'inquiry', id: event.params.id }
    );
  } else if (after.status === 'closed') {
    await notifyUser(
      after.customerId,
      '✅ Inquiry closed',
      `Your ${after.type} inquiry has been closed.`,
      { type: 'inquiry', id: event.params.id }
    );
  }
});

// ---------------------------------------------------------------------------
// Chat messages
// ---------------------------------------------------------------------------

exports.onChatMessageCreated = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const msg = event.data.data();
    const chatId = event.params.chatId; // == the customer's uid
    const preview = msg.text && msg.text.length > 80 ? `${msg.text.slice(0, 77)}...` : msg.text;

    // Level progression: +1 levelPoints per chat message sent, combined
    // with game entry-fee spends (onGamePointsLedgerCreated below) into one
    // counter (see progressionService.js's incrementLevelPoints/
    // DEFAULT_LEVEL_STEP).
    await progressionService.incrementLevelPoints(msg.senderId);

    if (msg.senderRole === 'customer') {
      await notifyRoles(STAFF_ROLES, `💬 ${msg.senderName || 'Customer'}`, preview || 'New message', {
        type: 'chat',
        chatId,
      });
    } else {
      await notifyUser(chatId, `💬 ${msg.senderName || 'MySheba Support'}`, preview || 'New message', {
        type: 'chat',
        chatId,
      });
    }
  }
);

// ---------------------------------------------------------------------------
// Direct chats (1:1 messaging between any two accounts - separate from the
// customer<->Support thread above, and from group chats below)
// ---------------------------------------------------------------------------

exports.onDirectChatMessageCreated = onDocumentCreated(
  'directChats/{chatId}/messages/{messageId}',
  async (event) => {
    const msg = event.data.data();
    const chatId = event.params.chatId;
    const preview = msg.text && msg.text.length > 80 ? `${msg.text.slice(0, 77)}...` : msg.text;

    const chatSnap = await db.collection('directChats').doc(chatId).get();
    if (!chatSnap.exists) return;
    const participants = chatSnap.data().participants || [];
    const recipient = participants.find((uid) => uid !== msg.senderId);
    if (!recipient) return;

    await notifyUser(recipient, `\uD83D\uDCAC ${msg.senderName || 'New message'}`, preview || 'New message', {
      type: 'directChat',
      chatId,
    });
  }
);

// "Report conversation" (Marketplace PRD section 11 "Security"). Unlike
// the five *ReportCreated triggers below there's no post/listing to
// auto-hide - a direct chat is private, not public content - so this is
// purely an admin-visibility ping, same notifyRoles(ADMIN_ROLES, ...) call
// every other report trigger in this file ends with.
//
// It also flips directChats/{chatId}.underInvestigation to true using the
// Admin SDK (which bypasses firestore.rules) - that flag is the ONLY thing
// firestore.rules checks to let a superadmin read this otherwise-private
// thread's messages (see ChatReportsScreen's "Investigate" button and
// firestore.rules' directChats/messages read rule). It's set here rather
// than trusted from the client because a client can't be allowed to grant
// itself read access to someone else's private conversation.
exports.onDirectChatReportCreated = onDocumentCreated('directChatReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (report.chatId) {
    await db.collection('directChats').doc(report.chatId).set({ underInvestigation: true }, { merge: true });
  }
  await notifyRoles(
    ADMIN_ROLES,
    '🚩 New conversation report',
    report.reason ? `Reported: ${report.reason}` : 'A direct chat conversation was reported.',
    { type: 'directChatReport', id: event.params.reportId }
  );
});

// Companion to onDirectChatReportCreated above - keeps the
// underInvestigation flag in sync with whether a chat has any open report
// against it. Two directions matter here, both driven by
// ChatReportsScreen's Dismiss/Reopen buttons calling setChatReportStatus:
//   resolved -> open   (Reopen) - flip the flag back on.
//   *       -> resolved (Dismiss) - flip it off, but only once EVERY
//     report against that chat is resolved (a chat can accumulate several
//     reports over time; one being dismissed shouldn't cut off
//     investigation of another still-open one).
// Only fires on an actual status transition, not every field edit, to
// avoid a redundant write/query on every no-op update.
exports.onDirectChatReportUpdated = onDocumentUpdated('directChatReports/{reportId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status || !after.chatId) return;

  if (after.status === 'open') {
    await db.collection('directChats').doc(after.chatId).set({ underInvestigation: true }, { merge: true });
    return;
  }

  if (after.status === 'resolved') {
    const stillOpen = await db.collection('directChatReports')
      .where('chatId', '==', after.chatId)
      .where('status', '==', 'open')
      .limit(1)
      .get();
    if (stillOpen.empty) {
      await db.collection('directChats').doc(after.chatId).set({ underInvestigation: false }, { merge: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Group chats (multi-person threads - separate collection from the two
// above; see src/firebase/groupChatService.js for the client-side shape)
// ---------------------------------------------------------------------------

exports.onGroupChatMessageCreated = onDocumentCreated(
  'groupChats/{groupId}/messages/{messageId}',
  async (event) => {
    const msg = event.data.data();
    const groupId = event.params.groupId;
    const preview = msg.text && msg.text.length > 80 ? `${msg.text.slice(0, 77)}...` : msg.text;

    const groupSnap = await db.collection('groupChats').doc(groupId).get();
    if (!groupSnap.exists) return;
    const group = groupSnap.data();
    const recipients = (group.memberUids || []).filter((uid) => uid !== msg.senderId);
    if (recipients.length === 0) return;

    const tokens = [];
    for (const uid of recipients) {
      const token = await getUserPushTarget(uid);
      if (token) tokens.push(token);
    }

    await sendExpoPush(
      tokens.map((to) => ({
        to,
        title: `\uD83D\uDCAC ${group.name || 'Group Chat'}`,
        body: `${msg.senderName || 'Someone'}: ${preview || 'New message'}`,
        data: { type: 'groupChat', groupId },
      }))
    );
  }
);

// Room/group deletion cleanup - src/firebase/roomChatService.js's
// deleteRoom and groupChatService.js's deleteGroup (called from
// RoomSettingsScreen/GroupSettingsScreen's Delete Room/Group buttons)
// only remove the parent roomChats/{roomId} or groupChats/{groupId}
// document itself; a client can't reliably batch-delete an arbitrarily
// large messages subcollection on its own. These two triggers finish the
// job server-side the moment the parent doc is gone, using
// admin.firestore().recursiveDelete so it works no matter how many
// messages there are (or any data nested under an individual message).
exports.onRoomChatDeleted = onDocumentDeleted('roomChats/{roomId}', async (event) => {
  const messagesRef = db.collection('roomChats').doc(event.params.roomId).collection('messages');
  await admin.firestore().recursiveDelete(messagesRef);
});

exports.onGroupChatDeleted = onDocumentDeleted('groupChats/{groupId}', async (event) => {
  const messagesRef = db.collection('groupChats').doc(event.params.groupId).collection('messages');
  await admin.firestore().recursiveDelete(messagesRef);
});

// ---------------------------------------------------------------------------
// Voice / video calls (Agora) - this only sends the "ringing" push. Actual
// call media never touches Firebase; see src/firebase/callService.js and
// src/screens/CallScreen.js for the Agora join/leave flow.
// ---------------------------------------------------------------------------

exports.onCallCreated = onDocumentCreated('calls/{callId}', async (event) => {
  const call = event.data.data();
  if (call.status !== 'ringing') return;

  const kind = call.type === 'video' ? '📹 Video call' : '📞 Voice call';
  const callType = call.type === 'video' ? 'video' : 'audio';

  // Sends both the visible push and the data-only wake-up message to one
  // callee, after checking their own "Incoming Call Notifications" toggle
  // (Call Settings screen) - the Firestore call doc itself is still
  // created either way so Accept/Decline still work if that person already
  // has the app open and sees it via the live listener in callService.js;
  // this only stops the two notifications below for them.
  //
  // callerUid/groupId are passed through so the client can resolve a
  // per-caller ringtone/vibration override (see callerRingtoneService.js)
  // in the background/killed-app case, the same way IncomingCallModal.js
  // already does for the app-open case - callChannelId in callPush.js
  // picks the notification channel by looking one of these up in the
  // cached overrides map. Mirrors IncomingCallModal.js's own key choice:
  // a 1:1 call resolves by callerUid, but a GROUP call resolves by
  // groupId, not by whichever member happened to start this particular
  // instance of it - the group should ring the same way regardless of who
  // rang it. Both are simply present-or-absent on the FCM data payload
  // (FCM data values must be strings, so undefined ones are omitted below
  // rather than sent as the literal string "undefined").
  async function ringOne(calleeUid, callerName, callerUid, groupId) {
    const calleeSnap = await db.collection('users').doc(calleeUid).get();
    const calleeData = calleeSnap.exists ? calleeSnap.data() : {};
    if (calleeData.callSettings && calleeData.callSettings.notificationsEnabled === false) return;

    // priority: 'high' + channelId: 'calls' make Android show this as an
    // urgent, MAX-importance heads-up notification (loud sound, repeating
    // vibration) even while the app is fully closed, instead of the
    // quieter default channel every other notification uses - see
    // pushService.js for the channel definition. iOS just gets its usual
    // sound-on push; a true ringing lock-screen call UI on iOS needs a
    // PushKit/CallKit integration, which is a native-code addition beyond
    // what Expo push can do.
    await Promise.all([
      notifyUser(
        calleeUid,
        kind,
        `${callerName || 'Someone'} is calling you`,
        { type: 'call', callId: event.params.callId },
        { priority: 'high', channelId: 'calls' }
      ),
      // Data-only FCM message -> wakes the app's background handler to
      // show a real full-screen ringing notification (Android). See
      // sendCallDataMessage above for why this is separate from the Expo
      // push just above.
      sendCallDataMessage(calleeUid, {
        type: 'call',
        callId: event.params.callId,
        callerName: callerName || 'Someone',
        callType,
        ...(callerUid ? { callerUid } : {}),
        ...(groupId ? { groupId } : {}),
      }),
    ]);
  }

  if (call.isGroup) {
    // Ring every invited member except the caller themselves. Every
    // member is rung with the same groupId (and no callerUid) regardless
    // of who actually tapped "start call" - see the ringOne comment above.
    await Promise.all((call.ringingUids || []).map((uid) => ringOne(uid, call.callerName, null, call.groupId)));
  } else {
    await ringOne(call.calleeUid, call.callerName, call.callerUid, null);
  }
});

// Auto-closes out a group call once nobody's ringing and nobody's left in
// it, so the doc doesn't sit at status 'active'/'ringing' forever if the
// last person to leave does so from a killed app (no client around to mark
// it 'ended' itself). 1:1 calls manage their own 'ended'/'declined'/
// 'missed' transitions entirely client-side and don't need this.
exports.onCallUpdated = onDocumentUpdated('calls/{callId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (!after.isGroup || after.status === 'ended') return;
  if ((after.ringingUids || []).length > 0 || (after.activeUids || []).length > 0) return;
  // Nothing changed about who's ringing/active (e.g. an unrelated field
  // touch) - avoid writing on every event once it's already caught up.
  if ((before.ringingUids || []).length === 0 && (before.activeUids || []).length === 0) return;

  await event.data.after.ref.update({ status: 'ended', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
});

// ---------------------------------------------------------------------------
// Marketplace (Buy & Sell) - report moderation. Listing create/edit/browse
// and buyer<->seller chat (reusing directChats above) all happen straight
// from the client (src/firebase/marketplaceService.js), no trigger needed.
// This is the one write that has to be server-trusted: bumping a listing's
// reportCount off the Admin SDK (firestore.rules blocks the client from
// setting it directly) and auto-hiding a listing once enough reports land.
// ---------------------------------------------------------------------------

const MARKETPLACE_REPORT_HIDE_THRESHOLD = 5;

exports.onMarketplaceReportCreated = onDocumentCreated('marketplaceReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.listingId) return;

  const listingRef = db.collection('marketplaceListings').doc(report.listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return;
  const listing = listingSnap.data();

  const newCount = (listing.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const willHide = newCount >= MARKETPLACE_REPORT_HIDE_THRESHOLD && listing.status !== 'hidden';
  if (willHide) patch.status = 'hidden';
  await listingRef.update(patch);

  await notifyRoles(
    ADMIN_ROLES,
    willHide ? '🚩 Listing auto-hidden' : '🚩 New marketplace report',
    willHide
      ? `"${listing.title || 'A listing'}" was hidden after ${newCount} reports.`
      : `${report.reason || 'Reported'}: "${listing.title || 'A listing'}"`,
    { type: 'marketplaceReport', listingId: report.listingId }
  );
});

// Same auto-moderation pattern as onMarketplaceReportCreated above, for
// Accommodation property reports (Phase 2 of the Marketplace PRD).
const ACCOMMODATION_REPORT_HIDE_THRESHOLD = 5;

exports.onAccommodationReportCreated = onDocumentCreated('propertyReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.propertyId) return;

  const propertyRef = db.collection('properties').doc(report.propertyId);
  const propertySnap = await propertyRef.get();
  if (!propertySnap.exists) return;
  const property = propertySnap.data();

  const newCount = (property.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const willHide = newCount >= ACCOMMODATION_REPORT_HIDE_THRESHOLD && property.status !== 'hidden';
  if (willHide) patch.status = 'hidden';
  await propertyRef.update(patch);

  await notifyRoles(
    ADMIN_ROLES,
    willHide ? '🚩 Property auto-hidden' : '🚩 New property report',
    willHide
      ? `"${property.title || 'A property'}" was hidden after ${newCount} reports.`
      : `${report.reason || 'Reported'}: "${property.title || 'A property'}"`,
    { type: 'propertyReport', propertyId: report.propertyId }
  );
});

// Same auto-moderation pattern as onAccommodationReportCreated above, for
// Room Sharing request reports (Phase 2 of the Marketplace PRD).
const ROOMMATE_REPORT_HIDE_THRESHOLD = 5;

exports.onRoommateReportCreated = onDocumentCreated('roommateReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.requestId) return;

  const requestRef = db.collection('roommateRequests').doc(report.requestId);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) return;
  const roommateRequest = requestSnap.data();

  const newCount = (roommateRequest.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const willHide = newCount >= ROOMMATE_REPORT_HIDE_THRESHOLD && roommateRequest.status !== 'hidden';
  if (willHide) patch.status = 'hidden';
  await requestRef.update(patch);

  await notifyRoles(
    ADMIN_ROLES,
    willHide ? '🚩 Roommate request auto-hidden' : '🚩 New roommate request report',
    willHide
      ? `A roommate request by "${roommateRequest.posterName || 'a user'}" was hidden after ${newCount} reports.`
      : `${report.reason || 'Reported'}: request by "${roommateRequest.posterName || 'a user'}"`,
    { type: 'roommateReport', requestId: report.requestId }
  );
});

// Local Services "Service Request" leads (Marketplace PRD section 8 /
// section 14 - "New service inquiry"). Mirrors onInquiryCreated /
// onInquiryUpdated above exactly, except the request is aimed at one
// specific provider owner rather than the whole admin/dealer staff, so we
// use notifyUser(providerOwnerId, ...) instead of notifyRoles(...).
exports.onServiceRequestCreated = onDocumentCreated('serviceRequests/{id}', async (event) => {
  const req = event.data.data();
  await notifyUser(
    req.providerOwnerId,
    '🧰 New service inquiry',
    `${req.customerName || 'A customer'} is interested in "${req.providerName || 'your service'}"`,
    { type: 'serviceRequest', id: event.params.id }
  );
});

exports.onServiceRequestUpdated = onDocumentUpdated('serviceRequests/{id}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  if (before.status === after.status) return;
  if (after.status === 'contacted') {
    await notifyUser(
      after.customerId,
      '📞 The provider reached out',
      `${after.providerName || 'The provider'} responded to your service request.`,
      { type: 'serviceRequest', id: event.params.id }
    );
  } else if (after.status === 'closed') {
    await notifyUser(
      after.customerId,
      '✅ Service request closed',
      `Your request to "${after.providerName || 'the provider'}" has been closed.`,
      { type: 'serviceRequest', id: event.params.id }
    );
  }
});

// Same auto-moderation pattern as onRoommateReportCreated above, for Local
// Services provider reports (Phase 2 of the Marketplace PRD, section 8).
const SERVICE_PROVIDER_REPORT_HIDE_THRESHOLD = 5;

exports.onServiceProviderReportCreated = onDocumentCreated('serviceProviderReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.providerId) return;

  const providerRef = db.collection('serviceProviders').doc(report.providerId);
  const providerSnap = await providerRef.get();
  if (!providerSnap.exists) return;
  const provider = providerSnap.data();

  const newCount = (provider.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const willHide = newCount >= SERVICE_PROVIDER_REPORT_HIDE_THRESHOLD && provider.status !== 'hidden';
  if (willHide) patch.status = 'hidden';
  await providerRef.update(patch);

  await notifyRoles(
    ADMIN_ROLES,
    willHide ? '🚩 Service listing auto-hidden' : '🚩 New service listing report',
    willHide
      ? `"${provider.name || 'A service'}" was hidden after ${newCount} reports.`
      : `${report.reason || 'Reported'}: "${provider.name || 'A service'}"`,
    { type: 'serviceProviderReport', providerId: report.providerId }
  );
});

// Same auto-moderation pattern as onServiceProviderReportCreated above,
// for Community post reports (PRD section 9 - Jobs/Events/Lost &
// Found/Emergency/News). Post create/edit/browse, likes, and comments all
// happen straight from the client (src/firebase/communityService.js), no
// trigger needed for those - this is the one write that has to be
// server-trusted, same reasoning as every other *ReportCreated trigger in
// this file.
//
// Emergency posts (post.type === 'emergency') are exempt from the
// auto-hide threshold below - a coordinated pile-on suppressing a real
// emergency notice is a worse failure than a spam/fake Jobs or News post
// staying visible a little longer, so this is the one place in the app
// where a post's own `type` field changes moderation behavior (every
// other *ReportCreated trigger in this file treats every item of its
// kind identically). reportCount still increments normally for Emergency
// posts - reports remain real signal for admin review - only the
// automatic status:'hidden' write is skipped. The manual safety net this
// exemption relies on already exists and needed no changes: 'community'
// is already registered in REPORT_KINDS
// (src/firebase/marketplaceModerationService.js), so admins can hide an
// Emergency post by hand from MarketplaceModerationScreen the moment a
// report comes in, same as any other post - this trigger just stops
// doing that automatically past a raw report count for this one type.
const COMMUNITY_REPORT_HIDE_THRESHOLD = 5;

exports.onCommunityReportCreated = onDocumentCreated('communityReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.postId) return;

  const postRef = db.collection('communityPosts').doc(report.postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return;
  const post = postSnap.data();

  const isEmergency = post.type === 'emergency';
  const newCount = (post.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const crossedThreshold = newCount >= COMMUNITY_REPORT_HIDE_THRESHOLD;
  const willHide = crossedThreshold && !isEmergency && post.status !== 'hidden';
  if (willHide) patch.status = 'hidden';

  // Emergency posts never get status:'hidden' written (that's the whole
  // exemption), so unlike the normal case - where the first hide's write
  // makes post.status !== 'hidden' false for every later report,
  // naturally silencing repeat notifications - there's nothing here to
  // stop every single report past the threshold from re-firing "needs
  // review". A brigaded Emergency post would otherwise page every admin
  // once per report. emergencyReviewNotified is a dedicated one-way flag
  // for exactly that: set the first time this alert fires, checked here
  // so it can only ever fire once per post, reset only by deleting the
  // post entirely (there's no un-set path, matching that this is a
  // "someone already reviewed this" signal, not a retriggerable count).
  const needsFirstReviewAlert = isEmergency && crossedThreshold && post.status !== 'hidden' && !post.emergencyReviewNotified;
  if (needsFirstReviewAlert) patch.emergencyReviewNotified = true;

  await postRef.update(patch);

  // Three distinct admin-notification cases, not two - an Emergency post
  // that crossed the threshold but wasn't auto-hidden needs a more urgent,
  // distinct message so it doesn't read as an ordinary "new report" when
  // it's actually the exempted case that most needs a human to look. Only
  // fires once per post (see needsFirstReviewAlert above) - later reports
  // on an already-flagged Emergency post fall through to the quiet
  // "new report" message instead of re-alerting.
  let title;
  let body;
  if (willHide) {
    title = '🚩 Community post auto-hidden';
    body = `"${post.title || 'A post'}" was hidden after ${newCount} reports.`;
  } else if (needsFirstReviewAlert) {
    title = '🚨 Emergency post needs review';
    body = `"${post.title || 'An emergency post'}" has ${newCount} reports and was NOT auto-hidden (Emergency posts require manual review). Please check it.`;
  } else {
    title = '🚩 New community post report';
    body = `${report.reason || 'Reported'}: "${post.title || 'A post'}"`;
  }

  await notifyRoles(ADMIN_ROLES, title, body, { type: 'communityReport', postId: report.postId });
});

// Next Update PRD §3 - Social Feed report auto-hide, exact mirror of
// onCommunityReportCreated above minus the Emergency-type exemption (a
// general Social Feed post has no `type` field to be exempt by).
const SOCIAL_REPORT_HIDE_THRESHOLD = 5;

exports.onSocialReportCreated = onDocumentCreated('socialReports/{reportId}', async (event) => {
  const report = event.data.data();
  if (!report.postId) return;

  const postRef = db.collection('socialPosts').doc(report.postId);
  const postSnap = await postRef.get();
  if (!postSnap.exists) return;
  const post = postSnap.data();

  const newCount = (post.reportCount || 0) + 1;
  const patch = { reportCount: admin.firestore.FieldValue.increment(1) };
  const willHide = newCount >= SOCIAL_REPORT_HIDE_THRESHOLD && post.status !== 'hidden';
  if (willHide) patch.status = 'hidden';

  await postRef.update(patch);

  const title = willHide ? '🚩 Social post auto-hidden' : '🚩 New social post report';
  const body = willHide
    ? `A post was hidden after ${newCount} reports.`
    : `${report.reason || 'Reported'}: a social post`;

  await notifyRoles(ADMIN_ROLES, title, body, { type: 'socialReport', postId: report.postId });
});

// ---------------------------------------------------------------------------
// Business Profile grant (Marketplace PRD section 15 Monetization Plan -
// "Business profile"). The grant/revoke write itself happens in
// setBusinessProfileStatus (functions/businessProfileService.js, Admin
// SDK) - same "callable just writes, a trigger here notifies" split as
// onTopupUpdated/onSupportTicketUpdated above. onDocumentWritten (rather
// than onDocumentUpdated) because the very first grant *creates*
// businessProfiles/{uid} rather than updating an existing doc, so
// event.data.before wouldn't exist yet for an onDocumentUpdated trigger.
// Only the false -> true transition notifies (a fresh grant); revokes and
// re-grants of an already-true doc stay silent, matching what was asked
// for - "when an admin grants status, the user isn't told."
exports.onBusinessProfileWritten = onDocumentWritten('businessProfiles/{uid}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  if (!after) return; // doc deleted - never happens via any client/admin path today

  const wasBusiness = !!(before && before.isBusinessProfile);
  const isBusiness = !!after.isBusinessProfile;
  if (!isBusiness || wasBusiness) return;

  await notifyUser(
    event.params.uid,
    '🏢 You\u2019ve been upgraded to a Business Profile!',
    'Add your business name, logo, and description from your Profile to start standing out across the Marketplace.',
    { type: 'businessProfile' }
  );
});

