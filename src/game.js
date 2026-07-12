(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExitStrategyGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  const ROWS = [1, 2, 3, 4, 5, 6, 7];
  const EXIT = 'D4';
  const MISSING = new Set([
    'A1', 'E1', 'F1', 'G1',
    'G2', 'G3',
    'A5', 'A6',
    'A7', 'B7', 'C7', 'G7'
  ]);

  const PAWN_ZONES = {
    cyan: new Set(['B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3', 'C3', 'B5', 'C5', 'B6', 'C6']),
    magenta: new Set(['E2', 'F2', 'E3', 'F3', 'E5', 'F5', 'G5', 'E6', 'F6', 'G6', 'E7', 'F7'])
  };

  const HUNTER_ZONES = {
    cyan: new Set(['A2', 'A3', 'A4']),
    magenta: new Set(['G4', 'G5', 'G6'])
  };

  const DIRECTIONS = [
    { dr: -1, dc: 0, name: 'up' },
    { dr: 1, dc: 0, name: 'down' },
    { dr: 0, dc: -1, name: 'left' },
    { dr: 0, dc: 1, name: 'right' }
  ];

  function coordToIndex(coord) {
    if (typeof coord !== 'string' || coord.length < 2) return null;
    const col = COLUMNS.indexOf(coord[0].toUpperCase());
    const row = Number(coord.slice(1)) - 1;
    if (col < 0 || row < 0 || row >= ROWS.length) return null;
    return { row, col };
  }

  function indexToCoord(row, col) {
    if (row < 0 || row >= ROWS.length || col < 0 || col >= COLUMNS.length) return null;
    return `${COLUMNS[col]}${row + 1}`;
  }

  function isPlayable(coord) {
    const index = coordToIndex(coord);
    return Boolean(index) && !MISSING.has(coord.toUpperCase());
  }

  function otherOwner(owner) {
    return owner === 'cyan' ? 'magenta' : 'cyan';
  }

  function createPieces() {
    const pieces = [];
    for (const owner of ['cyan', 'magenta']) {
      for (let number = 1; number <= 5; number += 1) {
        pieces.push({
          id: `${owner}-pawn-${number}`,
          owner,
          type: 'pawn',
          number,
          assigned: false,
          position: null,
          status: 'reserve'
        });
      }
      pieces.push({
        id: `${owner}-hunter`,
        owner,
        type: 'hunter',
        number: null,
        assigned: true,
        position: null,
        status: 'reserve'
      });
    }
    return pieces;
  }

  function pieceAt(pieces, coord) {
    return pieces.find((piece) => piece.status === 'board' && piece.position === coord) || null;
  }

  function getPiece(pieces, pieceId) {
    return pieces.find((piece) => piece.id === pieceId) || null;
  }

  function placementZone(piece) {
    return piece.type === 'hunter' ? HUNTER_ZONES[piece.owner] : PAWN_ZONES[piece.owner];
  }

  function canPlace(piece, coord, pieces) {
    if (!piece || !isPlayable(coord) || coord === EXIT) return false;
    if (!placementZone(piece).has(coord)) return false;
    const occupant = pieceAt(pieces, coord);
    return !occupant || occupant.id === piece.id;
  }

  function validateSetup(owner, pieces) {
    const ownPieces = pieces.filter((piece) => piece.owner === owner);
    const pawns = ownPieces.filter((piece) => piece.type === 'pawn');
    const hunter = ownPieces.find((piece) => piece.type === 'hunter');
    return pawns.every((piece) => piece.assigned && piece.status === 'board' && PAWN_ZONES[owner].has(piece.position)) &&
      hunter && hunter.status === 'board' && HUNTER_ZONES[owner].has(hunter.position) &&
      new Set(ownPieces.map((piece) => piece.position)).size === ownPieces.length;
  }

  function legalMovesForPiece(piece, pieces) {
    if (!piece || piece.status !== 'board') return [];
    return piece.type === 'hunter'
      ? legalHunterMoves(piece, pieces)
      : legalPawnMoves(piece, pieces);
  }

  function legalHunterMoves(piece, pieces) {
    const origin = coordToIndex(piece.position);
    const moves = [];
    for (const direction of DIRECTIONS) {
      const destination = indexToCoord(origin.row + direction.dr, origin.col + direction.dc);
      if (!destination || !isPlayable(destination) || destination === EXIT) continue;
      const occupant = pieceAt(pieces, destination);
      if (!occupant) {
        moves.push({ pieceId: piece.id, from: piece.position, to: destination, direction: direction.name, captureId: null, exits: false });
        continue;
      }
      if (occupant.owner !== piece.owner && occupant.type === 'pawn') {
        moves.push({ pieceId: piece.id, from: piece.position, to: destination, direction: direction.name, captureId: occupant.id, exits: false });
      }
    }
    return moves;
  }

  function legalPawnMoves(piece, pieces) {
    const origin = coordToIndex(piece.position);
    const moves = [];
    for (const direction of DIRECTIONS) {
      let row = origin.row + direction.dr;
      let col = origin.col + direction.dc;
      let lastEmpty = null;

      while (true) {
        const coord = indexToCoord(row, col);
        if (!coord || !isPlayable(coord) || pieceAt(pieces, coord)) break;
        lastEmpty = coord;
        row += direction.dr;
        col += direction.dc;
      }

      if (lastEmpty) {
        moves.push({
          pieceId: piece.id,
          from: piece.position,
          to: lastEmpty,
          direction: direction.name,
          captureId: null,
          exits: lastEmpty === EXIT
        });
      }
    }
    return moves;
  }

  function allLegalMoves(owner, pieces) {
    return pieces
      .filter((piece) => piece.owner === owner && piece.status === 'board')
      .flatMap((piece) => legalMovesForPiece(piece, pieces));
  }

  function applyMove(pieces, requestedMove) {
    const piece = getPiece(pieces, requestedMove.pieceId);
    if (!piece) throw new Error('Unknown piece.');
    const move = legalMovesForPiece(piece, pieces).find((candidate) => candidate.to === requestedMove.to);
    if (!move) throw new Error('Illegal move.');

    let captured = null;
    if (move.captureId) {
      captured = getPiece(pieces, move.captureId);
      captured.position = null;
      captured.status = 'captured';
    }

    if (move.exits) {
      piece.position = null;
      piece.status = 'escaped';
    } else {
      piece.position = move.to;
    }

    return { ...move, captured };
  }

  function escapedCount(owner, pieces) {
    return pieces.filter((piece) => piece.owner === owner && piece.type === 'pawn' && piece.status === 'escaped').length;
  }

  function captureCount(owner, pieces) {
    const opponent = otherOwner(owner);
    return pieces.filter((piece) => piece.owner === opponent && piece.type === 'pawn' && piece.status === 'captured').length;
  }

  function winner(pieces) {
    for (const owner of ['cyan', 'magenta']) {
      if (escapedCount(owner, pieces) >= 2) return { owner, reason: 'escape' };
      if (captureCount(owner, pieces) >= 3) return { owner, reason: 'capture' };
    }
    return null;
  }

  function serializePosition(pieces, currentOwner) {
    const compactPieces = pieces
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((piece) => `${piece.id}:${piece.status}:${piece.position || '-'}`)
      .join('|');
    return `${currentOwner}::${compactPieces}`;
  }

  function setupCells(owner, pieceType) {
    return Array.from(pieceType === 'hunter' ? HUNTER_ZONES[owner] : PAWN_ZONES[owner]);
  }

  function playableCells() {
    const cells = [];
    for (const row of ROWS) {
      for (const col of COLUMNS) {
        const coord = `${col}${row}`;
        if (isPlayable(coord)) cells.push(coord);
      }
    }
    return cells;
  }

  return {
    COLUMNS,
    ROWS,
    EXIT,
    MISSING,
    PAWN_ZONES,
    HUNTER_ZONES,
    DIRECTIONS,
    coordToIndex,
    indexToCoord,
    isPlayable,
    otherOwner,
    createPieces,
    pieceAt,
    getPiece,
    canPlace,
    validateSetup,
    legalMovesForPiece,
    allLegalMoves,
    applyMove,
    escapedCount,
    captureCount,
    winner,
    serializePosition,
    setupCells,
    playableCells
  };
});
