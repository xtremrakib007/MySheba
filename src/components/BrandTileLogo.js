import React from 'react';
import { Image } from 'react-native';

// A tile that is a BRAND rather than a service.
//
// Most tiles draw a vector from ServiceArt, which is right for "Bill Pay" or
// "Remittance" - those are things you do, and a line drawing says so. JomPAY is
// not a thing you do, it is a mark people look for: it is printed on the bill
// in their hand, and a generic receipt icon makes them hunt for it.
//
// The same mechanism BusOperatorLogo already uses for the three bus partners,
// kept separate because that one is keyed on bus operators and this is keyed on
// artwork names.
//
// Keyed on the ART NAME rather than the tile key, deliberately. A superadmin
// can rename a tile's icon in Tile Labels, and that override works by replacing
// `art` or clearing it for an emoji - so matching on the tile key would quietly
// ignore their choice for this one tile, which is the opposite of what that
// screen promises. Matching on the art name means an override simply names
// something else and this never fires. It also means a superadmin can put the
// JomPAY mark on another tile by choosing it, which is coherent rather than a
// special case.
const MARKS = {
  jompayBrand: require('../../assets/billers/jompay.png'),
};

export function hasBrandTileLogo(artName) {
  return Object.prototype.hasOwnProperty.call(MARKS, artName);
}

export default function BrandTileLogo({ art, size = 32 }) {
  const source = MARKS[art];
  if (!source) return null;
  // Rounded to match the tile's corners: the mark is square with its own
  // full-bleed background, so square corners inside a rounded card read as a
  // mistake.
  return <Image source={source} style={{ width: size, height: size, borderRadius: size * 0.26 }} resizeMode="contain" accessible={false} />;
}
