import { httpsCallable } from 'firebase/functions';
import { functions } from './config';
import { callWithSessionProof } from './deviceSessionService';

const listFn = httpsCallable(functions, 'listWalletFundingRequests');

/**
 * Funding a staff wallet from the one above it: finance asks admin, admin asks
 * superadmin. Every approval is a transfer out of the approver's own wallet,
 * so a request is refused when they are short - and they ask their own
 * approver in turn.
 *
 * Through callWithSessionProof because these move money and the backend checks
 * the session proof, which goes stale whenever someone signs in elsewhere.
 */
export async function requestWalletFunding(amount, note = '') {
  return callWithSessionProof('requestWalletFunding', { amount, note });
}

/** { incoming, outgoing } - what to decide, and what you are waiting on. */
export async function listWalletFundingRequests() {
  const { data } = await listFn({});
  return { incoming: data?.incoming || [], outgoing: data?.outgoing || [] };
}

export async function decideWalletFunding(requestId, approve, reason = '') {
  return callWithSessionProof('decideWalletFunding', { requestId, approve, reason });
}
