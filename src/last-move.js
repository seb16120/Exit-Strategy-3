(() => {
  'use strict';

  const board = document.querySelector('#board');
  const history = document.querySelector('#history');
  const sidePanel = document.querySelector('#sidePanel');
  if (!board || !history || !sidePanel) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const EXIT_COORD = 'D4';
  const MOVE_PATTERN = /:\s*([A-G][1-7])\s*(?:→|×)\s*(EXIT|[A-G][1-7])/;

  let lastMove = null;
  let drawQueued = false;

  const overlay = document.createElementNS(SVG_NS, 'svg');
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

  const shadowLine = document.createElementNS(SVG_NS, 'line');
  shadowLine.setAttribute('class', 'last-move-arrow-shadow');
  const mainLine = document.createElementNS(SVG_NS, 'line');
  mainLine.setAttribute('class', 'last-move-arrow');
  mainLine.setAttribute('marker-end', 'url(#last-move-arrowhead)');

  overlay.append(defs, shadowLine, mainLine);
  board.appendChild(overlay);

  function coordCenter(coord) {
    return {
      x: coord.charCodeAt(0) - 64 - 0.5,
      y: Number(coord.slice(1)) - 0.5
    };
  }

  function readLatestMove() {
    const entries = Array.from(history.querySelectorAll('li')).reverse();
    for (const entry of entries) {
      const match = entry.textContent.match(MOVE_PATTERN);
      if (!match) continue;
      return {
        from: match[1],
        to: match[2] === 'EXIT' ? EXIT_COORD : match[2]
      };
    }
    return null;
  }

  function setLineCoordinates(line, segment) {
    line.setAttribute('x1', segment.x1);
    line.setAttribute('y1', segment.y1);
    line.setAttribute('x2', segment.x2);
    line.setAttribute('y2', segment.y2);
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

  function drawLastMove() {
    board.querySelectorAll('.piece.last-moved-piece').forEach((piece) => {
      piece.classList.remove('last-moved-piece');
    });

    if (sidePanel.hidden || !lastMove) {
      overlay.hidden = true;
      return;
    }

    const segment = shortenedSegment(lastMove.from, lastMove.to);
    if (!segment) {
      overlay.hidden = true;
      return;
    }

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

  const historyObserver = new MutationObserver(() => {
    lastMove = readLatestMove();
    queueDraw();
  });
  historyObserver.observe(history, { childList: true });

  const boardObserver = new MutationObserver(queueDraw);
  boardObserver.observe(board, { childList: true, subtree: true });

  lastMove = readLatestMove();
  drawLastMove();
})();
