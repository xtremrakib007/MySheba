import { httpsCallable } from 'firebase/functions';
import { functions } from './config';

export async function getReferralInfo() {
  const fn = httpsCallable(functions, 'getReferralInfo');
  const { data } = await fn({});
  return data;
}
