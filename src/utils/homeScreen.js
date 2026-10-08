// Where a role lives.
//
// This existed three times: once in AppContext as homeScreenForRole, which
// knew about support and finance; once as getHomeForRole, which did not and is
// the copy the route guard calls; and once inside DeviceVerifyScreen, which
// did not either. So a support or finance agent was sent to the customer home
// every time the guard ran, and their own screen was unreachable - the staff
// features simply were not there.
//
// A comment on the first copy already said the other two "are now this". They
// were not. One function, imported by all three, is the only way that claim
// stays true.
//
// No React here, so a test can ask where each role lands.
export function homeScreenForRole(role) {
  if (role === 'retail') return 'customerHome';
  if (role === 'dealer') return 'dealerHome';
  if (role === 'reseller') return 'resellerHome';
  if (role === 'support' || role === 'finance') return 'staffHome';
  if (role === 'admin' || role === 'superadmin') return 'adminHome';
  return 'customerHome';
}

/** Roles that land on the shared staff home rather than one of their own. */
export const STAFF_HOME_ROLES = ['support', 'finance'];
