// The least an international reload may be sold for: its face value at
// MySheba's own exchange rate (rates/current, e.g. rechargeNP = NPR per MYR,
// set by the superadmin). IIMMPACT's catalogue price for some destinations
// came out far below what the top-up really costs - NPR 5,000 for MYR 59.83
// when it is worth about MYR 132 - and selling at it lost money on every
// order. The customer pays whichever is higher. The app keeps an identical
// copy in src/utils/rateFloor.js; a test holds them together.

const RECHARGE_RATE_KEYS = { BD: 'rechargeBD', IN: 'rechargeIN', NP: 'rechargeNP', ID: 'rechargeID', PK: 'rechargePK', MM: 'rechargeMM', PH: 'rechargePH', KH: 'rechargeKH', TH: 'rechargeTH' };

/** Face amount in the destination currency, converted to MYR at MySheba's rate; 0 when no rate applies. */
function rateFloorMyr(face, country, rates) {
  const amount = Number(face);
  const key = RECHARGE_RATE_KEYS[String(country || '').trim().toUpperCase()];
  const rate = Number(key && rates ? rates[key] : NaN);
  if (!(amount > 0) || !(rate > 0)) return 0;
  return Math.round((amount / rate) * 100) / 100;
}

/** The price to charge: the provider's, raised to the rate floor when it is below it. */
function flooredPrice(price, face, country, rates) {
  const p = Number(price);
  const floor = rateFloorMyr(face, country, rates);
  return Math.max(Number.isFinite(p) ? p : 0, floor);
}

module.exports = { RECHARGE_RATE_KEYS, rateFloorMyr, flooredPrice };
