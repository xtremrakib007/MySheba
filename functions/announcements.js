// Admin "send announcement" - a manual, admin-triggered push broadcast, as
// opposed to every other push in this app (see index.js) which fires
// automatically off a Firestore write.
//
// Flow: Admin/superadmin fills out the form on Admin > Announcements
// (src/screens/AdminHomeScreen.js), which calls this via
// src/firebase/announcementService.js:
//
//   const fn = httpsCallable(functions, 'sendAnnouncement');
//   await fn({ title, body, audience: 'all' | 'customer' | 'dealer' |
//                                      'dealer' | 'admin' | 'superadmin' });
//
// This function re-checks the caller is admin/superadmin server-side (same
// pattern as functions/userManagement.js - never trust a client-sent role),
// sends the push to every matching user's Expo token (respecting each
// user's notifPrefs.pushEnabled, same as every other push here), and logs
// the broadcast to `announcements/{id}` so Admin > Announcements has a
// history of what was sent, by whom, and how many people it reached.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logAudit, logServerError } = require('./logService');

const ADMIN_ROLES = ['admin', 'superadmin'];
const AUDIENCES = ['all', 'customer', 'dealer', 'reseller', 'admin', 'superadmin'];
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Sends a batch of Expo push messages, chunked into groups of 100 per Expo's guidance. */
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

exports.sendAnnouncement = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }

  const db = admin.firestore();
  const callerUid = request.auth.uid;
  const callerSnap = await db.collection('users').doc(callerUid).get();
  const callerProfile = callerSnap.exists ? callerSnap.data() : null;
  if (!callerProfile || !ADMIN_ROLES.includes(callerProfile.role)) {
    throw new HttpsError('permission-denied', 'Only an admin can send announcements.');
  }

  const { title, body, audience } = request.data || {};
  if (!title || !String(title).trim()) {
    throw new HttpsError('invalid-argument', 'A title is required.');
  }
  if (!body || !String(body).trim()) {
    throw new HttpsError('invalid-argument', 'A message is required.');
  }
  if (!AUDIENCES.includes(audience)) {
    throw new HttpsError('invalid-argument', 'Choose a valid audience.');
  }

  try {
    const usersQuery =
      audience === 'all'
        ? db.collection('users')
        : db.collection('users').where('role', '==', audience);
    const usersSnap = await usersQuery.get();

    const messages = [];
    let matched = 0;
    usersSnap.forEach((doc) => {
      matched += 1;
      const u = doc.data();
      if (!u.pushToken) return;
      if (u.notifPrefs && u.notifPrefs.pushEnabled === false) return;
      messages.push({
        to: u.pushToken,
        title: title.trim(),
        body: body.trim(),
        data: { type: 'announcement' },
      });
    });

    await sendExpoPush(messages);

    const logRef = await db.collection('announcements').add({
      title: title.trim(),
      body: body.trim(),
      audience,
      matchedCount: matched,
      sentCount: messages.length,
      sentBy: callerUid,
      sentByName: callerProfile.name || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await logAudit({
      action: 'announcement_sent',
      targetUid: null,
      performedBy: callerUid,
      performedByRole: callerProfile.role,
      details: { audience, matchedCount: matched, sentCount: messages.length },
    });

    return { id: logRef.id, audience, matchedCount: matched, sentCount: messages.length };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    await logServerError('sendAnnouncement', err, { userId: callerUid });
    throw new HttpsError('internal', 'Could not send the announcement.');
  }
});
