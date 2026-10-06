// Which screens belong to the same feature, for the back button.
//
// Back used to walk a flat stack of every screen visited, so it stepped
// sideways into whatever feature you happened to open earlier - leave
// Salary and you land in Documents. Worse, from a feature's first screen
// the stack was often empty, goBack() returned false, and Android took the
// unhandled press as "close the app".
//
// Grouping fixes both. Inside a group, back steps through that group's own
// screens. Crossing into a different group clears the trail, so back from a
// feature's first screen goes Home - never into another feature, never out
// of the app.
//
// A screen not listed here is its own group, which is exactly right for a
// single-screen feature: back goes straight Home.

export const FEATURE_GROUPS = {
  home: ['customerHome', 'dealerHome', 'resellerHome', 'adminHome', 'staffHome'],

  // The service wizard and everything it can open mid-flow.
  service: ['service', 'webview', 'buspicker', 'rechargePin'],

  money: ['topup', 'superAdminTopup', 'transferPoints'],

  salary: [
    'salaryDashboard', 'salarySettings', 'salaryCalculator', 'salaryWorkLog',
    'salaryReports', 'salaryMonthlySummary', 'salaryHistory',
    'createPayslip', 'payslipHistory', 'payslipDetails',
  ],

  documents: ['myDocuments', 'documentType', 'addDocument', 'documentDetails', 'documentViewer'],

  notepad: ['notepad', 'addNote', 'noteDetail'],

  // Account and its settings pages read as one place: you go in to change
  // something and come out. Settings opening Printer or Trusted Devices is
  // a step within that, not a new feature.
  account: ['myAccount', 'profile', 'settings', 'printer', 'trustedDevices', 'verifyIdentity'],

  support: ['support', 'help', 'adminSupport'],

  // The hubs and the management screens they list.
  admin: [
    'adminFeatures', 'dealerFeatures', 'resellerFeatures', 'moreFeatures',
    'userManagement', 'reports', 'ledger', 'walletFunding', 'adminAnalytics', 'verificationManagement',
    'featureAccess', 'gridManagement', 'tileLabels', 'tilePlacement', 'catalogue', 'customTileManagement', 'tierPromotions', 'apiProviderManagement',
  ],

  ads: [
    'adFeatureControls', 'adAnalytics', 'bannerManagement', 'advertiserManagement',
    'advertiserDetail', 'adPackagesManagement', 'adPaymentsManagement',
  ],
};

const SCREEN_TO_FEATURE = Object.entries(FEATURE_GROUPS).reduce((acc, [feature, screens]) => {
  screens.forEach((s) => { acc[s] = feature; });
  return acc;
}, {});

/** The feature a screen belongs to. An unlisted screen is its own feature. */
export function featureOf(screen) {
  return SCREEN_TO_FEATURE[screen] || screen || '';
}

/** True when moving between these two screens leaves one feature for another. */
export function crossesFeature(from, to) {
  if (!from || !to) return false;
  return featureOf(from) !== featureOf(to);
}
