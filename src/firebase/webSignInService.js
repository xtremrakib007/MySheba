// Answering a web sign-in request from the phone.
//
// The server decides whether the answer counts - see
// functions/webSignInApproval.js. This only carries the tap.
import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

const respondFn = httpsCallable(functions, 'respondToWebSignIn');

export async function respondToWebSignIn(approvalId, approve) {
  if (!approvalId) throw new Error('That request is no longer valid.');
  const { data } = await respondFn({ approvalId, approve: approve === true });
  return data;
}
