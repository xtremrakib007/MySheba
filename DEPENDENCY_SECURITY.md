# Dependency security

`npm audit` on this repo reports a lot. Most of it cannot hurt the app, and
treating all of it as equally urgent is how a genuinely reachable advisory ends
up ignored. This note records the triage, what was fixed, what was deliberately
not fixed, and the two guards that keep it honest.

Two guards run in CI:

| Script | What it does |
| --- | --- |
| `npm run audit:lockfiles` | Fails if any `package.json` and its `package-lock.json` disagree. Uses only Node builtins, so it runs **before** `npm ci`. |
| `npm run audit:deps` | Fails on **high/critical** advisories in **production** dependencies that are not triaged in `scripts/audit-deps.js`. |

Run plain `npm audit` (in the root and in `functions/`) for the unfiltered
picture, including build-time tooling.

## Why the lockfile guard exists

`npm ci` refuses to install when `package.json` and `package-lock.json` drift
apart — a dependency range edited by hand without re-running `npm install`. It
refuses *after* the runner has checked out, installed Node and warmed the cache,
so the run is wasted and the error reads as a generic install failure. PR #98
burned a run on exactly that. `scripts/audit-lockfiles.js` runs the same
comparison in the first few seconds and names the package and both versions.

It is wired in ahead of every `npm ci` in the repo: `eas-build.yml`,
`eas-update-production.yml`, `deploy-functions.yml`.

## `functions/` — fixed, then one new high

Cloud Functions run on Node, where every advisory in the tree **is** reachable
in principle, so this tree gets fixed rather than triaged wherever a fix exists.
It went from 14 advisories (2 high, 12 moderate) to **0** — and then, in October
2026, back to 3 highs when the node-forge advisory landed. Those 3 are one root
cause with one call site, triaged below; everything in this section is still
fixed, not exempted.

**`@grpc/grpc-js` 1.14.4 → 1.14.5** (high). Picked up by `npm audit fix`, along
with patch bumps to `express`, `body-parser` and `qs`. Reachable here: unlike
the app, functions talk to Firestore over real gRPC.

**`nodemailer` ^6.9.14 → ^10.0.13** (15 advisories, 4 of them high). A major
bump, taken deliberately. `functions/mailerService.js` is the only consumer and
it uses `createTransport({host, port, secure, auth})` plus
`sendMail({from, to, subject, text, html})` — unchanged across v6 → v10. It
never sets `envelope`, `raw`, `list-*` headers, or `jsonTransport`, so most of
the 15 did not apply; the ones that did are the `addressparser` DoS advisories
(GHSA-rcmh-qjqh-p98v, GHSA-2x7j-588g-ccc2, GHSA-v53p-9fqp-m79j), which are
reachable because `to` is a user-supplied email address. nodemailer 10 needs
Node ≥ 20; `functions/engines.node` is 22.

Verified after the bump: all of `firebase-admin`, `firebase-functions`,
`firebase-functions/v2/https`, `google-gax`, `@google-cloud/firestore` and
`mailerService` load, and `secureIndexV2.js` loads with all 107 exports intact.

**`uuid` override → `^11.1.1`.** Nine of the twelve moderate advisories were one
root cause: `uuid` GHSA-w5hq-g745-h8pq, a missing buffer bounds check in
`v3`/`v5`/`v6` when the caller passes `buf`. Every consumer in the tree
(`gaxios`, `google-gax`, `teeny-request`, `firebase-admin`) calls only
`uuid.v4()` with no buffer, so it was not reachable — but npm's only offered fix
was `firebase-admin` 12 → 14, a major bump across every callable. An
`overrides` pin clears all nine without touching `firebase-admin`, and it
de-duplicates three nested copies while it is at it.

## App tree — deliberately not "fixed"

27 advisories (10 high, 17 moderate) remain, and that is the correct state for
now. **Do not run `npm audit fix` here.** I tried it: it resolved exactly one
advisory and in exchange bumped `firebase` 12.18.0 → 12.19.0, which nests
`@react-native-async-storage/async-storage@3.1.1` under `@firebase/auth` while
the app itself is on **2.1.2**. async-storage is a native module. Two JS copies
spanning a major version, against one installed native implementation, is a
plausible way to break Firebase Auth persistence — which is the exact bug
("logged out on reopen") this branch exists to fix. 161 lines of lockfile churn
for one dev-tree advisory, days before a release build, is not a trade worth
taking.

What the 27 actually are:

- **7 of the 10 highs collapse to `@grpc/grpc-js`** (`firebase`,
  `@firebase/firestore`, `@react-native-firebase/*`). gRPC is **unreachable in
  React Native**: `@firebase/firestore` resolves through its `react-native`
  export condition to `dist/index.rn.js`, which talks WebChannel over
  fetch/XHR and contains no grpc reference at all. Metro never bundles the Node
  entry point. npm's suggested "fix" is to *downgrade* `firebase` to 9.14.0.
- **`brace-expansion`, `image-size`, `fast-uri`/`ajv`, `postcss`, `xcode`** are
  build-time only — Metro, the Expo CLI, `expo prebuild`. None ship in the
  bundle, and all their inputs are files committed to this repo, not user input.
- **The `expo*` moderates** are flagged purely for depending on one of those
  build-time packages. npm's only fix is Expo SDK 57, a full SDK migration.

Each of these is an entry in `EXEMPT` in `scripts/audit-deps.js` carrying a
`why` (why it cannot reach us) and a `recheckIf` (what would void that). The
gate also reports **stale** exemptions, so an entry that stops vouching for
anything gets deleted rather than quietly outliving its advisory.

## `node-forge` — the one high in both trees

Added October 2026: GHSA *"RSA PKCS#1 v1.5 signature verification accepts extra
nested DigestAlgorithm elements"*. It is a **verification bypass** — a forged
signature can be made to validate. It only matters where node-forge verifies a
PKCS#1 v1.5 signature against a trusted key. Seven packages across the two
trees are flagged for it, and none of them do that:

- **App tree, path 1** — `expo-updates` -> `@expo/code-signing-certificates`.
  This is the one that *would* verify: it checks OTA manifest signatures. But
  expo-updates code signing **is not configured** — there is no `codeSigning`
  or `certificate` key in `app.base.json`, `app.config.js` or `eas.json` — so
  the verification path never runs.
- **App tree, path 2** — `expo` -> `@expo/cli`. The dev and prebuild CLI,
  build-time only.
- Confirmed rather than assumed: `npx expo export --platform android` and then
  grepping the 6.9M Hermes bundle gives **0 occurrences** of `node-forge`,
  `code-signing-certificates`, `pki.privateKeyFromPem` and `rsa.verify`. The
  library is not on a device at all.
- **functions** — `firebase-admin` requires it in exactly one place,
  `lib/app/credential-internal.js`, as
  `forge.pki.privateKeyFromPem(this.privateKey)`: parsing *our own*
  service-account private key out of the runtime credentials. Key parsing, not
  signature verification, on an input that is ours.

`react-native-google-mobile-ads`, `@react-native-firebase/app-check`,
`@firebase/*` and `firebase-functions` are flagged only for depending on
node-forge or `@grpc/grpc-js` — none has a bug of its own.

Every fix npm offers is a major, and the app-tree ones are **downgrades** that
predate the vulnerable range (`expo-updates@0.11.7` against our `0.28.18`,
`react-native-google-mobile-ads@13.6.1`, `@react-native-firebase/app-check@19.0.1`)
and cannot run on SDK 53. Taking them would break the build, not secure it.

`functions` is the exception: `firebase-admin@14` / `firebase-functions@7` are
real forward versions. Worth doing as a deliberate, tested upgrade — not as an
audit-driven scramble, since the advisory cannot reach us today.

## When this needs revisiting

- Before an SDK bump, re-run `npm audit` in the app tree — an SDK 57 move
  clears the `expo*` cluster for free.
- If Firestore is ever used from Node in this repo (a script, SSR, a test
  harness), the `@grpc/grpc-js` exemption is void and the bump becomes urgent.
- `firebase` and `@react-native-async-storage/async-storage` should be bumped
  together, on purpose, with a native rebuild — never by `npm audit fix`.
- If expo-updates code signing is ever turned on, the `node-forge` exemption is
  void: that switch is exactly what makes the advisory reachable. Same if
  node-forge starts appearing in an exported bundle, or if `firebase-admin`
  gains a node-forge call beyond `privateKeyFromPem`.
- `firebase-admin@14` / `firebase-functions@7` in `functions/` is a worthwhile
  planned upgrade that happens to clear three highs.
