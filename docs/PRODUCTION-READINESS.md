# MySheba Production Readiness

This branch contains repository-side production hardening. Cloud-console steps are intentionally explicit because Firebase/EAS secrets and App Check providers cannot be safely committed to Git.

## Current release gate

Firebase App Check registration is already complete. However, Cloud Functions App Check enforcement is intentionally **staged** until the production Android client actually sends App Check tokens and Firebase metrics show legitimate verified traffic. Firebase recommends distributing the updated client, monitoring App Check metrics, and then enabling enforcement.

The Functions entry point currently uses `enforceAppCheck: false` with a `maxInstances: 50` safety cap. Do not change it to `true` until the client rollout is verified.

## 1. App Check client integration

The Android production client still needs the App Check SDK/provider initialization using Play Integrity.

Do not guess or manually mix Firebase Android dependency versions. The app currently uses React Native Firebase 21.x, so add the matching App Check package/version and regenerate the lockfile in a real Node/npm environment before committing it.

After the new client is built:

1. Install it on a real Android device.
2. Exercise Firebase-backed flows.
3. Confirm verified App Check traffic in Firebase.
4. Change Functions enforcement to `enforceAppCheck: true`.
5. Repeat production smoke tests after enforcement.

## 2. Incoming calls

The React Native entry point invokes the existing Notifee incoming-call handler for background `type=call` FCM messages. Validate voice and video calls in foreground, background, locked-screen, and force-stopped/relaunched states.

## 3. Automated checks

Run:

```bash
npm ci
npm run test:security
npm run production:check
npm run audit:prod
cd functions && npm ci && npm audit --audit-level=high
```

CI runs these checks for pull requests and pushes to `main`.

## 4. Production AAB

The production EAS AAB profile explicitly uses the `production` EAS environment. Run the GitHub Actions **Production Readiness** workflow manually after the verification job is available.

Install the resulting AAB on a physical device and test authentication, wallet operations, recharge, remittance, notifications, calls, uploads, and logout/session switching.

## 5. Firebase secrets

Verify production Secret Manager values in Firebase/Google Cloud. At minimum, verify every `defineSecret(...)` used by deployed code is populated and that the deployed function has access to it. Never commit secret values.

## 6. Firebase Hosting

`firebase.json` uses hosting targets `myshebas` and `admin-web`. `.firebaserc` does not contain target mappings because actual Firebase Hosting site IDs are environment-specific.

Configure them once in the production checkout with the real Site IDs:

```bash
firebase target:apply hosting myshebas YOUR_MYsheba_HOSTING_SITE_ID
firebase target:apply hosting admin-web YOUR_ADMIN_HOSTING_SITE_ID
firebase use satulink-solutions
firebase deploy --only hosting:myshebas,hosting:admin-web
```

Then verify the live domain and `/sitemap.xml` externally.

## 7. Crash monitoring

Enable Firebase Crashlytics in the Android release build as a separate native dependency upgrade and verify a test crash appears in the Crashlytics dashboard before rollout. Do not substitute server-side error logs for Crashlytics crash-free-user/crash-free-session metrics.

## 8. Dependency security

CI runs `npm audit --audit-level=high` for both app and Functions dependency trees. Review every audit result before release; do not blindly apply major upgrades to the Expo/RNFirebase stack.

## 9. Staging

Create a separate Firebase project for staging. Copy `.firebaserc.staging.example` to a local staging config, replace the project ID, and configure separate Auth, Firestore, Storage, Functions secrets, App Check registrations, and hosting. Never point staging builds at production financial data.

## 10. Financial backend verification

Before release, test every wallet/recharge/remittance operation using non-production provider accounts. Verify duplicate requests, retries, insufficient balance, rejection, timeout, and concurrent requests. Confirm the server remains authoritative for balances and roles.

## Final release gate

A release is production-ready only when:

- App Check is registered and verified from the production Android binary.
- App Check enforcement is enabled only after verified traffic is confirmed.
- Incoming calls work in killed/background states.
- Security regression tests pass.
- Production readiness gate passes.
- Dependency audits have no unresolved high/critical findings.
- A real production AAB is built and installed successfully.
- Firebase production secrets are verified.
- Hosting targets deploy successfully and the sitemap is reachable.
- Crash monitoring is visible.
- Staging and production projects are separated.
- Financial and authentication flows pass manual release tests.
