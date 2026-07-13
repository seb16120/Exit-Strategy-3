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
  const random = options.random || Math.random;
  const analysisTimeMs = Math.max(0, options.analysisTimeMs ?? CPUPlus.SETUP_ANALYSIS_MS ?? 5000);
  const startedAt = Date.now();
  const deadline = startedAt + analysisTimeMs;
  const cleanDatabase = CPUPlus.sanitizeDatabase(database);
  const totalWeightedGames = Object.values(cleanDatabase.placements)
    .reduce((total, stat) => total + stat.weightedGames, 0);
  const candidates = [];

  for (const hunterCell of Game.setupCells(owner, 'hunter')) {
    const available = Game.setupCells(owner, 'pawn').filter((coord) => coord !== hunterCell);
    for (const pawnCells of combinations(available, 5)) {
      const candidatePieces = Game.createPieces();
      clearAllPieces(candidatePieces);
      CPUPlus.applySetup(Game, owner, candidatePieces, { hunterCell, pawnCells });
      const key = candidateKey(owner, hunterCell, pawnCells);
      candidates.push({
        hunterCell,
        pawnCells,
        key,
        baseScore: CPU3.setupScore(Game, owner, candidatePieces),
        simulationTotal: 0,
        simulations: 0
      });
    }
  }

  candidates.sort((a, b) => {
    const aScore = a.baseScore + candidateLearningBonus(cleanDatabase, a.key, totalWeightedGames);
    const bScore = b.baseScore + candidateLearningBonus(cleanDatabase, b.key, totalWeightedGames);
    return bScore - aScore;
  });

  const simulationPool = candidates.slice(0, Math.min(240, candidates.length));
  let simulations = 0;
  let cursor = 0;
  while (Date.now() < deadline && simulationPool.length > 0) {
    const candidate = simulationPool[cursor % simulationPool.length];
    cursor += 1;
    const simulated = Game.createPieces();
    clearAllPieces(simulated);
    CPUPlus.applySetup(Game, owner, simulated, candidate);
    const occupied = new Set([candidate.hunterCell, ...candidate.pawnCells]);
    const opponent = Game.otherOwner(owner);
    const opponentSetup = randomSetupDescriptor(opponent, occupied, random);
    if (opponentSetup.pawnCells.length < 5) continue;
    CPUPlus.applySetup(Game, opponent, simulated, opponentSetup);
    const score = CPU3.evaluatePosition(Game, owner, simulated);
    candidate.simulationTotal += clamp(score, -200000, 200000);
    candidate.simulations += 1;
    simulations += 1;
  }

  candidates.forEach((candidate) => {
    const simulationAverage = candidate.simulations
      ? candidate.simulationTotal / candidate.simulations
      : 0;
    candidate.finalScore = candidate.baseScore
      + candidateLearningBonus(cleanDatabase, candidate.key, totalWeightedGames)
      + simulationAverage * 0.035
      + random() * 0.001;
  });
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  const pool = candidates.slice(0, Math.min(4, candidates.length));
  const selected = random() < 0.82 ? pool[0] : pool[Math.floor(random() * pool.length)];
  return {
    key: selected.key,
    hunterCell: selected.hunterCell,
    pawnCells: selected.pawnCells.slice(),
    score: selected.finalScore,
    candidates: candidates.length,
    simulations,
    elapsedMs: Date.now() - startedAt
  };
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
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) {
      complete = false;
      break;
    }
  }
  if (complete) context.cache.set(key, best);
  return best;
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
  return {
    move: bestMoves[Math.floor(Math.random() * bestMoves.length)],
    score: bestScore
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

function searchMove(owner, pieces, options = {}) {
  const maxDepth = Math.max(1, Math.min(CPUPlus.MAX_DEPTH || 64, options.maxDepth || 64));
  const maxTimeMs = Math.max(10, Math.min(CPUPlus.MOVE_SEARCH_MS || 54000, options.maxTimeMs || 54000));
  const startedAt = Date.now();
  const context = { deadline: startedAt + maxTimeMs, cache: new Map(), nodes: 0 };
  const legalMoves = orderedMoves(owner, owner, pieces);
  if (!legalMoves.length) return { move: null, completedDepth: 0, nodes: 0, elapsedMs: 0, timedOut: false };

  const immediateWins = immediateWinningMoves(owner, pieces);
  if (legalMoves.length === 1 || immediateWins.length) {
    const choices = immediateWins.length ? immediateWins : legalMoves;
    return {
      move: choices[Math.floor(Math.random() * choices.length)],
      completedDepth: 0,
      nodes: 0,
      elapsedMs: Date.now() - startedAt,
      timedOut: false,
      fastPath: immediateWins.length ? 'win' : 'only-move'
    };
  }

  let best = { move: legalMoves[0], score: -Infinity };
  let completedDepth = 0;
  let timedOut = false;
  self.postMessage({ ok: true, kind: 'progress', progress: { completedDepth: 0, searchingDepth: 1, nodes: 0, elapsedMs: 0 } });

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    context.cache.clear();
    try {
      const result = searchDepth(owner, pieces, depth, context);
      if (result.move) best = result;
      completedDepth = depth;
      self.postMessage({
        ok: true,
        kind: 'progress',
        progress: {
          completedDepth,
          searchingDepth: depth < maxDepth ? depth + 1 : null,
          nodes: context.nodes,
          elapsedMs: Date.now() - startedAt
        }
      });
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
    timedOut,
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
        maxTimeMs: payload.maxTimeMs
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