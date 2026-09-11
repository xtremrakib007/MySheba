// GameBot — standalone Cloud Functions codebase.
// Deploy separately: firebase deploy --only functions:gamebot
//
// Triggers ONLY on roomChats/{roomId}/messages — never groupChats or
// directChats — so the bot structurally cannot operate outside chatrooms.
//
// Which room plays which game is set live by a room admin from
// RoomSettingsScreen in the main app (roomChatService.setRoomGameBot /
// removeRoomGameBot), which writes `gameBotGame` on the roomChats/{roomId}
// doc and adds this bot to memberUids — see getActiveGame() below. Any
// existing room can be turned into a game room this way at any time, and
// an admin can switch games later just by picking a different one.
// scripts/seedGameRooms.js is now an optional helper for provisioning
// brand-new dedicated rooms up front; it is no longer required.

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const points = require('./pointsLedger');
const sessions = require('./sessionManager');
const { runRound } = require('./games/eliminationEngine');

const dice = require('./games/dice');
const lowcard = require('./games/lowcard');
const highcard = require('./games/highcard');
const cricket = require('./games/cricket');
const twentyNine = require('./games/twentyNine');

const GAMES = { dice, lowcard, highcard, cricket, '29': twentyNine };

const BOT_UID = 'bot_gamebot';
const BOT_NAME = 'GameBot';

/**
 * Which game (if any) is active in a room is no longer a static map baked
 * into this codebase - a room admin sets it live from RoomSettingsScreen
 * (roomChatService.setRoomGameBot / removeRoomGameBot), which writes a
 * `gameBotGame` field directly on the roomChats/{roomId} doc. This function
 * reads that field. This is the ONLY read this codebase does outside its
 * own four collections (roomChats/{roomId}/messages, gameBotSessions/*,
 * gamePoints/*, gamePointsLedger/*) - it is read-only, this codebase never
 * writes to the roomChats document itself, only to its messages
 * subcollection (see postMessage below).
 */
async function getActiveGame(roomId) {
  const snap = await db.collection('roomChats').doc(roomId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  const game = data.gameBotGame;
  if (!game || !GAMES[game]) return null;
  // Guard against a stale gameBotGame left set after the bot was removed
  // from the room (e.g. kicked/banned) without clearing the field.
  if (!(data.memberUids || []).includes(BOT_UID)) return null;
  return game;
}

async function postMessage(roomId, text) {
  await db.collection('roomChats').doc(roomId).collection('messages').add({
    senderId: BOT_UID,
    senderName: BOT_NAME,
    text,
    type: 'text',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

function parseCommand(text) {
  const trimmed = (text || '').trim();
  if (!trimmed.startsWith('.')) return null;
  const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
  return { cmd: cmd.toLowerCase(), args: rest };
}

/**
 * Runs a single-winner game to completion. Dispatches by gameModule.mode:
 *   'survival'  (cricket)         — OUT eliminates immediately, its own internal loop
 *   default     (dice/lowcard/highcard) — shared elimination engine, worst score/round eliminated
 * NOTE: 'team' mode (29) is NOT handled here — it has its own payout path
 * (split pot / draw refund) in the .startgame handler below.
 */
async function playOutGame(roomId, gameModule, session) {
  if (gameModule.mode === 'survival') {
    const { lines, winner } = await gameModule.playSurvivalGame(session.players);
    return { lines, winner };
  }

  let activePlayers = session.players;
  let round = session.round;
  const lines = [];

  let winner = null;
  while (!winner) {
    round += 1;
    lines.push(`— Round ${round} —`);
    const result = await runRound(gameModule, activePlayers);
    lines.push(...result.displayLines);

    if (result.winner) {
      winner = result.winner;
      break;
    }
    activePlayers = result.remainingPlayers;
    await sessions.updateAfterRound(roomId, activePlayers, round);
  }

  return { lines, winner, finalRound: round };
}

exports.onRoomMessageCreated = onDocumentCreated(
  'roomChats/{roomId}/messages/{messageId}',
  async (event) => {
    const message = event.data.data();
    const { roomId } = event.params;

    if (!message || message.senderId === BOT_UID) return;

    const parsed = parseCommand(message.text);
    if (!parsed) return;

    const game = await getActiveGame(roomId);
    if (!game) return; // not a game room, or bot not active here, ignore

    const gameModule = GAMES[game];
    const player = { uid: message.senderId, name: message.senderName || 'Player' };

    try {
      if (parsed.cmd === 'newgame') {
        const entryFee = parseInt(parsed.args[0], 10) || 10;
        await sessions.openSession(roomId, game, entryFee);
        const need = gameModule.mode === 'team'
          ? `exactly ${gameModule.minPlayers} players (2v2 teams)`
          : `at least 2 players`;
        await postMessage(
          roomId,
          `${gameModule.label} — new game open! Entry fee: ${entryFee} pts (need ${need}).\nType .join to enter, .startgame when ready.`
        );
        return;
      }

      if (parsed.cmd === 'join') {
        const session = await sessions.getSession(roomId);
        if (!session || session.status !== 'waiting') {
          await postMessage(roomId, `No open game to join. Type .newgame [entry fee] to start one.`);
          return;
        }
        const balance = await points.getBalance(player.uid);
        if (balance < session.entryFee) {
          await postMessage(roomId, `${player.name}, you need ${session.entryFee} pts to join (you have ${balance}).`);
          return;
        }
        await points.deductEntryFee(player.uid, roomId, game, session.entryFee);
        await sessions.addJoiner(roomId, player, gameModule.maxPlayers);
        await postMessage(roomId, `✅ ${player.name} joined. Pot: ${session.pot + session.entryFee} pts.`);
        return;
      }

      if (parsed.cmd === 'startgame') {
        const session = await sessions.getSession(roomId);
        if (!session || session.status !== 'waiting') {
          await postMessage(roomId, `No game waiting to start.`);
          return;
        }

        const minPlayers = gameModule.minPlayers || 2;
        const isTeamGame = gameModule.mode === 'team';

        if (isTeamGame && session.joined.length !== minPlayers) {
          await postMessage(roomId, `29 needs exactly ${minPlayers} players to start (have ${session.joined.length}).`);
          return;
        }
        if (!isTeamGame && session.joined.length < minPlayers) {
          await postMessage(roomId, `Need at least ${minPlayers} players to start (have ${session.joined.length}).`);
          return;
        }

        await sessions.startGame(roomId);
        const started = await sessions.getSession(roomId);
        await postMessage(roomId, `🎮 ${gameModule.label} starting with ${started.players.length} players! Pot: ${started.pot} pts.`);

        if (isTeamGame) {
          const { lines, winningTeamPlayers, isDraw } = await gameModule.playTeamGame(started.players);
          await postMessage(roomId, lines.join('\n'));

          if (isDraw) {
            for (const p of started.players) {
              await points.applyDelta(p.uid, roomId, game, started.entryFee, 'refund_draw');
            }
            await sessions.finishSession(roomId);
            await postMessage(roomId, `Entry fees refunded to all players.\nType .newgame [entry fee] to play again.`);
            return;
          }

          const [p1, p2] = winningTeamPlayers;
          const half = Math.floor(started.pot / 2);
          const remainder = started.pot - half * 2;
          await points.creditWinnings(p1.uid, roomId, game, half + remainder);
          await points.creditWinnings(p2.uid, roomId, game, half);
          await sessions.finishSession(roomId);
          await postMessage(roomId, `🏆 ${p1.name} & ${p2.name} split the pot of ${started.pot} pts!\nType .newgame [entry fee] to play again.`);
          return;
        }

        const { lines, winner } = await playOutGame(roomId, gameModule, started);
        await postMessage(roomId, lines.join('\n'));

        await points.creditWinnings(winner.uid, roomId, game, started.pot);
        await sessions.finishSession(roomId);
        await postMessage(roomId, `🏆 ${winner.name} wins the pot of ${started.pot} pts!\nType .newgame [entry fee] to play again.`);
        return;
      }

      if (parsed.cmd === 'points' || parsed.cmd === 'balance') {
        const balance = await points.getBalance(player.uid);
        await postMessage(roomId, `${player.name}, your balance: ${balance} pts.`);
        return;
      }

      if (parsed.cmd === 'help') {
        await postMessage(
          roomId,
          `Commands:\n.newgame [fee] — open a new game\n.join — join the open game\n.startgame — begin once enough players joined\n.points — check your balance`
        );
        return;
      }
    } catch (err) {
      await postMessage(roomId, `⚠️ ${err.message}`);
    }
  }
);
