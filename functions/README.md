# MySheba push notifications - deploy guide

This folder is the **server half** of push notifications. The app already
does its half (asking permission, saving a push token to
`users/{uid}.pushToken`, reading/writing `notifPrefs` from Settings). These
Cloud Functions watch Firestore and actually send the push when something
changes - a new order comes in, a dealer accepts it, an admin approves a
top-up, a chat message arrives, etc.

I can't deploy this for you from here - it needs your own Firebase login and
your own EAS account. Both are one-time setup, ~10 minutes total.

## 1. One-time: get an EAS project ID (needed for push tokens)

Expo push tokens are scoped to an EAS project.

```bash
npm install -g eas-cli
cd mysheba
eas login
eas init
```

`eas init` will print a project ID and can offer to write it into `app.json`
automatically. If it doesn't, open `app.json` and replace:

```json
"extra": { "eas": { "projectId": "REPLACE_WITH_YOUR_EAS_PROJECT_ID" } }
```

with the real ID it gave you. Without this, `registerForPushNotificationsAsync()`
in `src/notifications/pushService.js` will fail silently and no token will
ever be saved - nothing else will look "broken", push notifications will
just never arrive.

## 2. One-time: install and deploy the Cloud Functions

```bash
npm install -g firebase-tools
cd mysheba
firebase login
firebase deploy --only functions
```

This project is already wired to `satulink-solutions` via `.firebaserc`, and
`firebase.json` points at this `functions/` folder. The Blaze (pay-as-you-go)
plan is required for Cloud Functions - the free Spark plan can't run them.
Cost for this app's volume (a few notifications per transaction/topup/inquiry)
should be effectively $0/month within Firebase's free tier of included Blaze
usage.

## 3. Test it

1. Run the app on a **physical device** (push tokens don't work in a
   simulator/emulator - `Device.isDevice` will be `false` there).
2. Log in - this triggers permission request + token save.
3. In the Firebase console, check `users/{your-uid}` has a `pushToken` field.
4. Submit a test order (e.g. Recharge) as a customer, then Accept it from
   another account signed in as a dealer - the customer's device should get
   a "🔄 Order accepted" push within a few seconds.
5. If nothing arrives: `firebase functions:log` to see if the trigger ran
   and what error (if any) Expo's push API returned.

## What's covered

| Event | Who gets notified |
|---|---|
| New transaction (recharge/banking/internet/remittance) submitted | All dealers |
| Transaction accepted / completed / rejected | The customer |
| New top-up request submitted | All admins |
| Top-up approved / rejected | The requester |
| New travel inquiry (flight/bus/train) submitted | All admins |
| Inquiry marked contacted / closed | The customer |
| New chat message from a customer | All staff (dealer/admin/superadmin) |
| New chat message from staff | That customer |
| Business Profile granted | The user |

Every send checks `users/{uid}.notifPrefs.pushEnabled` first (set from the
in-app Settings screen) and skips anyone who's turned push off, and skips
anyone with no saved token at all.

## Phone OTP verification (registration)

`functions/otpService.js` adds two callables - `sendOtp({ phone })` and
`verifyOtp({ phone, code })` - used by `src/screens/RegisterScreen.js` to
confirm someone owns the phone number they're registering with before
`registerWithDealerCode` creates the account (it re-checks server-side that
the phone was verified in the last 15 minutes, so this can't be bypassed
from the client).

Without any setup, it still works end-to-end for testing: with no SMS
provider configured, the code is written to the function's logs instead of
texted (`firebase functions:log`, look for `[otpService]`). To actually text
the code, set these three env vars (any Twilio-compatible account works)
and redeploy:

```bash
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_FROM_NUMBER
firebase deploy --only functions
```

## Not included (out of scope for this pass)

- **Email notifications** - the Settings toggle exists and persists, but no
  email is actually sent yet. That needs an email provider (e.g. SendGrid,
  Postmark, or Firebase Trigger Email extension) wired into a Function.
- **Rate change alerts** - toggle persists, but no Function watches
  `rates/current` yet. Straightforward to add as another `onDocumentUpdated`
  trigger following the same pattern as the ones above, notifying everyone
  with `notifPrefs.rateAlerts === true`.
- **OTP-based login** - OTP is used for registration only (see above); sign
  in still uses phone+PIN via Firebase email/password auth as before (see
  `src/firebase/authService.js`). The same `sendOtp`/`verifyOtp` callables
  could be reused for an OTP login step later if needed.
