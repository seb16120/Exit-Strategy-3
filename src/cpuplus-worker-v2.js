'use strict';

importScripts('game.js', 'cpu3.js', 'cpuplus.js');

const Game = self.ExitStrategyGame;
const CPU3 = self.ExitStrategyCPU3;
const CPUPlus = self.ExitStrategyCPUPlus;
const WIN_SCORE = 100000000;

class SearchTimeout extends Error {}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function clonePieces(pieces) {
  return pieces.map((piece) => ({ ...piece }));
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

function shuffle(values, random = Math.random) {
  const copy = values.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function clearAllPieces(pieces) {
  pieces.forEach((piece) => {
    piece.position = null;
    piece.status = 'reserve';
    if (piece.type === 'pawn') piece.assigned = false;
  });
}

function candidateKey(owner, hunterCell, pawnCells) {
  const role = owner === 'cyan' ? 'first' : 'second';
  const hunter = CPUPlus.normalizedCoord(owner, hunterCell);
  const pawns = pawnCells.map((coord) => CPUPlus.normalizedCoord(owner, coord)).sort();
  return `${role}|H:${hunter}|P:${pawns.join(',')}`;
}

function placementStat(database, key) {
  return database.placements[key] || {
    weightedScore: 0,
    weightedGames: 0,
    rawGames: 0,
    wins: 0,
    draws: 0,
    losses: 0
  };
}

function candidateLearningBonus(database, key, totalWeightedGames) {
  const stat = placementStat(database, key);
  const smoothedRate = (stat.weightedScore + 2) / (stat.weightedGames + 4);
  const confidence = stat.weightedGames / (stat.weightedGames + 8);
  const exploitation = (smoothedRate - 0.5) * 4200 * confidence;
  const exploration = Math.sqrt(Math.log(totalWeightedGames + 2) / (stat.weightedGames + 1)) * 260;
  return exploitation + exploration;
}

function randomSetupDescriptor(owner, occupied, random) {
  const hunterCells = shuffle(Game.setupCells(owner, 'hunter').filter((coord) => !occupied.has(coord)), random);
  const hunterCell = hunterCells[0] || Game.setupCells(owner, 'hunter')[0];
  const pawnCells = shuffle(
    Game.setupCells(owner, 'pawn').filter((coord) => coord !== hunterCell && !occupied.has(coord)),
    random
  ).slice(0, 5);
  return { hunterCell, pawnCells };
}

function createLearnedSetup(owner, database, options = {}) {
  const pieces = Game.createPieces();
  return CPUPlus.createLearnedSetup(Game, owner, pieces, database, options);
}

function moveOrderingScore(rootOwner, currentOwner, pieces, move) {
  const next = clonePieces(pieces);
  Game.applyMove(next, move);
  const winner = Game.winner(next);
  let score = CPU3.evaluatePosition(Game, rootOwner, next);
  if (winner) score += winner.owner === rootOwner ? WIN_SCORE : -WIN_SCORE;
  if (move.exits) score += currentOwner === rootOwner ? 500000 : -500000;
  if (move.captureId) score += currentOwner === rootOwner ? 350000 : -350000;
  return score;
}

function orderedMoves(rootOwner, currentOwner, pieces) {
  const maximizing = currentOwner === rootOwner;
  return Game.allLegalMoves(currentOwner, pieces)
    .map((move) => ({ move, score: moveOrderingScore(rootOwner, currentOwner, pieces, move) }))
    .sort((a, b) => maximizing ? b.score - a.score : a.score - b.score)
    .map((entry) => entry.move);
}

function terminalScore(rootOwner, pieces, depth) {
  const winner = Game.winner(pieces);
  if (!winner) return null;
  return winner.owner === rootOwner ? WIN_SCORE + depth : -WIN_SCORE - depth;
}

function minimax(rootOwner, currentOwner, pieces, depth, alpha, beta, passCount, context) {
  context.nodes += 1;
  if ((context.nodes & 127) === 0 && Date.now() >= context.deadline) throw new SearchTimeout();
  const terminal = terminalScore(rootOwner, pieces, depth);
  if (terminal !== null) return terminal;
  if (depth <= 0) return CPU3.evaluatePosition(Game, rootOwner, pieces);

  const key = `${depth}|${passCount}|${Game.serializePosition(pieces, currentOwner)}`;
  const cached = context.cache.get(key);
  if (cached !== undefined) return cached;
  const moves = orderedMoves(rootOwner, currentOwner, pieces);
  if (moves.length === 0) {
    context.bestMoveCache.set(key, { pass: true, owner: currentOwner });
    if (passCount >= 1) return 0;
    const value = minimax(
      rootOwner,
      Game.otherOwner(currentOwner),
      pieces,
      depth - 1,
      alpha,
      beta,
      passCount + 1,
      context
    );
    context.cache.set(key, value);
    return value;
  }

  const maximizing = currentOwner === rootOwner;
  let best = maximizing ? -Infinity : Infinity;
  let bestMove = null;
  let complete = true;
  for (const move of moves) {
    if (Date.now() >= context.deadline) throw new SearchTimeout();
    const next = clonePieces(pieces);
    Game.applyMove(next, move);
    const value = minimax(
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
      if (value > best) {
        best = value;
        bestMove = move;
      }
      alpha = Math.max(alpha, best);
    } else {
      if (value < best) {
        best = value;
        bestMove = move;
      }
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) {
      complete = false;
      break;
    }
  }
  if (bestMove) context.bestMoveCache.set(key, { ...bestMove, owner: currentOwner });
  if (complete) context.cache.set(key, best);
  return best;
}

function buildPrincipalVariation(rootOwner, pieces, depth, rootMove, context) {
  if (!rootMove || depth <= 0) return [];
  const position = clonePieces(pieces);
  const line = [];
  let currentOwner = rootOwner;
  let remaining = depth;
  let passCount = 0;
  let action = { ...rootMove, owner: rootOwner };

  while (remaining > 0 && action) {
    if (action.pass) {
      line.push({ pass: true, owner: currentOwner });
      currentOwner = Game.otherOwner(currentOwner);
      passCount += 1;
      remaining -= 1;
    } else {
      line.push({ ...action, owner: currentOwner });
      Game.applyMove(position, action);
      currentOwner = Game.otherOwner(currentOwner);
      passCount = 0;
      remaining -= 1;
    }

    if (remaining <= 0 || Game.winner(position)) break;
    const key = `${remaining}|${passCount}|${Game.serializePosition(position, currentOwner)}`;
    const stored = context.bestMoveCache.get(key);
    action = stored ? { ...stored, owner: currentOwner } : null;
  }

  return line.slice(0, depth);
}

function searchDepth(owner, pieces, depth, context) {
  const moves = orderedMoves(owner, owner, pieces);
  let bestScore = -Infinity;
  let bestMoves = [];
  let alpha = -Infinity;
  for (const move of moves) {
    if (Date.now() >= context.deadline) throw new SearchTimeout();
    const next = clonePieces(pieces);
    Game.applyMove(next, move);
    const score = minimax(
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
  const move = bestMoves[0];
  return {
    move,
    score: bestScore,
    principalVariation: buildPrincipalVariation(owner, pieces, depth, move, context)
  };
}

function immediateWinningMoves(owner, pieces) {
  return Game.allLegalMoves(owner, pieces).filter((move) => {
    const next = clonePieces(pieces);
    Game.applyMove(next, move);
    const winner = Game.winner(next);
    return winner && winner.owner === owner;
  });
}

function moveSignature(move) {
  if (!move) return '';
  return [move.pieceId, move.from, move.to, move.captureId || '', move.exits ? 'exit' : 'board'].join('|');
}

function searchMove(owner, pieces, options = {}) {
  const maxDepth = Math.max(1, Math.min(CPUPlus.MAX_DEPTH || 64, options.maxDepth || 64));
  const maxTimeMs = Math.max(10, Math.min(CPUPlus.DEEP_HARD_MAX_MS || 300000, options.maxTimeMs || CPUPlus.MOVE_SEARCH_MS || 54000));
  const minDepth = Math.max(0, Math.min(maxDepth, options.minDepth || 0));
  const minTimeMs = Math.max(0, Math.min(maxTimeMs, options.minTimeMs || 0));
  const stableDepths = Math.max(1, options.stableDepths || CPUPlus.DEEP_STABLE_DEPTHS || 3);
  const stopWhenStable = Boolean(options.stopWhenStable);
  const startedAt = Date.now();
  const context = { deadline: startedAt + maxTimeMs, cache: new Map(), bestMoveCache: new Map(), nodes: 0 };
  const legalMoves = orderedMoves(owner, owner, pieces);
  if (!legalMoves.length) return { move: null, completedDepth: 0, nodes: 0, elapsedMs: 0, timedOut: false, stopReason: 'no-move' };

  const immediateWins = immediateWinningMoves(owner, pieces);
  if (legalMoves.length === 1 || immediateWins.length) {
    const choices = immediateWins.length ? immediateWins : legalMoves;
    return {
      move: choices[Math.floor(Math.random() * choices.length)],
      completedDepth: 0,
      nodes: 0,
      elapsedMs: Date.now() - startedAt,
      timedOut: false,
      stopReason: 'fast-path',
      fastPath: immediateWins.length ? 'win' : 'only-move'
    };
  }

  let best = { move: legalMoves[0], score: -Infinity, principalVariation: [] };
  let completedDepth = 0;
  let timedOut = false;
  let stableDepthCount = 0;
  let previousSignature = '';
  let stopReason = null;

  self.postMessage({
    ok: true,
    kind: 'progress',
    progress: {
      completedDepth: 0,
      searchingDepth: 1,
      nodes: 0,
      elapsedMs: 0,
      minDepth,
      minTimeMs,
      stableDepths,
      stopWhenStable
    }
  });

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    context.cache.clear();
    context.bestMoveCache.clear();
    try {
      const result = searchDepth(owner, pieces, depth, context);
      if (result.move) best = result;
      completedDepth = depth;
      const signature = moveSignature(result.move);
      stableDepthCount = signature && signature === previousSignature ? stableDepthCount + 1 : 1;
      previousSignature = signature;
      const elapsedMs = Date.now() - startedAt;
      const reachedMaxDepth = depth >= maxDepth;
      const stableReady = stopWhenStable
        && depth >= minDepth
        && elapsedMs >= minTimeMs
        && stableDepthCount >= stableDepths;
      if (reachedMaxDepth) stopReason = 'max-depth';
      else if (stableReady) stopReason = 'stable';
      self.postMessage({
        ok: true,
        kind: 'progress',
        progress: {
          completedDepth,
          searchingDepth: stopReason ? null : depth + 1,
          nodes: context.nodes,
          elapsedMs,
          principalVariation: result.principalVariation || [],
          minDepth,
          minTimeMs,
          stableDepths,
          stableDepthCount,
          stopWhenStable
        }
      });
      if (stopReason) break;
    } catch (error) {
      if (!(error instanceof SearchTimeout)) throw error;
      timedOut = true;
      stopReason = 'max-time';
      break;
    }
  }

  return {
    move: best.move,
    score: best.score,
    completedDepth,
    nodes: context.nodes,
    elapsedMs: Date.now() - startedAt,
    timedOut,
    principalVariation: best.principalVariation || [],
    stableDepthCount,
    stopReason,
    fastPath: null
  };
}

self.onmessage = (event) => {
  const payload = event.data || {};
  try {
    if (payload.kind === 'setup') {
      self.postMessage({
        ok: true,
        kind: 'setup',
        result: createLearnedSetup(payload.owner, payload.database, { analysisTimeMs: payload.analysisTimeMs })
      });
      return;
    }

    self.postMessage({
      ok: true,
      kind: 'move',
      result: searchMove(payload.owner, payload.pieces, {
        maxDepth: payload.maxDepth,
        maxTimeMs: payload.maxTimeMs,
        minDepth: payload.minDepth,
        minTimeMs: payload.minTimeMs,
        stableDepths: payload.stableDepths,
        stopWhenStable: payload.stopWhenStable
      })
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      kind: payload.kind || 'move',
      error: error && error.message ? error.message : String(error)
    });
  }
};