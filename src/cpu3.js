(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExitStrategyCPU3 = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const WIN_SCORE = 100000000;
  const DEFAULT_MAX_DEPTH = 3;
  const DEFAULT_MAX_TIME_MS = 45000;

  class SearchTimeout extends Error {
    constructor() {
      super('CPU3 search time limit reached.');
      this.name = 'SearchTimeout';
    }
  }

  function clonePieces(pieces) {
    return pieces.map((piece) => ({ ...piece }));
  }

  function shuffle(values, random = Math.random) {
    const copy = values.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function combinations(values, count, start = 0, prefix = [], output = []) {
    if (prefix.length === count) {
      output.push(prefix.slice());
      return output;
    }
    for (let index = start; index <= values.length - (count - prefix.length); index += 1) {
      prefix.push(values[index]);
      combinations(values, count, index + 1, prefix, output);
      prefix.pop();
    }
    return output;
  }

  function manhattan(Game, from, to) {
    const a = Game.coordToIndex(from);
    const b = Game.coordToIndex(to);
    if (!a || !b) return 99;
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
  }

  function pawnProgress(Game, owner, pieces) {
    return pieces
      .filter((piece) => piece.owner === owner && piece.type === 'pawn' && piece.status === 'board')
      .reduce((total, pawn) => total + (8 - manhattan(Game, pawn.position, Game.EXIT)), 0);
  }

  function hunterPressure(Game, owner, pieces) {
    const hunter = pieces.find((piece) => piece.owner === owner && piece.type === 'hunter' && piece.status === 'board');
    if (!hunter) return 0;
    const opponent = Game.otherOwner(owner);
    const enemyPawns = pieces.filter((piece) => piece.owner === opponent && piece.type === 'pawn' && piece.status === 'board');
    if (enemyPawns.length === 0) return 0;
    const closest = Math.min(...enemyPawns.map((pawn) => manhattan(Game, hunter.position, pawn.position)));
    return Math.max(0, 9 - closest);
  }

  function evaluatePosition(Game, owner, pieces) {
    const opponent = Game.otherOwner(owner);
    const win = Game.winner(pieces);
    if (win) return win.owner === owner ? WIN_SCORE : -WIN_SCORE;

    const ownMoves = Game.allLegalMoves(owner, pieces);
    const opponentMoves = Game.allLegalMoves(opponent, pieces);
    const ownEscapes = Game.escapedCount(owner, pieces);
    const opponentEscapes = Game.escapedCount(opponent, pieces);
    const ownCaptures = Game.captureCount(owner, pieces);
    const opponentCaptures = Game.captureCount(opponent, pieces);

    let score = 0;
    score += (ownEscapes - opponentEscapes) * 120000;
    score += (ownCaptures - opponentCaptures) * 90000;
    score += (ownMoves.length - opponentMoves.length) * 55;
    score += (ownMoves.filter((move) => move.exits).length - opponentMoves.filter((move) => move.exits).length) * 9000;
    score += (ownMoves.filter((move) => move.captureId).length - opponentMoves.filter((move) => move.captureId).length) * 7000;
    score += (pawnProgress(Game, owner, pieces) - pawnProgress(Game, opponent, pieces)) * 140;
    score += (hunterPressure(Game, owner, pieces) - hunterPressure(Game, opponent, pieces)) * 180;
    return score;
  }

  function moveOrderingScore(Game, rootOwner, currentOwner, pieces, move) {
    const next = clonePieces(pieces);
    Game.applyMove(next, move);
    const win = Game.winner(next);
    let score = evaluatePosition(Game, rootOwner, next);
    if (win) score += win.owner === rootOwner ? WIN_SCORE : -WIN_SCORE;
    if (move.exits) score += currentOwner === rootOwner ? 500000 : -500000;
    if (move.captureId) score += currentOwner === rootOwner ? 350000 : -350000;
    return score;
  }

  function orderedMoves(Game, rootOwner, currentOwner, pieces) {
    const moves = Game.allLegalMoves(currentOwner, pieces);
    const maximizing = currentOwner === rootOwner;
    return moves
      .map((move) => ({ move, order: moveOrderingScore(Game, rootOwner, currentOwner, pieces, move) }))
      .sort((a, b) => maximizing ? b.order - a.order : a.order - b.order)
      .map((entry) => entry.move);
  }

  function terminalScore(Game, rootOwner, pieces, depth) {
    const win = Game.winner(pieces);
    if (!win) return null;
    return win.owner === rootOwner ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }

  function minimax(Game, rootOwner, currentOwner, pieces, depth, alpha, beta, passCount, context) {
    context.nodes += 1;
    if ((context.nodes & 127) === 0 && Date.now() >= context.deadline) throw new SearchTimeout();

    const terminal = terminalScore(Game, rootOwner, pieces, depth);
    if (terminal !== null) return terminal;
    if (depth <= 0) return evaluatePosition(Game, rootOwner, pieces);

    const cacheKey = `${depth}|${passCount}|${Game.serializePosition(pieces, currentOwner)}`;
    if (context.cache.has(cacheKey)) return context.cache.get(cacheKey);

    const moves = orderedMoves(Game, rootOwner, currentOwner, pieces);
    if (moves.length === 0) {
      if (passCount >= 1) return 0;
      const value = minimax(
        Game,
        rootOwner,
        Game.otherOwner(currentOwner),
        pieces,
        depth - 1,
        alpha,
        beta,
        passCount + 1,
        context
      );
      context.cache.set(cacheKey, value);
      return value;
    }

    const maximizing = currentOwner === rootOwner;
    let best = maximizing ? -Infinity : Infinity;
    let cutOff = false;
    for (const move of moves) {
      if (Date.now() >= context.deadline) throw new SearchTimeout();
      const next = clonePieces(pieces);
      Game.applyMove(next, move);
      const value = minimax(
        Game,
        rootOwner,
        Game.otherOwner(currentOwner),
        next,
        depth - 1,
        alpha,
        beta,
        0,
        context
      );

      if (maximizing) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, best);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, best);
      }
      if (beta <= alpha) {
        cutOff = true;
        break;
      }
    }

    if (!cutOff) context.cache.set(cacheKey, best);
    return best;
  }

  function searchDepth(Game, owner, pieces, depth, context, random) {
    const moves = orderedMoves(Game, owner, owner, pieces);
    if (moves.length === 0) return { move: null, score: 0 };

    let bestScore = -Infinity;
    let bestMoves = [];
    let alpha = -Infinity;

    for (const move of moves) {
      if (Date.now() >= context.deadline) throw new SearchTimeout();
      const next = clonePieces(pieces);
      Game.applyMove(next, move);
      const score = minimax(
        Game,
        owner,
        Game.otherOwner(owner),
        next,
        depth - 1,
        alpha,
        Infinity,
        0,
        context
      );

      if (score > bestScore) {
        bestScore = score;
        bestMoves = [move];
      } else if (score === bestScore) {
        bestMoves.push(move);
      }
      alpha = Math.max(alpha, bestScore);
    }

    return {
      move: bestMoves[Math.floor(random() * bestMoves.length)],
      score: bestScore
    };
  }

  function searchMove(Game, owner, pieces, options = {}) {
    const maxDepth = Math.max(1, Math.min(12, options.maxDepth || DEFAULT_MAX_DEPTH));
    const maxTimeMs = Math.max(10, Math.min(DEFAULT_MAX_TIME_MS, options.maxTimeMs || DEFAULT_MAX_TIME_MS));
    const random = options.random || Math.random;
    const startedAt = Date.now();
    const context = {
      deadline: startedAt + maxTimeMs,
      cache: new Map(),
      nodes: 0
    };

    const legalMoves = orderedMoves(Game, owner, owner, pieces);
    if (legalMoves.length === 0) {
      return { move: null, completedDepth: 0, nodes: 0, elapsedMs: Date.now() - startedAt, timedOut: false };
    }

    let best = { move: legalMoves[0], score: -Infinity };
    let completedDepth = 0;
    let timedOut = false;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      context.cache.clear();
      try {
        const result = searchDepth(Game, owner, pieces, depth, context, random);
        if (result.move) best = result;
        completedDepth = depth;
      } catch (error) {
        if (!(error instanceof SearchTimeout)) throw error;
        timedOut = true;
        break;
      }
    }

    return {
      move: best.move,
      score: best.score,
      completedDepth,
      nodes: context.nodes,
      elapsedMs: Date.now() - startedAt,
      timedOut
    };
  }

  function chooseMove(Game, owner, pieces, options = {}) {
    return searchMove(Game, owner, pieces, options).move;
  }

  function setupScore(Game, owner, pieces) {
    const own = pieces.filter((piece) => piece.owner === owner && piece.status === 'board');
    const pawns = own.filter((piece) => piece.type === 'pawn');
    const hunter = own.find((piece) => piece.type === 'hunter');
    const rows = new Set(pawns.map((piece) => Game.coordToIndex(piece.position).row));
    const cols = new Set(pawns.map((piece) => Game.coordToIndex(piece.position).col));
    const mobility = Game.allLegalMoves(owner, pieces).length;
    const progress = pawnProgress(Game, owner, pieces);
    const crowding = pawns.reduce((total, pawn, index) => {
      return total + pawns.slice(index + 1).filter((other) => {
        const a = Game.coordToIndex(pawn.position);
        const b = Game.coordToIndex(other.position);
        return a.row === b.row || a.col === b.col;
      }).length;
    }, 0);
    const hunterCentrality = hunter ? 10 - manhattan(Game, hunter.position, Game.EXIT) : 0;
    return mobility * 50 + progress * 20 + rows.size * 35 + cols.size * 35 + hunterCentrality * 18 - crowding * 22;
  }

  function createLogicalSetup(Game, owner, pieces, random = Math.random) {
    const ownPieces = pieces.filter((piece) => piece.owner === owner);
    const pawns = ownPieces.filter((piece) => piece.type === 'pawn').sort((a, b) => a.number - b.number);
    const hunter = ownPieces.find((piece) => piece.type === 'hunter');
    const hunterCells = Game.setupCells(owner, 'hunter');
    const pawnZone = Game.setupCells(owner, 'pawn');
    const candidates = [];

    for (const hunterCell of hunterCells) {
      const available = pawnZone.filter((coord) => coord !== hunterCell);
      for (const pawnCells of combinations(available, 5)) {
        const isolated = clonePieces(pieces).map((piece) => {
          if (piece.owner !== owner) return { ...piece, position: null, status: 'reserve' };
          return piece;
        });
        const isolatedHunter = isolated.find((piece) => piece.id === hunter.id);
        isolatedHunter.position = hunterCell;
        isolatedHunter.status = 'board';
        const isolatedPawns = isolated.filter((piece) => piece.owner === owner && piece.type === 'pawn').sort((a, b) => a.number - b.number);
        isolatedPawns.forEach((pawn, index) => {
          pawn.assigned = true;
          pawn.position = pawnCells[index];
          pawn.status = 'board';
        });
        candidates.push({
          hunterCell,
          pawnCells,
          score: setupScore(Game, owner, isolated) + random() * 0.001
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const pool = candidates.slice(0, Math.min(12, candidates.length));
    const selected = pool[Math.floor(random() * pool.length)];

    ownPieces.forEach((piece) => {
      piece.position = null;
      piece.status = 'reserve';
      if (piece.type === 'pawn') piece.assigned = false;
    });
    hunter.position = selected.hunterCell;
    hunter.status = 'board';
    pawns.forEach((pawn, index) => {
      pawn.assigned = true;
      pawn.position = selected.pawnCells[index];
      pawn.status = 'board';
    });

    return Game.validateSetup(owner, pieces);
  }

  return {
    WIN_SCORE,
    SearchTimeout,
    clonePieces,
    evaluatePosition,
    searchMove,
    chooseMove,
    createLogicalSetup,
    setupScore
  };
});
