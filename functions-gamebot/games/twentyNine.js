// "29" — simplified 2v2 partnership trick-taking simulation.
//
// IMPORTANT SCOPE NOTE: real 29 involves live bidding and trump selection
// by players. This text-command bot has no per-trick interactive prompts
// yet, so this is a fully-automated simplified simulation: exactly 4
// players required, teams are fixed by join order (seats 0&2 vs 1&3),
// trump is chosen randomly (not bid), and the bot auto-plays all 8 tricks
// with simple heuristics. It captures partnerships + trump + point
// counting, not tournament-accurate bidding play.
//
// Deck: 32 cards, 4 suits x {7,8,9,10,J,Q,K,A}.
// Trick-winning strength order (high to low): J, 9, A, 10, K, Q, 8, 7.
// Point values: J=3, 9=2, A=1, 10=1, K=0, Q=0, 8=0, 7=0 (28 pts total/deck).
// Each side plays 8 tricks (2 players x 8... actually 4 players x 8 cards
// = 32 cards / 4 players = 8 cards each, 8 tricks total).
//
// Mode: 'team' — dispatched separately in index.js. Requires exactly 4
// joined players. Winning team splits the pot evenly (2-way). A 14-14 tie
// refunds everyone's entry fee (index.js handles the refund branch).

const SUITS = ['♠', '♥', '♦', '♣'];
const RANK_STRENGTH = { J: 8, 9: 7, A: 6, 10: 5, K: 4, Q: 3, 8: 2, 7: 1 };
const RANK_POINTS = { J: 3, 9: 2, A: 1, 10: 1, K: 0, Q: 0, 8: 0, 7: 0 };
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function freshDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANK_ORDER) {
      deck.push({ suit, rank, label: `${rank}${suit}` });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealHands(deck, players) {
  const hands = {};
  players.forEach((p) => (hands[p.uid] = []));
  deck.forEach((card, i) => {
    hands[players[i % players.length].uid].push(card);
  });
  return hands;
}

/** Picks which card a player plays for the current trick. Simple heuristic AI. */
function chooseCard(hand, ledSuit, trumpSuit) {
  const followSuit = hand.filter((c) => c.suit === ledSuit);
  const trumpCards = hand.filter((c) => c.suit === trumpSuit);

  const strongest = (cards) =>
    cards.reduce((best, c) => (RANK_STRENGTH[c.rank] > RANK_STRENGTH[best.rank] ? c : best));
  const weakestByPoints = (cards) =>
    cards.reduce((worst, c) => (RANK_POINTS[c.rank] < RANK_POINTS[worst.rank] ? c : worst));

  let chosen;
  if (!ledSuit) {
    // Leading the trick: lead the suit where this player is strongest.
    chosen = strongest(hand);
  } else if (followSuit.length > 0) {
    chosen = strongest(followSuit); // try to win with the led suit
  } else if (trumpCards.length > 0) {
    chosen = strongest(trumpCards); // trump in since can't follow suit
  } else {
    chosen = weakestByPoints(hand); // can't win, discard lowest-value card
  }

  hand.splice(hand.indexOf(chosen), 1);
  return chosen;
}

function trickWinnerIndex(plays, ledSuit, trumpSuit) {
  const trumpPlays = plays.filter((p) => p.card.suit === trumpSuit);
  const pool = trumpPlays.length > 0 ? trumpPlays : plays.filter((p) => p.card.suit === ledSuit);
  const winner = pool.reduce((best, p) =>
    RANK_STRENGTH[p.card.rank] > RANK_STRENGTH[best.card.rank] ? p : best
  );
  return winner.seatIndex;
}

/**
 * Plays a full simplified 29 hand.
 * players: exactly 4 [{uid, name}], seat order = join order.
 * Teams: seats [0,2] = Team A, seats [1,3] = Team B.
 *
 * Returns:
 *   { lines: [string], winningTeamPlayers: [{uid,name}] | null, isDraw: boolean }
 *   winningTeamPlayers is null when isDraw is true (14-14).
 */
async function playTeamGame(players) {
  if (players.length !== 4) {
    throw new Error('29 requires exactly 4 players.');
  }

  const teamA = [players[0], players[2]];
  const teamB = [players[1], players[3]];
  const trumpSuit = SUITS[Math.floor(Math.random() * SUITS.length)];

  const deck = freshDeck();
  const hands = dealHands(deck, players);

  const lines = [];
  lines.push(`Teams: A = ${teamA.map((p) => p.name).join(' & ')} | B = ${teamB.map((p) => p.name).join(' & ')}`);
  lines.push(`Trump suit: ${trumpSuit}`);

  let leaderIndex = 0;
  let scoreA = 0;
  let scoreB = 0;

  for (let trick = 1; trick <= 8; trick++) {
    const plays = [];
    let ledSuit = null;

    for (let i = 0; i < 4; i++) {
      const seatIndex = (leaderIndex + i) % 4;
      const player = players[seatIndex];
      const card = chooseCard(hands[player.uid], ledSuit, trumpSuit);
      if (i === 0) ledSuit = card.suit;
      plays.push({ seatIndex, player, card });
    }

    const winnerSeat = trickWinnerIndex(plays, ledSuit, trumpSuit);
    const winnerPlayer = players[winnerSeat];
    const trickPoints = plays.reduce((sum, p) => sum + RANK_POINTS[p.card.rank], 0);
    const isTeamA = winnerSeat === 0 || winnerSeat === 2;

    if (isTeamA) scoreA += trickPoints;
    else scoreB += trickPoints;

    lines.push(
      `Trick ${trick}: ${plays.map((p) => `${p.player.name} ${p.card.label}`).join(', ')} — won by ${winnerPlayer.name} (Team ${isTeamA ? 'A' : 'B'}, +${trickPoints} pts)`
    );

    leaderIndex = winnerSeat;
  }

  lines.push(`Final score — Team A: ${scoreA} pts, Team B: ${scoreB} pts`);

  if (scoreA === scoreB) {
    lines.push(`🤝 It's a ${scoreA}-${scoreB} tie — entry fees refunded, no winner this hand.`);
    return { lines, winningTeamPlayers: null, isDraw: true };
  }

  const winningTeamPlayers = scoreA > scoreB ? teamA : teamB;
  lines.push(`🏆 Team ${scoreA > scoreB ? 'A' : 'B'} wins (${winningTeamPlayers.map((p) => p.name).join(' & ')})!`);

  return { lines, winningTeamPlayers, isDraw: false };
}

module.exports = {
  key: '29',
  label: '🂮 29',
  mode: 'team',
  minPlayers: 4,
  maxPlayers: 4,
  playTeamGame,
};
