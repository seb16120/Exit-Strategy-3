(() => {
  'use strict';

  const Game = window.ExitStrategyGame;
  const CPU1 = window.ExitStrategyCPU;
  const CPU3 = window.ExitStrategyCPU3;
  const CPUPlus = window.ExitStrategyCPUPlus;
  const phaseCard = document.querySelector('#phaseCard');
  const board = document.querySelector('#board');
  const boardFrame = document.querySelector('#boardFrame');
  const sidePanel = document.querySelector('#sidePanel');
  const resetDialog = document.querySelector('#resetLearningDialog');
  const resetButton = document.querySelector('#resetLearningButton');

  if (!Game || !CPUPlus || !phaseCard || !board || !boardFrame || !sidePanel) return;

  const RESET_CREDENTIAL_KEY = 'exit-strategy-cpuplus-reset-credential-v1';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let simulationDepth = 0;
  let cpuPlusProgress = null;
  let lastMove = null;
  let overlay = null;
  let shadowLine = null;
  let mainLine = null;
  let drawQueued = false;

  const style = document.createElement('style');
  style.textContent = `
    .cpuplus-depth-status {
      display: block;
      margin-top: 8px;
      padding-left: 22px;
      color: var(--muted);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .password-field[hidden], .last-move-layer[hidden] { display: none !important; }
  `;
  document.head.appendChild(style);

  function defaultStorage() {
    try {
      return window.localStorage;
    } catch (_) {
      return null;
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(text) {
    if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') return null;
    const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
    return bytesToHex(new Uint8Array(digest));
  }

  function loadResetCredential(storage = defaultStorage()) {
    if (!storage) return null;
    try {
      const value = JSON.parse(storage.getItem(RESET_CREDENTIAL_KEY) || 'null');
      if (!value || value.version !== 1 || typeof value.salt !== 'string' || typeof value.hash !== 'string') return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  function hasResetPassword(storage = defaultStorage()) {
    return Boolean(loadResetCredential(storage));
  }

  async function setResetPassword(password, storage = defaultStorage()) {
    if (!storage || typeof window.crypto?.getRandomValues !== 'function') return false;
    const saltBytes = new Uint8Array(16);
    window.crypto.getRandomValues(saltBytes);
    const salt = bytesToHex(saltBytes);
    const hash = await sha256Hex(`${salt}:${password}`);
    if (!hash) return false;
    try {
      storage.setItem(RESET_CREDENTIAL_KEY, JSON.stringify({ version: 1, salt, hash }));
      return true;
    } catch (_) {
      return false;
    }
  }

  async function verifyDeviceResetPassword(password, storage = defaultStorage()) {
    const credential = loadResetCredential(storage);
    if (!credential) return false;
    const hash = await sha256Hex(`${credential.salt}:${password}`);
    return Boolean(hash && hash === credential.hash);
  }

  function showPasswordError(message) {
    window.setTimeout(() => {
      const error = document.querySelector('#resetLearningError');
      if (error) error.textContent = message;
    }, 0);
  }

  CPUPlus.hasResetPassword = hasResetPassword;
  CPUPlus.setResetPassword = setResetPassword;
  CPUPlus.verifyDeviceResetPassword = verifyDeviceResetPassword;
  CPUPlus.verifyResetPassword = async (password) => {
    if (!hasResetPassword()) {
      const confirmation = document.querySelector('#resetLearningPasswordConfirm')?.value || '';
      if (!String(password).length) {
        showPasswordError('Password cannot be empty.');
        return false;
      }
      if (password !== confirmation) {
        showPasswordError('The two passwords do not match.');
        return false;
      }
      const stored = await setResetPassword(password);
      if (!stored) showPasswordError('This browser could not store the password.');
      return stored;
    }
    const valid = await verifyDeviceResetPassword(password);
    if (!valid) showPasswordError('Incorrect password for this browser.');
    return valid;
  };

  function ensurePasswordConfirmationField() {
    if (!resetDialog || document.querySelector('#resetLearningConfirmField')) return;
    const passwordLabel = document.querySelector('#resetLearningPassword')?.closest('label');
    if (!passwordLabel) return;
    const label = document.createElement('label');
    label.id = 'resetLearningConfirmField';
    label.className = 'password-field';
    label.hidden = true;
    label.innerHTML = '<span>Confirm password</span><input id="resetLearningPasswordConfirm" type="password" autocomplete="new-password">';
    passwordLabel.insertAdjacentElement('afterend', label);
  }

  function configureResetDialog() {
    if (!resetDialog) return;
    ensurePasswordConfirmationField();
    const protectedAlready = hasResetPassword();
    const title = resetDialog.querySelector('h2');
    const stats = document.querySelector('#resetLearningStats');
    const password = document.querySelector('#resetLearningPassword');
    const confirmField = document.querySelector('#resetLearningConfirmField');
    const confirmation = document.querySelector('#resetLearningPasswordConfirm');
    const submit = resetDialog.querySelector('button[type="submit"]');
    if (title) title.textContent = protectedAlready ? 'Reset CPU+ learning?' : 'Create a reset password';
    if (stats) {
      const cleanStats = stats.textContent.replace(/^Create a password for this browser, then reset the local learning data\.\s*/i, '');
      stats.textContent = protectedAlready
        ? cleanStats
        : `Create a password for this browser, then reset the local learning data. ${cleanStats}`;
    }
    if (password) password.autocomplete = protectedAlready ? 'current-password' : 'new-password';
    if (confirmField) confirmField.hidden = protectedAlready;
    if (confirmation) {
      confirmation.required = !protectedAlready;
      if (protectedAlready) confirmation.value = '';
    }
    if (submit) submit.textContent = protectedAlready ? 'Reset local data' : 'Create password and reset';
  }

  ensurePasswordConfirmationField();
  resetButton?.addEventListener('click', () => window.setTimeout(configureResetDialog, 0));
  if (resetDialog) {
    new MutationObserver(() => {
      if (resetDialog.open) configureResetDialog();
    }).observe(resetDialog, { attributes: true, attributeFilter: ['open'] });
  }

  function wrapSimulation(api, name) {
    if (!api || typeof api[name] !== 'function' || api[name].__exitStrategyWrapped) return;
    const original = api[name];
    const wrapped = function (...args) {
      simulationDepth += 1;
      try {
        return original.apply(this, args);
      } finally {
        simulationDepth -= 1;
      }
    };
    wrapped.__exitStrategyWrapped = true;
    api[name] = wrapped;
  }

  wrapSimulation(CPU1, 'chooseMove');
  wrapSimulation(CPU1, 'rankMoves');
  wrapSimulation(CPU1, 'analyzeMove');
  wrapSimulation(CPU3, 'chooseMove');
  wrapSimulation(CPU3, 'searchMove');
  wrapSimulation(CPUPlus, 'immediateWinningMoves');
  wrapSimulation(CPUPlus, 'searchMove');

  function isPlayVisible() {
    return !boardFrame.hidden && !sidePanel.hidden && phaseCard.textContent.includes('CURRENT TURN');
  }

  if (!Game.applyMove.__exitStrategyWrapped) {
    const originalApplyMove = Game.applyMove;
    const wrappedApplyMove = function (pieces, move) {
      const outcome = originalApplyMove.call(this, pieces, move);
      if (simulationDepth === 0 && isPlayVisible()) {
        window.dispatchEvent(new CustomEvent('exit-strategy:last-move', {
          detail: {
            from: outcome.from,
            to: outcome.exits ? 'D4' : outcome.to,
            pieceId: move.pieceId
          }
        }));
      }
      return outcome;
    };
    wrappedApplyMove.__exitStrategyWrapped = true;
    Game.applyMove = wrappedApplyMove;
  }

  const NativeWorker = window.Worker;
  if (typeof NativeWorker === 'function') {
    class WorkerBridge {
      constructor(url, options) {
        this.requestedUrl = String(url);
        const actualUrl = this.requestedUrl.includes('cpuplus-worker.js')
          ? this.requestedUrl.replace('cpuplus-worker.js', 'cpuplus-worker-v2.js')
          : url;
        this.nativeWorker = new NativeWorker(actualUrl, options);
        this.messageHandler = null;
        this.errorHandler = null;
        this.nativeWorker.addEventListener('message', (event) => {
          if (this.requestedUrl.includes('cpuplus-worker') && event.data?.kind === 'progress') {
            window.dispatchEvent(new CustomEvent('exit-strategy:cpuplus-progress', {
              detail: event.data.progress || null
            }));
            return;
          }
          if (typeof this.messageHandler === 'function') this.messageHandler.call(this, event);
        });
        this.nativeWorker.addEventListener('error', (event) => {
          if (typeof this.errorHandler === 'function') this.errorHandler.call(this, event);
        });
      }

      postMessage(message, transfer) {
        if (this.requestedUrl.includes('cpuplus-worker') && message?.kind === 'move') {
          cpuPlusProgress = null;
          updateDepthDisplay();
        }
        if (transfer === undefined) this.nativeWorker.postMessage(message);
        else this.nativeWorker.postMessage(message, transfer);
      }

      terminate() {
        this.nativeWorker.terminate();
      }

      addEventListener(...args) {
        this.nativeWorker.addEventListener(...args);
      }

      removeEventListener(...args) {
        this.nativeWorker.removeEventListener(...args);
      }

      dispatchEvent(...args) {
        return this.nativeWorker.dispatchEvent(...args);
      }

      set onmessage(handler) {
        this.messageHandler = handler;
      }

      get onmessage() {
        return this.messageHandler;
      }

      set onerror(handler) {
        this.errorHandler = handler;
      }

      get onerror() {
        return this.errorHandler;
      }
    }
    window.Worker = WorkerBridge;
  }

  function depthText(progress) {
    if (!progress) return '';
    if (!progress.completedDepth) return `Searching depth ${progress.searchingDepth || 1}…`;
    if (!progress.searchingDepth) return `Depth ${progress.completedDepth} completed.`;
    return `Depth ${progress.completedDepth} completed — searching depth ${progress.searchingDepth}.`;
  }

  function updateDepthDisplay() {
    const cpuPlusTurn = phaseCard.textContent.includes('CPU+ is deepening its search');
    const existing = phaseCard.querySelector('.cpuplus-depth-status');
    if (!cpuPlusTurn || !cpuPlusProgress) {
      if (existing) existing.remove();
      return;
    }
    const text = depthText(cpuPlusProgress);
    if (!text) return;
    const node = existing || document.createElement('small');
    node.className = 'cpuplus-depth-status';
    if (node.textContent !== text) node.textContent = text;
    if (!existing) phaseCard.appendChild(node);
  }

  window.addEventListener('exit-strategy:cpuplus-progress', (event) => {
    cpuPlusProgress = event.detail || null;
    updateDepthDisplay();
  });

  new MutationObserver(updateDepthDisplay).observe(phaseCard, {
    childList: true,
    subtree: true,
    characterData: true
  });

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElementNS(SVG_NS, 'svg');
    overlay.classList.add('last-move-layer');
    overlay.setAttribute('viewBox', '0 0 7 7');
    overlay.setAttribute('preserveAspectRatio', 'none');
    overlay.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS(SVG_NS, 'defs');
    const marker = document.createElementNS(SVG_NS, 'marker');
    marker.setAttribute('id', 'last-move-arrowhead');
    marker.setAttribute('markerWidth', '0.48');
    marker.setAttribute('markerHeight', '0.48');
    marker.setAttribute('refX', '0.42');
    marker.setAttribute('refY', '0.24');
    marker.setAttribute('orient', 'auto');
    marker.setAttribute('markerUnits', 'userSpaceOnUse');
    marker.setAttribute('viewBox', '0 0 0.48 0.48');

    const arrowHead = document.createElementNS(SVG_NS, 'path');
    arrowHead.setAttribute('d', 'M 0 0 L 0.48 0.24 L 0 0.48 Z');
    arrowHead.setAttribute('class', 'last-move-arrowhead');
    marker.appendChild(arrowHead);
    defs.appendChild(marker);

    shadowLine = document.createElementNS(SVG_NS, 'line');
    shadowLine.setAttribute('class', 'last-move-arrow-shadow');
    mainLine = document.createElementNS(SVG_NS, 'line');
    mainLine.setAttribute('class', 'last-move-arrow');
    mainLine.setAttribute('marker-end', 'url(#last-move-arrowhead)');
    overlay.append(defs, shadowLine, mainLine);
    board.appendChild(overlay);
    return overlay;
  }

  function coordCenter(coord) {
    return {
      x: coord.charCodeAt(0) - 64 - 0.5,
      y: Number(coord.slice(1)) - 0.5
    };
  }

  function shortenedSegment(from, to) {
    const start = coordCenter(from);
    const end = coordCenter(to);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (!length) return null;
    const ux = dx / length;
    const uy = dy / length;
    const startInset = Math.min(0.18, length * 0.18);
    const endInset = Math.min(0.30, length * 0.30);
    return {
      x1: start.x + ux * startInset,
      y1: start.y + uy * startInset,
      x2: end.x - ux * endInset,
      y2: end.y - uy * endInset
    };
  }

  function setLineCoordinates(line, segment) {
    line.setAttribute('x1', segment.x1);
    line.setAttribute('y1', segment.y1);
    line.setAttribute('x2', segment.x2);
    line.setAttribute('y2', segment.y2);
  }

  function clearPieceHighlight() {
    board.querySelectorAll('.piece.last-moved-piece').forEach((piece) => {
      piece.classList.remove('last-moved-piece');
    });
  }

  function resetLastMove() {
    lastMove = null;
    clearPieceHighlight();
    if (overlay) overlay.remove();
    overlay = null;
    shadowLine = null;
    mainLine = null;
  }

  function drawLastMove() {
    clearPieceHighlight();
    if (!lastMove || !isPlayVisible()) {
      if (overlay) overlay.hidden = true;
      return;
    }
    const segment = shortenedSegment(lastMove.from, lastMove.to);
    if (!segment) {
      resetLastMove();
      return;
    }
    createOverlay();
    setLineCoordinates(shadowLine, segment);
    setLineCoordinates(mainLine, segment);
    overlay.hidden = false;
    const destinationCell = board.querySelector(`.cell[data-coord="${lastMove.to}"]`);
    const movedPiece = destinationCell?.querySelector('.piece');
    if (movedPiece) movedPiece.classList.add('last-moved-piece');
  }

  function queueDraw() {
    if (drawQueued) return;
    drawQueued = true;
    window.requestAnimationFrame(() => {
      drawQueued = false;
      drawLastMove();
    });
  }

  window.addEventListener('exit-strategy:last-move', (event) => {
    const detail = event.detail || {};
    if (!/^[A-G][1-7]$/.test(detail.from || '') || !/^[A-G][1-7]$/.test(detail.to || '')) return;
    lastMove = { from: detail.from, to: detail.to, pieceId: detail.pieceId || null };
    queueDraw();
  });

  window.addEventListener('exit-strategy:reset-last-move', resetLastMove);

  new MutationObserver(queueDraw).observe(board, { childList: true, subtree: true });
  new MutationObserver(() => {
    if (!isPlayVisible()) resetLastMove();
    else queueDraw();
  }).observe(phaseCard, { childList: true, subtree: true, characterData: true });
  new MutationObserver(() => {
    if (!isPlayVisible()) resetLastMove();
    else queueDraw();
  }).observe(sidePanel, { attributes: true, attributeFilter: ['hidden'] });

  resetLastMove();
})();