# MySheba admin subdomain rollout

The existing admin-web app remains one React/Vite application and one Firebase
Hosting target. The three hostnames select a portal; they are not security
boundaries. Existing capability checks, Cloud Functions authorization and
Firestore rules remain the security boundary.

## Production hostnames

- admin.mysheba.top — Admin / Superadmin
- finance.mysheba.top — Finance + Operations
- support.mysheba.top — Customer Support + KYC

Operations uses the existing `orders` capability. KYC uses the existing
`users` capability. No new database role names are required.

## Environment

Set this at admin-web build time:

```env
SUBDOMAIN_PORTAL_ENFORCEMENT=false
```

Keep it false for shadow/canary testing. Set it to true only after DNS, HTTPS,
login, route and direct API authorization tests pass.

## Firebase Hosting / DNS

Attach all three custom domains to the existing `admin-web` Firebase Hosting
site/target. Follow the DNS records Firebase Hosting provides for each domain
and wait for managed TLS certificates to become active. Do not create separate
applications or databases for the three portals.

## Safe deployment

1. Record the current production commit and successful admin-web deployment.
2. Build this branch with enforcement false.
3. Deploy the existing named hosting target from the repository root.
4. Attach and verify the three custom domains and HTTPS.
5. Test Superadmin/Admin, Finance/Operations, Support/KYC and denied cross-portal access.
6. Verify direct Cloud Function/API and Firestore authorization still rejects unauthorized operations.
7. Rebuild with `SUBDOMAIN_PORTAL_ENFORCEMENT=true`.
8. Deploy Support first, then Finance, then Admin, checking authentication and authorization after each DNS/traffic change.

## Rollback

First rebuild/redeploy with `SUBDOMAIN_PORTAL_ENFORCEMENT=false`. If needed,
redeploy the previously recorded known-good hosting version. DNS can then be
returned to the previous endpoint. Never remove the tested Superadmin recovery
path during rollout.
