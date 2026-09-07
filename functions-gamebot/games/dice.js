// Dice: each active player rolls 1-6. Lowest roll each round is eliminated.
// Last player standing wins the pot.

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

async function playRound(activePlayers) {
  const results = activePlayers.map((p) => ({
    uid: p.uid,
    name: p.name,
    value: rollDie(),
  }));

  const displayLines = results.map((r) => `🎲 ${r.name} rolled a ${r.value}`);

  return { results, displayLines };
}

module.exports = {
  key: 'dice',
  label: '🎲 Dice',
  direction: 'lowest_eliminated',
  playRound,
};
