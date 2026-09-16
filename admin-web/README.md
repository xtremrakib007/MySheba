# MySheba Admin Web

Web console for MySheba admin/superadmin, built for full parity with the
mobile app's admin screens. Talks to the **same Firebase project**
(`satulink-solutions`) as the mobile app — no separate backend.

Stack: React + Vite + TypeScript + Tailwind CSS v4 + Firebase SDK.

## Phase 1 (this drop) — Foundation

- Firebase Auth sign-in
- Role guard: only Firestore `users/{uid}.role` of `admin` or `superadmin`
  can get past login (anyone else is signed back out with a clear message)
- Sidebar shell with all planned modules — built ones are clickable,
  unbuilt ones show "soon" so the nav map is visible from day one
- Superadmin-only nav items (Point Top-Up, Device Sessions) are hidden
  entirely for plain admins

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build   # outputs to dist/
```

## Deploy — Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare Pages: **Create a project → Connect to Git**.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. No environment variables needed — the Firebase web config is public by
   design (Firebase security comes from Firestore/Auth rules, not from
   hiding this config).

Alternative: Firebase Hosting (`firebase deploy --only hosting`) if you'd
rather keep it under the same console as the rest of the project.

## Phase 2 (this drop) — User & Access Management

- **User Management** (`/users`): paginated user list from the `users`
  collection, search by name/email/phone, filter by role, inline role
  change, enable/disable an account.
- **Feature Access** (`/feature-access`): per-customer toggle matrix for
  individual modules (Mobile Banking, Recharge, Remittance, Travel,
- Role-rank permissions (`src/services/userManagementService.ts`):
  admins can manage `user`/`dealer`/`reseller` accounts; superadmins can
  additionally promote to `admin`. Nobody can grant `superadmin` from the
  console. An account can only be edited by someone with a strictly
  higher rank.
- **Assumption flagged**: the mobile app's own
  `userManagementService.js` wasn't in this drop, so the role list,
  rank order, and `features` shape above are inferred from how the app
  uses dealer/reseller roles elsewhere — confirm these match the real
  Firestore schema before relying on this in production, and adjust
  `ROLE_RANK` / `FeatureAccess` if not.

## Phase 3 (this drop) — Verification & Moderation

- **Identity Verification** (`/verification`): pending KYC queue with
  document/selfie image previews, approve/reject. Approving or rejecting
  mirrors onto `users/{uid}.verificationStatus` and `.verified`.
  remove — removal hides the underlying listing doc when the report
  carries a `listingPath`.
- **Chat Reports** (`/chat-reports`): reported conversations/messages,
  dismiss or disable the reported user (reuses the same
  `updateUserDisabled` action as User Management, so it also respects
  role-rank permissions).
- **Assumption flagged**: none of `verificationRequests`,
  so their shape (see `src/services/moderationService.ts`) is inferred
  from the moderation flows implied by the sitemap. Confirm field names
  `reportedUserId` on chat reports — against what the mobile app/report
  Cloud Functions actually write before relying on this in production.

## Phase 4 (this drop) — Support & Reports

- **Support Tickets** (`/support`): open/in-progress queue by default
  (toggle to see all), expandable thread view, reply (writes to a
  `messages` subcollection and flips status to `inProgress`), manual
  status change, "assign to me".
- **Reports** (`/reports`): a live ops-overview dashboard — total/verified
  chat reports — using Firestore `getCountFromServer` against the
  collections already established in Phases 2–4. This is a snapshot, not
  historical trends.
- **Assumption flagged**: `supportTickets` and its `messages`
  subcollection weren't in this drop, so the shape (see
  `src/services/supportService.ts`) is inferred. The Reports page itself
  adds no new schema assumptions beyond what earlier phases already
  flagged.

## Phase 5 (this drop) — Configuration

Six screens (Rates & Pricing, Salary Settings, Banners & Announcements,
Categories, Module Subscriptions, Payment Settings) sharing one generic
list/add/edit/delete component (`src/components/ConfigListPage.tsx`) —
each page just declares its own fields and Firestore collection name:

| Page | Collection | Notes |
|---|---|---|
| Rates & Pricing | `rates` | buy/sell rate + commission per service |
| Salary Settings | `salaryTiers` | volume-based dealer/reseller tiers |
| Banners & Announcements | `banners` | pastes an already-hosted image URL, no upload |
| Module Subscriptions | `moduleSubscriptions` | global module on/off + price — distinct from the per-customer [[Feature Access]] toggles in Phase 2 |
| Payment Settings | `paymentMethods` | payout/payment channels |

- **Assumption flagged**: all six collection names/shapes are inferred —
  same caveat as earlier phases. This is the one screen you'll most
  likely want to reshape once real config data exists, since "rates",
  "salary", and "modules" in particular could mean several different
  things depending on how the mobile app actually reads them.

## Phase 6 (this drop, final) — Superadmin

- **Point Top-Up** (`/topup`): search dealer/reseller accounts, add
  points to `users/{uid}.pointsBalance` (via a Firestore transaction),
  logs every top-up to a `pointTopUps` audit collection, shows the last
  20 top-ups.
- **Device Sessions** (`/devices`): active-session list from
  `deviceSessions`, revoke a session. Revoking only flips a `revoked`
  flag in Firestore — actually forcing that device to sign out requires
  the mobile app to check the flag, which is outside this admin
  console's scope.
- Both routes are wrapped in `SuperadminRoute` (`src/routes/SuperadminRoute.tsx`)
  so a plain admin hitting the URL directly gets redirected to the
  dashboard, on top of the sidebar already hiding these links from them.
- **Assumption flagged**: `pointsBalance`, `pointTopUps`, and
  `deviceSessions` are all inferred — same caveat as every phase before
  this one.

All six sitemap phases are now built. The recurring theme across
Phases 2–6: every collection name/field beyond what Phase 1 shipped
with is a best guess from the sitemap and the mobile app's role model,
not read from real schema — worth a pass against the actual Firestore
data (or the mobile app's service files, if you can share them) before
any of this goes to production.
