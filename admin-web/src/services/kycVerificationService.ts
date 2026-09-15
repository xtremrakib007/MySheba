import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';
import type { VerificationRequest } from './moderationService';

export async function reviewKycVerification(
  req: VerificationRequest,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  const callable = httpsCallable(functions, decision === 'approved' ? 'approveVerification' : 'rejectVerification');
  await callable(decision === 'approved'
    ? { targetUid: req.uid }
    : { targetUid: req.uid, reason: reason?.trim() || '' });
}
