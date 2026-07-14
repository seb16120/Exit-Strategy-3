'use strict';

const fs = require('node:fs');

function replaceOrFail(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Could not patch ${label}`);
  return next;
}

// Prevent the best-sequence MutationObserver from replacing an identical node forever.
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

// Add the Undo control to the normal game actions.
let index = fs.readFileSync('index.html', 'utf8');
index = replaceOrFail(
  index,
  `      <section id="gameActions" class="game-actions" hidden>\n        <h2>Game actions</h2>\n        <button id="abandonButton" class="danger-button" type="button">Abandon game</button>\n      </section>`,
  `      <section id="gameActions" class="game-actions" hidden>
        <h2>Game actions</h2>
        <div class="game-action-buttons">
          <button id="undoMoveButton" class="secondary-button" type="button" hidden>Undo move</button>
          <button id="abandonButton" class="danger-button" type="button">Abandon game</button>
        </div>
      </section>`,
  'undo button markup'
);
fs.writeFileSync('index.html', index);

// Style history by side and remove the duplicate ordered-list marker.
let styles = fs.readFileSync('styles.css', 'utf8');
styles = replaceOrFail(
  styles,
  `.history { margin: 0; padding-left: 24px; max-height: 330px; overflow: auto; color: var(--muted); font-size: .86rem; }\n.history li { padding: 4px 0; }\n.history li:last-child { color: var(--text); }`,
  `.game-action-buttons { display: flex; gap: 9px; flex-wrap: wrap; }
.history { margin: 0; padding: 0; list-style: none; display: grid; gap: .28rem; max-height: 330px; overflow: auto; color: var(--muted); font-size: .86rem; }
.history li { padding: .42rem .55rem; border-left: 3px solid transparent; border-radius: .5rem; }
.history li.history-cyan { background: rgba(53, 217, 199, .10); border-left-color: var(--cyan); }
.history li.history-magenta { background: rgba(228, 90, 172, .10); border-left-color: var(--magenta); }
.history li:last-child { color: var(--text); }`,
  'history ownership styling'
);
fs.writeFileSync('styles.css', styles);

// Core runtime support for safe undo and replaying the exact previous setups.
let app = fs.readFileSync('src/app-v2.js', 'utf8');
app = replaceOrFail(
  app,
  `    gameActions: $('#gameActions'),\n    abandonButton: $('#abandonButton'),`,
  `    gameActions: $('#gameActions'),
    undoMoveButton: $('#undoMoveButton'),
    abandonButton: $('#abandonButton'),`,
  'undo element reference'
);
app = replaceOrFail(
  app,
  `  let clockInterval = null;\n  let toastTimer = null;`,
  `  let clockInterval = null;
  let toastTimer = null;
  let queuedReplayPieces = null;`,
  'queued replay state'
);
app = replaceOrFail(
  app,
  `    repetitions: new Map(),\n    history: [],\n    pendingMove: null,`,
  `    repetitions: new Map(),
    history: [],
    undoStack: [],
    pendingMove: null,`,
  'undo stack state'
);
app = replaceOrFail(
  app,
  `  function dispatchLastMoveReset() {\n    window.dispatchEvent(new Event('exit-strategy:reset-last-move'));\n  }\n\n  function clearCpuSearch() {`,
  `  function dispatchLastMoveReset() {
    window.dispatchEvent(new Event('exit-strategy:reset-last-move'));
  }

  function cloneRuntimePieces(pieces) {
    return pieces.map((piece) => ({ ...piece }));
  }

  function createUndoSnapshot() {
    return {
      pieces: cloneRuntimePieces(state.pieces),
      currentOwner: state.currentOwner,
      turnCount: state.turnCount,
      playerTurns: { ...state.playerTurns },
      consecutivePasses: state.consecutivePasses,
      repetitions: Array.from(state.repetitions.entries()),
      history: state.history.slice()
    };
  }

  function restoreUndoSnapshot(snapshot) {
    state.pieces = cloneRuntimePieces(snapshot.pieces);
    state.currentOwner = snapshot.currentOwner;
    state.turnCount = snapshot.turnCount;
    state.playerTurns = { ...snapshot.playerTurns };
    state.consecutivePasses = snapshot.consecutivePasses;
    state.repetitions = new Map(snapshot.repetitions);
    state.history = snapshot.history.slice();
    state.selectedPieceId = null;
    state.pendingMove = null;
    state.cpuThinking = false;
    state.finished = false;
  }

  function pushUndoSnapshot() {
    if (state.phase === 'play' && !state.finished) state.undoStack.push(createUndoSnapshot());
  }

  function humanUndoIndex() {
    if (!state.humanOwner) return -1;
    for (let index = state.undoStack.length - 1; index >= 0; index -= 1) {
      if (state.undoStack[index].currentOwner === state.humanOwner) return index;
    }
    return -1;
  }

  function canUndoHumanMove() {
    return state.phase === 'play'
      && !state.finished
      && !state.timedGame
      && state.mode !== 'local'
      && state.mode !== 'cpu-duel'
      && humanUndoIndex() >= 0;
  }

  function undoHumanMove() {
    if (!canUndoHumanMove()) return false;
    const index = humanUndoIndex();
    const snapshot = state.undoStack[index];
    const removedHalfMoves = state.history.length - snapshot.history.length;
    clearScheduledAction();
    restoreUndoSnapshot(snapshot);
    state.undoStack = state.undoStack.slice(0, index);
    dispatchLastMoveReset();
    render();
    showToast(removedHalfMoves > 1 ? 'Your move and the CPU reply were undone.' : 'Your move was undone.');
    return true;
  }

  function queueReplaySetup(pieces) {
    const candidate = cloneRuntimePieces(Array.isArray(pieces) ? pieces : []);
    if (!Game.validateSetup('cyan', candidate) || !Game.validateSetup('magenta', candidate)) return false;
    queuedReplayPieces = candidate;
    return true;
  }

  function tryStartQueuedReplay() {
    if (!queuedReplayPieces) return false;
    const candidate = cloneRuntimePieces(queuedReplayPieces);
    queuedReplayPieces = null;
    if (!Game.validateSetup('cyan', candidate) || !Game.validateSetup('magenta', candidate)) return false;
    state.pieces = candidate;
    state.nextPawnNumber = { cyan: 6, magenta: 6 };
    state.selectedPieceId = null;
    state.setupOwner = null;
    state.cpuThinking = false;
    state.phase = 'handoff';
    render();
    showPassDialog(
      'Same setups restored',
      'Both starting formations from the previous game are ready.',
      startPlay,
      'Start game',
      'READY TO PLAY'
    );
    return true;
  }

  function clearCpuSearch() {`,
  'runtime undo and replay helpers'
);
app = replaceOrFail(
  app,
  `    state.repetitions = new Map();\n    state.history = [];\n    state.pendingMove = null;`,
  `    state.repetitions = new Map();
    state.history = [];
    state.undoStack = [];
    state.pendingMove = null;`,
  'reset undo stack'
);
app = replaceOrFail(
  app,
  `    state.cpuMatchPaused = false;\n    state.cpuStepOnce = false;\n    beginCpuSetup('cyan');`,
  `    state.cpuMatchPaused = false;
    state.cpuStepOnce = false;
    if (tryStartQueuedReplay()) return;
    beginCpuSetup('cyan');`,
  'CPU duel setup replay'
);
app = replaceOrFail(
  app,
  `      state.humanOwner = state.roleByPerson.human;\n      state.cpuByOwner[state.roleByPerson.cpu] = level;\n      if (isCpuOwner('cyan')) beginCpuSetup('cyan');`,
  `      state.humanOwner = state.roleByPerson.human;
      state.cpuByOwner[state.roleByPerson.cpu] = level;
      if (tryStartQueuedReplay()) return;
      if (isCpuOwner('cyan')) beginCpuSetup('cyan');`,
  'human versus CPU setup replay'
);
app = replaceOrFail(
  app,
  `    state.phase = 'handoff';\n    render();\n    showPassDialog(\n      \`${state.personByOwner.cyan} is Player 1\`,`,
  `    if (tryStartQueuedReplay()) return;
    state.phase = 'handoff';
    render();
    showPassDialog(
      \`${state.personByOwner.cyan} is Player 1\`,`,
  'local setup replay'
);
app = replaceOrFail(
  app,
  `    state.repetitions = new Map();\n    state.history = [];\n    state.finished = false;`,
  `    state.repetitions = new Map();
    state.history = [];
    state.undoStack = [];
    state.finished = false;`,
  'fresh undo stack at reveal'
);
app = replaceOrFail(
  app,
  `    elements.gameActions.hidden = !hasHumanPlayer();\n    elements.abandonButton.disabled = state.finished;\n    renderLearningSummary();\n    elements.history.innerHTML = '';\n    state.history.forEach((entry) => {\n      const item = document.createElement('li');\n      item.textContent = entry;\n      elements.history.appendChild(item);\n    });`,
  `    elements.gameActions.hidden = !hasHumanPlayer();
    const showUndo = state.mode !== 'local' && state.mode !== 'cpu-duel' && !state.timedGame && Boolean(state.humanOwner);
    elements.undoMoveButton.hidden = !showUndo;
    elements.undoMoveButton.disabled = !canUndoHumanMove();
    elements.abandonButton.disabled = state.finished;
    renderLearningSummary();
    elements.history.innerHTML = '';
    state.history.forEach((entry, index) => {
      const item = document.createElement('li');
      item.classList.add(index % 2 === 0 ? 'history-cyan' : 'history-magenta');
      item.dataset.owner = index % 2 === 0 ? 'cyan' : 'magenta';
      item.textContent = entry;
      elements.history.appendChild(item);
    });`,
  'undo visibility and colored history rows'
);
app = replaceOrFail(
  app,
  `    const movingOwner = piece.owner;\n    clearCpuSearch();`,
  `    const movingOwner = piece.owner;
    pushUndoSnapshot();
    clearCpuSearch();`,
  'snapshot before each move'
);
app = replaceOrFail(
  app,
  `  elements.cpuNextButton.addEventListener('click', playNextCpuMove);\n  elements.abandonButton.addEventListener('click', openAbandonDialog);`,
  `  elements.cpuNextButton.addEventListener('click', playNextCpuMove);
  elements.undoMoveButton.addEventListener('click', undoHumanMove);
  elements.abandonButton.addEventListener('click', openAbandonDialog);`,
  'undo event listener'
);
app = replaceOrFail(
  app,
  `  createBoard();\n  render();`,
  `  window.ExitStrategyRuntime = {
    queueReplaySetup,
    canUndoHumanMove,
    undoHumanMove
  };

  createBoard();
  render();`,
  'public runtime controls'
);
fs.writeFileSync('src/app-v2.js', app);

// Add the result-screen setup replay option and make tracking robust after Undo.
let review = fs.readFileSync('src/game-review-tools.source.js', 'utf8');
review = replaceOrFail(
  review,
  `    .result-share-actions{padding-top:.85rem;border-top:1px solid var(--line)}\n    .analysis-card`,
  `    .result-share-actions{padding-top:.85rem;border-top:1px solid var(--line)}
    .result-replay-choice{display:flex;align-items:center;gap:.65rem;margin-top:.9rem;color:var(--muted)}
    .result-replay-choice input{width:22px;height:22px;accent-color:var(--exit)}
    .analysis-history button.history-cyan{background:rgba(53,217,199,.10)}
    .analysis-history button.history-magenta{background:rgba(228,90,172,.10)}
    .analysis-card`,
  'result replay and analysis history styles'
);
review = replaceOrFail(
  review,
  `    const domEntries = Array.from(historyList?.children || []).map((item) => item.textContent.trim());\n    while (currentRecord.entries.length < domEntries.length) {`,
  `    const domEntries = Array.from(historyList?.children || []).map((item) => item.textContent.trim());
    let commonLength = 0;
    while (commonLength < currentRecord.entries.length
      && commonLength < domEntries.length
      && currentRecord.entries[commonLength] === domEntries[commonLength]) commonLength += 1;
    if (commonLength < currentRecord.entries.length) {
      currentRecord.entries = currentRecord.entries.slice(0, commonLength);
      currentRecord.timeline = currentRecord.timeline.slice(0, commonLength + 1);
      currentRecord.result = null;
    }
    while (currentRecord.entries.length < domEntries.length) {`,
  'history truncation after undo'
);
review = replaceOrFail(
  review,
  `    const share = document.createElement('div');\n    share.className = 'result-share-actions';`,
  `    const replay = document.createElement('label');
    replay.className = 'result-replay-choice';
    replay.innerHTML = '<input id="replaySameSetupChoice" type="checkbox"><span>Replay the same starting setups</span>';
    main.insertAdjacentElement('afterend', replay);

    const share = document.createElement('div');
    share.className = 'result-share-actions';`,
  'same setup result option'
);
review = replaceOrFail(
  review,
  `    main.insertAdjacentElement('afterend', share);`,
  `    replay.insertAdjacentElement('afterend', share);`,
  'share actions after replay option'
);
review = replaceOrFail(
  review,
  `  function sameModeNewGame() {\n    const config = currentRecord?.config || deriveConfig();\n    relaunchConfig(config);\n  }`,
  `  function sameModeNewGame() {
    const config = currentRecord?.config || deriveConfig();
    const replay = $('#replaySameSetupChoice')?.checked;
    const initialPieces = currentRecord?.timeline?.[0]?.pieces;
    if (replay && initialPieces && !window.ExitStrategyRuntime?.queueReplaySetup(initialPieces)) {
      notify('The previous setups could not be restored; a normal new game will start.');
    }
    relaunchConfig(config);
  }`,
  'queue previous setups on new game'
);
review = replaceOrFail(
  review,
  `      button.classList.toggle('active', index === analysis.index);\n      if (analysis.timeline[index]?.variation) button.classList.add('variation');`,
  `      button.classList.toggle('active', index === analysis.index);
      if (index > 0) button.classList.add(index % 2 === 1 ? 'history-cyan' : 'history-magenta');
      if (analysis.timeline[index]?.variation) button.classList.add('variation');`,
  'colored analysis history rows'
);
review = replaceOrFail(
  review,
  `    if (resultDialog.open) {\n      finishTracking();\n      installResultButtons();\n    }`,
  `    if (resultDialog.open) {
      finishTracking();
      installResultButtons();
      const replay = $('#replaySameSetupChoice');
      if (replay) replay.checked = false;
    }`,
  'reset replay option on each result'
);
fs.writeFileSync('src/game-review-tools.source.js', review);

// Keep public starter-profile counts derived from the actual JSON instead of a stale constant.
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
  assert.match(source, new RegExp(\`${placements} placements and ${games} recorded results\`));
  const readme = read('README.md');
  assert.match(readme, /Download the trained CPU\\+ starter profile/);
  assert.match(readme, new RegExp(\`${placements} learned placements and ${games} recorded results\`));`,
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
test += `

test('human versus CPU supports safe undo and replaying previous setups', () => {
  const app = read('src/app-v2.js');
  const review = read('src/game-review-tools.source.js');
  assert.match(app, /undoHumanMove/);
  assert.match(app, /queueReplaySetup/);
  assert.match(app, /state\\.undoStack/);
  assert.match(review, /Replay the same starting setups/);
  assert.match(review, /commonLength/);
  assert.match(read('index.html'), /undoMoveButton/);
});

test('move history has one explicit move number and side-colored rows', () => {
  const app = read('src/app-v2.js');
  const styles = read('styles.css');
  assert.match(app, /history-cyan/);
  assert.match(app, /history-magenta/);
  assert.match(styles, /list-style: none/);
  assert.match(styles, /border-left-color: var\\(--cyan\\)/);
  assert.match(styles, /border-left-color: var\\(--magenta\\)/);
});
`;
fs.writeFileSync('tests/analysis-progress-navigation.test.js', test);

for (const path of ['scripts/apply-best-sequence-freeze-fix.js', '.github/workflows/apply-best-sequence-freeze-fix.yml', 'tmp/trigger-best-sequence-freeze-fix.txt']) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
