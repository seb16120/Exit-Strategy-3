(() => {
  'use strict';

  const Game = window.ExitStrategyGame;
  const CPU1 = window.ExitStrategyCPU;
  const CPU3 = window.ExitStrategyCPU3;
  const CPUPlus = window.ExitStrategyCPUPlus;
  if (!Game || !CPU1 || !CPU3 || !CPUPlus) return;

  const $ = (selector) => document.querySelector(selector);
  const phaseCard = $('#phaseCard');
  const boardFrame = $('#boardFrame');
  const board = $('#board');
  const sidePanel = $('#sidePanel');
  const historyList = $('#history');
  const resultDialog = $('#resultDialog');
  const newGameButton = $('#newGameButton');
  const resultTitle = $('#resultTitle');
  const resultText = $('#resultText');
  const toast = $('#toast');

  const FORMAT_PGN = 'ES3-PGN/1';
  const FORMAT_FEN = 'ES3-FEN/1';
  const MOVE_RE = /^\s*(\d+)\.\s+.+?:\s*([A-G][1-7])\s*(?:→|×)\s*(EXIT|[A-G][1-7])/;
  const PASS_RE = /^\s*(\d+)\.\s+.+forced pass/i;

  let toastTimer = null;
  let currentRecord = null;
  let pendingLaunch = null;
  let allowOriginalNewGame = false;
  let trackingScheduled = false;
  let analysisWorker = null;

  const analysis = {
    active: false,
    imported: false,
    source: null,
    timeline: [],
    entries: [],
    index: 0,
    selectedPieceId: null,
    cpuThinking: false,
    status: '',
    originalResultOpen: false
  };

  const style = document.createElement('style');
  style.textContent = `
    .result-main-actions,.result-share-actions,.analysis-actions{display:flex;gap:.65rem;flex-wrap:wrap;margin-top:1rem}
    .result-share-actions{padding-top:.85rem;border-top:1px solid var(--line)}
    .analysis-card{display:grid;gap:.65rem}
    .analysis-card h2{font-size:1rem;margin:0}
    .analysis-actions>button{flex:1 1 9.5rem}
    .analysis-history{padding-left:0;list-style:none;display:grid;gap:.35rem;max-height:clamp(11rem,32dvh,25rem)}
    .analysis-history li{padding:0}
    .analysis-history button{width:100%;text-align:left;border:1px solid transparent;border-radius:.55rem;background:transparent;color:var(--muted);padding:.4rem .5rem;font:inherit;cursor:pointer}
    .analysis-history button:hover,.analysis-history button.active{border-color:var(--line);background:var(--panel-soft);color:var(--text)}
    .analysis-history button.variation{border-left:3px solid var(--exit)}
    .analysis-status{color:var(--muted);margin:0}
    .analysis-selected{outline:5px solid white;outline-offset:-7px;z-index:2}
    .review-import-text{width:100%;min-height:12rem;resize:vertical;border:1px solid var(--line);border-radius:.7rem;background:#101217;color:var(--text);padding:.75rem;font:500 .82rem/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
    .review-import-error{color:var(--danger);min-height:1.3em}
    .review-copy-note{color:var(--muted);font-size:.85rem}
    .mode-import-button{margin-top:.7rem;width:100%}
    body.analysis-mode .game-column{min-width:0}
    @media(min-width:70rem) and (min-aspect-ratio:4/3){
      body.analysis-mode .site-header,body.analysis-mode .app-shell{width:94vw;max-width:none}
      body.analysis-mode .app-shell{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:clamp(.7rem,1.2vw,1.45rem)}
      body.analysis-mode .side-panel{grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(.45rem,.75vw,.8rem);align-items:start}
      body.analysis-mode .side-panel>section{min-width:0;padding:clamp(.6rem,.8vw,.95rem)}
    }
    @media(max-width:620px){.result-main-actions>button,.result-share-actions>button,.analysis-actions>button{flex:1 1 100%}}
  `;
  document.head.appendChild(style);

  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3200);
  }

  function clonePieces(pieces) {
    return pieces.map((piece) => ({ ...piece }));
  }

  function cloneSnapshot(snapshot) {
    return {
      pieces: clonePieces(snapshot.pieces),
      currentOwner: snapshot.currentOwner,
      turnCount: Number(snapshot.turnCount) || 0,
      consecutivePasses: Number(snapshot.consecutivePasses) || 0,
      text: String(snapshot.text || ''),
      variation: Boolean(snapshot.variation)
    };
  }

  function cpuLevelFromText(text) {
    const value = String(text || '').trim();
    if (value === 'CPU+') return 'cpuplus';
    if (value === 'CPU3') return 'cpu3';
    if (value === 'CPU1') return 'cpu1';
    return null;
  }

  function cpuLabel(level) {
    if (level === 'cpuplus') return 'CPU+';
    if (level === 'cpu3') return 'CPU3';
    if (level === 'cpu1') return 'CPU1';
    return 'Human';
  }

  function capturePiecesFromBoard() {
    const pieces = Game.createPieces();
    pieces.forEach((piece) => {
      piece.position = null;
      piece.status = 'reserve';
      if (piece.type === 'pawn') piece.assigned = false;
    });
    board.querySelectorAll('.cell[data-coord]').forEach((cell) => {
      const node = cell.querySelector('.piece');
      if (!node) return;
      const owner = node.classList.contains('cyan') ? 'cyan' : node.classList.contains('magenta') ? 'magenta' : null;
      if (!owner) return;
      const type = node.classList.contains('hunter') ? 'hunter' : 'pawn';
      const number = type === 'pawn' ? Number(node.textContent.trim()) : null;
      const id = type === 'hunter' ? `${owner}-hunter` : `${owner}-pawn-${number}`;
      const piece = Game.getPiece(pieces, id);
      if (!piece) return;
      piece.position = cell.dataset.coord;
      piece.status = 'board';
      piece.assigned = true;
    });
    return pieces;
  }

  function deriveConfig() {
    const cyanIdentity = $('#cyanPlayerIdentity')?.textContent.trim() || 'Cyan';
    const magentaIdentity = $('#magentaPlayerIdentity')?.textContent.trim() || 'Magenta';
    const cpuByOwner = {
      cyan: cpuLevelFromText(cyanIdentity),
      magenta: cpuLevelFromText(magentaIdentity)
    };
    let mode = 'local';
    if (cpuByOwner.cyan && cpuByOwner.magenta) mode = 'cpu-duel';
    else if (cpuByOwner.cyan || cpuByOwner.magenta) mode = cpuByOwner.cyan || cpuByOwner.magenta;
    const humanOwner = cyanIdentity === 'You' ? 'cyan' : magentaIdentity === 'You' ? 'magenta' : null;
    return {
      mode,
      timed: !$('#timerCard')?.hidden,
      automatic: Boolean(pendingLaunch?.automatic),
      cpuByOwner,
      humanOwner,
      personByOwner: { cyan: cyanIdentity, magenta: magentaIdentity }
    };
  }

  function initialSnapshot() {
    return {
      pieces: capturePiecesFromBoard(),
      currentOwner: 'cyan',
      turnCount: 0,
      consecutivePasses: 0,
      text: 'Initial position'
    };
  }

  function beginTracking() {
    if (analysis.active || !phaseCard?.textContent.includes('CURRENT TURN') || boardFrame?.hidden || sidePanel?.hidden) return;
    const entries = Array.from(historyList?.children || []).map((item) => item.textContent.trim());
    if (entries.length !== 0) return;
    currentRecord = {
      format: FORMAT_PGN,
      version: 1,
      createdAt: new Date().toISOString(),
      config: deriveConfig(),
      timeline: [initialSnapshot()],
      entries: [],
      result: null
    };
    pendingLaunch = null;
  }

  function rebuildSnapshot(previous, text) {
    const snapshot = cloneSnapshot(previous);
    snapshot.text = text;
    const pass = text.match(PASS_RE);
    if (pass) {
      snapshot.turnCount = Number(pass[1]);
      snapshot.consecutivePasses += 1;
      snapshot.currentOwner = Game.otherOwner(previous.currentOwner);
      return snapshot;
    }
    const match = text.match(MOVE_RE);
    if (!match) return null;
    const [, turnText, from, targetText] = match;
    const piece = Game.pieceAt(snapshot.pieces, from);
    if (!piece) return null;
    const target = targetText === 'EXIT' ? Game.EXIT : targetText;
    const move = Game.legalMovesForPiece(piece, snapshot.pieces).find((candidate) => candidate.to === target);
    if (!move) return null;
    Game.applyMove(snapshot.pieces, move);
    snapshot.turnCount = Number(turnText);
    snapshot.consecutivePasses = 0;
    snapshot.currentOwner = Game.otherOwner(piece.owner);
    return snapshot;
  }

  function processHistory() {
    if (analysis.active) return;
    if (!currentRecord) beginTracking();
    if (!currentRecord) return;
    const domEntries = Array.from(historyList?.children || []).map((item) => item.textContent.trim());
    while (currentRecord.entries.length < domEntries.length) {
      const text = domEntries[currentRecord.entries.length];
      const previous = currentRecord.timeline[currentRecord.timeline.length - 1];
      const next = rebuildSnapshot(previous, text);
      if (!next) break;
      currentRecord.entries.push(text);
      currentRecord.timeline.push(next);
    }
  }

  function scheduleTracking() {
    if (trackingScheduled || analysis.active) return;
    trackingScheduled = true;
    requestAnimationFrame(() => {
      trackingScheduled = false;
      if (!phaseCard?.textContent.includes('CURRENT TURN')) return;
      if (!currentRecord) beginTracking();
      processHistory();
    });
  }

  function finishTracking() {
    processHistory();
    if (!currentRecord || !resultDialog?.open) return;
    const title = resultTitle?.textContent.trim() || '';
    const corrected = title.replace(/^You wins\b/, 'You win');
    if (title !== corrected && resultTitle) resultTitle.textContent = corrected;
    currentRecord.result = {
      title: corrected,
      text: resultText?.textContent.trim() || ''
    };
  }

  function sanitizePiece(raw, fallback) {
    const piece = { ...fallback };
    if (raw && raw.id === fallback.id) {
      const statuses = new Set(['reserve', 'board', 'captured', 'escaped']);
      piece.status = statuses.has(raw.status) ? raw.status : fallback.status;
      piece.position = piece.status === 'board' && Game.isPlayable(raw.position) ? raw.position : null;
      piece.assigned = Boolean(raw.assigned || piece.status !== 'reserve');
    }
    return piece;
  }

  function sanitizePieces(rawPieces) {
    const byId = new Map(Array.isArray(rawPieces) ? rawPieces.map((piece) => [piece?.id, piece]) : []);
    return Game.createPieces().map((fallback) => sanitizePiece(byId.get(fallback.id), fallback));
  }

  function sanitizeConfig(raw) {
    const cpuLevels = new Set(['cpu1', 'cpu3', 'cpuplus']);
    const cpuByOwner = {
      cyan: cpuLevels.has(raw?.cpuByOwner?.cyan) ? raw.cpuByOwner.cyan : null,
      magenta: cpuLevels.has(raw?.cpuByOwner?.magenta) ? raw.cpuByOwner.magenta : null
    };
    let mode = raw?.mode;
    if (!['local', 'cpu1', 'cpu3', 'cpuplus', 'cpu-duel'].includes(mode)) {
      mode = cpuByOwner.cyan && cpuByOwner.magenta ? 'cpu-duel' : cpuByOwner.cyan || cpuByOwner.magenta || 'local';
    }
    return {
      mode,
      timed: Boolean(raw?.timed),
      automatic: Boolean(raw?.automatic),
      cpuByOwner,
      humanOwner: raw?.humanOwner === 'cyan' || raw?.humanOwner === 'magenta' ? raw.humanOwner : null,
      personByOwner: {
        cyan: String(raw?.personByOwner?.cyan || (cpuByOwner.cyan ? cpuLabel(cpuByOwner.cyan) : 'Player 1')),
        magenta: String(raw?.personByOwner?.magenta || (cpuByOwner.magenta ? cpuLabel(cpuByOwner.magenta) : 'Player 2'))
      }
    };
  }

  function sanitizeSnapshot(raw) {
    return {
      pieces: sanitizePieces(raw?.pieces),
      currentOwner: raw?.currentOwner === 'magenta' ? 'magenta' : 'cyan',
      turnCount: Math.max(0, Math.min(100, Number(raw?.turnCount) || 0)),
      consecutivePasses: Math.max(0, Math.min(2, Number(raw?.consecutivePasses) || 0)),
      text: String(raw?.text || '')
    };
  }

  function sanitizeRecord(raw) {
    if (!raw || raw.format !== FORMAT_PGN || raw.version !== 1 || !Array.isArray(raw.timeline) || raw.timeline.length < 1) {
      throw new Error('This is not a compatible ES3-PGN game.');
    }
    const timeline = raw.timeline.map(sanitizeSnapshot);
    const entries = Array.isArray(raw.entries) ? raw.entries.map(String).slice(0, timeline.length - 1) : [];
    while (entries.length < timeline.length - 1) entries.push(timeline[entries.length + 1]?.text || `Move ${entries.length + 1}`);
    return {
      format: FORMAT_PGN,
      version: 1,
      createdAt: String(raw.createdAt || new Date().toISOString()),
      config: sanitizeConfig(raw.config),
      timeline,
      entries,
      result: raw.result && typeof raw.result === 'object' ? { title: String(raw.result.title || ''), text: String(raw.result.text || '') } : null
    };
  }

  function recordForExport() {
    if (analysis.active) {
      return sanitizeRecord({
        format: FORMAT_PGN,
        version: 1,
        createdAt: analysis.source?.createdAt || new Date().toISOString(),
        config: analysis.source?.config || deriveConfig(),
        timeline: analysis.timeline,
        entries: analysis.entries,
        result: analysis.source?.result || null
      });
    }
    if (!currentRecord) throw new Error('No complete game is available yet.');
    processHistory();
    return sanitizeRecord(currentRecord);
  }

  function fenForSnapshot(snapshot, config) {
    return {
      format: FORMAT_FEN,
      version: 1,
      createdAt: new Date().toISOString(),
      config: sanitizeConfig(config),
      position: sanitizeSnapshot(snapshot)
    };
  }

  function stringifyPGN(record) {
    return `${FORMAT_PGN}\n${JSON.stringify(sanitizeRecord(record))}`;
  }

  function stringifyFEN(snapshot, config) {
    return `${FORMAT_FEN}\n${JSON.stringify(fenForSnapshot(snapshot, config))}`;
  }

  function parseSharedText(text) {
    const value = String(text || '').trim();
    if (value.startsWith(FORMAT_PGN)) return { type: 'pgn', value: sanitizeRecord(JSON.parse(value.slice(FORMAT_PGN.length).trim())) };
    if (value.startsWith(FORMAT_FEN)) {
      const raw = JSON.parse(value.slice(FORMAT_FEN.length).trim());
      if (!raw || raw.format !== FORMAT_FEN || raw.version !== 1) throw new Error('This is not a compatible ES3-FEN position.');
      return { type: 'fen', value: { format: FORMAT_FEN, version: 1, config: sanitizeConfig(raw.config), position: sanitizeSnapshot(raw.position) } };
    }
    throw new Error('Paste text beginning with ES3-PGN/1 or ES3-FEN/1.');
  }

  async function copyText(text, message) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    notify(message);
  }

  function currentSnapshot() {
    return analysis.active ? analysis.timeline[analysis.index] : currentRecord?.timeline[currentRecord.timeline.length - 1] || null;
  }

  function installResultButtons() {
    if (!resultDialog || !newGameButton || $('#analyzeGameButton')) return;
    const body = newGameButton.closest('.modal-body');
    if (!body) return;
    const main = document.createElement('div');
    main.className = 'result-main-actions';
    newGameButton.replaceWith(main);
    main.appendChild(newGameButton);
    newGameButton.textContent = 'New game';

    const menu = document.createElement('button');
    menu.id = 'resultReturnMenuButton';
    menu.className = 'secondary-button';
    menu.type = 'button';
    menu.textContent = 'Return to menu';
    main.appendChild(menu);

    const analyze = document.createElement('button');
    analyze.id = 'analyzeGameButton';
    analyze.className = 'secondary-button';
    analyze.type = 'button';
    analyze.textContent = 'Analyze game';
    main.appendChild(analyze);

    const share = document.createElement('div');
    share.className = 'result-share-actions';
    share.innerHTML = `
      <button id="copyResultPgnButton" class="text-button" type="button">Copy ES3-PGN</button>
      <button id="copyResultFenButton" class="text-button" type="button">Copy final ES3-FEN</button>
      <button id="pasteResultGameButton" class="text-button" type="button">Paste / import</button>`;
    main.insertAdjacentElement('afterend', share);

    menu.addEventListener('click', returnToMenu);
    analyze.addEventListener('click', startAnalysisFromCurrentGame);
    $('#copyResultPgnButton').addEventListener('click', () => {
      try { copyText(stringifyPGN(recordForExport()), 'ES3-PGN copied.'); } catch (error) { notify(error.message || String(error)); }
    });
    $('#copyResultFenButton').addEventListener('click', () => {
      const snapshot = currentRecord?.timeline[currentRecord.timeline.length - 1];
      if (!snapshot) return notify('No final position is available.');
      copyText(stringifyFEN(snapshot, currentRecord.config), 'ES3-FEN copied.');
    });
    $('#pasteResultGameButton').addEventListener('click', openImportDialog);
  }

  function setTimedChoice(value) {
    const checkbox = $('#timedGameChoice');
    if (!checkbox) return;
    checkbox.checked = Boolean(value);
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function clickWithRandom(button, randomValue) {
    if (!button) return;
    const original = Math.random;
    Math.random = () => randomValue;
    try { button.click(); } finally { Math.random = original; }
  }

  function originalReset() {
    allowOriginalNewGame = true;
    try { newGameButton?.click(); } finally { allowOriginalNewGame = false; }
  }

  function stopAutomaticSeries() {
    const stop = $('#stopAutoSeries');
    if (stop && !stop.disabled) stop.click();
  }

  function relaunchConfig(config) {
    stopAutomaticSeries();
    originalReset();
    setTimedChoice(config.timed);
    if (config.mode === 'cpu-duel') {
      $('#cpuDuelModeButton')?.click();
      const cyan = $('#cyanCpuSelect');
      const magenta = $('#magentaCpuSelect');
      if (cyan) cyan.value = config.cpuByOwner.cyan || 'cpu1';
      if (magenta) magenta.value = config.cpuByOwner.magenta || 'cpu3';
      cyan?.dispatchEvent(new Event('change', { bubbles: true }));
      magenta?.dispatchEvent(new Event('change', { bubbles: true }));
      const automatic = $('#autoChainGamesChoice');
      if (automatic) automatic.checked = Boolean(config.automatic);
      $('#startCpuDuelButton')?.click();
      return;
    }
    const modeButton = config.mode === 'cpuplus' ? $('#cpuPlusModeButton') : config.mode === 'cpu3' ? $('#cpu3ModeButton') : config.mode === 'cpu1' ? $('#cpu1ModeButton') : $('#localModeButton');
    modeButton?.click();
    clickWithRandom($('#drawChoiceButton'), 0);
    const cyanIsPreferred = config.mode === 'local'
      ? config.personByOwner.cyan === 'Player A'
      : config.humanOwner === 'cyan';
    (cyanIsPreferred ? $('#chooseFirstButton') : $('#chooseSecondButton'))?.click();
  }

  function sameModeNewGame() {
    const config = currentRecord?.config || deriveConfig();
    relaunchConfig(config);
  }

  function returnToMenu() {
    stopAutomaticSeries();
    originalReset();
  }

  function ensureAnalysisCard() {
    let card = $('#analysisControls');
    if (card) return card;
    card = document.createElement('section');
    card.id = 'analysisControls';
    card.className = 'analysis-card';
    card.innerHTML = `
      <h2>Game analysis</h2>
      <p id="analysisStatus" class="analysis-status"></p>
      <div class="analysis-actions">
        <button id="analysisNextCpu" class="secondary-button" type="button">Next CPU move</button>
        <button id="analysisOriginal" class="secondary-button" type="button">Return to original game</button>
        <button id="analysisResult" class="secondary-button" type="button">Return to result</button>
        <button id="analysisMenu" class="secondary-button" type="button">Return to menu</button>
        <button id="analysisCopyPgn" class="secondary-button" type="button">Copy ES3-PGN</button>
        <button id="analysisCopyFen" class="secondary-button" type="button">Copy current ES3-FEN</button>
        <button id="analysisPaste" class="secondary-button" type="button">Paste / import</button>
      </div>`;
    $('#cpuControls')?.insertAdjacentElement('afterend', card);
    $('#analysisNextCpu').addEventListener('click', playAnalysisCpuMove);
    $('#analysisOriginal').addEventListener('click', restoreOriginalTimeline);
    $('#analysisResult').addEventListener('click', returnToResult);
    $('#analysisMenu').addEventListener('click', () => { leaveAnalysis(); returnToMenu(); });
    $('#analysisCopyPgn').addEventListener('click', () => copyText(stringifyPGN(recordForExport()), 'ES3-PGN copied.'));
    $('#analysisCopyFen').addEventListener('click', () => copyText(stringifyFEN(currentSnapshot(), analysis.source.config), 'ES3-FEN copied.'));
    $('#analysisPaste').addEventListener('click', openImportDialog);
    return card;
  }

  function startAnalysis(record, options = {}) {
    const clean = sanitizeRecord(record);
    stopAutomaticSeries();
    if (resultDialog?.open) resultDialog.close();
    analysis.active = true;
    analysis.imported = Boolean(options.imported);
    analysis.source = clean;
    analysis.timeline = clean.timeline.map(cloneSnapshot);
    analysis.entries = clean.entries.slice();
    analysis.index = Math.max(0, Math.min(options.index ?? analysis.timeline.length - 1, analysis.timeline.length - 1));
    analysis.selectedPieceId = null;
    analysis.cpuThinking = false;
    analysis.status = options.playable ? 'Imported position: playable variation.' : 'Select a move in the history, then explore another line.';
    analysis.originalResultOpen = Boolean(clean.result && !options.imported);
    document.body.classList.add('analysis-mode');
    window.dispatchEvent(new Event('exit-strategy:reset-last-move'));
    boardFrame.hidden = false;
    sidePanel.hidden = false;
    $('#timerCard')?.setAttribute('hidden', '');
    $('#gameActions')?.setAttribute('hidden', '');
    $('#cpuControls')?.setAttribute('hidden', '');
    const card = ensureAnalysisCard();
    card.hidden = false;
    renderAnalysis();
    processForcedPasses();
  }

  function startAnalysisFromCurrentGame() {
    finishTracking();
    if (!currentRecord) return notify('No game was recorded for analysis.');
    startAnalysis(currentRecord);
  }

  function leaveAnalysis() {
    if (!analysis.active) return;
    if (analysisWorker) {
      analysisWorker.terminate();
      analysisWorker = null;
    }
    analysis.active = false;
    analysis.cpuThinking = false;
    document.body.classList.remove('analysis-mode');
    $('#analysisControls')?.setAttribute('hidden', '');
    window.dispatchEvent(new Event('exit-strategy:reset-last-move'));
  }

  function returnToResult() {
    const source = analysis.source;
    const canReturn = analysis.originalResultOpen && source?.result;
    leaveAnalysis();
    if (!canReturn) {
      returnToMenu();
      return;
    }
    currentRecord = sanitizeRecord(source);
    renderSnapshot(currentRecord.timeline[currentRecord.timeline.length - 1]);
    renderOriginalHistory(currentRecord);
    if (resultTitle) resultTitle.textContent = source.result.title.replace(/^You wins\b/, 'You win');
    if (resultText) resultText.textContent = source.result.text;
    if (!resultDialog.open) resultDialog.showModal();
  }

  function restoreOriginalTimeline() {
    if (!analysis.source) return;
    analysis.timeline = analysis.source.timeline.map(cloneSnapshot);
    analysis.entries = analysis.source.entries.slice();
    analysis.index = analysis.timeline.length - 1;
    analysis.selectedPieceId = null;
    analysis.status = 'Original game restored. Select a move to create another variation.';
    window.dispatchEvent(new Event('exit-strategy:reset-last-move'));
    renderAnalysis();
  }

  function renderSnapshot(snapshot) {
    board.querySelectorAll('.cell[data-coord]').forEach((cell) => {
      cell.classList.remove('selected', 'analysis-selected', 'legal-target', 'legal-exit', 'capture-target', 'selectable');
      cell.querySelectorAll('.piece').forEach((node) => node.remove());
    });
    snapshot.pieces.forEach((piece) => {
      if (piece.status !== 'board' || !piece.position) return;
      const cell = board.querySelector(`.cell[data-coord="${piece.position}"]`);
      if (!cell) return;
      const node = document.createElement('span');
      node.className = `piece ${piece.owner} ${piece.type}`;
      if (piece.type === 'pawn') node.textContent = piece.number;
      cell.appendChild(node);
    });
  }

  function ownerName(owner) {
    return analysis.source?.config?.personByOwner?.[owner] || (owner === 'cyan' ? 'Player 1' : 'Player 2');
  }

  function canManuallyMove(owner) {
    return !analysis.source?.config?.cpuByOwner?.[owner];
  }

  function renderAnalysisBoard() {
    const snapshot = currentSnapshot();
    renderSnapshot(snapshot);
    const selected = Game.getPiece(snapshot.pieces, analysis.selectedPieceId);
    if (selected && selected.status === 'board') {
      const origin = board.querySelector(`.cell[data-coord="${selected.position}"]`);
      origin?.classList.add('analysis-selected');
      Game.legalMovesForPiece(selected, snapshot.pieces).forEach((move) => {
        const cell = board.querySelector(`.cell[data-coord="${move.to}"]`);
        cell?.classList.add('legal-target');
        if (move.exits) cell?.classList.add('legal-exit');
        if (move.captureId) cell?.classList.add('capture-target');
      });
    }
    if (canManuallyMove(snapshot.currentOwner)) {
      snapshot.pieces.filter((piece) => piece.owner === snapshot.currentOwner && piece.status === 'board').forEach((piece) => {
        board.querySelector(`.cell[data-coord="${piece.position}"]`)?.classList.add('selectable');
      });
    }
  }

  function renderAnalysisHistory() {
    historyList.classList.add('analysis-history');
    historyList.innerHTML = '';
    const rows = ['Initial position', ...analysis.entries];
    rows.forEach((text, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.classList.toggle('active', index === analysis.index);
      if (analysis.timeline[index]?.variation) button.classList.add('variation');
      button.addEventListener('click', () => {
        if (analysis.cpuThinking) return;
        analysis.index = index;
        analysis.selectedPieceId = null;
        analysis.status = index === 0 ? 'Initial position selected.' : `Position after move ${index} selected.`;
        window.dispatchEvent(new Event('exit-strategy:reset-last-move'));
        renderAnalysis();
      });
      item.appendChild(button);
      historyList.appendChild(item);
    });
    historyList.children[analysis.index]?.scrollIntoView?.({ block: 'nearest' });
  }

  function updateAnalysisScore(snapshot) {
    $('#cyanEscaped').textContent = Game.escapedCount('cyan', snapshot.pieces);
    $('#cyanCaptured').textContent = Game.captureCount('cyan', snapshot.pieces);
    $('#magentaEscaped').textContent = Game.escapedCount('magenta', snapshot.pieces);
    $('#magentaCaptured').textContent = Game.captureCount('magenta', snapshot.pieces);
    $('#turnCounter').textContent = `${snapshot.turnCount} / 100`;
    $('#cyanPlayerIdentity').textContent = analysis.source.config.personByOwner.cyan;
    $('#magentaPlayerIdentity').textContent = analysis.source.config.personByOwner.magenta;
  }

  function renderAnalysis() {
    if (!analysis.active) return;
    const snapshot = currentSnapshot();
    const level = analysis.source.config.cpuByOwner[snapshot.currentOwner];
    const winner = Game.winner(snapshot.pieces);
    let detail = analysis.status;
    if (winner) detail = `${ownerName(winner.owner)} has a winning position. Select an earlier move to explore another line.`;
    else if (snapshot.turnCount >= 100) detail = 'The variation reached the 100-turn limit.';
    else if (analysis.cpuThinking) detail = `${cpuLabel(level)} is calculating. The analysis remains paused after this move.`;
    else if (level) detail = `${cpuLabel(level)} to move. Click “Next CPU move”.`;
    else detail = detail || `${ownerName(snapshot.currentOwner)} to move. Select a piece and destination.`;
    phaseCard.innerHTML = `
      <div class="turn-banner"><span class="turn-dot ${snapshot.currentOwner}"></span><div><p class="eyebrow">CURRENT TURN · ANALYSIS</p><h2>${ownerName(snapshot.currentOwner)} — ${snapshot.currentOwner === 'cyan' ? 'Cyan' : 'Magenta'}</h2></div></div>
      <p>${detail}</p>`;
    renderAnalysisBoard();
    renderAnalysisHistory();
    updateAnalysisScore(snapshot);
    const next = $('#analysisNextCpu');
    if (next) {
      next.hidden = !level;
      next.disabled = analysis.cpuThinking || Boolean(winner) || snapshot.turnCount >= 100;
    }
    const resultButton = $('#analysisResult');
    if (resultButton) resultButton.hidden = !analysis.originalResultOpen;
    $('#analysisStatus').textContent = `Viewing position ${analysis.index} of ${analysis.timeline.length - 1}. Analysis moves never affect CPU+ learning.`;
  }

  function variationEntry(snapshot, piece, outcome) {
    const actor = cpuLabel(analysis.source.config.cpuByOwner[piece.owner]) !== 'Human'
      ? cpuLabel(analysis.source.config.cpuByOwner[piece.owner])
      : ownerName(piece.owner);
    const label = piece.type === 'hunter' ? 'Hunter' : `Pawn ${piece.number}`;
    if (outcome.exits) return `${snapshot.turnCount}. ${actor} ${label}: ${outcome.from} → EXIT`;
    if (outcome.captured) return `${snapshot.turnCount}. ${actor} Hunter: ${outcome.from} × ${outcome.to} (${outcome.captured.type === 'hunter' ? 'Hunter' : `Pawn ${outcome.captured.number}`})`;
    return `${snapshot.turnCount}. ${actor} ${label}: ${outcome.from} → ${outcome.to}`;
  }

  function truncateForVariation() {
    if (analysis.index >= analysis.timeline.length - 1) return;
    analysis.timeline = analysis.timeline.slice(0, analysis.index + 1);
    analysis.entries = analysis.entries.slice(0, analysis.index);
  }

  function applyAnalysisMove(move) {
    if (!analysis.active || analysis.cpuThinking) return;
    truncateForVariation();
    const previous = cloneSnapshot(currentSnapshot());
    const next = cloneSnapshot(previous);
    const piece = Game.getPiece(next.pieces, move.pieceId);
    if (!piece) return;
    const outcome = Game.applyMove(next.pieces, move);
    next.turnCount += 1;
    next.consecutivePasses = 0;
    next.currentOwner = Game.otherOwner(piece.owner);
    next.text = variationEntry(next, piece, outcome);
    next.variation = true;
    analysis.entries.push(next.text);
    analysis.timeline.push(next);
    analysis.index = analysis.timeline.length - 1;
    analysis.selectedPieceId = null;
    analysis.status = 'Variation move added.';
    renderAnalysis();
    processForcedPasses();
  }

  function processForcedPasses() {
    if (!analysis.active || analysis.cpuThinking) return;
    let snapshot = currentSnapshot();
    while (!Game.winner(snapshot.pieces) && snapshot.turnCount < 100 && Game.allLegalMoves(snapshot.currentOwner, snapshot.pieces).length === 0 && snapshot.consecutivePasses < 2) {
      truncateForVariation();
      const next = cloneSnapshot(snapshot);
      const owner = snapshot.currentOwner;
      next.turnCount += 1;
      next.consecutivePasses += 1;
      next.currentOwner = Game.otherOwner(owner);
      next.text = `${next.turnCount}. ${ownerName(owner)} — forced pass`;
      next.variation = true;
      analysis.entries.push(next.text);
      analysis.timeline.push(next);
      analysis.index = analysis.timeline.length - 1;
      snapshot = next;
    }
    renderAnalysis();
  }

  function handleAnalysisBoardClick(event) {
    if (!analysis.active || analysis.cpuThinking) return;
    const cell = event.target.closest?.('.cell[data-coord]');
    if (!cell || !board.contains(cell)) return;
    const snapshot = currentSnapshot();
    if (!canManuallyMove(snapshot.currentOwner) || Game.winner(snapshot.pieces)) return;
    const coord = cell.dataset.coord;
    const clicked = Game.pieceAt(snapshot.pieces, coord);
    if (clicked && clicked.owner === snapshot.currentOwner) {
      analysis.selectedPieceId = analysis.selectedPieceId === clicked.id ? null : clicked.id;
      analysis.status = analysis.selectedPieceId ? `${clicked.type === 'hunter' ? 'Hunter' : `Pawn ${clicked.number}`} selected.` : 'Selection cleared.';
      renderAnalysis();
      return;
    }
    const selected = Game.getPiece(snapshot.pieces, analysis.selectedPieceId);
    if (!selected) return;
    const move = Game.legalMovesForPiece(selected, snapshot.pieces).find((candidate) => candidate.to === coord);
    if (move) applyAnalysisMove(move);
  }

  function finishCpuMove(result, level, startedAt) {
    const minimum = level === 'cpuplus' ? 30000 : 1000;
    const delay = Math.max(0, minimum - (performance.now() - startedAt));
    setTimeout(() => {
      analysis.cpuThinking = false;
      const snapshot = currentSnapshot();
      if (!analysis.active || analysis.source.config.cpuByOwner[snapshot.currentOwner] !== level) return;
      const move = result?.move || CPU1.chooseMove(Game, snapshot.currentOwner, snapshot.pieces);
      if (move) applyAnalysisMove(move);
      else processForcedPasses();
    }, delay);
  }

  function playAnalysisCpuMove() {
    if (!analysis.active || analysis.cpuThinking) return;
    const snapshot = currentSnapshot();
    const level = analysis.source.config.cpuByOwner[snapshot.currentOwner];
    if (!level) return;
    const legal = Game.allLegalMoves(snapshot.currentOwner, snapshot.pieces);
    if (!legal.length) return processForcedPasses();
    if (level === 'cpuplus') {
      const immediate = CPUPlus.immediateWinningMoves(Game, snapshot.currentOwner, snapshot.pieces);
      if (legal.length === 1 || immediate.length) {
        analysis.cpuThinking = true;
        analysis.status = 'CPU+ found an immediate move.';
        renderAnalysis();
        const choices = immediate.length ? immediate : legal;
        const move = choices[Math.floor(Math.random() * choices.length)];
        return setTimeout(() => { analysis.cpuThinking = false; applyAnalysisMove(move); }, 1000);
      }
    }
    analysis.cpuThinking = true;
    analysis.status = `${cpuLabel(level)} is calculating…`;
    renderAnalysis();
    const startedAt = performance.now();
    if (level === 'cpu1') {
      return setTimeout(() => finishCpuMove({ move: CPU1.chooseMove(Game, snapshot.currentOwner, clonePieces(snapshot.pieces)) }, level, startedAt), 0);
    }
    if (typeof Worker === 'undefined') {
      const move = CPU3.chooseMove(Game, snapshot.currentOwner, clonePieces(snapshot.pieces), { maxDepth: 3, maxTimeMs: 1500 });
      return finishCpuMove({ move }, level, startedAt);
    }
    analysisWorker = new Worker(level === 'cpuplus' ? 'src/cpuplus-worker.js' : 'src/cpu3-worker.js');
    analysisWorker.onmessage = (event) => {
      const worker = analysisWorker;
      analysisWorker = null;
      worker?.terminate();
      finishCpuMove(event.data?.ok ? event.data.result : null, level, startedAt);
    };
    analysisWorker.onerror = () => {
      analysisWorker?.terminate();
      analysisWorker = null;
      finishCpuMove(null, level, startedAt);
    };
    analysisWorker.postMessage({
      kind: 'move',
      owner: snapshot.currentOwner,
      pieces: clonePieces(snapshot.pieces),
      maxDepth: level === 'cpuplus' ? 64 : 3,
      maxTimeMs: level === 'cpuplus' ? 54000 : 45000
    });
  }

  function renderOriginalHistory(record) {
    historyList.classList.remove('analysis-history');
    historyList.innerHTML = '';
    record.entries.forEach((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      historyList.appendChild(item);
    });
  }

  function importDialog() {
    let dialog = $('#reviewImportDialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'reviewImportDialog';
    dialog.className = 'modal rules-modal';
    dialog.innerHTML = `
      <div class="modal-body">
        <p class="eyebrow">IMPORT GAME OR POSITION</p>
        <h2>Paste ES3-PGN or ES3-FEN</h2>
        <textarea id="reviewImportText" class="review-import-text" spellcheck="false" placeholder="ES3-PGN/1 … or ES3-FEN/1 …"></textarea>
        <p id="reviewImportError" class="review-import-error" aria-live="polite"></p>
        <p class="review-copy-note">Open for analysis keeps the imported history. Start playable uses the imported final/current position as a fresh variation. Neither option updates CPU+ learning.</p>
        <div class="dialog-actions">
          <button id="cancelReviewImport" class="text-button" type="button">Cancel</button>
          <button id="analyzeReviewImport" class="secondary-button" type="button">Open for analysis</button>
          <button id="playReviewImport" class="primary-button" type="button">Start playable</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    $('#cancelReviewImport').addEventListener('click', () => dialog.close());
    $('#analyzeReviewImport').addEventListener('click', () => applyImport(false));
    $('#playReviewImport').addEventListener('click', () => applyImport(true));
    return dialog;
  }

  function openImportDialog() {
    const dialog = importDialog();
    $('#reviewImportError').textContent = '';
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $('#reviewImportText')?.focus(), 0);
  }

  function applyImport(playable) {
    try {
      const parsed = parseSharedText($('#reviewImportText').value);
      let record;
      if (parsed.type === 'pgn' && !playable) {
        record = parsed.value;
      } else {
        const config = parsed.type === 'pgn' ? parsed.value.config : parsed.value.config;
        const position = parsed.type === 'pgn' ? parsed.value.timeline[parsed.value.timeline.length - 1] : parsed.value.position;
        const snapshot = sanitizeSnapshot({ ...position, turnCount: playable ? 0 : position.turnCount, text: 'Imported position' });
        record = {
          format: FORMAT_PGN,
          version: 1,
          createdAt: new Date().toISOString(),
          config,
          timeline: [snapshot],
          entries: [],
          result: null
        };
      }
      importDialog().close();
      startAnalysis(record, { imported: true, playable, index: playable ? 0 : undefined });
    } catch (error) {
      $('#reviewImportError').textContent = error.message || String(error);
    }
  }

  function installModeImportButton() {
    if (!phaseCard || !phaseCard.textContent.includes('How do you want to play?') || $('#modeImportButton')) return;
    const button = document.createElement('button');
    button.id = 'modeImportButton';
    button.className = 'secondary-button mode-import-button';
    button.type = 'button';
    button.textContent = 'Paste ES3-PGN / ES3-FEN';
    button.addEventListener('click', openImportDialog);
    phaseCard.appendChild(button);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('#startCpuDuelButton')) {
      pendingLaunch = {
        automatic: Boolean($('#autoChainGamesChoice')?.checked),
        cpuByOwner: { cyan: $('#cyanCpuSelect')?.value || 'cpu1', magenta: $('#magentaCpuSelect')?.value || 'cpu3' }
      };
    }
    if (event.target.closest?.('#localModeButton')) pendingLaunch = { mode: 'local', automatic: false };
    if (event.target.closest?.('#cpu1ModeButton')) pendingLaunch = { mode: 'cpu1', automatic: false };
    if (event.target.closest?.('#cpu3ModeButton')) pendingLaunch = { mode: 'cpu3', automatic: false };
    if (event.target.closest?.('#cpuPlusModeButton')) pendingLaunch = { mode: 'cpuplus', automatic: false };
  }, true);

  newGameButton?.addEventListener('click', (event) => {
    if (allowOriginalNewGame || !event.isTrusted || analysis.active) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sameModeNewGame();
  }, true);

  board?.addEventListener('click', handleAnalysisBoardClick);

  phaseCard && new MutationObserver(() => {
    installModeImportButton();
    if (!analysis.active) scheduleTracking();
  }).observe(phaseCard, { childList: true, subtree: true, characterData: true });
  historyList && new MutationObserver(scheduleTracking).observe(historyList, { childList: true, subtree: true });
  resultDialog && new MutationObserver(() => {
    if (resultDialog.open) {
      finishTracking();
      installResultButtons();
    }
  }).observe(resultDialog, { attributes: true, attributeFilter: ['open'] });
  resultTitle && new MutationObserver(() => {
    if (/^You wins\b/.test(resultTitle.textContent)) resultTitle.textContent = resultTitle.textContent.replace(/^You wins\b/, 'You win');
  }).observe(resultTitle, { childList: true, subtree: true, characterData: true });

  installResultButtons();
  installModeImportButton();
  scheduleTracking();
})();
