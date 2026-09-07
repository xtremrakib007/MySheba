// Visual identity for each Mobile Banking provider shown on the "Select
// Provider" step (src/steps/MobileBankingSteps.js). Same pattern as
// src/data/operatorBrand.js: each `logo` is that provider's own registered
// trademark, used here purely to identify it during a legitimate transfer,
// the same way any mobile-banking/remittance app does. Anything without a
// logo yet falls back to a colored initials badge via OperatorCard
// (src/components/ui.js).
export const providerBrand = {
  bKash: { logo: require('../../assets/providers/bkash.png'), color: '#E2136E', initials: 'bK' },
  Nagad: { logo: require('../../assets/providers/nagad.png'), color: '#EC1D25', initials: 'NG' },
  Rocket: { logo: require('../../assets/providers/rocket.png'), color: '#8C3494', initials: 'RK' },
};
