// Game top-ups: the thing Entertainment is actually for.
//
// That screen used to ask for a country, a mobile operator and a phone number,
// then show nothing - because it searched the Success TopUp catalogue for a
// category it has no rows in. All 450 packages Success TopUp sells are Data,
// Bundle, Voice and Call Rate. There is no game voucher among them, so there
// never was anything to list, and the operator grid in front of it was asking
// for details a game top-up does not have.
//
// These are fulfilled by hand, like any other order the provider cannot serve:
// the customer pays from their wallet, the order joins the dealer queue, and
// staff buy and deliver the code. No API is involved, which is why the prices
// live here rather than coming from a catalogue call.
//
// Prices are a starting point, in MYR, the currency these are sold in. Admin >
// Pricing overrides them per pack without a release, exactly as it does for
// internet packages - see internetPricingService for the shape.
//
// `playerIdLabel` is what the field asks for, because every game calls it
// something different and entering the wrong one is how a top-up goes to a
// stranger. `needsServer` adds the second field those games require: a Mobile
// Legends account is a user ID AND a zone, and one without the other is not
// deliverable.

export const GAME_TOP_UPS = [
  {
    key: 'pubg', name: 'PUBG Mobile', emoji: '🎯',
    playerIdLabel: 'PUBG Player ID', playerIdHint: 'Numeric ID from your in-game profile',
    packs: [
      { id: 'pubg-60', name: '60 UC', price: 4.5 },
      { id: 'pubg-325', name: '325 UC', price: 21 },
      { id: 'pubg-660', name: '660 UC', price: 42 },
      { id: 'pubg-1800', name: '1800 UC', price: 105 },
      { id: 'pubg-3850', name: '3850 UC', price: 210 },
      { id: 'pubg-8100', name: '8100 UC', price: 420 },
    ],
  },
  {
    key: 'freefire', name: 'Free Fire', emoji: '🔥',
    playerIdLabel: 'Free Fire Player ID', playerIdHint: 'Numeric UID from your profile',
    packs: [
      { id: 'ff-100', name: '100 Diamonds', price: 4.5 },
      { id: 'ff-310', name: '310 Diamonds', price: 13 },
      { id: 'ff-520', name: '520 Diamonds', price: 21 },
      { id: 'ff-1060', name: '1060 Diamonds', price: 42 },
      { id: 'ff-2180', name: '2180 Diamonds', price: 84 },
      { id: 'ff-weekly', name: 'Weekly Membership', price: 13 },
      { id: 'ff-monthly', name: 'Monthly Membership', price: 55 },
    ],
  },
  {
    key: 'mlbb', name: 'Mobile Legends', emoji: '⚔️',
    playerIdLabel: 'Mobile Legends User ID', playerIdHint: 'The number before the brackets',
    // A user ID without its zone cannot be topped up at all.
    needsServer: true, serverLabel: 'Zone ID', serverHint: 'The number inside the brackets',
    packs: [
      { id: 'ml-86', name: '86 Diamonds', price: 6 },
      { id: 'ml-172', name: '172 Diamonds', price: 12 },
      { id: 'ml-257', name: '257 Diamonds', price: 18 },
      { id: 'ml-706', name: '706 Diamonds', price: 48 },
      { id: 'ml-2195', name: '2195 Diamonds', price: 145 },
      { id: 'ml-weekly', name: 'Weekly Diamond Pass', price: 9 },
    ],
  },
  {
    key: 'codm', name: 'Call of Duty Mobile', emoji: '🪖',
    playerIdLabel: 'Player ID', playerIdHint: 'Open Settings, then Account, to find it',
    packs: [
      { id: 'codm-80', name: '80 CP', price: 5 },
      { id: 'codm-420', name: '420 CP', price: 24 },
      { id: 'codm-880', name: '880 CP', price: 48 },
      { id: 'codm-2400', name: '2400 CP', price: 125 },
    ],
  },
  {
    key: 'freefiremax', name: 'Free Fire MAX', emoji: '💎',
    playerIdLabel: 'Free Fire MAX Player ID', playerIdHint: 'Numeric UID from your profile',
    packs: [
      { id: 'ffm-100', name: '100 Diamonds', price: 4.5 },
      { id: 'ffm-310', name: '310 Diamonds', price: 13 },
      { id: 'ffm-1060', name: '1060 Diamonds', price: 42 },
    ],
  },
  {
    key: 'genshin', name: 'Genshin Impact', emoji: '🌟',
    playerIdLabel: 'UID', playerIdHint: 'Nine-digit UID, bottom-right in game',
    needsServer: true, serverLabel: 'Server', serverHint: 'Asia, Europe, America or TW/HK/MO',
    packs: [
      { id: 'gi-60', name: '60 Genesis Crystals', price: 5 },
      { id: 'gi-330', name: '330 Genesis Crystals', price: 25 },
      { id: 'gi-1090', name: '1090 Genesis Crystals', price: 80 },
      { id: 'gi-welkin', name: 'Blessing of the Moon', price: 25 },
    ],
  },
];

/** One game by key, or null. */
export function gameByKey(key) {
  return GAME_TOP_UPS.find((g) => g.key === key) || null;
}

/** One pack within a game, or null - the pair the order is actually placed on. */
export function packById(gameKey, packId) {
  const game = gameByKey(gameKey);
  if (!game) return null;
  return game.packs.find((p) => p.id === packId) || null;
}
