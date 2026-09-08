// Admin > Business Profiles — real schema and behavior confirmed against
// the mobile app's src/firebase/businessProfileService.js and
// functions/businessProfileService.js. There's no "request to review" -
// the admin just searches all users and grants/revokes the badge
// directly, through the setBusinessProfileStatus Cloud Function (the
// only path that can ever flip isBusinessProfile - firestore.rules
// blocks client create entirely and freezes isBusinessProfile on update).

import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase/config';

const COLLECTION = 'businessProfiles';

export interface BusinessProfile {
  uid: string;
  isBusinessProfile: boolean;
  businessName: string;
  businessLogoUrl: string;
  businessDescription: string;
  businessCategory: string;
  grantedAt: string | null;
  grantedBy: string | null;
}

/** Live list of every businessProfiles doc that has ever been created
 * (i.e. every user granted the badge at least once, including
 * since-revoked ones) - small collection, no pagination needed. */
export function subscribeAllBusinessProfiles(
  onUpdate: (byUid: Record<string, BusinessProfile>) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    collection(db, COLLECTION),
    (snap) => {
      const byUid: Record<string, BusinessProfile> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        byUid[d.id] = {
          uid: d.id,
          isBusinessProfile: !!data.isBusinessProfile,
          businessName: data.businessName ?? '',
          businessLogoUrl: data.businessLogoUrl ?? '',
          businessDescription: data.businessDescription ?? '',
          businessCategory: data.businessCategory ?? '',
          grantedAt: data.grantedAt?.toDate?.().toLocaleString() ?? null,
          grantedBy: data.grantedBy ?? null,
        };
      });
      onUpdate(byUid);
    },
    (err) => onError(err as Error)
  );
}

export async function setBusinessProfileStatus(targetUid: string, granted: boolean): Promise<void> {
  const fn = httpsCallable(functions, 'setBusinessProfileStatus');
  await fn({ targetUid, granted });
}

export interface UserLite {
  uid: string;
  name: string;
  phone: string;
  role: string;
}

/** Live list of every user - same subscribeAllUsers pattern the mobile
 * screen uses, kept local here rather than touching
 * userManagementService.ts's existing paged fetchUsersPage (a different,
 * already-working query shape used elsewhere). */
export function subscribeAllUsersLite(
  onUpdate: (list: UserLite[]) => void,
  onError: (err: Error) => void
) {
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const list = snap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? '',
        phone: (d.data().phone as string) ?? '',
        role: (d.data().role as string) ?? '',
      }));
      onUpdate(list);
    },
    (err) => onError(err as Error)
  );
}
