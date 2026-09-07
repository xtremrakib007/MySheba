// Home page banner slider - admin-managed via the Admin > Banners tab,
// rendered by src/components/BannerSlider.js on every role's home screen.
// Each doc in `banners/{id}` is one slide; `order` controls left-to-right
// position and `active` controls whether it shows at all (kept, rather
// than deleted, so an admin can temporarily hide a seasonal promo and
// bring it back later).
import {
  collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './config';

const BANNERS_COL = collection(db, 'banners');

// Same background gradients BannerSlider.js used to hardcode - offered as
// quick presets in the admin form instead of a full color picker.
export const BANNER_COLOR_PRESETS = [
  ['#667eea', '#764ba2'],
  ['#f093fb', '#f5576c'],
  ['#4facfe', '#00f2fe'],
  ['#fa8231', '#f7b731'],
  ['#20bf6b', '#0fb9b1'],
];

// What a slide can link to when tapped - passed to startService()/openWebView()
// exactly like ServiceGrid's tiles do.
export const BANNER_LINK_TARGETS = [
  { key: 'recharge', label: 'Recharge' },
  { key: 'mobilebanking', label: 'Mobile Banking' },
  { key: 'internet', label: 'Internet' },
  { key: 'remittance', label: 'Remittance' },
  { key: 'bus', label: 'Bus' },
  { key: 'train', label: 'Train' },
  { key: 'flight', label: 'Flight' },
  { key: 'fomema', label: 'FOMEMA (webview)' },
  { key: 'visa', label: 'Visa (webview)' },
  { key: 'none', label: 'No link' },
];

/** Uploads a picked photo (local file uri) to Storage for use as a banner's
 * background image, returns its download URL. Same pattern as
 * topupService.uploadReceipt / receiverService.uploadPassport - explicit
 * contentType so it passes storage.rules' image/.* check. */
export async function uploadBannerImage(localUri) {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const fileName = `${Date.now()}.jpg`;
  const storageRef = ref(storage, `banner-images/${fileName}`);
  await uploadBytes(storageRef, blob, { contentType: blob.type || 'image/jpeg' });
  return getDownloadURL(storageRef);
}

export function subscribeBanners(callback, onError) {
  const q = query(BANNERS_COL, orderBy('order', 'asc'));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Creates a new banner. `order` defaults to pushing it to the end of the current list (caller passes nextOrder). */
export async function createBanner(banner) {
  await addDoc(BANNERS_COL, {
    title: banner.title || '',
    body: banner.body || '',
    icon: banner.icon || '📣',
    colorStart: banner.colorStart || BANNER_COLOR_PRESETS[0][0],
    colorEnd: banner.colorEnd || BANNER_COLOR_PRESETS[0][1],
    imageUrl: banner.imageUrl || '',
    linkTo: banner.linkTo || 'none',
    // Only meaningful when imageUrl is set - lets the photo link somewhere
    // different from the text overlay (BannerSlider.js's onPressPhoto vs
    // onPressText). Left as 'none' for text/color-only banners, where
    // there's nothing else for it to distinguish from `linkTo`.
    photoLinkTo: banner.photoLinkTo || 'none',
    order: typeof banner.order === 'number' ? banner.order : 0,
    active: banner.active !== false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateBanner(id, changes) {
  await updateDoc(doc(db, 'banners', id), { ...changes, updatedAt: serverTimestamp() });
}

export async function deleteBanner(id) {
  await deleteDoc(doc(db, 'banners', id));
}

export async function setBannerActive(id, active) {
  await updateBanner(id, { active });
}

/** Swaps the `order` value of two banners so one moves up/down in the slider. */
export async function reorderBanners(bannerA, bannerB) {
  await Promise.all([
    updateBanner(bannerA.id, { order: bannerB.order }),
    updateBanner(bannerB.id, { order: bannerA.order }),
  ]);
}
