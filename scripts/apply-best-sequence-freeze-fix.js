'use strict';

const fs = require('node:fs');

function replaceOrFail(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Could not patch ${label}`);
  return next;
}

let lastMove = fs.readFileSync('src/last-move.js', 'utf8');
lastMove = replaceOrFail(
  lastMove,
  /  function updateDepthDisplay\(\) \{[\s\S]*?\n  \}\n\n  ensureBestSequenceOption\(\);/,
  `  function updateDepthDisplay() {
    const cpuPlusTurn = !document.body.classList.contains('analysis-mode') && phaseCard.textContent.includes('CPU+ is deepening its search');
    const existing = phaseCard.querySelector('.cpuplus-depth-status');
    const existingSequence = phaseCard.querySelector('.cpuplus-best-sequence');
    if (!cpuPlusTurn || !cpuPlusProgress) {
      existing?.remove();
      existingSequence?.remove();
      return;
    }

    const text = depthText(cpuPlusProgress);
    if (!text) return;
    const node = existing || document.createElement('small');
    node.className = 'cpuplus-depth-status';
    if (node.textContent !== text) node.textContent = text;
    if (!existing) phaseCard.appendChild(node);

    const startTurn = Number.parseInt(document.querySelector('#turnCounter')?.textContent || '0', 10) || 0;
    const sequence = createBestSequenceNode(cpuPlusProgress, startTurn);
    if (!sequence) {
      existingSequence?.remove();
      return;
    }

    const signature = JSON.stringify({
      completedDepth: cpuPlusProgress.completedDepth || 0,
      startTurn,
      principalVariation: cpuPlusProgress.principalVariation || []
    });
    if (existingSequence?.dataset.renderSignature === signature) return;
    sequence.dataset.renderSignature = signature;
    if (existingSequence) existingSequence.replaceWith(sequence);
    else phaseCard.appendChild(sequence);
  }

  ensureBestSequenceOption();`,
  'idempotent best-sequence rendering'
);
fs.writeFileSync('src/last-move.js', lastMove);

let navigation = fs.readFileSync('src/pre-game-navigation.js', 'utf8');
navigation = navigation.replace(/14 placements and 43 recorded results/g, '14 placements and 45 recorded results');
fs.writeFileSync('src/pre-game-navigation.js', navigation);

let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(/14 learned placements and 43 recorded results/g, '14 learned placements and 45 recorded results');
fs.writeFileSync('README.md', readme);

let test = fs.readFileSync('tests/analysis-progress-navigation.test.js', 'utf8');
test = replaceOrFail(
  test,
  `  assert.equal(profile.checksum, checksum);\n  assert.equal(Object.keys(profile.database.placements).length, 14);\n  assert.equal(Object.values(profile.database.placements).reduce((sum, stat) => sum + stat.rawGames, 0), 43);\n  assert.match(source, /Download trained profile/);\n  assert.match(source, /cpuplus-trained-profile-2026-07-14\\.json/);\n  assert.match(read('README.md'), /Download the trained CPU\\+ starter profile/);`,
  `  assert.equal(profile.checksum, checksum);
  const placements = Object.keys(profile.database.placements).length;
  const games = Object.values(profile.database.placements).reduce((sum, stat) => sum + stat.rawGames, 0);
  assert.ok(placements > 0);
  assert.ok(games > 0);
  assert.match(source, /Download trained profile/);
  assert.match(source, /cpuplus-trained-profile-2026-07-14\\.json/);
  assert.match(source, new RegExp(\\`${'${placements}'} placements and ${'${games}'} recorded results\\`));
  const readme = read('README.md');
  assert.match(readme, /Download the trained CPU\\+ starter profile/);
  assert.match(readme, new RegExp(\\`${'${placements}'} learned placements and ${'${games}'} recorded results\\`));`,
  'derived starter profile totals'
);
test = replaceOrFail(
  test,
  `  assert.match(source, /Best depth-/);`,
  `  assert.match(source, /Best depth-/);
  assert.match(source, /renderSignature/);
  assert.match(source, /existingSequence\\.replaceWith/);`,
  'idempotent rendering test'
);
fs.writeFileSync('tests/analysis-progress-navigation.test.js', test);

for (const path of ['scripts/apply-best-sequence-freeze-fix.js', '.github/workflows/apply-best-sequence-freeze-fix.yml', 'tmp/trigger-best-sequence-freeze-fix.txt']) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
