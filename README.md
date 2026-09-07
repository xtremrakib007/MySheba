# MySheba — React Native app (production, Firebase-backed)

A React Native (Expo) app for MySheba's services: mobile recharge, mobile
banking, internet packages, remittance (all dealer-processed), plus
Flight/Bus/Train travel inquiries (admin-contacted, no live booking
inventory). Backed by real **Firebase Authentication** and **Firestore** —
there is no mock/demo data path left in the app.

## What's real now

- **Auth**: phone number + password, backed by Firebase Auth (email/password
  under the hood — see `src/firebase/authService.js` for why). Customers can
  self-register from the app. Dealer/Admin/Super Admin accounts are
  provisioned separately (see below) — there is no self-service way to
  become staff from the app UI. There is no role picker in the UI at all:
  signing in with phone + password reads the account's `role` field straight
  from its `users/{uid}` Firestore doc and routes to the matching dashboard
  automatically, live-subscribed so a role/wallet change from the console
  applies without a re-login.

  > ⚠️ **Google Sign-In setup required before it will work**: this project
  > references `./google-services.json` (see `app.json` →
  > `expo.android.googleServicesFile`), but that file is **not included** in
  > this export/zip (it contains project-specific secrets, so it's normally
  > gitignored). Without it, Google Sign-In will fail on a real
  > device/build with a `DEVELOPER_ERROR`. To fix: Firebase Console → Project
  > Settings → your Android app → download `google-services.json` → place it
  > at the project root (next to `app.json`). Also double check
  > `app.json` → `expo.extra.googleWebClientId` matches the **Web client ID**
  > (not the Android client ID) from Firebase Console → Authentication →
  > Sign-in method → Google.
- **Firestore collections**:
  - `users/{uid}` — profile: `name`, `phone`, `role` (`customer` | `dealer`
    | `admin` | `superadmin`), `walletBalance`
  - `inquiries/{id}` — Flight/Bus/Train requests: route, date(/time),
    passengers, contact info, `status` (`new` → `contacted` → `closed`)
  - `transactions/{id}` — Recharge/Mobile Banking/Internet/Remittance
    orders: `service`, `details`, `amount`, `total`, `status` (`pending` →
    `processing` → `completed`)
  - `rates/current` — single doc with every exchange rate shown in the app,
    editable from Admin → Rates
  - `topups/{id}` — point top-up requests: `amount`/`points` (1 RM = 1
    point), `method` (`transfer` | `deposit`), `bankName`, `refNo`,
    `receiptUrl` (Firebase Storage), `status` (`pending` → `approved` |
    `rejected`). See "Point Top-Up" below.
- **Dealer dashboard** reads/writes `transactions` live (Firestore
  `onSnapshot`) — Accept/Reject/Complete actions are real writes.
- **Admin dashboard** reads/writes `transactions`, `inquiries`, and `rates`
  live. The Inquiries tab is where Flight/Bus/Train requests land; tapping
  **Contact** marks it `contacted` and opens the phone dialer to the
  customer's number, **Close** marks it done once you've arranged the
  booking with them directly.

## Flight / Bus / Train flow

These are **inquiries, not bookings** — there's no seat/fare inventory to
book against, so the wizard just collects:

1. From, To, Date (Bus/Train also get a "Preferred Time" field), passengers
2. Contact details (name, phone, email, notes)
3. Summary + Submit

Submitting writes a doc to `inquiries` and shows a confirmation. Admin sees
it immediately on the Inquiries tab and calls/messages the customer to
confirm price and availability — matching how the business actually
operates.

## One-time Firebase project setup

The app already points at the `satulink-solutions` Firebase project
(config in `src/firebase/config.js`). Before shipping, from the
[Firebase console](https://console.firebase.google.com/project/satulink-solutions):

1. **Authentication → Sign-in method** → enable **Email/Password**.
2. **Firestore Database** → create a database (production mode) if one
   doesn't exist yet.
3. Deploy the security rules in `firestore.rules`:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules --project satulink-solutions
   ```
   (Or paste the contents of `firestore.rules` into the Firestore Rules tab
   in the console.)

## Creating Dealer / Admin / Super Admin accounts

There's no in-app "become an admin" button — that's intentional. To
provision staff:

1. Have the person register normally in the app (Create an account). This
   creates their `users/{uid}` doc with `role: "customer"`.
2. In the Firebase console → Firestore → `users/{their uid}`, change the
   `role` field to `"dealer"`, `"admin"`, or `"superadmin"`.
3. They just sign in with their phone + PIN as usual — no role to pick. The
   app reads their Firestore `role` and routes them straight to the matching
   dashboard (see `login` + `subscribeProfile` in `authService.js`).

## Run it locally (development)

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (Android/iOS), or press `a` for
an Android emulator.

## Build an installable APK

### Option A — EAS Build (recommended, no Android Studio needed)

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview
```

### Option B — Build locally with Android Studio / Gradle

```bash
npx expo prebuild -p android
cd android
./gradlew assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`.

## Project layout

```
App.js                        entry point, auth-loading splash + screen router
firestore.rules               Firestore security rules (role-based)
src/firebase/                 config.js, authService.js, inquiryService.js,
                               transactionService.js, ratesService.js
src/context/AppContext.js     global app state: auth/profile, screen, wizard,
                               live Firestore subscriptions
src/screens/                  one file per top-level screen (incl. RegisterScreen)
src/components/                shared UI: InfoBar, BannerSlider, ServiceGrid, modals
src/steps/                    one file per service's step wizard,
                               TravelInquirySteps.js shared by Flight/Bus/Train
src/data/                     static reference data: countries, operators, packages
src/theme/                     color/spacing tokens
```

## Point Top-Up (customer/dealer -> Admin approval)

Customers and dealers can send money via **bank transfer** or **bank
deposit** and submit a top-up request with the receipt photo attached;
Admin reviews the receipt and Approves or Rejects it. **1 RM = 1 point**,
credited onto the requester's `users/{uid}.walletBalance` the moment Admin
approves (`topupService.approveTopup`, using a Firestore `increment` so
concurrent approvals can't clobber each other).

- Entry points: the "+ Top Up" button in the customer `InfoBar`, the
  "Top-Up" tab in `BottomNav`, and a "💰 Top-Up" header button on the
  Dealer dashboard (dealers don't have `BottomNav`).
- `src/screens/TopUpScreen.js` — amount, method (transfer/deposit), bank
  name, optional reference number, and a required receipt photo (picked via
  `expo-image-picker`, uploaded to Firebase Storage).
- `src/firebase/topupService.js` — Firestore `topups/{id}` docs
  (`status`: `pending` → `approved` | `rejected`) + the Storage upload.
- Admin reviews everything under **Admin → 💰 Top-Ups**
  (`AdminHomeScreen.js`): tap the receipt thumbnail to open the full image,
  then Approve or Reject (with a reason).
- Customers/dealers track their own requests under **History → Top-Ups**.
- Security: `firestore.rules` lets a user create only their own `pending`
  request and only admins update it; `storage.rules` lets a user upload
  only into their own `topup-receipts/{uid}/` folder. **Deploy both** (see
  setup step 3 above, plus `firebase deploy --only storage` — this needs
  **Storage** enabled in the Firebase console, which the base setup above
  doesn't cover).

## Known follow-ups (not needed for this app to be usable, but worth knowing)

- No push notifications yet for "your order status changed" / "admin
  called you" / "your top-up was approved" — Firestore `onSnapshot` updates
  all currently-open dashboards in real time, but a signed-out user won't
  be notified. Consider Firebase Cloud Messaging for that.
