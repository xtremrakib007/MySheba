# Gamebot merge — mysheba-gamepoints-merged folded into this tree

Base already contained the gamepoints-withdraw-transfer feature in full
(App.js wiring, GamePointsScreen/GamePointsTransferScreen, gamePointsService.js,
chargeGamePoints/withdrawGamePoints/transferGamePoints in functions/, and the
gamePoints/gamePointsLedger/gamePointsTransfers firestore rules) — that delta
had already been superseded by a newer revision in base, per the original
MERGE_NOTES.md.

What was actually new and has now been added:

1. **`functions-gamebot/`** — new top-level folder, copied in as-is. Standalone
   Cloud Functions codebase (own `package.json`) implementing the room games
   (dice/lowcard/highcard/cricket/29) via `sessionManager.js` + `pointsLedger.js`.
   Not merged into `functions/` — deploys independently.

2. **`firebase.json`** — added a second entry to the `functions` array:
   `{ "source": "functions-gamebot", "codebase": "gamebot" }`. Deploy separately:
   `firebase deploy --only functions:default` / `firebase deploy --only functions:gamebot`.

3. **`firestore.rules`** — added the one missing rule, `gameBotSessions/{roomId}`
   (`allow read, write: if false` — Admin SDK only, functions-gamebot's session
   state). Inserted right after the existing `gamePointsLedger` rule.

## Still needed before deploying functions-gamebot (not a file change)
Set up a scoped GCP service account for the `gamebot` codebase — read-only on
`roomChats`, read/write only on its own collections (`gameBotSessions` +
whatever `pointsLedger.js`/game files touch) — and assign it via Functions v2
per-function or per-codebase `serviceAccount` config. This is IAM/console
setup, not something either source zip could contain.

## Verified
- All `functions-gamebot/*.js` files pass `node --check` (plain CommonJS, no JSX).
- `firebase.json` is valid JSON.
- `functions/index.js` and `functions/walletService.js` were untouched (base
  already had the gamePoints functions) and still pass `node --check`.
- Did not re-run the full babel/JSX parse check on the whole tree (network
  install of `@babel/parser` timed out in this environment) — App.js, screens,
  and other JSX files were not touched by this merge, so the prior merge's
  parse-check result still holds for them. Re-run it yourself if you want to
  re-confirm before deploying, or just build with `eas build` which will catch
  any real syntax error.
