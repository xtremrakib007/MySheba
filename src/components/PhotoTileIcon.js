import React from 'react';
import { Image } from 'react-native';

/**
 * The photo icon pack: a full-colour square per tile, in place of a drawing.
 *
 * ServiceArt draws a one-colour vector, which is right when the tile is a
 * thing you do. These are supplied artwork - each one its own little picture
 * with its own background - so they are images, like the JomPAY mark, and not
 * something ServiceArt could express.
 *
 * Keyed on the ART NAME rather than the tile key, for the reason BrandTileLogo
 * gives: a superadmin can change a tile's icon in Tile Labels, and that works
 * by replacing `art`. Matching on the tile key would quietly ignore their
 * choice; matching on the art name means an override simply names something
 * else and this never fires.
 *
 * Every file here is named after the tile it was supplied for, so replacing the
 * artwork is a file swap in assets/tiles and nothing else. Nothing in this map
 * decides what a tile MEANS - it only decides what it looks like.
 */
const PHOTO_ICONS = {
  // ---- what a customer buys ----
  photoRecharge: require('../../assets/tiles/recharge.png'),
  photoInternet: require('../../assets/tiles/internet.png'),
  photoRechargePin: require('../../assets/tiles/rechargePin.png'),
  photoBillpayment: require('../../assets/tiles/billpayment.png'),
  photoJompay: require('../../assets/tiles/jompay.png'),
  photoTngewallet: require('../../assets/tiles/tngewallet.png'),
  photoMobilebanking: require('../../assets/tiles/mobilebanking.png'),
  photoRemittance: require('../../assets/tiles/remittance.png'),
  photoOfferpacks: require('../../assets/tiles/offerpacks.png'),
  photoEntertainment: require('../../assets/tiles/entertainment.png'),

  // ---- travel and government ----
  photoFlight: require('../../assets/tiles/flight.png'),
  photoBus: require('../../assets/tiles/bus.png'),
  photoTrain: require('../../assets/tiles/train.png'),
  photoMydigital: require('../../assets/tiles/mydigital.png'),
  photoPassport: require('../../assets/tiles/passport.png'),
  photoVisa: require('../../assets/tiles/visa.png'),
  photoFomema: require('../../assets/tiles/fomema.png'),

  // ---- what staff run ----
  photoFinance: require('../../assets/tiles/finance.png'),
  photoAdminAnalytics: require('../../assets/tiles/adminAnalytics.png'),
  photoLedger: require('../../assets/tiles/ledger.png'),
  photoWalletFunding: require('../../assets/tiles/walletFunding.png'),
  photoUserManagement: require('../../assets/tiles/userManagement.png'),
  photoVerificationManagement: require('../../assets/tiles/verificationManagement.png'),
  photoAdminSupport: require('../../assets/tiles/adminSupport.png'),
  photoAdminFeatures: require('../../assets/tiles/adminFeatures.png'),
  photoDealerFeatures: require('../../assets/tiles/dealerFeatures.png'),
  photoResellerFeatures: require('../../assets/tiles/resellerFeatures.png'),
  photoReports: require('../../assets/tiles/reports.png'),
  photoInquiries: require('../../assets/tiles/inquiries.png'),
  photoHistory: require('../../assets/tiles/history.png'),
  photoTopup: require('../../assets/tiles/topup.png'),
  photoInvoices: require('../../assets/tiles/invoices.png'),
  photoWalletTransfer: require('../../assets/tiles/walletTransfer.png'),

  // ---- a person's own account ----
  photoMyAccount: require('../../assets/tiles/myAccount.png'),
  photoProfile: require('../../assets/tiles/profile.png'),
  photoKyc: require('../../assets/tiles/kyc.png'),
  photoSupport: require('../../assets/tiles/support.png'),
  photoSalary: require('../../assets/tiles/salary.png'),
  photoMyDocuments: require('../../assets/tiles/myDocuments.png'),
  photoDocuments: require('../../assets/tiles/documents.png'),
  photoMoreFeaturesTile: require('../../assets/tiles/moreFeaturesTile.png'),
};

/** Every supplied picture's name, for a picker to offer. */
export function photoTileIconNames() {
  return Object.keys(PHOTO_ICONS);
}

export function hasPhotoTileIcon(artName) {
  return Object.prototype.hasOwnProperty.call(PHOTO_ICONS, artName);
}

/** The art name this tile key was supplied artwork for, or ''. */
export function photoIconFor(tileKey) {
  if (typeof tileKey !== 'string' || !tileKey) return '';
  const name = 'photo' + tileKey.charAt(0).toUpperCase() + tileKey.slice(1);
  return hasPhotoTileIcon(name) ? name : '';
}

export { PHOTO_ICONS };

export default function PhotoTileIcon({ art, size = 32 }) {
  const source = PHOTO_ICONS[art];
  if (!source) return null;
  // Rounded to match the card's own corners. Each icon is a square with a
  // full-bleed background of its own, so square corners inside a rounded tile
  // read as a mistake - the same treatment BrandTileLogo gives the JomPAY mark.
  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: size * 0.26 }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
