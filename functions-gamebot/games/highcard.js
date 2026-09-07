// HighCard: mirror of LowCard. Each active player is dealt one card from a
// fresh shuffled deck each round. LOWEST card is eliminated each round
// (highest card survives). Last player standing wins the pot.

const RANKS = [
  { label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 },
  { label: '5', value: 5 }, { label: '6', value: 6 }, { label: '7', value: 7 },
  { label: '8', value: 8 }, { label: '9', value: 9 }, { label: '10', value: 10 },
  { label: 'J', value: 11 }, { label: 'Q', value: 12 }, { label: 'K', value: 13 },
  { label: 'A', value: 14 },
];
const SUITS = ['♠', '♥', '♦', '♣'];

function freshDeck() {
  const deck = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ label: `${rank.label}${suit}`, value: rank.value });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

async function playRound(activePlayers) {
  const deck = freshDeck(); // fresh deck each round, no card-counting across rounds
  const results = activePlayers.map((p, i) => ({
    uid: p.uid,
    name: p.name,
    value: deck[i].value,
    cardLabel: deck[i].label,
  }));

  const displayLines = results.map((r) => `🃏 ${r.name} drew ${r.cardLabel}`);

  return { results, displayLines };
}

module.exports = {
  key: 'highcard',
  label: '🂡 HighCard',
  direction: 'lowest_eliminated', // highest card survives each round
  playRound,
};
