import { httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { functions } from './config';
import { getSessionProof } from './deviceSessionService';

function createRequestId() {
  return `mswt_${Crypto.randomUUID().replace(/-/g, '')}`;
}

export async function findWalletRecipient(recipient) {
  const fn = httpsCallable(functions, 'findWalletRecipient');
  try {
    const { data } = await fn({ recipient: String(recipient || '').trim() });
    return data;
  } catch (err) {
    throw new Error(err?.message || 'Could not find that MySheba account.');
  }
}

export async function walletTransfer({ recipient, amount, note, securityPin, requestId }) {
  const fn = httpsCallable(functions, 'walletTransfer');
  const id = requestId || createRequestId();
  try {
    const { data } = await fn({
      recipient: String(recipient || '').trim(),
      amount: Number(amount),
      note: String(note || '').trim(),
      securityPin: String(securityPin || ''),
      requestId: id,
    });
    return data;
  } catch (err) {
    throw new Error(err?.message || 'Could not complete the wallet transfer.');
  }
}
