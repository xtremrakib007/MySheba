// Admin-facing side of directChatService.reportConversation ("Report" on a
// direct chat thread). The report itself has been written to Firestore and
// pinged admin/superadmin (functions/index.js onDirectChatReportCreated)
// since that feature was built - what was missing was any screen to
// actually see or act on those reports. This file is that screen's data
// layer (see ChatReportsScreen.js).
//
// A plain admin still can't read the reported conversation's messages -
// firestore.rules only lets the two participants (plus, now, an
// investigating superadmin) read directChats/*/messages. For a report
// with an "open" status, functions/index.js flips
// directChats/{chatId}.underInvestigation to true (Admin SDK, so a client
// can't grant itself this), which is the one thing firestore.rules checks
// to let a superadmin in - see subscribeInvestigationMessages below and
// InvestigateChatScreen.js. That flag clears automatically once every
// report against that chat is resolved. A regular admin is still limited
// to investigating the *people* involved (account history, other reports
// against them) via userManagementService.
import { collection, doc, updateDoc, onSnapshot, query, orderBy, limitToLast, serverTimestamp } from 'firebase/firestore';
import { db } from './config';

const COLLECTION = 'directChatReports';
const CHATS_COLLECTION = 'directChats';
const MESSAGES = 'messages';

/** Live list of every direct-chat report, newest first. */
export function subscribeChatReports(onUpdate, onError) {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Marks a report resolved/reopened - firestore.rules only allows admin to
 * touch status/resolvedBy/resolvedAt, nothing else on the report doc. */
export async function setChatReportStatus(reportId, status, adminUid) {
  await updateDoc(doc(db, COLLECTION, reportId), {
    status,
    resolvedBy: status === 'resolved' ? adminUid : null,
    resolvedAt: status === 'resolved' ? serverTimestamp() : null,
  });
}

/** Live list of a reported conversation's messages, oldest first, for a
 * superadmin investigating an open report - only succeeds while
 * firestore.rules sees directChats/{chatId}.underInvestigation == true
 * (see this file's header comment). Same shape/cap as
 * directChatService.subscribeMessages; kept as its own copy here rather
 * than imported so this moderation-only read path stays independent of
 * the regular chat screen's data layer. Reject early with a clear error
 * for anyone who isn't a superadmin, rather than letting the onSnapshot
 * fail silently with a permission-denied the UI has to guess about. */
export function subscribeInvestigationMessages(chatId, myRole, callback, onError) {
  if (myRole !== 'superadmin') {
    onError?.(new Error('Only a superadmin can investigate a reported conversation.'));
    return () => {};
  }
  const q = query(
    collection(db, CHATS_COLLECTION, chatId, MESSAGES),
    orderBy('createdAt', 'asc'),
    limitToLast(100)
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
}
