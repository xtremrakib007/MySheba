// Shared elimination-round logic used by Dice, LowCard, and Cricket.
//
// A "game module" plugs into this by providing:
//   playRound(activePlayers) -> { results: [{uid, name, value}], displayLines: [string] }
//   direction: 'lowest_eliminated' | 'highest_eliminated'
//
// The engine handles: rolling each active player's result, finding the
// loser(s) of the round, re-rolling ties-for-last, eliminating the single
// loser, and detecting when only one player remains (the winner).

function pickRoundLosers(results, direction) {
  const values = results.map((r) => r.value);
  const worst = direction === 'lowest_eliminated'
    ? Math.min(...values)
    : Math.max(...values);
  return results.filter((r) => r.value === worst);
}

/**
 * Runs a single elimination round against the given active players.
 * gameModule.playRound receives the list of {uid, name} still in play.
 *
 * Returns:
 *   {
 *     displayLines: [string],       // text to post to the room
 *     eliminated: {uid, name} | null,
 *     remainingPlayers: [{uid, name}],
 *     winner: {uid, name} | null    // set only when 1 player remains
 *   }
 */
async function runRound(gameModule, activePlayers) {
  if (activePlayers.length === 1) {
    return {
      displayLines: [],
      eliminated: null,
      remainingPlayers: activePlayers,
      winner: activePlayers[0],
    };
  }

  const { results, displayLines } = await gameModule.playRound(activePlayers);
  let losers = pickRoundLosers(results, gameModule.direction);

  // Tie for last place with more than one player left after removing the
  // tied group entirely: replay just among the tied players until it
  // breaks, so exactly one player is eliminated per round.
  const tieBreakLines = [];
  while (losers.length > 1 && losers.length < activePlayers.length) {
    const tieBreakPlayers = losers.map((l) => ({ uid: l.uid, name: l.name }));
    tieBreakLines.push(
      `Tie between ${losers.map((l) => l.name).join(', ')} — replaying to break it...`
    );
    const tieRound = await gameModule.playRound(tieBreakPlayers);
    tieBreakLines.push(...tieRound.displayLines);
    losers = pickRoundLosers(tieRound.results, gameModule.direction);
  }

  // Edge case: every remaining player tied (losers.length === activePlayers.length)
  // — nobody eliminated this round, engine will just run again next round.
  if (losers.length >= activePlayers.length) {
    return {
      displayLines: [...displayLines, ...tieBreakLines, 'Everyone tied — replaying the round.'],
      eliminated: null,
      remainingPlayers: activePlayers,
      winner: null,
    };
  }

  const eliminated = losers[0];
  const remainingPlayers = activePlayers.filter((p) => p.uid !== eliminated.uid);

  return {
    displayLines: [...displayLines, ...tieBreakLines, `❌ ${eliminated.name} is eliminated.`],
    eliminated,
    remainingPlayers,
    winner: remainingPlayers.length === 1 ? remainingPlayers[0] : null,
  };
}

module.exports = { runRound };
