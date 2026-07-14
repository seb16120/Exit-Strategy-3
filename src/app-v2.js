(() => {
  'use strict';

  const Game = window.ExitStrategyGame;
  const CPU1 = window.ExitStrategyCPU;
  const CPU3 = window.ExitStrategyCPU3;
  const CPUPlus = window.ExitStrategyCPUPlus;
  const Timer = window.ExitStrategyTimer;
  const $ = (selector) => document.querySelector(selector);

  const elements = {
    phaseCard: $('#phaseCard'),
    boardFrame: $('#boardFrame'),
    board: $('#board'),
    setupControls: $('#setupControls'),
    reserve: $('#reserve'),
    returnPieceButton: $('#returnPieceButton'),
    restartSetupButton: $('#restartSetupButton'),
    lockSetupButton: $('#lockSetupButton'),
    sidePanel: $('#sidePanel'),
    cyanPlayerName: $('#cyanPlayerName'),
    cyanPlayerIdentity: $('#cyanPlayerIdentity'),
    magentaPlayerName: $('#magentaPlayerName'),
    magentaPlayerIdentity: $('#magentaPlayerIdentity'),
    cyanEscaped: $('#cyanEscaped'),
    cyanCaptured: $('#cyanCaptured'),
    magentaEscaped: $('#magentaEscaped'),
    magentaCaptured: $('#magentaCaptured'),
    turnCounter: $('#turnCounter'),
    timerCard: $('#timerCard'),
    moveClock: $('#moveClock'),
    cyanTotalClock: $('#cyanTotalClock'),
    magentaTotalClock: $('#magentaTotalClock'),
    cpuControls: $('#cpuControls'),
    cpuPauseButton: $('#cpuPauseButton'),
    cpuNextButton: $('#cpuNextButton'),
    gameActions: $('#gameActions'),
    undoMoveButton: $('#undoMoveButton'),
    abandonButton: $('#abandonButton'),
    history: $('#history'),
    confirmMoves: $('#confirmMoves'),
    showCoordinates: $('#showCoordinates'),
    resetLearningButton: $('#resetLearningButton'),
    learningSummary: $('#learningSummary'),
    passDialog: $('#passDialog'),
    passEyebrow: $('#passEyebrow'),
    passTitle: $('#passTitle'),
    passText: $('#passText'),
    passContinueButton: $('#passContinueButton'),
    confirmDialog: $('#confirmDialog'),
    confirmText: $('#confirmText'),
    resultDialog: $('#resultDialog'),
    resultTitle: $('#resultTitle'),
    resultText: $('#resultText'),
    newGameButton: $('#newGameButton'),
    abandonDialog: $('#abandonDialog'),
    abandonLoseButton: $('#abandonLoseButton'),
    abandonLeaveButton: $('#abandonLeaveButton'),
    abandonCancelButton: $('#abandonCancelButton'),
    resetLearningDialog: $('#resetLearningDialog'),
    resetLearningForm: $('#resetLearningForm'),
    resetLearningPassword: $('#resetLearningPassword'),
    resetLearningError: $('#resetLearningError'),
    resetLearningCancelButton: $('#resetLearningCancelButton'),
    rulesButton: $('#rulesButton'),
    rulesDialog: $('#rulesDialog'),
    toast: $('#toast')
  };

  const storedConfirm = localStorage.getItem('exit-strategy-confirm-moves');
  const defaultConfirm = window.matchMedia('(pointer: coarse)').matches;

  let scheduledTimer = null;
  let cpuDeadlineTimer = null;
  let cpuWorker = null;
  let clockInterval = null;
  let toastTimer = null;
  let queuedReplayPieces = null;

  const state = {
    phase: 'mode',
    mode: null,
    timedGame: false,
    choiceMaker: null,
    identities: {},
    roleByPerson: {},
    personByOwner: {},
    humanOwner: null,
    cpuByOwner: { cyan: null, magenta: null },
    cpuThinking: false,
    cpuMatchPaused: false,
    cpuStepOnce: false,
    cpuDuelConfig: { cyan: 'cpu1', magenta: 'cpu3' },
    cpuPlusSetupKeyByOwner: { cyan: null, magenta: null },
    cpuPlusDatabase: CPUPlus.loadDatabase(),
    learningRecorded: false,
    pieces: Game.createPieces(),
    setupOwner: null,
    selectedPieceId: null,
    nextPawnNumber: { cyan: 1, magenta: 1 },
    currentOwner: 'cyan',
    turnCount: 0,
    playerTurns: { cyan: 0, magenta: 0 },
    consecutivePasses: 0,
    repetitions: new Map(),
    history: [],
    undoStack: [],
    pendingMove: null,
    confirmMoves: storedConfirm === null ? defaultConfirm : storedConfirm === 'true',
    showCoordinates: false,
    finished: false,
    timer: Timer.createState(false)
  };

  function dispatchLastMoveReset() {
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

  function clearCpuSearch() {
    window.clearTimeout(cpuDeadlineTimer);
    cpuDeadlineTimer = null;
    if (cpuWorker) {
      cpuWorker.terminate();
      cpuWorker = null;
    }
  }

  function clearScheduledAction() {
    window.clearTimeout(scheduledTimer);
    scheduledTimer = null;
    clearCpuSearch();
    state.cpuThinking = false;
  }

  function stopClockInterval() {
    window.clearInterval(clockInterval);
    clockInterval = null;
  }

  function ensureClockInterval() {
    if (!state.timedGame || clockInterval) return;
    clockInterval = window.setInterval(tickClock, 200);
  }

  function ownerLabel(owner) {
    return owner === 'cyan' ? 'Player 1 (Cyan)' : 'Player 2 (Magenta)';
  }

  function personLabel(owner) {
    return state.personByOwner[owner] || ownerLabel(owner);
  }

  function pieceLabel(piece) {
    return piece.type === 'hunter' ? 'Hunter' : `Pawn ${piece.number}`;
  }

  function cpuName(level) {
    if (level === 'cpuplus') return 'CPU+';
    if (level === 'cpu3') return 'CPU3';
    return 'CPU1';
  }

  function cpuLevel(owner) {
    return state.cpuByOwner[owner];
  }

  function isCpuOwner(owner) {
    return Boolean(cpuLevel(owner));
  }

  function isCpuDuel() {
    return state.mode === 'cpu-duel';
  }

  function hasHumanPlayer() {
    return state.mode === 'local' || Boolean(state.humanOwner);
  }

  function cpuModeLevel() {
    if (state.mode === 'cpuplus') return 'cpuplus';
    if (state.mode === 'cpu3') return 'cpu3';
    return 'cpu1';
  }

  function createBoard() {
    elements.board.innerHTML = '';
    for (const row of Game.ROWS) {
      for (const col of Game.COLUMNS) {
        const coord = `${col}${row}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.dataset.coord = coord;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', coord);
        if (!Game.isPlayable(coord)) {
          cell.classList.add('missing');
          cell.tabIndex = -1;
        } else {
          if (coord === Game.EXIT) cell.classList.add('exit');
          const coordinate = document.createElement('span');
          coordinate.className = 'cell-coordinate';
          coordinate.textContent = coord;
          cell.appendChild(coordinate);
          cell.addEventListener('click', () => onCellClick(coord));
        }
        elements.board.appendChild(cell);
      }
    }
  }

  function resetRuntimeState() {
    clearScheduledAction();
    stopClockInterval();
    state.choiceMaker = null;
    state.identities = {};
    state.roleByPerson = {};
    state.personByOwner = {};
    state.humanOwner = null;
    state.cpuByOwner = { cyan: null, magenta: null };
    state.cpuThinking = false;
    state.cpuMatchPaused = false;
    state.cpuStepOnce = false;
    state.cpuPlusSetupKeyByOwner = { cyan: null, magenta: null };
    state.learningRecorded = false;
    state.pieces = Game.createPieces();
    state.setupOwner = null;
    state.selectedPieceId = null;
    state.nextPawnNumber = { cyan: 1, magenta: 1 };
    state.currentOwner = 'cyan';
    state.turnCount = 0;
    state.playerTurns = { cyan: 0, magenta: 0 };
    state.consecutivePasses = 0;
    state.repetitions = new Map();
    state.history = [];
    state.undoStack = [];
    state.pendingMove = null;
    state.finished = false;
    Timer.reset(state.timer, state.timedGame);
    dispatchLastMoveReset();
  }

  function resetGame() {
    state.phase = 'mode';
    state.mode = null;
    state.timedGame = false;
    resetRuntimeState();
    for (const dialog of [elements.resultDialog, elements.passDialog, elements.confirmDialog, elements.abandonDialog, elements.resetLearningDialog]) {
      if (dialog && dialog.open) dialog.close();
    }
    render();
  }

  function setTimedGame(enabled) {
    state.timedGame = Boolean(enabled);
    Timer.reset(state.timer, state.timedGame);
  }

  function startMode(mode) {
    const timedGame = state.timedGame;
    state.mode = mode;
    state.phase = 'choice';
    resetRuntimeState();
    state.timedGame = timedGame;
    Timer.reset(state.timer, timedGame);
    if (mode === 'local') {
      state.identities = { A: 'Player A', B: 'Player B' };
    } else {
      const level = cpuModeLevel();
      state.identities = { human: 'You', cpu: cpuName(level) };
    }
    render();
  }

  function openCpuDuelConfig() {
    const timedGame = state.timedGame;
    state.mode = 'cpu-duel';
    state.phase = 'cpu-config';
    resetRuntimeState();
    state.timedGame = timedGame;
    Timer.reset(state.timer, timedGame);
    render();
  }

  function startCpuDuel() {
    state.mode = 'cpu-duel';
    state.personByOwner = {
      cyan: cpuName(state.cpuDuelConfig.cyan),
      magenta: cpuName(state.cpuDuelConfig.magenta)
    };
    state.cpuByOwner = {
      cyan: state.cpuDuelConfig.cyan,
      magenta: state.cpuDuelConfig.magenta
    };
    state.cpuMatchPaused = false;
    state.cpuStepOnce = false;
    if (tryStartQueuedReplay()) return;
    beginCpuSetup('cyan');
  }

  function render() {
    renderPhaseCard();
    renderBoard();
    renderSetupControls();
    renderSidePanel();
  }

  function timedGameToggleMarkup() {
    return `
      <label class="mode-toggle">
        <input id="timedGameChoice" type="checkbox" ${state.timedGame ? 'checked' : ''}>
        <span><strong>Timed game</strong><small>1 min per move / 50 min per player</small></span>
      </label>`;
  }

  function bindTimedGameToggle() {
    const checkbox = $('#timedGameChoice');
    if (!checkbox) return;
    checkbox.addEventListener('change', () => setTimedGame(checkbox.checked));
  }

  function renderPhaseCard() {
    const card = elements.phaseCard;

    if (state.phase === 'mode') {
      card.innerHTML = `
        <p class="eyebrow">CHOOSE A MODE</p>
        <h2>How do you want to play?</h2>
        <p>Play locally, face CPU1, CPU3 or CPU+, or watch two CPUs play each other.</p>
        <div class="mode-grid">
          <button id="localModeButton" class="primary-button" type="button">Local 1 vs 1</button>
          <button id="cpu1ModeButton" class="secondary-button" type="button">Vs. CPU1</button>
          <button id="cpu3ModeButton" class="secondary-button" type="button">Vs. CPU3</button>
          <button id="cpuPlusModeButton" class="secondary-button cpuplus-button" type="button">Vs. CPU+</button>
          <button id="cpuDuelModeButton" class="secondary-button mode-grid-wide" type="button">CPU vs CPU</button>
        </div>
        ${timedGameToggleMarkup()}`;
      $('#localModeButton').addEventListener('click', () => startMode('local'));
      $('#cpu1ModeButton').addEventListener('click', () => startMode('cpu1'));
      $('#cpu3ModeButton').addEventListener('click', () => startMode('cpu3'));
      $('#cpuPlusModeButton').addEventListener('click', () => startMode('cpuplus'));
      $('#cpuDuelModeButton').addEventListener('click', openCpuDuelConfig);
      bindTimedGameToggle();
      return;
    }

    if (state.phase === 'cpu-config') {
      const options = '<option value="cpu1">CPU1</option><option value="cpu3">CPU3</option><option value="cpuplus">CPU+</option>';
      card.innerHTML = `
        <p class="eyebrow">CPU MATCH</p>
        <h2>Choose both CPUs</h2>
        <div class="cpu-config-grid">
          <label><span>Player 1 · Cyan</span><select id="cyanCpuSelect">${options}</select></label>
          <label><span>Player 2 · Magenta</span><select id="magentaCpuSelect">${options}</select></label>
        </div>
        ${timedGameToggleMarkup()}
        <div class="choice-actions">
          <button id="startCpuDuelButton" class="primary-button" type="button">Start CPU match</button>
          <button id="backToModesButton" class="secondary-button" type="button">Back</button>
        </div>`;
      const cyanSelect = $('#cyanCpuSelect');
      const magentaSelect = $('#magentaCpuSelect');
      cyanSelect.value = state.cpuDuelConfig.cyan;
      magentaSelect.value = state.cpuDuelConfig.magenta;
      cyanSelect.addEventListener('change', () => { state.cpuDuelConfig.cyan = cyanSelect.value; });
      magentaSelect.addEventListener('change', () => { state.cpuDuelConfig.magenta = magentaSelect.value; });
      $('#startCpuDuelButton').addEventListener('click', startCpuDuel);
      $('#backToModesButton').addEventListener('click', () => {
        state.phase = 'mode';
        state.mode = null;
        render();
      });
      bindTimedGameToggle();
      return;
    }

    if (state.phase === 'choice') {
      const participants = state.mode === 'local' ? 'one of the two players' : 'you or the CPU';
      card.innerHTML = `
        <p class="eyebrow">STEP 1 · TURN ORDER</p>
        <h2>Draw the choice maker</h2>
        <p>The system selects ${participants}. The choice maker decides whether to play first or second. Whoever plays first becomes Player 1 and uses cyan.</p>
        <div class="choice-actions"><button id="drawChoiceButton" class="primary-button" type="button">Draw choice maker</button></div>`;
      $('#drawChoiceButton').addEventListener('click', drawChoiceMaker);
      return;
    }

    if (state.phase === 'choose-order') {
      card.innerHTML = `
        <p class="eyebrow">CHOICE MAKER</p>
        <h2>${state.identities[state.choiceMaker]} was drawn</h2>
        <p>Choose your preferred turn order.</p>
        <div class="choice-actions">
          <button id="chooseFirstButton" class="primary-button" type="button">Play first</button>
          <button id="chooseSecondButton" class="secondary-button" type="button">Play second</button>
        </div>`;
      $('#chooseFirstButton').addEventListener('click', () => assignRoles(true));
      $('#chooseSecondButton').addEventListener('click', () => assignRoles(false));
      return;
    }

    if (state.phase === 'cpu-choice') {
      const label = state.identities.cpu || 'CPU';
      card.innerHTML = `
        <p class="eyebrow">CPU CHOICE MAKER</p>
        <h2>${label} is choosing</h2>
        <p class="thinking-line"><span class="thinking-dot"></span>The CPU will choose first or second.</p>`;
      return;
    }

    if (state.phase === 'cpu-setup') {
      const level = cpuLevel(state.setupOwner);
      const setupText = level === 'cpuplus'
        ? 'CPU+ is comparing logical formations and its local placement history.'
        : 'The CPU setup remains hidden until the reveal.';
      card.innerHTML = `
        <p class="eyebrow">SECRET SETUP</p>
        <h2>${cpuName(level)} is placing its pieces</h2>
        <p class="thinking-line"><span class="thinking-dot"></span>${setupText}</p>`;
      return;
    }

    if (state.phase === 'handoff') {
      card.innerHTML = `
        <p class="eyebrow">PRIVATE HANDOFF</p>
        <h2>Pieces hidden</h2>
        <p>Continue only when the correct player has the device.</p>`;
      return;
    }

    if (state.phase === 'setup') {
      card.innerHTML = `
        <p class="eyebrow">SECRET SETUP</p>
        <h2>${ownerLabel(state.setupOwner)} — ${personLabel(state.setupOwner)}</h2>
        <p>Place five numbered pawns in the highlighted camp and the Hunter on one of the three yellow-edged squares. Pawn numbers follow first-placement order.</p>`;
      return;
    }

    if (state.phase === 'play') {
      const level = cpuLevel(state.currentOwner);
      const cpuTurn = Boolean(level);
      let status = 'Select one of your pieces, then select a highlighted destination.';
      if (level === 'cpu1') status = 'CPU1 is checking every legal reply one move ahead.';
      if (level === 'cpu3') status = 'CPU3 is searching up to three plies, with a 45-second maximum.';
      if (level === 'cpuplus') status = 'CPU+ is deepening its search for at least 30 seconds and at most 55 seconds.';
      const paused = isCpuDuel() && state.cpuMatchPaused && !state.cpuStepOnce;
      card.innerHTML = `
        <div class="turn-banner">
          <span class="turn-dot ${state.currentOwner}"></span>
          <div><p class="eyebrow">CURRENT TURN</p><h2>${ownerLabel(state.currentOwner)} — ${personLabel(state.currentOwner)}</h2></div>
        </div>
        <p>${paused ? 'CPU match paused.' : (cpuTurn ? `<span class="thinking-line"><span class="thinking-dot"></span>${status}</span>` : status)}</p>`;
    }
  }

  function renderBoard() {
    const visible = state.phase === 'setup' || state.phase === 'play';
    elements.boardFrame.hidden = !visible;
    if (!visible) return;

    elements.boardFrame.classList.toggle('coordinates-hidden', !state.showCoordinates);
    elements.board.classList.toggle('show-cell-coordinates', state.showCoordinates);
    const selected = Game.getPiece(state.pieces, state.selectedPieceId);
    const legalMoves = state.phase === 'play' && selected ? Game.legalMovesForPiece(selected, state.pieces) : [];
    const legalByDestination = new Map(legalMoves.map((move) => [move.to, move]));

    document.querySelectorAll('.cell').forEach((cell) => {
      const coord = cell.dataset.coord;
      if (!coord || cell.classList.contains('missing')) return;
      cell.className = 'cell';
      if (coord === Game.EXIT) cell.classList.add('exit');
      cell.querySelectorAll('.piece').forEach((pieceNode) => pieceNode.remove());

      if (state.phase === 'setup') {
        const selectedPiece = Game.getPiece(state.pieces, state.selectedPieceId);
        const selectedType = selectedPiece ? selectedPiece.type : 'pawn';
        const zone = selectedType === 'hunter' ? Game.HUNTER_ZONES[state.setupOwner] : Game.PAWN_ZONES[state.setupOwner];
        if (zone.has(coord)) cell.classList.add(`setup-${state.setupOwner}`);
        if (Game.HUNTER_ZONES[state.setupOwner].has(coord)) cell.classList.add('setup-hunter');
      }

      const move = legalByDestination.get(coord);
      if (move) {
        cell.classList.add('legal-target');
        if (move.exits) cell.classList.add('legal-exit');
        if (move.captureId) cell.classList.add('capture-target');
      }

      const piece = Game.pieceAt(state.pieces, coord);
      if (piece && shouldRenderPiece(piece)) {
        const node = document.createElement('span');
        node.className = `piece ${piece.owner} ${piece.type}`;
        if (piece.type === 'pawn') node.textContent = piece.number;
        node.setAttribute('aria-label', `${ownerLabel(piece.owner)} ${pieceLabel(piece)}`);
        cell.appendChild(node);
        if (piece.id === state.selectedPieceId) cell.classList.add('selected');
        if (canSelectPiece(piece)) cell.classList.add('selectable');
      }
    });
  }

  function shouldRenderPiece(piece) {
    if (piece.status !== 'board') return false;
    if (state.phase === 'setup') return piece.owner === state.setupOwner;
    return true;
  }

  function canSelectPiece(piece) {
    if (state.phase === 'setup') return piece.owner === state.setupOwner && !isCpuOwner(piece.owner);
    return state.phase === 'play' && !state.finished && !isCpuOwner(state.currentOwner) && piece.owner === state.currentOwner;
  }

  function renderSetupControls() {
    elements.setupControls.hidden = state.phase !== 'setup' || isCpuOwner(state.setupOwner);
    if (elements.setupControls.hidden) return;
    const owner = state.setupOwner;
    const selected = Game.getPiece(state.pieces, state.selectedPieceId);
    const ownPieces = state.pieces.filter((piece) => piece.owner === owner);
    const reservePieces = ownPieces.filter((piece) => piece.status === 'reserve' && (piece.type === 'hunter' || piece.assigned));
    const nextNumber = state.nextPawnNumber[owner];
    elements.reserve.innerHTML = '';
    reservePieces.forEach((piece) => addReserveButton(piece));
    if (nextNumber <= 5) {
      const unassigned = ownPieces.find((piece) => piece.type === 'pawn' && piece.number === nextNumber && !piece.assigned);
      if (unassigned) addReserveButton(unassigned, true);
    }
    elements.returnPieceButton.disabled = !(selected && selected.status === 'board' && selected.owner === owner);
    elements.lockSetupButton.disabled = !Game.validateSetup(owner, state.pieces);
  }

  function addReserveButton(piece, isNew = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `piece-button ${piece.owner}`;
    if (piece.id === state.selectedPieceId) button.classList.add('selected');
    button.textContent = piece.type === 'hunter' ? 'Hunter' : `${isNew ? 'New ' : ''}Pawn ${piece.number}`;
    button.addEventListener('click', () => {
      state.selectedPieceId = state.selectedPieceId === piece.id ? null : piece.id;
      render();
    });
    elements.reserve.appendChild(button);
  }

  function renderLearningSummary() {
    if (!elements.learningSummary) return;
    const info = CPUPlus.summary(state.cpuPlusDatabase);
    elements.learningSummary.textContent = `${info.placements} placements · ${info.games} recorded results`;
  }

  function renderSidePanel() {
    elements.sidePanel.hidden = state.phase !== 'play';
    if (state.phase !== 'play') return;
    elements.cyanPlayerName.textContent = 'Player 1';
    elements.magentaPlayerName.textContent = 'Player 2';
    elements.cyanPlayerIdentity.textContent = state.personByOwner.cyan || 'Cyan';
    elements.magentaPlayerIdentity.textContent = state.personByOwner.magenta || 'Magenta';
    elements.cyanEscaped.textContent = Game.escapedCount('cyan', state.pieces);
    elements.cyanCaptured.textContent = Game.captureCount('cyan', state.pieces);
    elements.magentaEscaped.textContent = Game.escapedCount('magenta', state.pieces);
    elements.magentaCaptured.textContent = Game.captureCount('magenta', state.pieces);
    elements.turnCounter.textContent = `${state.turnCount} / 100`;
    elements.timerCard.hidden = !state.timedGame;
    updateTimerDisplay();
    elements.cpuControls.hidden = !isCpuDuel();
    if (isCpuDuel()) {
      elements.cpuPauseButton.textContent = state.cpuMatchPaused ? 'Resume' : 'Pause';
      elements.cpuNextButton.disabled = !state.cpuMatchPaused || state.cpuThinking;
    }
    elements.gameActions.hidden = !hasHumanPlayer();
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
    });
    elements.history.scrollTop = elements.history.scrollHeight;
  }

  function drawChoiceMaker() {
    if (state.mode === 'local') {
      state.choiceMaker = Math.random() < 0.5 ? 'A' : 'B';
      state.phase = 'choose-order';
      render();
      return;
    }
    state.choiceMaker = Math.random() < 0.5 ? 'human' : 'cpu';
    if (state.choiceMaker === 'human') {
      state.phase = 'choose-order';
      render();
      return;
    }
    state.phase = 'cpu-choice';
    state.cpuThinking = true;
    render();
    scheduledTimer = window.setTimeout(() => {
      state.cpuThinking = false;
      assignRoles(Math.random() < 0.5);
    }, 1000);
  }

  function assignRoles(choiceMakerWantsFirst) {
    const cpuMode = state.mode !== 'local';
    const otherPerson = cpuMode
      ? (state.choiceMaker === 'human' ? 'cpu' : 'human')
      : (state.choiceMaker === 'A' ? 'B' : 'A');
    const firstPerson = choiceMakerWantsFirst ? state.choiceMaker : otherPerson;
    const humanOrA = cpuMode ? 'human' : 'A';
    const cpuOrB = cpuMode ? 'cpu' : 'B';
    const secondPerson = firstPerson === humanOrA ? cpuOrB : humanOrA;
    state.roleByPerson = { [firstPerson]: 'cyan', [secondPerson]: 'magenta' };
    state.personByOwner = { cyan: state.identities[firstPerson], magenta: state.identities[secondPerson] };

    if (cpuMode) {
      const level = cpuModeLevel();
      state.humanOwner = state.roleByPerson.human;
      state.cpuByOwner[state.roleByPerson.cpu] = level;
      if (tryStartQueuedReplay()) return;
      if (isCpuOwner('cyan')) beginCpuSetup('cyan');
      else beginSetup('cyan');
      return;
    }

    if (tryStartQueuedReplay()) return;
    state.phase = 'handoff';
    render();
    showPassDialog(
      `${state.personByOwner.cyan} is Player 1`,
      `${state.personByOwner.cyan} uses cyan, sets up first, and takes the first turn. Pass the device to ${state.personByOwner.cyan}.`,
      () => beginSetup('cyan')
    );
  }

  function beginSetup(owner) {
    dispatchLastMoveReset();
    state.phase = 'setup';
    state.setupOwner = owner;
    state.selectedPieceId = null;
    render();
  }

  function createCpuSetup(owner) {
    const level = cpuLevel(owner);
    if (level === 'cpu3') return CPU3.createLogicalSetup(Game, owner, state.pieces);
    return CPU1.createRandomSetup(Game, owner, state.pieces);
  }

  function finishCpuSetup(owner) {
    state.nextPawnNumber[owner] = 6;
    state.cpuThinking = false;
    clearCpuSearch();
    if (owner === 'cyan') {
      if (isCpuOwner('magenta')) beginCpuSetup('magenta');
      else beginSetup('magenta');
      return;
    }
    state.phase = 'handoff';
    render();
    const cpuMatch = isCpuDuel();
    showPassDialog(
      'Both setups are locked',
      cpuMatch ? 'Both CPU setups are ready.' : 'The CPU setup is ready. Reveal the board and begin the game.',
      startPlay,
      cpuMatch ? 'Start match' : 'Reveal board',
      'READY TO PLAY'
    );
  }

  function finishCpuPlusSetup(owner, result, startedAt) {
    const delay = Math.max(0, CPUPlus.SETUP_VISIBLE_MIN_MS - (performance.now() - startedAt));
    scheduledTimer = window.setTimeout(() => {
      if (state.phase !== 'cpu-setup' || state.setupOwner !== owner || cpuLevel(owner) !== 'cpuplus') return;
      if (result && result.hunterCell && result.pawnCells) {
        CPUPlus.applySetup(Game, owner, state.pieces, result);
        state.cpuPlusSetupKeyByOwner[owner] = result.key || CPUPlus.placementKey(owner, state.pieces);
      } else {
        CPU3.createLogicalSetup(Game, owner, state.pieces);
        state.cpuPlusSetupKeyByOwner[owner] = CPUPlus.placementKey(owner, state.pieces);
      }
      finishCpuSetup(owner);
    }, delay);
  }

  function beginCpuPlusSetup(owner) {
    const startedAt = performance.now();
    if (typeof Worker === 'undefined') {
      CPU3.createLogicalSetup(Game, owner, state.pieces);
      state.cpuPlusSetupKeyByOwner[owner] = CPUPlus.placementKey(owner, state.pieces);
      finishCpuPlusSetup(owner, null, startedAt);
      return;
    }
    cpuWorker = new Worker('src/cpuplus-worker.js');
    cpuWorker.onmessage = (event) => {
      const worker = cpuWorker;
      cpuWorker = null;
      if (worker) worker.terminate();
      window.clearTimeout(cpuDeadlineTimer);
      cpuDeadlineTimer = null;
      const result = event.data && event.data.ok ? event.data.result : null;
      finishCpuPlusSetup(owner, result, startedAt);
    };
    cpuWorker.onerror = () => {
      clearCpuSearch();
      finishCpuPlusSetup(owner, null, startedAt);
    };
    cpuWorker.postMessage({
      kind: 'setup',
      owner,
      database: state.cpuPlusDatabase,
      analysisTimeMs: CPUPlus.SETUP_ANALYSIS_MS
    });
    cpuDeadlineTimer = window.setTimeout(() => {
      clearCpuSearch();
      finishCpuPlusSetup(owner, null, startedAt);
    }, CPUPlus.SETUP_VISIBLE_MIN_MS + 1000);
  }

  function beginCpuSetup(owner) {
    dispatchLastMoveReset();
    state.phase = 'cpu-setup';
    state.setupOwner = owner;
    state.selectedPieceId = null;
    state.cpuThinking = true;
    render();
    if (cpuLevel(owner) === 'cpuplus') {
      beginCpuPlusSetup(owner);
      return;
    }
    scheduledTimer = window.setTimeout(() => {
      createCpuSetup(owner);
      finishCpuSetup(owner);
    }, 1000);
  }

  function onCellClick(coord) {
    if (state.phase === 'setup') {
      handleSetupCell(coord);
      return;
    }
    if (state.phase === 'play') handlePlayCell(coord);
  }

  function handleSetupCell(coord) {
    if (isCpuOwner(state.setupOwner)) return;
    const clickedPiece = Game.pieceAt(state.pieces, coord);
    if (clickedPiece && clickedPiece.owner === state.setupOwner) {
      state.selectedPieceId = clickedPiece.id === state.selectedPieceId ? null : clickedPiece.id;
      render();
      return;
    }
    const selected = Game.getPiece(state.pieces, state.selectedPieceId);
    if (!selected || selected.owner !== state.setupOwner) return;
    if (!Game.canPlace(selected, coord, state.pieces)) {
      showToast('That square is not available for this piece.');
      return;
    }
    if (selected.type === 'pawn' && !selected.assigned) {
      selected.assigned = true;
      state.nextPawnNumber[selected.owner] = Math.max(state.nextPawnNumber[selected.owner], selected.number + 1);
    }
    selected.position = coord;
    selected.status = 'board';
    state.selectedPieceId = null;
    render();
  }

  function returnSelectedPiece() {
    const selected = Game.getPiece(state.pieces, state.selectedPieceId);
    if (!selected || selected.status !== 'board' || selected.owner !== state.setupOwner) return;
    selected.position = null;
    selected.status = 'reserve';
    state.selectedPieceId = selected.id;
    render();
  }

  function restartCurrentSetup() {
    state.pieces.filter((piece) => piece.owner === state.setupOwner).forEach((piece) => {
      piece.position = null;
      piece.status = 'reserve';
      if (piece.type === 'pawn') piece.assigned = false;
    });
    state.nextPawnNumber[state.setupOwner] = 1;
    state.selectedPieceId = null;
    render();
  }

  function lockSetup() {
    if (!Game.validateSetup(state.setupOwner, state.pieces)) return;
    state.selectedPieceId = null;
    if (state.mode !== 'local') {
      if (state.setupOwner === 'cyan') {
        beginCpuSetup('magenta');
      } else {
        state.phase = 'handoff';
        render();
        showPassDialog(
          'Both setups are locked',
          'The CPU setup is ready. Reveal the board and begin the game.',
          startPlay,
          'Reveal board',
          'READY TO PLAY'
        );
      }
      return;
    }
    state.phase = 'handoff';
    render();
    if (state.setupOwner === 'cyan') {
      showPassDialog(
        'Player 1 setup locked',
        `All cyan pieces are now hidden. Pass the device to ${state.personByOwner.magenta}.`,
        () => beginSetup('magenta')
      );
      return;
    }
    showPassDialog(
      'Both setups are locked',
      'Place the device where both players can see it, then reveal the board.',
      startPlay,
      'Reveal board'
    );
  }

  function startPlay() {
    dispatchLastMoveReset();
    state.phase = 'play';
    state.currentOwner = 'cyan';
    state.selectedPieceId = null;
    state.turnCount = 0;
    state.playerTurns = { cyan: 0, magenta: 0 };
    state.consecutivePasses = 0;
    state.repetitions = new Map();
    state.history = [];
    state.undoStack = [];
    state.finished = false;
    state.learningRecorded = false;
    for (const owner of ['cyan', 'magenta']) {
      if (cpuLevel(owner) === 'cpuplus' && !state.cpuPlusSetupKeyByOwner[owner]) {
        state.cpuPlusSetupKeyByOwner[owner] = CPUPlus.placementKey(owner, state.pieces);
      }
    }
    Timer.reset(state.timer, state.timedGame);
    recordPosition();
    render();
    processTurnStart();
  }

  function startTurnClock(owner) {
    if (!state.timedGame) return;
    if (state.timer.activeOwner === owner) {
      if (state.timer.paused) Timer.resume(state.timer);
    } else {
      Timer.startTurn(state.timer, owner);
    }
    ensureClockInterval();
    updateTimerDisplay();
  }

  function commitTurnClock(owner) {
    if (!state.timedGame) return { usedMs: 0, remainingMs: Timer.PLAYER_LIMIT_MS };
    const result = Timer.commitTurn(state.timer, owner);
    updateTimerDisplay();
    return result;
  }

  function forcePassClock(owner) {
    if (!state.timedGame) return { usedMs: 0, remainingMs: Timer.PLAYER_LIMIT_MS };
    const result = Timer.forcePass(state.timer, owner);
    updateTimerDisplay();
    return result;
  }

  function formatClock(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    if (!state.timedGame || !elements.timerCard) return;
    const snapshot = Timer.remaining(state.timer);
    const cyanRunning = snapshot.owner === 'cyan' ? snapshot.usedMs : 0;
    const magentaRunning = snapshot.owner === 'magenta' ? snapshot.usedMs : 0;
    elements.moveClock.textContent = formatClock(snapshot.moveMs);
    elements.cyanTotalClock.textContent = formatClock(Math.max(0, state.timer.remainingByOwner.cyan - cyanRunning));
    elements.magentaTotalClock.textContent = formatClock(Math.max(0, state.timer.remainingByOwner.magenta - magentaRunning));
  }

  function tickClock() {
    if (!state.timedGame || state.finished || state.phase !== 'play') return;
    updateTimerDisplay();
    const reason = Timer.timeoutReason(state.timer);
    if (reason) finishTimeLoss(state.timer.activeOwner, reason);
  }

  function handlePlayCell(coord) {
    if (state.finished || isCpuOwner(state.currentOwner)) return;
    const clickedPiece = Game.pieceAt(state.pieces, coord);
    if (clickedPiece && clickedPiece.owner === state.currentOwner) {
      state.selectedPieceId = clickedPiece.id === state.selectedPieceId ? null : clickedPiece.id;
      render();
      return;
    }
    const selected = Game.getPiece(state.pieces, state.selectedPieceId);
    if (!selected || selected.owner !== state.currentOwner) return;
    const move = Game.legalMovesForPiece(selected, state.pieces).find((candidate) => candidate.to === coord);
    if (!move) return;
    if (state.confirmMoves) {
      state.pendingMove = move;
      elements.confirmDialog.returnValue = '';
      elements.confirmText.textContent = describeMove(selected, move, true);
      elements.confirmDialog.showModal();
    } else {
      executeMove(move);
    }
  }

  function executeMove(move) {
    if (state.finished) return;
    const timeout = Timer.timeoutReason(state.timer);
    if (timeout) {
      finishTimeLoss(state.timer.activeOwner, timeout);
      return;
    }
    const piece = Game.getPiece(state.pieces, move.pieceId);
    if (!piece) return;
    const movingOwner = piece.owner;
    pushUndoSnapshot();
    clearCpuSearch();
    commitTurnClock(movingOwner);
    const outcome = Game.applyMove(state.pieces, move);
    state.turnCount += 1;
    state.playerTurns[movingOwner] += 1;
    state.consecutivePasses = 0;
    state.history.push(formatHistoryEntry(state.turnCount, piece, outcome));
    state.selectedPieceId = null;
    state.pendingMove = null;
    state.cpuThinking = false;
    const win = Game.winner(state.pieces);
    if (win) {
      render();
      finishWithWinner(win);
      return;
    }
    if (state.turnCount >= 100) {
      render();
      finishDraw('The 100-turn limit was reached.');
      return;
    }
    state.currentOwner = Game.otherOwner(state.currentOwner);
    if (recordPosition() >= 3) {
      render();
      finishDraw('The same position occurred three times.');
      return;
    }
    if (isCpuDuel() && state.cpuStepOnce) {
      state.cpuStepOnce = false;
      state.cpuMatchPaused = true;
      render();
      return;
    }
    render();
    processTurnStart();
  }

  function processTurnStart() {
    if (state.finished || state.phase !== 'play') return;
    if (isCpuDuel() && state.cpuMatchPaused && !state.cpuStepOnce) {
      render();
      return;
    }
    const legalMoves = Game.allLegalMoves(state.currentOwner, state.pieces);
    if (legalMoves.length > 0) {
      startTurnClock(state.currentOwner);
      if (isCpuOwner(state.currentOwner)) scheduleCpuMove();
      return;
    }
    const passingOwner = state.currentOwner;
    const clockResult = forcePassClock(passingOwner);
    state.turnCount += 1;
    state.playerTurns[passingOwner] += 1;
    state.consecutivePasses += 1;
    state.history.push(`${state.turnCount}. ${isCpuOwner(passingOwner) ? cpuName(cpuLevel(passingOwner)) : ownerLabel(passingOwner)} — forced pass (1:00 charged)`);
    showToast(`${ownerLabel(passingOwner)} has no legal move. One minute was charged and the turn passed.`);
    if (state.timedGame && clockResult.remainingMs <= 0) {
      render();
      finishTimeLoss(passingOwner, 'total');
      return;
    }
    if (state.consecutivePasses >= 2) {
      render();
      finishDraw('Neither player can make a legal move.');
      return;
    }
    if (state.turnCount >= 100) {
      render();
      finishDraw('The 100-turn limit was reached.');
      return;
    }
    state.currentOwner = Game.otherOwner(state.currentOwner);
    if (recordPosition() >= 3) {
      render();
      finishDraw('The same position occurred three times.');
      return;
    }
    if (isCpuDuel() && state.cpuStepOnce) {
      state.cpuStepOnce = false;
      state.cpuMatchPaused = true;
      render();
      return;
    }
    render();
    scheduledTimer = window.setTimeout(processTurnStart, 650);
  }

  function scheduleCpu1Move() {
    scheduledTimer = window.setTimeout(() => {
      if (state.finished || state.phase !== 'play' || !isCpuOwner(state.currentOwner)) return;
      const move = CPU1.chooseMove(Game, state.currentOwner, state.pieces);
      state.cpuThinking = false;
      if (move) executeMove(move);
    }, 1000);
  }

  function finishCpu3Result(result, owner, startedAt) {
    const delay = Math.max(0, 1000 - (performance.now() - startedAt));
    scheduledTimer = window.setTimeout(() => {
      if (state.finished || state.phase !== 'play' || state.currentOwner !== owner || cpuLevel(owner) !== 'cpu3') return;
      state.cpuThinking = false;
      const move = result && result.move ? result.move : CPU1.chooseMove(Game, owner, state.pieces);
      if (move) executeMove(move);
    }, delay);
  }

  function scheduleCpu3Move() {
    const owner = state.currentOwner;
    const startedAt = performance.now();
    if (typeof Worker === 'undefined') {
      scheduledTimer = window.setTimeout(() => {
        const move = CPU3.chooseMove(Game, owner, state.pieces, { maxDepth: 3, maxTimeMs: 1500 });
        state.cpuThinking = false;
        if (move) executeMove(move);
      }, 1000);
      return;
    }
    cpuWorker = new Worker('src/cpu3-worker.js');
    cpuWorker.onmessage = (event) => {
      const worker = cpuWorker;
      cpuWorker = null;
      if (worker) worker.terminate();
      window.clearTimeout(cpuDeadlineTimer);
      cpuDeadlineTimer = null;
      finishCpu3Result(event.data && event.data.ok ? event.data.result : null, owner, startedAt);
    };
    cpuWorker.onerror = () => {
      clearCpuSearch();
      finishCpu3Result(null, owner, startedAt);
    };
    cpuWorker.postMessage({ owner, pieces: state.pieces, maxDepth: 3, maxTimeMs: 45000 });
    cpuDeadlineTimer = window.setTimeout(() => {
      clearCpuSearch();
      finishCpu3Result(null, owner, startedAt);
    }, 45500);
  }

  function finishCpuPlusResult(result, owner, startedAt, fastPath = false) {
    const minimum = fastPath ? 1000 : CPUPlus.MOVE_MIN_MS;
    const delay = Math.max(0, minimum - (performance.now() - startedAt));
    scheduledTimer = window.setTimeout(() => {
      if (state.finished || state.phase !== 'play' || state.currentOwner !== owner || cpuLevel(owner) !== 'cpuplus') return;
      state.cpuThinking = false;
      const move = result && result.move ? result.move : CPU1.chooseMove(Game, owner, state.pieces);
      if (move) executeMove(move);
    }, delay);
  }

  function scheduleCpuPlusMove() {
    const owner = state.currentOwner;
    const startedAt = performance.now();
    const legalMoves = Game.allLegalMoves(owner, state.pieces);
    const immediateWins = CPUPlus.immediateWinningMoves(Game, owner, state.pieces);
    if (legalMoves.length === 1 || immediateWins.length > 0) {
      const choices = immediateWins.length > 0 ? immediateWins : legalMoves;
      const move = choices[Math.floor(Math.random() * choices.length)];
      finishCpuPlusResult({ move, fastPath: immediateWins.length > 0 ? 'win' : 'only-move' }, owner, startedAt, true);
      return;
    }
    if (typeof Worker === 'undefined') {
      const move = CPU3.chooseMove(Game, owner, state.pieces, { maxDepth: 3, maxTimeMs: 1500 });
      finishCpuPlusResult({ move }, owner, startedAt, false);
      return;
    }
    cpuWorker = new Worker('src/cpuplus-worker.js');
    cpuWorker.onmessage = (event) => {
      const worker = cpuWorker;
      cpuWorker = null;
      if (worker) worker.terminate();
      window.clearTimeout(cpuDeadlineTimer);
      cpuDeadlineTimer = null;
      const result = event.data && event.data.ok ? event.data.result : null;
      finishCpuPlusResult(result, owner, startedAt, Boolean(result && result.fastPath));
    };
    cpuWorker.onerror = () => {
      clearCpuSearch();
      finishCpuPlusResult(null, owner, startedAt, false);
    };
    cpuWorker.postMessage({
      kind: 'move',
      owner,
      pieces: state.pieces,
      maxDepth: CPUPlus.MAX_DEPTH,
      maxTimeMs: CPUPlus.MOVE_SEARCH_MS
    });
    cpuDeadlineTimer = window.setTimeout(() => {
      clearCpuSearch();
      finishCpuPlusResult(null, owner, startedAt, false);
    }, CPUPlus.MOVE_HARD_MAX_MS);
  }

  function scheduleCpuMove() {
    clearScheduledAction();
    state.cpuThinking = true;
    render();
    const level = cpuLevel(state.currentOwner);
    if (level === 'cpuplus') scheduleCpuPlusMove();
    else if (level === 'cpu3') scheduleCpu3Move();
    else scheduleCpu1Move();
  }

  function toggleCpuPause() {
    if (!isCpuDuel() || state.finished) return;
    if (!state.cpuMatchPaused) {
      state.cpuMatchPaused = true;
      state.cpuStepOnce = false;
      clearScheduledAction();
      Timer.pause(state.timer);
      render();
      return;
    }
    state.cpuMatchPaused = false;
    Timer.resume(state.timer);
    render();
    processTurnStart();
  }

  function playNextCpuMove() {
    if (!isCpuDuel() || !state.cpuMatchPaused || state.finished || state.cpuThinking) return;
    state.cpuStepOnce = true;
    Timer.resume(state.timer);
    render();
    processTurnStart();
  }

  function recordPosition() {
    const key = Game.serializePosition(state.pieces, state.currentOwner);
    const count = (state.repetitions.get(key) || 0) + 1;
    state.repetitions.set(key, count);
    return count;
  }

  function describeMove(piece, move, sentence = false) {
    const destination = move.exits ? 'the exit' : move.to;
    const capture = move.captureId ? ` and capture ${pieceLabel(Game.getPiece(state.pieces, move.captureId))}` : '';
    const text = `${ownerLabel(piece.owner)} ${pieceLabel(piece)}: ${move.from} → ${destination}${capture}`;
    return sentence ? `${text}.` : text;
  }

  function formatHistoryEntry(turn, piece, outcome) {
    const actor = isCpuOwner(piece.owner) ? cpuName(cpuLevel(piece.owner)) : ownerLabel(piece.owner);
    if (outcome.exits) return `${turn}. ${actor} ${pieceLabel(piece)}: ${outcome.from} → EXIT`;
    if (outcome.captured) return `${turn}. ${actor} Hunter: ${outcome.from} × ${outcome.to} (${pieceLabel(outcome.captured)})`;
    return `${turn}. ${actor} ${pieceLabel(piece)}: ${outcome.from} → ${outcome.to}`;
  }

  function opponentKindFor(owner) {
    const opponent = Game.otherOwner(owner);
    return cpuLevel(opponent) || 'human';
  }

  function recordCpuPlusLearning(result, metadata = {}) {
    if (state.learningRecorded || metadata.countLearning === false) return;
    const plusOwners = ['cyan', 'magenta'].filter((owner) => cpuLevel(owner) === 'cpuplus');
    if (plusOwners.length === 0) return;
    if (metadata.reason === 'time' && plusOwners.includes(metadata.loser)) {
      state.learningRecorded = true;
      return;
    }
    let database = state.cpuPlusDatabase;
    for (const owner of plusOwners) {
      const key = state.cpuPlusSetupKeyByOwner[owner] || CPUPlus.placementKey(owner, state.pieces);
      if (!key) continue;
      const outcome = result.draw ? 'draw' : result.winner === owner ? 'win' : 'loss';
      database = CPUPlus.recordResult(database, key, outcome, opponentKindFor(owner));
    }
    state.cpuPlusDatabase = CPUPlus.saveDatabase(database);
    state.learningRecorded = true;
    renderLearningSummary();
  }

  function stopGameRuntime() {
    clearScheduledAction();
    stopClockInterval();
    Timer.stopTurn(state.timer);
    state.finished = true;
  }

  function showResult(title, text) {
    elements.resultTitle.textContent = title;
    elements.resultText.textContent = text;
    render();
    elements.resultDialog.showModal();
  }

  function finishWithWinner(win, metadata = {}) {
    if (state.finished) return;
    stopGameRuntime();
    recordCpuPlusLearning({ winner: win.owner, draw: false }, metadata);
    const reason = win.reason === 'escape'
      ? 'Two numbered pawns escaped through the central door.'
      : win.reason === 'concession'
        ? 'The opponent conceded because they were going to lose.'
        : 'The Hunter captured three opposing pawns.';
    showResult(`${personLabel(win.owner)} wins`, reason);
  }

  function finishTimeLoss(loser, reason) {
    if (!loser || state.finished) return;
    const winner = Game.otherOwner(loser);
    stopGameRuntime();
    recordCpuPlusLearning({ winner, draw: false }, { reason: 'time', loser });
    const text = reason === 'total'
      ? `${personLabel(loser)} used all 50 minutes.`
      : `${personLabel(loser)} exceeded the one-minute move limit.`;
    showResult(`${personLabel(winner)} wins on time`, text);
  }

  function finishDraw(reason) {
    if (state.finished) return;
    stopGameRuntime();
    recordCpuPlusLearning({ winner: null, draw: true }, { reason: 'draw' });
    showResult('Draw', reason);
  }

  function openAbandonDialog() {
    if (state.finished || !hasHumanPlayer()) return;
    elements.abandonDialog.showModal();
  }

  function abandonGoingToLose() {
    if (elements.abandonDialog.open) elements.abandonDialog.close();
    const loser = state.humanOwner || state.currentOwner;
    const winner = Game.otherOwner(loser);
    finishWithWinner({ owner: winner, reason: 'concession' }, { reason: 'concession', loser });
  }

  function abandonLeave() {
    if (elements.abandonDialog.open) elements.abandonDialog.close();
    if (state.finished) return;
    stopGameRuntime();
    state.learningRecorded = true;
    showResult('Game ended', 'The game was interrupted because a player had to leave. No CPU+ learning data was recorded.');
  }

  function openResetLearningDialog() {
    elements.resetLearningPassword.value = '';
    elements.resetLearningError.textContent = '';
    const info = CPUPlus.summary(state.cpuPlusDatabase);
    $('#resetLearningStats').textContent = `${info.placements} placements and ${info.games} results are stored on this browser.`;
    elements.resetLearningDialog.showModal();
    window.setTimeout(() => elements.resetLearningPassword.focus(), 0);
  }

  async function submitResetLearning(event) {
    event.preventDefault();
    elements.resetLearningError.textContent = 'Checking…';
    const valid = await CPUPlus.verifyResetPassword(elements.resetLearningPassword.value);
    if (!valid) {
      elements.resetLearningError.textContent = 'Incorrect password.';
      elements.resetLearningPassword.select();
      return;
    }
    state.cpuPlusDatabase = CPUPlus.clearDatabase();
    elements.resetLearningError.textContent = '';
    elements.resetLearningDialog.close();
    renderLearningSummary();
    showToast('CPU+ placement learning was reset on this browser.');
  }

  function showPassDialog(title, text, onContinue, buttonText = 'Continue', eyebrow = 'PASS THE DEVICE') {
    elements.passEyebrow.textContent = eyebrow;
    elements.passTitle.textContent = title;
    elements.passText.textContent = text;
    elements.passContinueButton.textContent = buttonText;
    elements.passContinueButton.onclick = () => {
      elements.passDialog.close();
      onContinue();
    };
    elements.passDialog.showModal();
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 3000);
  }

  elements.returnPieceButton.addEventListener('click', returnSelectedPiece);
  elements.restartSetupButton.addEventListener('click', restartCurrentSetup);
  elements.lockSetupButton.addEventListener('click', lockSetup);
  elements.cpuPauseButton.addEventListener('click', toggleCpuPause);
  elements.cpuNextButton.addEventListener('click', playNextCpuMove);
  elements.undoMoveButton.addEventListener('click', undoHumanMove);
  elements.abandonButton.addEventListener('click', openAbandonDialog);
  elements.abandonLoseButton.addEventListener('click', abandonGoingToLose);
  elements.abandonLeaveButton.addEventListener('click', abandonLeave);
  elements.abandonCancelButton.addEventListener('click', () => elements.abandonDialog.close());
  elements.resetLearningButton.addEventListener('click', openResetLearningDialog);
  elements.resetLearningForm.addEventListener('submit', submitResetLearning);
  elements.resetLearningCancelButton.addEventListener('click', () => elements.resetLearningDialog.close());

  elements.confirmMoves.checked = state.confirmMoves;
  elements.confirmMoves.addEventListener('change', () => {
    state.confirmMoves = elements.confirmMoves.checked;
    localStorage.setItem('exit-strategy-confirm-moves', String(state.confirmMoves));
  });
  elements.showCoordinates.checked = state.showCoordinates;
  elements.showCoordinates.addEventListener('change', () => {
    state.showCoordinates = elements.showCoordinates.checked;
    renderBoard();
  });
  elements.confirmDialog.addEventListener('close', () => {
    if (elements.confirmDialog.returnValue === 'confirm' && state.pendingMove) executeMove(state.pendingMove);
    state.pendingMove = null;
  });
  elements.newGameButton.addEventListener('click', resetGame);
  elements.rulesButton.addEventListener('click', () => elements.rulesDialog.showModal());

  window.ExitStrategyRuntime = {
    queueReplaySetup,
    canUndoHumanMove,
    undoHumanMove
  };

  createBoard();
  render();
})();