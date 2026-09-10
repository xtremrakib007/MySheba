# MySheba production readiness runbook

This branch contains the repository-side production hardening. Cloud-console steps below are intentionally explicit because Firebase/EAS secrets and App Check providers cannot be safely committed to Git.

## 1. App Check

The Functions entry point now enables `enforceAppCheck: true` globally for 2nd-gen functions.

Before deploying the mobile app, register the Android production app in Firebase App Check and configure the Android provider supported by the release build (Play Integrity for Play-distributed production builds). Build a new app binary with the matching Firebase Android configuration, install it, and verify callable Functions succeed. Monitor App Check metrics before broad rollout.

Do not ship the new Functions deployment before a compatible production client is available; older binaries that do not send App Check will be rejected.

## 2. Incoming calls

The top-level React Native entry point now invokes the existing Notifee incoming-call handler for background `type=call` FCM messages. Validate voice and video calls in all states: foreground, background, locked screen, and force-stopped/relaunched app.

## 3. Automated checks

Run:

```bash
npm ci
npm run test:security
npm run production:check
npm run audit:prod
cd functions && npm ci && npm audit --audit-level=high
```

The CI workflow runs these checks for pull requests and pushes to `main`.

## 4. Production AAB

Run the GitHub Actions **Production Readiness** workflow manually. Its release job creates a real EAS production Android AAB after the verification job passes.

Also install the resulting AAB on a physical device and test authentication, wallet operations, recharge, remittance, notifications, calls, uploads, and logout/session switching.

## 5. Firebase secrets

Verify production Secret Manager values in Firebase/Google Cloud. At minimum, verify every `defineSecret(...)` used by the deployed code is populated and that the deployed function has access to it. Never commit secret values.

## 6. Firebase Hosting

`firebase.json` uses hosting targets `myshebas` and `admin-web`. `.firebaserc` currently does not contain target mappings because the actual Firebase Hosting site IDs are environment-specific.

Configure them once in the production checkout:

```bash
firebase target:apply hosting myshebas YOUR_MYsheba_HOSTING_SITE_ID
firebase target:apply hosting admin-web YOUR_ADMIN_HOSTING_SITE_ID
firebase use satulink-solutions
firebase deploy --only hosting:myshebas,hosting:admin-web
```

Then verify the live domain and `/sitemap.xml` from outside the Firebase console.

## 7. Crash monitoring

The repository already records uncaught JavaScript errors to the server-side error log. For store production, enable Firebase Crashlytics in the Android release build as a separate native dependency upgrade and verify a test crash appears in the Crashlytics dashboard before rollout. Do not substitute a Firestore error log for Crashlytics crash-free-user/crash-free-session metrics.

## 8. Dependency security

CI now runs `npm audit --audit-level=high` for both the app and Functions dependency trees. Review every audit result before release; do not blindly apply major upgrades to the Expo/RNFirebase stack.

## 9. Staging

Create a separate Firebase project for staging. Copy `.firebaserc.staging.example` to a local staging config, replace the project ID, and configure separate Auth, Firestore, Storage, Functions secrets, App Check registrations, and hosting. Never point staging builds at production financial data.

## 10. Documentation

This file is the release runbook. Update it whenever a new external provider, secret, Firebase service, or production deployment step is introduced.

## 11. Financial backend verification

Before release, test every wallet/recharge/remittance operation using a non-production provider account. Verify duplicate requests, retries, insufficient balance, rejection, timeout, and concurrent requests. Confirm the server remains authoritative for balances and roles.

## 12. Release gate

A release is production-ready only when:

- App Check is registered and verified from the production Android binary.
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
