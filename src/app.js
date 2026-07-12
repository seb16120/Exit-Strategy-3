(() => {
  'use strict';

  const Game = window.ExitStrategyGame;
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
    cyanEscaped: $('#cyanEscaped'),
    cyanCaptured: $('#cyanCaptured'),
    magentaEscaped: $('#magentaEscaped'),
    magentaCaptured: $('#magentaCaptured'),
    turnCounter: $('#turnCounter'),
    history: $('#history'),
    confirmMoves: $('#confirmMoves'),
    showCoordinates: $('#showCoordinates'),
    passDialog: $('#passDialog'),
    passTitle: $('#passTitle'),
    passText: $('#passText'),
    passContinueButton: $('#passContinueButton'),
    confirmDialog: $('#confirmDialog'),
    confirmText: $('#confirmText'),
    confirmMoveButton: $('#confirmMoveButton'),
    resultDialog: $('#resultDialog'),
    resultTitle: $('#resultTitle'),
    resultText: $('#resultText'),
    newGameButton: $('#newGameButton'),
    rulesButton: $('#rulesButton'),
    rulesDialog: $('#rulesDialog'),
    toast: $('#toast')
  };

  const storedConfirm = localStorage.getItem('exit-strategy-confirm-moves');
  const defaultConfirm = window.matchMedia('(pointer: coarse)').matches;

  const state = {
    phase: 'choice',
    choiceMaker: null,
    identities: { A: 'Player A', B: 'Player B' },
    roleByPerson: {},
    personByOwner: {},
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
    pendingMove: null,
    confirmMoves: storedConfirm === null ? defaultConfirm : storedConfirm === 'true',
    showCoordinates: false,
    finished: false
  };

  function ownerLabel(owner) {
    return owner === 'cyan' ? 'Player 1 (Cyan)' : 'Player 2 (Magenta)';
  }

  function personLabel(owner) {
    return state.personByOwner[owner] || ownerLabel(owner);
  }

  function pieceLabel(piece) {
    return piece.type === 'hunter' ? 'Hunter' : `Pawn ${piece.number}`;
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

  function resetGame() {
    state.phase = 'choice';
    state.choiceMaker = null;
    state.roleByPerson = {};
    state.personByOwner = {};
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
    state.pendingMove = null;
    state.finished = false;
    if (elements.resultDialog.open) elements.resultDialog.close();
    render();
  }

  function render() {
    renderPhaseCard();
    renderBoard();
    renderSetupControls();
    renderSidePanel();
  }

  function renderPhaseCard() {
    const card = elements.phaseCard;
    if (state.phase === 'choice') {
      card.innerHTML = `
        <p class="eyebrow">STEP 1 · TURN ORDER</p>
        <h2>Draw the choice maker</h2>
        <p>The chosen person decides whether to play first or second. The first player becomes Player 1 and uses cyan.</p>
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
      card.innerHTML = `
        <div class="turn-banner">
          <span class="turn-dot ${state.currentOwner}"></span>
          <div><p class="eyebrow">CURRENT TURN</p><h2>${ownerLabel(state.currentOwner)} — ${personLabel(state.currentOwner)}</h2></div>
        </div>
        <p>Select one of your pieces, then select a highlighted destination.</p>`;
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
    if (state.phase === 'setup') return piece.owner === state.setupOwner;
    return state.phase === 'play' && !state.finished && piece.owner === state.currentOwner;
  }

  function renderSetupControls() {
    elements.setupControls.hidden = state.phase !== 'setup';
    if (state.phase !== 'setup') return;

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

  function renderSidePanel() {
    elements.sidePanel.hidden = state.phase !== 'play';
    if (state.phase !== 'play') return;
    elements.cyanEscaped.textContent = Game.escapedCount('cyan', state.pieces);
    elements.cyanCaptured.textContent = Game.captureCount('cyan', state.pieces);
    elements.magentaEscaped.textContent = Game.escapedCount('magenta', state.pieces);
    elements.magentaCaptured.textContent = Game.captureCount('magenta', state.pieces);
    elements.turnCounter.textContent = `${state.turnCount} / 100`;
    elements.history.innerHTML = '';
    state.history.forEach((entry) => {
      const item = document.createElement('li');
      item.textContent = entry;
      elements.history.appendChild(item);
    });
    elements.history.scrollTop = elements.history.scrollHeight;
  }

  function drawChoiceMaker() {
    state.choiceMaker = Math.random() < 0.5 ? 'A' : 'B';
    state.phase = 'choose-order';
    render();
  }

  function assignRoles(choiceMakerWantsFirst) {
    const otherPerson = state.choiceMaker === 'A' ? 'B' : 'A';
    const firstPerson = choiceMakerWantsFirst ? state.choiceMaker : otherPerson;
    const secondPerson = firstPerson === 'A' ? 'B' : 'A';
    state.roleByPerson = { [firstPerson]: 'cyan', [secondPerson]: 'magenta' };
    state.personByOwner = { cyan: state.identities[firstPerson], magenta: state.identities[secondPerson] };

    state.phase = 'handoff';
    render();
    showPassDialog(
      `${state.personByOwner.cyan} is Player 1`,
      `${state.personByOwner.cyan} uses cyan, sets up first, and takes the first turn. Pass the device to ${state.personByOwner.cyan}.`,
      () => beginSetup('cyan')
    );
  }

  function beginSetup(owner) {
    state.phase = 'setup';
    state.setupOwner = owner;
    state.selectedPieceId = null;
    render();
  }

  function onCellClick(coord) {
    if (state.phase === 'setup') {
      handleSetupCell(coord);
      return;
    }
    if (state.phase === 'play') handlePlayCell(coord);
  }

  function handleSetupCell(coord) {
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
    state.pieces
      .filter((piece) => piece.owner === state.setupOwner)
      .forEach((piece) => {
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
    state.phase = 'handoff';
    state.selectedPieceId = null;
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
    state.phase = 'play';
    state.currentOwner = 'cyan';
    state.selectedPieceId = null;
    state.turnCount = 0;
    state.playerTurns = { cyan: 0, magenta: 0 };
    state.consecutivePasses = 0;
    state.repetitions = new Map();
    state.history = [];
    state.finished = false;
    recordPosition();
    render();
    processTurnStart();
  }

  function handlePlayCell(coord) {
    if (state.finished) return;
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
    const piece = Game.getPiece(state.pieces, move.pieceId);
    const movingOwner = piece.owner;
    const outcome = Game.applyMove(state.pieces, move);
    state.turnCount += 1;
    state.playerTurns[movingOwner] += 1;
    state.consecutivePasses = 0;
    state.history.push(formatHistoryEntry(state.turnCount, piece, outcome));
    state.selectedPieceId = null;
    state.pendingMove = null;

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
    render();
    processTurnStart();
  }

  function processTurnStart() {
    if (state.finished || state.phase !== 'play') return;
    if (Game.allLegalMoves(state.currentOwner, state.pieces).length > 0) return;

    const passingOwner = state.currentOwner;
    state.turnCount += 1;
    state.playerTurns[passingOwner] += 1;
    state.consecutivePasses += 1;
    state.history.push(`${state.turnCount}. ${ownerLabel(passingOwner)} — forced pass`);
    showToast(`${ownerLabel(passingOwner)} has no legal move. Turn passed.`);

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
    render();
    window.setTimeout(processTurnStart, 650);
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
    if (outcome.exits) return `${turn}. ${ownerLabel(piece.owner)} ${pieceLabel(piece)}: ${outcome.from} → EXIT`;
    if (outcome.captured) return `${turn}. ${ownerLabel(piece.owner)} Hunter: ${outcome.from} × ${outcome.to} (${pieceLabel(outcome.captured)})`;
    return `${turn}. ${ownerLabel(piece.owner)} ${pieceLabel(piece)}: ${outcome.from} → ${outcome.to}`;
  }

  function finishWithWinner(win) {
    state.finished = true;
    const reason = win.reason === 'escape'
      ? 'Two numbered pawns escaped through the central door.'
      : 'The Hunter captured three opposing pawns.';
    elements.resultTitle.textContent = `${ownerLabel(win.owner)} wins`;
    elements.resultText.textContent = reason;
    elements.resultDialog.showModal();
  }

  function finishDraw(reason) {
    state.finished = true;
    elements.resultTitle.textContent = 'Draw';
    elements.resultText.textContent = reason;
    elements.resultDialog.showModal();
  }

  function showPassDialog(title, text, onContinue, buttonText = 'Continue') {
    elements.passTitle.textContent = title;
    elements.passText.textContent = text;
    elements.passContinueButton.textContent = buttonText;
    elements.passContinueButton.onclick = () => {
      elements.passDialog.close();
      onContinue();
    };
    elements.passDialog.showModal();
  }

  let toastTimer = null;
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 2400);
  }

  elements.returnPieceButton.addEventListener('click', returnSelectedPiece);
  elements.restartSetupButton.addEventListener('click', restartCurrentSetup);
  elements.lockSetupButton.addEventListener('click', lockSetup);
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

  createBoard();
  render();
})();
