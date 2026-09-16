import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

function createRequestId() {
  return `mswt_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`;
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

export async function walletTransfer({ recipient, amount, note, requestId }) {
  const fn = httpsCallable(functions, 'walletTransfer');
  const id = requestId || createRequestId();
  try {
    const { data } = await fn({
      recipient: String(recipient || '').trim(),
      amount: Number(amount),
      note: String(note || '').trim(),
      requestId: id,
    });
    return data;
  } catch (err) {
    throw new Error(err?.message || 'Could not complete the wallet transfer.');
  }
}
