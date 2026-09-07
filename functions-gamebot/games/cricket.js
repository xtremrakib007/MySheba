// Cricket (simplified for chat) — SURVIVAL style, not comparison style.
//
// Every round, each still-active player faces one turn (up to
// BALLS_PER_TURN balls). If they get OUT during their turn, they are
// eliminated immediately — not compared against anyone else's score.
// Runs only exist as a tie-breaker for the rare case where the last two+
// players all get out in the same round.
//
// This game does NOT use games/eliminationEngine.js (that's for
// "lowest/highest score eliminated" games like Dice/LowCard). Cricket
// exports its own playSurvivalGame loop and mode: 'survival', which
// index.js dispatches to separately.

const BALLS_PER_TURN = 3;
const OUT_PROBABILITY = 0.15;
const MAX_ROUNDS = 6; // safety valve so an unlucky streak can't run forever

function faceBall() {
  if (Math.random() < OUT_PROBABILITY) return null; // null = OUT
  return Math.floor(Math.random() * 7); // 0-6 runs
}

/** One player's turn: bats until OUT or BALLS_PER_TURN balls faced. */
function faceTurn() {
  let runs = 0;
  let ballsFaced = 0;
  let isOut = false;

  for (let i = 0; i < BALLS_PER_TURN; i++) {
    const ball = faceBall();
    ballsFaced++;
    if (ball === null) {
      isOut = true;
      break;
    }
    runs += ball;
  }

  return { runs, ballsFaced, isOut };
}

/**
 * Plays a full survival-style game to completion.
 * startingPlayers: [{uid, name}]
 * Returns { lines: [string], winner: {uid, name, totalRuns} }
 */
async function playSurvivalGame(startingPlayers) {
  let active = startingPlayers.map((p) => ({ ...p, totalRuns: 0 }));
  const lines = [];
  let round = 0;

  while (active.length > 1) {
    round += 1;

    // Safety valve: if nobody's been eliminated after MAX_ROUNDS, force it
    // by highest total runs so far, instead of playing indefinitely.
    if (round > MAX_ROUNDS) {
      const best = active.reduce((a, b) => (b.totalRuns > a.totalRuns ? b : a));
      const topScorers = active.filter((p) => p.totalRuns === best.totalRuns);

      if (topScorers.length === 1) {
        lines.push(`⏱️ ${MAX_ROUNDS} rounds reached — ${best.name} wins on highest score (${best.totalRuns} runs)!`);
        return { lines, winner: best };
      }

      // Still tied at the cap — narrow the field to just the tied leaders
      // and keep playing only among them until it breaks.
      lines.push(`⏱️ ${MAX_ROUNDS} rounds reached — tied at ${best.totalRuns} runs between ${topScorers.map((p) => p.name).join(', ')}, playing a decider...`);
      active = topScorers;
    }

    lines.push(`— Round ${round} —`);
    const outThisRound = [];

    for (const player of active) {
      const turn = faceTurn();
      player.totalRuns += turn.runs;

      if (turn.isOut) {
        lines.push(`🏏 ${player.name} is OUT! (final score: ${player.totalRuns} runs)`);
        outThisRound.push(player);
      } else {
        lines.push(`🏏 ${player.name} scores ${turn.runs} run(s) off ${turn.ballsFaced} balls (total: ${player.totalRuns})`);
      }
    }

    active = active.filter((p) => !outThisRound.some((o) => o.uid === p.uid));

    // Everyone still active got out in the same round — decide by total runs.
    if (active.length === 0) {
      const best = outThisRound.reduce((a, b) => (b.totalRuns > a.totalRuns ? b : a));
      const topScorers = outThisRound.filter((p) => p.totalRuns === best.totalRuns);

      if (topScorers.length === 1) {
        lines.push(`🏆 Everyone's out this round — ${best.name} wins on highest score (${best.totalRuns} runs)!`);
        return { lines, winner: best };
      }

      lines.push(`All out and tied at ${best.totalRuns} runs between ${topScorers.map((p) => p.name).join(', ')} — replaying a decider between them...`);
      active = topScorers.map((p) => ({ ...p, totalRuns: 0 }));
    }
  }

  const winner = active[0];
  lines.push(`🏆 ${winner.name} is the last batter standing with ${winner.totalRuns} run(s)!`);
  return { lines, winner };
}

module.exports = {
  key: 'cricket',
  label: '🏏 Cricket',
  mode: 'survival', // dispatches to playSurvivalGame, bypasses eliminationEngine
  playSurvivalGame,
};
