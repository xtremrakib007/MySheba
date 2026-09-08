# MySheba Contact Email — Option A (Firebase + Resend)

The English and Bangla contact forms now submit to `/api/contact`.
Firebase Hosting rewrites that endpoint to the `submitContact` Cloud Function in `functions/index.js`.

The function:

- validates the form server-side;
- rejects the honeypot field;
- rate-limits by IP and email;
- stores the message in Firestore collection `contactMessages`;
- sends a notification to `info@mysheba.top` through Resend;
- sets the visitor's email as `Reply-To`, so you can press Reply and answer the customer directly;
- keeps the Resend API key in Firebase Secret Manager (never in browser code).

## One-time setup

### 1. Resend

Create a Resend account, add `mysheba.top` as a sending domain, and verify it using the DNS records Resend provides. Do not invent DNS records; use the exact records shown by Resend for your account.

After the domain is verified, create a Resend API key.

### 2. Firebase billing

Cloud Functions for Firebase requires the Firebase Blaze plan. Set a Google Cloud/Firebase budget alert before deployment.

### 3. Firebase secret

From the project root:

```bash
firebase functions:secrets:set RESEND_API_KEY
```

Paste the Resend API key when prompted. Never put the key in HTML, JavaScript, Git, or this ZIP.

### 4. Install function dependencies

```bash
cd functions
npm install
cd ..
```

### 5. Deploy

```bash
firebase deploy --only functions,hosting
```

### 6. Test

Open:

- `https://mysheba.top/contact/`
- `https://mysheba.top/bn/contact/`

Submit a test message. The message should arrive at `info@mysheba.top`.

When you press **Reply** in your email client, the reply should go to the visitor's email address because the function sets `Reply-To` to the submitted address.

## Where submitted messages are stored

Firebase Console → Firestore Database → `contactMessages`

Each message has a status such as `new` and an `emailStatus` such as `sent` or `failed`.

## Important

The contact form does not expose the Resend API key. The key is stored as a Firebase Secret and is only bound to the email function.
