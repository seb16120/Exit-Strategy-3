'use strict';

const fs = require('node:fs');

function replaceOrFail(text, pattern, replacement, label) {
  const next = text.replace(pattern, replacement);
  if (next === text) throw new Error(`Could not patch ${label}`);
  return next;
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

let worker = fs.readFileSync('src/cpuplus-worker-v2.js', 'utf8');
worker = replaceOrFail(
  worker,
  `  if (moves.length === 0) {\n    if (passCount >= 1) return 0;`,
  `  if (moves.length === 0) {\n    context.bestMoveCache.set(key, { pass: true, owner: currentOwner });\n    if (passCount >= 1) return 0;`,
  'pass principal variation marker'
);
worker = replaceOrFail(
  worker,
  `  const maximizing = currentOwner === rootOwner;\n  let best = maximizing ? -Infinity : Infinity;\n  let complete = true;`,
  `  const maximizing = currentOwner === rootOwner;\n  let best = maximizing ? -Infinity : Infinity;\n  let bestMove = null;\n  let complete = true;`,
  'minimax best move state'
);
worker = replaceOrFail(
  worker,
  `    if (maximizing) {\n      best = Math.max(best, value);\n      alpha = Math.max(alpha, best);\n    } else {\n      best = Math.min(best, value);\n      beta = Math.min(beta, best);\n    }`,
  `    if (maximizing) {\n      if (value > best) {\n        best = value;\n        bestMove = move;\n      }\n      alpha = Math.max(alpha, best);\n    } else {\n      if (value < best) {\n        best = value;\n        bestMove = move;\n      }\n      beta = Math.min(beta, best);\n    }`,
  'minimax best move tracking'
);
worker = replaceOrFail(
  worker,
  `  if (complete) context.cache.set(key, best);\n  return best;\n}\n\nfunction searchDepth`,
  `  if (bestMove) context.bestMoveCache.set(key, { ...bestMove, owner: currentOwner });\n  if (complete) context.cache.set(key, best);\n  return best;\n}\n\nfunction buildPrincipalVariation(rootOwner, pieces, depth, rootMove, context) {\n  if (!rootMove || depth <= 0) return [];\n  const position = clonePieces(pieces);\n  const line = [];\n  let currentOwner = rootOwner;\n  let remaining = depth;\n  let passCount = 0;\n  let action = { ...rootMove, owner: rootOwner };\n\n  while (remaining > 0 && action) {\n    if (action.pass) {\n      line.push({ pass: true, owner: currentOwner });\n      currentOwner = Game.otherOwner(currentOwner);\n      passCount += 1;\n      remaining -= 1;\n    } else {\n      line.push({ ...action, owner: currentOwner });\n      Game.applyMove(position, action);\n      currentOwner = Game.otherOwner(currentOwner);\n      passCount = 0;\n      remaining -= 1;\n    }\n\n    if (remaining <= 0 || Game.winner(position)) break;\n    const key = \`${'${remaining}'}|${'${passCount}'}|${'${Game.serializePosition(position, currentOwner)}'}\`;\n    const stored = context.bestMoveCache.get(key);\n    action = stored ? { ...stored, owner: currentOwner } : null;\n  }\n\n  return line.slice(0, depth);\n}\n\nfunction searchDepth`,
  'principal variation builder'
);
worker = replaceOrFail(
  worker,
  `  return {\n    move: bestMoves[Math.floor(Math.random() * bestMoves.length)],\n    score: bestScore\n  };`,
  `  const move = bestMoves[Math.floor(Math.random() * bestMoves.length)];\n  return {\n    move,\n    score: bestScore,\n    principalVariation: buildPrincipalVariation(owner, pieces, depth, move, context)\n  };`,
  'search depth principal variation result'
);
worker = replaceOrFail(
  worker,
  `  const context = { deadline: startedAt + maxTimeMs, cache: new Map(), nodes: 0 };`,
  `  const context = { deadline: startedAt + maxTimeMs, cache: new Map(), bestMoveCache: new Map(), nodes: 0 };`,
  'search context best move cache'
);
worker = replaceOrFail(
  worker,
  `  for (let depth = 1; depth <= maxDepth; depth += 1) {\n    context.cache.clear();`,
  `  for (let depth = 1; depth <= maxDepth; depth += 1) {\n    context.cache.clear();\n    context.bestMoveCache.clear();`,
  'clear principal variation cache'
);
worker = replaceOrFail(
  worker,
  `          nodes: context.nodes,\n          elapsedMs: Date.now() - startedAt`,
  `          nodes: context.nodes,\n          elapsedMs: Date.now() - startedAt,\n          principalVariation: result.principalVariation || []`,
  'progress principal variation'
);
worker = replaceOrFail(
  worker,
  `    elapsedMs: Date.now() - startedAt,\n    timedOut,\n    fastPath: null`,
  `    elapsedMs: Date.now() - startedAt,\n    timedOut,\n    principalVariation: best.principalVariation || [],\n    fastPath: null`,
  'final principal variation'
);
write('src/cpuplus-worker-v2.js', worker);

let lastMove = fs.readFileSync('src/last-move.js', 'utf8');
lastMove = replaceOrFail(
  lastMove,
  `  const RESET_CREDENTIAL_KEY = 'exit-strategy-cpuplus-reset-credential-v1';\n  const SVG_NS = 'http://www.w3.org/2000/svg';`,
  `  const RESET_CREDENTIAL_KEY = 'exit-strategy-cpuplus-reset-credential-v1';\n  const BEST_SEQUENCE_KEY = 'exit-strategy-display-best-sequence';\n  const SVG_NS = 'http://www.w3.org/2000/svg';`,
  'best sequence storage key'
);
lastMove = replaceOrFail(
  lastMove,
  `  let cpuPlusProgress = null;\n  let lastMove = null;`,
  `  let cpuPlusProgress = null;\n  let displayBestSequence = false;\n  try { displayBestSequence = localStorage.getItem(BEST_SEQUENCE_KEY) === 'true'; } catch (_) {}\n  let lastMove = null;`,
  'best sequence state'
);
lastMove = replaceOrFail(
  lastMove,
  `    .cpuplus-depth-status {\n      display: block;\n      margin-top: 8px;\n      padding-left: 22px;\n      color: var(--muted);\n      font-weight: 700;\n      font-variant-numeric: tabular-nums;\n    }\n    .password-field[hidden], .last-move-layer[hidden] { display: none !important; }`,
  `    .cpuplus-depth-status {\n      display: block;\n      margin-top: 8px;\n      padding-left: 22px;\n      color: var(--muted);\n      font-weight: 700;\n      font-variant-numeric: tabular-nums;\n    }\n    .cpuplus-best-sequence {\n      display: block;\n      margin-top: 7px;\n      padding-left: 22px;\n      color: var(--muted);\n      line-height: 1.45;\n      overflow-wrap: anywhere;\n    }\n    .cpuplus-best-sequence strong,.cpuplus-best-sequence summary{color:var(--text);font-weight:800}\n    .cpuplus-best-sequence summary{cursor:pointer}\n    .cpuplus-best-sequence-body{margin-top:.35rem}\n    .password-field[hidden], .last-move-layer[hidden] { display: none !important; }\n    @media(max-width:620px){\n      .cpuplus-depth-status,.cpuplus-best-sequence{padding-left:0}\n    }`,
  'best sequence styles'
);
lastMove = replaceOrFail(
  lastMove,
  `  function depthText(progress) {`,
  `  function ensureBestSequenceOption() {\n    if (document.querySelector('#displayBestSequence')) return;\n    const confirmRow = document.querySelector('#confirmMoves')?.closest('.toggle-row');\n    if (!confirmRow) return;\n    const label = document.createElement('label');\n    label.className = 'toggle-row';\n    label.innerHTML = '<span>Display the best sequence</span><input id="displayBestSequence" type="checkbox">';\n    confirmRow.insertAdjacentElement('afterend', label);\n    const input = label.querySelector('input');\n    input.checked = displayBestSequence;\n    input.addEventListener('change', () => {\n      displayBestSequence = input.checked;\n      try { localStorage.setItem(BEST_SEQUENCE_KEY, String(displayBestSequence)); } catch (_) {}\n      updateDepthDisplay();\n      window.dispatchEvent(new CustomEvent('exit-strategy:best-sequence-option', { detail: displayBestSequence }));\n    });\n  }\n\n  function pieceOwner(pieceId) {\n    const value = String(pieceId || '');\n    if (value.startsWith('cyan-')) return 'cyan';\n    if (value.startsWith('magenta-')) return 'magenta';\n    return null;\n  }\n\n  function pieceLabelFromId(pieceId) {\n    const value = String(pieceId || '');\n    if (value.endsWith('-hunter')) return 'Hunter';\n    const match = value.match(/-pawn-(\\d+)$/);\n    return match ? \`Pawn ${'${match[1]}'}\` : 'Piece';\n  }\n\n  function defaultOwnerLabel(owner) {\n    const selector = owner === 'cyan' ? '#cyanPlayerIdentity' : '#magentaPlayerIdentity';\n    return document.querySelector(selector)?.textContent.trim() || (owner === 'cyan' ? 'Player 1' : 'Player 2');\n  }\n\n  function formatPrincipalVariation(progress, startTurn = 0, labelForOwner = defaultOwnerLabel) {\n    const line = Array.isArray(progress?.principalVariation) ? progress.principalVariation : [];\n    if (!line.length) return '';\n    const firstMove = line.find((action) => !action.pass);\n    const rootOwner = firstMove?.owner || line[0]?.owner || null;\n    return line.map((action, index) => {\n      const owner = action.owner || pieceOwner(action.pieceId) || rootOwner;\n      const actor = owner === rootOwner ? 'CPU+' : (labelForOwner(owner) || defaultOwnerLabel(owner));\n      const turn = Number(startTurn || 0) + index + 1;\n      if (action.pass) return \`${'${turn}'}. ${'${actor}'}: forced pass\`;\n      const piece = pieceLabelFromId(action.pieceId);\n      if (action.exits) return \`${'${turn}'}. ${'${actor}'} ${'${piece}'}: ${'${action.from}'} → EXIT\`;\n      if (action.captureId) return \`${'${turn}'}. ${'${actor}'} ${'${piece}'}: ${'${action.from}'} × ${'${action.to}'} (${'${pieceLabelFromId(action.captureId)}'})\`;\n      return \`${'${turn}'}. ${'${actor}'} ${'${piece}'}: ${'${action.from}'} → ${'${action.to}'}\`;\n    }).join('; ');\n  }\n\n  function createBestSequenceNode(progress, startTurn = 0, labelForOwner = defaultOwnerLabel) {\n    if (!displayBestSequence || !progress?.completedDepth) return null;\n    const text = formatPrincipalVariation(progress, startTurn, labelForOwner);\n    if (!text) return null;\n    const mobile = window.matchMedia('(max-width: 620px)').matches;\n    if (mobile) {\n      const details = document.createElement('details');\n      details.className = 'cpuplus-best-sequence';\n      const summary = document.createElement('summary');\n      summary.textContent = \`Best depth-${'${progress.completedDepth}'} sequence\`;\n      const body = document.createElement('div');\n      body.className = 'cpuplus-best-sequence-body';\n      body.textContent = text;\n      details.append(summary, body);\n      return details;\n    }\n    const node = document.createElement('small');\n    node.className = 'cpuplus-best-sequence';\n    const strong = document.createElement('strong');\n    strong.textContent = \`Best depth-${'${progress.completedDepth}'} sequence: \`;\n    node.append(strong, document.createTextNode(text));\n    return node;\n  }\n\n  function depthText(progress) {`,
  'best sequence helpers'
);
lastMove = replaceOrFail(
  lastMove,
  `    if (!progress.completedDepth) return \`Searching depth ${'${progress.searchingDepth || 1}'}…\`;\n    if (!progress.searchingDepth) return \`Depth ${'${progress.completedDepth}'} completed.\`;\n    return \`Depth ${'${progress.completedDepth}'} completed — searching depth ${'${progress.searchingDepth}'}.\`;`,
  `    if (!progress.completedDepth) return \`Searching depth ${'${progress.searchingDepth || 1}'}…\`;\n    if (!progress.searchingDepth) return \`Depth ${'${progress.completedDepth}'} fully evaluated.\`;\n    return \`Depth ${'${progress.completedDepth}'} fully evaluated — searching depth ${'${progress.searchingDepth}'}.\`;`,
  'fully evaluated wording'
);
lastMove = replaceOrFail(
  lastMove,
  /  function updateDepthDisplay\(\) \{[\s\S]*?\n  \}\n\n  window\.addEventListener\('exit-strategy:cpuplus-progress'/,
  `  function updateDepthDisplay() {\n    const cpuPlusTurn = !document.body.classList.contains('analysis-mode') && phaseCard.textContent.includes('CPU+ is deepening its search');\n    const existing = phaseCard.querySelector('.cpuplus-depth-status');\n    const existingSequence = phaseCard.querySelector('.cpuplus-best-sequence');\n    if (!cpuPlusTurn || !cpuPlusProgress) {\n      existing?.remove();\n      existingSequence?.remove();\n      return;\n    }\n    const text = depthText(cpuPlusProgress);\n    if (!text) return;\n    const node = existing || document.createElement('small');\n    node.className = 'cpuplus-depth-status';\n    if (node.textContent !== text) node.textContent = text;\n    if (!existing) phaseCard.appendChild(node);\n    existingSequence?.remove();\n    const startTurn = Number.parseInt(document.querySelector('#turnCounter')?.textContent || '0', 10) || 0;\n    const sequence = createBestSequenceNode(cpuPlusProgress, startTurn);\n    if (sequence) phaseCard.appendChild(sequence);\n  }\n\n  ensureBestSequenceOption();\n  window.ExitStrategyCpuProgressUI = {\n    depthText,\n    formatPrincipalVariation,\n    createBestSequenceNode,\n    isBestSequenceEnabled: () => displayBestSequence\n  };\n\n  window.addEventListener('exit-strategy:cpuplus-progress'`,
  'depth display and shared progress UI'
);
write('src/last-move.js', lastMove);

let review = fs.readFileSync('src/game-review-tools.source.js', 'utf8');
review = replaceOrFail(
  review,
  `    cpuThinking: false,\n    status: '',`,
  `    cpuThinking: false,\n    cpuProgress: null,\n    status: '',`,
  'analysis progress state'
);
review = replaceOrFail(
  review,
  `    .analysis-status{color:var(--muted);margin:0}\n    .analysis-selected`,
  `    .analysis-status{color:var(--muted);margin:0}\n    .analysis-cpu-progress:empty{display:none}\n    .analysis-cpu-progress .cpuplus-depth-status,.analysis-cpu-progress .cpuplus-best-sequence{padding-left:0}\n    .analysis-selected`,
  'analysis progress styles'
);
review = replaceOrFail(
  review,
  `    analysis.cpuThinking = false;\n    analysis.status = options.playable`,
  `    analysis.cpuThinking = false;\n    analysis.cpuProgress = null;\n    analysis.status = options.playable`,
  'reset analysis progress on start'
);
review = replaceOrFail(
  review,
  `    analysis.active = false;\n    analysis.cpuThinking = false;`,
  `    analysis.active = false;\n    analysis.cpuThinking = false;\n    analysis.cpuProgress = null;`,
  'reset analysis progress on leave'
);
review = replaceOrFail(
  review,
  `  function renderAnalysis() {\n    if (!analysis.active) return;`,
  `  function renderAnalysisCpuProgress() {\n    const host = $('#analysisCpuProgress');\n    if (!host) return;\n    host.replaceChildren();\n    const snapshot = currentSnapshot();\n    const level = analysis.source?.config?.cpuByOwner?.[snapshot.currentOwner];\n    const progress = analysis.cpuProgress;\n    const ui = window.ExitStrategyCpuProgressUI;\n    if (!analysis.cpuThinking || level !== 'cpuplus' || !progress || !ui) return;\n    const depth = ui.depthText(progress);\n    if (depth) {\n      const node = document.createElement('small');\n      node.className = 'cpuplus-depth-status';\n      node.textContent = depth;\n      host.appendChild(node);\n    }\n    const sequence = ui.createBestSequenceNode(progress, snapshot.turnCount, (owner) => ownerName(owner));\n    if (sequence) host.appendChild(sequence);\n  }\n\n  function renderAnalysis() {\n    if (!analysis.active) return;`,
  'analysis progress renderer'
);
review = replaceOrFail(
  review,
  /    let detail = analysis\.status;[\s\S]*?      <p>\$\{detail\}<\/p>`;/,
  `    let detail = analysis.status;\n    let detailHtml = '';\n    if (winner) detail = \`${'${ownerName(winner.owner)}'} has a winning position. Select an earlier move to explore another line.\`;\n    else if (snapshot.turnCount >= 100) detail = 'The variation reached the 100-turn limit.';\n    else if (analysis.cpuThinking) detail = \`${'${cpuLabel(level)}'} is calculating. The analysis remains paused after this move.\`;\n    else if (level) detail = \`${'${cpuLabel(level)}'} to move. Click “Next CPU move”.\`;\n    else detail = detail || \`${'${ownerName(snapshot.currentOwner)}'} to move. Select a piece and destination.\`;\n    if (analysis.cpuThinking) {\n      detailHtml = \`<span class="thinking-line"><span class="thinking-dot"></span>${'${detail}'}</span>\`;\n    } else {\n      detailHtml = detail;\n    }\n    phaseCard.innerHTML = \`\n      <div class="turn-banner"><span class="turn-dot ${'${snapshot.currentOwner}'}"></span><div><p class="eyebrow">CURRENT TURN · ANALYSIS</p><h2>${'${ownerName(snapshot.currentOwner)}'} — ${'${snapshot.currentOwner === \'cyan\' ? \'Cyan\' : \'Magenta\'}'}</h2></div></div>\n      <p>${'${detailHtml}'}</p>\n      <div id="analysisCpuProgress" class="analysis-cpu-progress"></div>\`;`,
  'analysis thinking indicator'
);
review = replaceOrFail(
  review,
  `    updateAnalysisScore(snapshot);\n    const next = $('#analysisNextCpu');`,
  `    updateAnalysisScore(snapshot);\n    renderAnalysisCpuProgress();\n    const next = $('#analysisNextCpu');`,
  'render analysis progress'
);
review = replaceOrFail(
  review,
  `      analysis.cpuThinking = false;\n      const snapshot = currentSnapshot();`,
  `      analysis.cpuThinking = false;\n      analysis.cpuProgress = null;\n      const snapshot = currentSnapshot();`,
  'clear progress after CPU move'
);
review = replaceOrFail(
  review,
  `        analysis.cpuThinking = true;\n        analysis.status = 'CPU+ found an immediate move.';`,
  `        analysis.cpuThinking = true;\n        analysis.cpuProgress = null;\n        analysis.status = 'CPU+ found an immediate move.';`,
  'fast path progress reset'
);
review = replaceOrFail(
  review,
  `        return setTimeout(() => { analysis.cpuThinking = false; applyAnalysisMove(move); }, 1000);`,
  `        return setTimeout(() => { analysis.cpuThinking = false; analysis.cpuProgress = null; applyAnalysisMove(move); }, 1000);`,
  'fast path progress cleanup'
);
review = replaceOrFail(
  review,
  `    analysis.cpuThinking = true;\n    analysis.status = \`${'${cpuLabel(level)}'} is calculating…\`;`,
  `    analysis.cpuThinking = true;\n    analysis.cpuProgress = null;\n    analysis.status = \`${'${cpuLabel(level)}'} is calculating…\`;`,
  'analysis search progress reset'
);
review = replaceOrFail(
  review,
  `  board?.addEventListener('click', handleAnalysisBoardClick);`,
  `  board?.addEventListener('click', handleAnalysisBoardClick);\n\n  window.addEventListener('exit-strategy:cpuplus-progress', (event) => {\n    if (!analysis.active || !analysis.cpuThinking) return;\n    const snapshot = currentSnapshot();\n    if (analysis.source?.config?.cpuByOwner?.[snapshot.currentOwner] !== 'cpuplus') return;\n    analysis.cpuProgress = event.detail || null;\n    renderAnalysisCpuProgress();\n  });\n  window.addEventListener('exit-strategy:best-sequence-option', renderAnalysisCpuProgress);`,
  'analysis progress event listeners'
);
write('src/game-review-tools.source.js', review);

const navigation = `(() => {
  'use strict';

  const phaseCard = document.querySelector('#phaseCard');
  const newGameButton = document.querySelector('#newGameButton');
  if (!phaseCard || !newGameButton) return;

  const style = document.createElement('style');
  style.textContent = \`
    .pre-game-return-menu{margin-top:clamp(.75rem,1.5vh,1rem)}
    @media(max-width:620px){.pre-game-return-menu{width:100%}}
  \`;
  document.head.appendChild(style);

  function shouldShow() {
    if (document.body.classList.contains('analysis-mode')) return false;
    const text = phaseCard.textContent || '';
    if (!text || text.includes('How do you want to play?') || text.includes('CURRENT TURN')) return false;
    return /STEP 1 · TURN ORDER|CHOICE MAKER|CPU CHOICE MAKER|SECRET SETUP|PRIVATE HANDOFF/.test(text);
  }

  function sync() {
    const existing = phaseCard.querySelector('#preGameReturnMenu');
    if (!shouldShow()) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const button = document.createElement('button');
    button.id = 'preGameReturnMenu';
    button.className = 'secondary-button pre-game-return-menu';
    button.type = 'button';
    button.textContent = 'Return to main menu';
    button.addEventListener('click', () => newGameButton.click());
    phaseCard.appendChild(button);
  }

  new MutationObserver(sync).observe(phaseCard, { childList: true, subtree: true, characterData: true });
  sync();
})();
`;
write('src/pre-game-navigation.js', navigation);

let index = fs.readFileSync('index.html', 'utf8');
index = replaceOrFail(
  index,
  `  <script src="src/cpuplus-merge-version.js"></script>\n</body>`,
  `  <script src="src/cpuplus-merge-version.js"></script>\n  <script src="src/pre-game-navigation.js"></script>\n</body>`,
  'pre-game navigation loader'
);
write('index.html', index);

const test = `'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function read(name) { return fs.readFileSync(path.join(__dirname, '..', name), 'utf8'); }

for (const file of ['src/cpuplus-worker-v2.js', 'src/last-move.js', 'src/game-review-tools.source.js', 'src/pre-game-navigation.js']) {
  test(\`${'${file}'} is valid JavaScript\`, () => {
    assert.doesNotThrow(() => new vm.Script(read(file)));
  });
}

test('CPU+ progress reports a principal variation', () => {
  const source = read('src/cpuplus-worker-v2.js');
  assert.match(source, /bestMoveCache/);
  assert.match(source, /buildPrincipalVariation/);
  assert.match(source, /principalVariation: result\.principalVariation/);
});

test('progress UI uses fully evaluated wording and optional sequences', () => {
  const source = read('src/last-move.js');
  assert.match(source, /fully evaluated/);
  assert.match(source, /Display the best sequence/);
  assert.match(source, /ExitStrategyCpuProgressUI/);
  assert.match(source, /Best depth-/);
});

test('analysis shows CPU thinking and live depth progress', () => {
  const source = read('src/game-review-tools.source.js');
  assert.match(source, /thinking-dot/);
  assert.match(source, /analysisCpuProgress/);
  assert.match(source, /exit-strategy:cpuplus-progress/);
});

test('pre-game screens can return to the main menu', () => {
  const source = read('src/pre-game-navigation.js');
  assert.match(source, /Return to main menu/);
  assert.match(source, /newGameButton\.click/);
  assert.match(read('index.html'), /pre-game-navigation\.js/);
});
`;
write('tests/analysis-progress-navigation.test.js', test);

for (const path of ['scripts/apply-analysis-progress-nav.js', '.github/workflows/apply-analysis-progress-nav.yml', 'tmp/trigger-analysis-progress-nav.txt']) {
  if (fs.existsSync(path)) fs.rmSync(path);
}
