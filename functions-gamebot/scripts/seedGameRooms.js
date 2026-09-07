// Optional one-time setup script. Run with Admin SDK credentials to create
// five brand-new dedicated game rooms, each already configured with the
// bot as a member and `gameBotGame` set. Uses the SAME roomChats data
// model as the rest of the app — no schema changes needed.
//
// This is no longer the only way to get a game room: a room admin can
// also enable/switch GameBot on any existing room live from
// RoomSettingsScreen (roomChatService.setRoomGameBot), which sets this
// same `gameBotGame` field. Use this script only if you want ready-made,
// bot-dedicated rooms provisioned in bulk up front.
//
// Usage: node scripts/seedGameRooms.js

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

const BOT_UID = 'bot_gamebot';
const BOT_NAME = 'GameBot';

const ROOMS = [
  {
    game: 'dice',
    name: '🎲 Dice Room',
    description: 'Roll for points — lowest roll is eliminated each round. Last player standing wins the pot.',
    rules: [
      'Points only — no real money involved.',
      'Entry fee is deducted from your points balance when you .join.',
      'Be respectful — no spamming or harassment.',
    ],
  },
  {
    game: 'lowcard',
    name: '🃏 LowCard Room',
    description: 'Draw a card each round — lowest card survives, highest is eliminated. Last player standing wins.',
    rules: [
      'Points only — no real money involved.',
      'Entry fee is deducted from your points balance when you .join.',
      'Be respectful — no spamming or harassment.',
    ],
  },
  {
    game: 'highcard',
    name: '🂡 HighCard Room',
    description: 'Draw a card each round — highest card survives, lowest is eliminated. Last player standing wins.',
    rules: [
      'Points only — no real money involved.',
      'Entry fee is deducted from your points balance when you .join.',
      'Be respectful — no spamming or harassment.',
    ],
  },
  {
    game: 'cricket',
    name: '🏏 Cricket Room',
    description: 'Face your balls — get OUT and you\'re eliminated immediately. Last batter standing wins the pot.',
    rules: [
      'Points only — no real money involved.',
      'Entry fee is deducted from your points balance when you .join.',
      'Be respectful — no spamming or harassment.',
    ],
  },
  {
    game: '29',
    name: '🂮 29 Room',
    description: 'Simplified 2v2 partnership card game — exactly 4 players, teams by join order, trump revealed, bot plays the hand. Highest-scoring team splits the pot.',
    rules: [
      'Points only — no real money involved.',
      'Requires exactly 4 players to start (2 vs 2, teams set by join order).',
      'Entry fee is deducted from your points balance when you .join.',
      'This is a simplified auto-played version of 29, not tournament rules.',
      'Be respectful — no spamming or harassment.',
    ],
  },
];

async function createGameRoom({ game, name, description, rules }) {
  const roomRef = db.collection('roomChats').doc(); // pre-generate id
  await roomRef.set({
    name,
    description,
    rules,
    type: 'open',
    adminsOnlyPost: false,
    ownerUid: BOT_UID,
    adminUids: [BOT_UID],
    memberUids: [BOT_UID],
    memberNames: { [BOT_UID]: BOT_NAME },
    pendingUids: [],
    mutedUids: [],
    bannedUids: [],
    agreedUids: [BOT_UID],
    unreadCounts: { [BOT_UID]: 0 },
    gameBotGame: game,
    createdBy: BOT_UID,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: '',
    lastMessageAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSenderName: '',
  });

  console.log(`${game} -> roomId: ${roomRef.id} (gameBotGame already set, ready to play)`);
  return { game, roomId: roomRef.id };
}

async function main() {
  for (const room of ROOMS) {
    await createGameRoom(room);
  }
  console.log('\nDone. Each room already has gameBotGame set - no further config needed.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
