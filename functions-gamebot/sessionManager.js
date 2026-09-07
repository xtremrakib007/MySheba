// gameBotSessions/{roomId} -> {
//   game: 'dice' | 'lowcard' | 'cricket',
//   status: 'waiting' | 'in_progress' | 'finished',
//   entryFee: number,
//   pot: number,
//   players: [{uid, name}],       // still-active players once in_progress
//   joined: [{uid, name}],        // players who joined during 'waiting'
//   round: number,
//   createdAt, updatedAt
// }
//
// Fully separate from roomChats/{roomId} itself — the room doc's
// memberUids/etc are untouched by game state.

const admin = require('firebase-admin');

const SESSIONS_COLLECTION = 'gameBotSessions';

function db() {
  return admin.firestore();
}

function sessionRef(roomId) {
  return db().collection(SESSIONS_COLLECTION).doc(roomId);
}

async function getSession(roomId) {
  const snap = await sessionRef(roomId).get();
  return snap.exists ? snap.data() : null;
}

/** Starts a fresh 'waiting' session for a given game + entry fee. */
async function openSession(roomId, game, entryFee) {
  await sessionRef(roomId).set({
    game,
    status: 'waiting',
    entryFee,
    pot: 0,
    joined: [],
    players: [],
    round: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function addJoiner(roomId, player, maxPlayers) {
  const ref = sessionRef(roomId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('No open session in this room.');
    const session = snap.data();
    if (session.status !== 'waiting') throw new Error('Game already in progress.');
    if (session.joined.some((p) => p.uid === player.uid)) throw new Error('Already joined.');
    if (maxPlayers && session.joined.length >= maxPlayers) {
      throw new Error(`This game is full (max ${maxPlayers} players).`);
    }

    tx.update(ref, {
      joined: [...session.joined, player],
      pot: session.pot + session.entryFee,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

/** Moves session from 'waiting' to 'in_progress', snapshotting joined players as active players. */
async function startGame(roomId) {
  const ref = sessionRef(roomId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const session = snap.data();
    tx.update(ref, {
      status: 'in_progress',
      players: session.joined,
      round: 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function updateAfterRound(roomId, remainingPlayers, round) {
  await sessionRef(roomId).update({
    players: remainingPlayers,
    round,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function finishSession(roomId) {
  await sessionRef(roomId).update({
    status: 'finished',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = {
  getSession,
  openSession,
  addJoiner,
  startGame,
  updateAfterRound,
  finishSession,
};
