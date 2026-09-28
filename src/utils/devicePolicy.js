// Which callable completes device verification, and why it matters.
//
// There are two, they are not interchangeable, and picking the wrong one
// fails in a way that cannot be escaped:
//
//   checkDeviceSession   staff (admin, superadmin, dealer, reseller). Their
//                        challenge is recorded as pendingAdminEmailChallenge
//                        and this is the only callable that verifies it - and
//                        the only one that then records the device in
//                        trustedDevices, which is what stops the NEXT sign-in
//                        asking again.
//
//   confirmDeviceSwitch  everyone else. It requires profile.pendingDeviceApproval
//                        to exist for this device, which is what the non-staff
//                        branch of checkDeviceSession writes.
//
// Calling confirmDeviceSwitch for a staff account throws "No pending
// verification for this device" - there is no pendingDeviceApproval, only a
// pendingAdminEmailChallenge - so verification can never complete. The device
// is never trusted, the next sign-in asks for a code again, and that code
// fails the same way. An unbreakable loop of "log in, enter the code, back to
// the login screen", which is exactly what it did.
//
// The role decided this, read from context state that the login path forgot
// to populate before routing to the verification screen. Putting the decision
// here, as a pure function over an explicit role, means it can be tested and
// that an absent role is a loud failure rather than a silent wrong answer.
export const STAFF_ROLES = ['admin', 'superadmin', 'dealer', 'reseller'];

/**
 * The callable that completes verification for this role.
 * @param {string|null|undefined} role
 * @returns {'checkDeviceSession'|'confirmDeviceSwitch'|null} null when the
 *          role is unknown - the caller must find out rather than guess,
 *          because both guesses are wrong for half of all accounts.
 */
export function verifyCallableFor(role) {
  if (!role || typeof role !== 'string') return null;
  return STAFF_ROLES.includes(role) ? 'checkDeviceSession' : 'confirmDeviceSwitch';
}

/** Whether this role's device trust is recorded by verification at all. */
export function isStaffRole(role) {
  return !!role && STAFF_ROLES.includes(role);
}
