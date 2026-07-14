'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const BUILD = '20260714-4';

function replaceOrFail(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Could not patch ${label}`);
  return next;
}

function versionLocalAssets(index) {
  let next = index;
  next = next.replace(
    /<link rel="icon"[^>]*>/,
    `<link rel="icon" type="image/svg+xml" href="favicon.svg?v=${BUILD}">`
  );
  if (!/<link rel="icon"/.test(next)) {
    next = next.replace(
      /(<title>Exit Strategy 3<\/title>)/,
      `$1\n  <link rel="icon" type="image/svg+xml" href="favicon.svg?v=${BUILD}">`
    );
  }
  next = next.replace(
    /(<link rel="stylesheet" href=")([^"?]+\.css)(?:\?[^" ]*)?(")/g,
    `$1$2?v=${BUILD}$3`
  );
  next = next.replace(
    /(<script src=")(src\/[^"?]+\.js)(?:\?[^" ]*)?("[^>]*><\/script>)/g,
    `$1$2?v=${BUILD}$3`
  );
  return next;
}

let index = fs.readFileSync('index.html', 'utf8');
index = versionLocalAssets(index);
index = index.replace(
  '<ol id="history" class="history"></ol>',
  '<ul id="history" class="history" aria-label="Move history"></ul>'
);
fs.writeFileSync('index.html', index);

let app = fs.readFileSync('src/app-v2.js', 'utf8');
app = app.replace(
  /new Worker\('src\/cpu3-worker\.js(?:\?[^']*)?'\)/g,
  `new Worker('src/cpu3-worker.js?v=${BUILD}')`
);
app = app.replace(
  /new Worker\('src\/cpuplus-worker\.js(?:\?[^']*)?'\)/g,
  `new Worker('src/cpuplus-worker.js?v=${BUILD}')`
);
fs.writeFileSync('src/app-v2.js', app);

let lastMove = fs.readFileSync('src/last-move.js', 'utf8');
lastMove = replaceOrFail(
  lastMove,
  `  let drawQueued = false;`,
  `  let drawQueued = false;\n  let depthRefreshQueued = false;`,
  'depth refresh state'
);
lastMove = replaceOrFail(
  lastMove,
  `    const startTurn = Number.parseInt(document.querySelector('#turnCounter')?.textContent || '0', 10) || 0;
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
    else phaseCard.appendChild(sequence);`,
  `    const startTurn = Number.parseInt(document.querySelector('#turnCounter')?.textContent || '0', 10) || 0;
    const signature = JSON.stringify({
      completedDepth: cpuPlusProgress.completedDepth || 0,
      startTurn,
      principalVariation: cpuPlusProgress.principalVariation || []
    });
    if (existingSequence?.dataset.renderSignature === signature) return;

    const sequence = createBestSequenceNode(cpuPlusProgress, startTurn);
    if (!sequence) {
      existingSequence?.remove();
      return;
    }

    sequence.dataset.renderSignature = signature;
    if (existingSequence) existingSequence.replaceWith(sequence);
    else phaseCard.appendChild(sequence);`,
  'best-sequence signature before DOM creation'
);
lastMove = replaceOrFail(
  lastMove,
  `  new MutationObserver(updateDepthDisplay).observe(phaseCard, {
    childList: true,
    subtree: true,
    characterData: true
  });`,
  `  function isProgressMutationNode(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return Boolean(element?.matches?.('.cpuplus-depth-status, .cpuplus-best-sequence')
      || element?.closest?.('.cpuplus-depth-status, .cpuplus-best-sequence'));
  }

  function queueDepthDisplayRefresh() {
    if (depthRefreshQueued) return;
    depthRefreshQueued = true;
    window.requestAnimationFrame(() => {
      depthRefreshQueued = false;
      updateDepthDisplay();
    });
  }

  new MutationObserver((mutations) => {
    const externalMutation = mutations.some((mutation) => {
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (changedNodes.length && changedNodes.every(isProgressMutationNode)) return false;
      return !isProgressMutationNode(mutation.target);
    });
    if (externalMutation) queueDepthDisplayRefresh();
  }).observe(phaseCard, {
    childList: true,
    subtree: true,
    characterData: true
  });`,
  'filtered depth observer'
);
fs.writeFileSync('src/last-move.js', lastMove);

const profilePath = 'downloads/cpuplus-trained-profile-2026-07-14.json';
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const body = {
  format: profile.format,
  schemaVersion: profile.schemaVersion,
  exportedAt: profile.exportedAt,
  database: profile.database
};
const checksum = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
if (checksum !== profile.checksum) throw new Error('Starter profile checksum is invalid.');
const placements = Object.keys(profile.database.placements).length;
const games = Object.values(profile.database.placements)
  .reduce((sum, stat) => sum + Number(stat.rawGames || 0), 0);

let navigation = fs.readFileSync('src/pre-game-navigation.js', 'utf8');
navigation = navigation.replace(
  /\d+ placements and \d+ recorded results/g,
  `${placements} placements and ${games} recorded results`
);
fs.writeFileSync('src/pre-game-navigation.js', navigation);

let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(
  /\d+ learned placements and \d+ recorded results/g,
  `${placements} learned placements and ${games} recorded results`
);
fs.writeFileSync('README.md', readme);

let test = fs.readFileSync('tests/analysis-progress-navigation.test.js', 'utf8');
test = test.replace(
  `  assert.match(source, /existingSequence\\.replaceWith/);`,
  `  assert.match(source, /existingSequence\\.replaceWith/);\n  assert.match(source, /isProgressMutationNode/);\n  assert.match(source, /queueDepthDisplayRefresh/);`
);
test += `

test('browser assets are cache-busted and a favicon is installed', () => {
  const index = read('index.html');
  assert.match(index, /favicon\\.svg\\?v=${BUILD}/);
  assert.match(index, /styles\\.css\\?v=${BUILD}/);
  assert.match(index, /src\\/app-v2\\.js\\?v=${BUILD}/);
  assert.match(index, /src\\/last-move\\.js\\?v=${BUILD}/);
  assert.match(index, /<ul id="history"/);
  assert.match(read('favicon.svg'), /Exit Strategy 3 favicon/);
});

test('CPU workers use the current build version', () => {
  const app = read('src/app-v2.js');
  assert.match(app, /cpu3-worker\\.js\\?v=${BUILD}/);
  assert.match(app, /cpuplus-worker\\.js\\?v=${BUILD}/);
});
`;
fs.writeFileSync('tests/analysis-progress-navigation.test.js', test);

for (const path of [
  'scripts/apply-cache-runtime-fixes.js',
  '.github/workflows/apply-cache-runtime-fixes.yml'
]) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
