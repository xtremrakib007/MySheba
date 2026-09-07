# mysheba GameBot

Standalone Cloud Functions codebase for multiplayer, points-based games in
mysheba chatrooms. **Deployed and maintained separately from the main
`functions/` codebase.** No real money — points only.

## Isolation from the main app

- Deploys independently: `firebase deploy --only functions:gamebot`
  (requires the multi-codebase `functions` array in `firebase.json`).
- **Writes to**: `roomChats/*/messages` (read+write), `gameBotSessions/*`,
  `gamePoints/*`, `gamePointsLedger/*`.
- **Reads (read-only)**: `roomChats/{roomId}` itself, just the
  `gameBotGame`/`memberUids` fields, to know which game (if any) is active
  in a room — see `getActiveGame()` in `index.js`.
- **Never writes to**: `roomChats/{roomId}` (the room doc itself),
  `wallets`, `transactions`, `salarySettings`, `directChats`,
  `groupChats`. Adding the bot to a room and picking its game are always
  client-side, admin-only writes (`roomChatService.setRoomGameBot` /
  `removeRoomGameBot`) — this codebase only ever reads that config.
- Give this codebase's service account a scoped IAM role limited to
  read-only on `roomChats` plus read+write on the four collections above,
  separate from the main app's function identity.

## Getting a room into play

A room admin turns any existing room into a game room from **Room
Settings → Game Bot** in the app (admin-only section), picking one of the
five games. This adds the bot to the room and sets `gameBotGame` on the
room doc — no redeploy needed, and the admin can switch games or turn the
bot off again at any time the same way.

Alternatively, `node scripts/seedGameRooms.js` (with admin credentials)
bulk-provisions five brand-new, ready-to-play dedicated rooms up front —
useful for initial setup, but no longer required.

## Setup

1. `cd functions-gamebot && npm install`
2. Deploy: `npm run deploy`.
3. (Optional) `node scripts/seedGameRooms.js` to provision starter rooms,
   or just let admins enable GameBot on existing rooms from Room Settings.

## Points

- Every user gets 100 starting points on first interaction
  (`gamePoints/{uid}.balance`).
- All balance changes go through `pointsLedger.js` inside a Firestore
  transaction, with a ledger row for full auditability. Balances can never
  go negative.
- Points have **no cash value** and cannot be withdrawn — make sure this
  is stated in-app and in each room's rules (already included in the
  seed script).

## Commands (typed in a game room)

- `.newgame [entryFee]` — open a new game (default 10 pts)
- `.join` — join the open game, deducts entry fee
- `.startgame` — begin once ≥2 players have joined
- `.points` — check your points balance
- `.help` — list commands

## Games

All three share `games/eliminationEngine.js`: every round, the
worst-performing player is eliminated (ties replay just among themselves)
until one player remains and takes the pot.

| Game | File | Round mechanic |
|---|---|---|
| Dice | `games/dice.js` | Roll 1–6, lowest eliminated each round |
| LowCard | `games/lowcard.js` | Draw a card, highest eliminated each round (lowest survives) |
| HighCard | `games/highcard.js` | Draw a card, lowest eliminated each round (highest survives) |
| Cricket | `games/cricket.js` | Survival style — each turn faces up to 3 balls; getting OUT eliminates that player immediately (not compared to others). Total runs only used as a tie-break if the last players all get out in the same round. Capped at 6 rounds (sudden-death by total runs if still unresolved). |
| 29 | `games/twentyNine.js` | Simplified 2v2 partnership trick-taking — exactly 4 players, teams fixed by join order, trump chosen randomly, bot auto-plays all 8 tricks. Winning team splits the pot; a 14–14 tie refunds everyone. **Not tournament-accurate** — real 29 involves live bidding/trump selection which this text-command bot doesn't support yet. |

Dice, LowCard, and HighCard share `games/eliminationEngine.js` (worst
result each round is out). Cricket and 29 do **not** use that engine —
Cricket exports `playSurvivalGame` (`mode: 'survival'`), and 29 exports
`playTeamGame` (`mode: 'team'`, requires exactly 4 players, split-pot or
draw-refund payout instead of a single winner). Both are dispatched
separately in `index.js`.

## Adding a new game

Add a module to `games/` exporting `{ key, label, direction, playRound }`
matching the shape in `games/dice.js`, register it in `GAMES` in
`index.js`, and seed a room for it.

## Compliance note

This intentionally uses **non-withdrawable in-app points**, not real
money, to avoid real-money-gambling regulation (licensing, KYC/AML,
age verification, app store restrictions on gambling apps). If a
real-money version is ever considered, that requires legal review
specific to each jurisdiction your users are in — do not repurpose
this points ledger for cash without that review.
