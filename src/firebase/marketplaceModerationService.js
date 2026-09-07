// Marketplace Admin Panel > "Manage reports" (PRD section 13) - the admin
// side of the reports filed via marketplaceService.reportListing,
// accommodationService.reportProperty, roommateService.reportRoommateRequest,
// serviceProviderService.reportProvider, and communityService.reportPost.
//
// Those five write-only report collections (marketplaceReports,
// propertyReports, roommateReports, serviceProviderReports,
// communityReports) and their auto-hide-past-threshold logic already
// exist server-side (functions/index.js's onMarketplaceReportCreated /
// onAccommodationReportCreated / onRoommateReportCreated /
// onServiceProviderReportCreated / onCommunityReportCreated). What was
// missing was any admin-facing screen to see them, dismiss them, or act
// further (hide/restore/delete the underlying post, or ban the person who
// posted it) - this file and MarketplaceModerationScreen.js are that
// screen's data layer.
//
// Hiding/restoring/deleting the underlying listing/property/roommate
// request/provider/post reuses each module's own service (setListingStatus,
// setPropertyStatus, setRoommateRequestStatus, setPostStatus, deleteListing,
// etc.) - firestore.rules already lets isAdmin() write those, so nothing
// new was needed there. Banning a user calls
// userManagementService.setMarketplaceBan.
import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './config';
import * as marketplaceService from './marketplaceService';
import * as accommodationService from './accommodationService';
import * as roommateService from './roommateService';
import * as serviceProviderService from './serviceProviderService';
import * as communityService from './communityService';
import * as socialFeedService from './socialFeedService';

// One entry per report "kind" - the collection it lives in, which field on
// the report doc points at the underlying post, and how to read/act on
// that post via the module's own service. Keeping this table in one place
// is what lets the screen and subscribeAllReports below treat all four
// kinds uniformly instead of four parallel code paths.
export const REPORT_KINDS = {
  listing: {
    label: 'Buy & Sell',
    collection: 'marketplaceReports',
    targetIdField: 'listingId',
    targetTitleField: 'listingTitle',
    getTarget: marketplaceService.getListing,
    setStatus: marketplaceService.setListingStatus,
    deleteTarget: marketplaceService.deleteListing,
    ownerField: 'sellerId',
    // Denormalized "🏢 Business" snapshot field on the target doc itself
    // (see marketplaceService.createListing) - lets ReportCard show the
    // badge with no extra per-report lookup. Undefined for kinds with no
    // Business Profile concept (roommate/community).
    businessField: 'sellerIsBusiness',
  },
  property: {
    label: 'Accommodation',
    collection: 'propertyReports',
    targetIdField: 'propertyId',
    targetTitleField: 'propertyTitle',
    getTarget: accommodationService.getProperty,
    setStatus: accommodationService.setPropertyStatus,
    deleteTarget: accommodationService.deleteProperty,
    ownerField: 'ownerId',
    businessField: 'ownerIsBusiness',
  },
  roommate: {
    label: 'Room Sharing',
    collection: 'roommateReports',
    targetIdField: 'requestId',
    targetTitleField: 'requestPosterName',
    getTarget: roommateService.getRoommateRequest,
    setStatus: roommateService.setRoommateRequestStatus,
    deleteTarget: roommateService.deleteRoommateRequest,
    ownerField: 'posterId',
  },
  service: {
    label: 'Local Services',
    collection: 'serviceProviderReports',
    targetIdField: 'providerId',
    targetTitleField: 'providerName',
    getTarget: serviceProviderService.getProvider,
    setStatus: serviceProviderService.setProviderStatus,
    deleteTarget: serviceProviderService.deleteProvider,
    ownerField: 'ownerId',
    businessField: 'ownerIsBusiness',
  },
  community: {
    label: 'Community',
    collection: 'communityReports',
    targetIdField: 'postId',
    targetTitleField: 'postTitle',
    getTarget: communityService.getPost,
    setStatus: communityService.setPostStatus,
    deleteTarget: communityService.deletePost,
    ownerField: 'authorId',
  },
  // Next Update PRD §3 - Social Feed reports. targetTitleField points at
  // postText (Social posts have no title field, unlike every other kind
  // here) - ReportCard falls back to showing that instead.
  social: {
    label: 'Social Feed',
    collection: 'socialReports',
    targetIdField: 'postId',
    targetTitleField: 'postText',
    getTarget: socialFeedService.getPost,
    setStatus: socialFeedService.setPostStatus,
    deleteTarget: socialFeedService.deletePost,
    ownerField: 'authorId',
  },
};

const MAX_PER_KIND = 200;

/** Live feed of every report across all three kinds, newest first, each
 * tagged with `kind` (a REPORT_KINDS key) so the screen can render one
 * unified list (or filter to a tab) without three separate subscriptions
 * of its own. `status` defaults to 'open' for reports filed before this
 * feature existed (they simply have no status field yet). */
export function subscribeAllReports(callback, onError) {
  const merged = {}; // kind -> latest array from that collection's snapshot
  const emit = () => {
    const all = Object.values(merged).flat();
    all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    callback(all);
  };

  const unsubs = Object.entries(REPORT_KINDS).map(([kind, cfg]) => {
    const q = query(collection(db, cfg.collection), orderBy('createdAt', 'desc'), limit(MAX_PER_KIND));
    return onSnapshot(
      q,
      (snap) => {
        merged[kind] = snap.docs.map((d) => ({
          id: d.id,
          kind,
          status: 'open',
          ...d.data(),
        }));
        emit();
      },
      onError
    );
  });

  return () => unsubs.forEach((u) => u());
}

/** Marks a report resolved (or reopens it) without touching the
 * underlying post - use this for "dismiss" when the post itself is fine.
 * Firestore rules restrict this update to admin and to exactly these
 * fields, so the report's reason/note/reporterId can't be rewritten. */
export async function setReportStatus(kind, reportId, status, resolvedByUid) {
  const cfg = REPORT_KINDS[kind];
  await updateDoc(doc(db, cfg.collection, reportId), {
    status,
    resolvedBy: resolvedByUid,
    resolvedAt: serverTimestamp(),
  });
}
