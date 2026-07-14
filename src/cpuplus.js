(function (root, factory) {
  const cpu3 = typeof module === 'object' && module.exports
    ? require('./cpu3.js')
    : root.ExitStrategyCPU3;
  const api = factory(cpu3);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExitStrategyCPUPlus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CPU3) {
  'use strict';

  const STORAGE_KEY = 'exit-strategy-cpuplus-learning-v1';
  const DATABASE_VERSION = 1;
  const RESET_PASSWORD_SHA256 = 'bb421fa35db885ce507b0ef5c3f23cb09c62eb378fae3641c165bdf4c0272949';
  const MOVE_MIN_MS = 30000;
  const MOVE_SEARCH_MS = 54000;
  const MOVE_HARD_MAX_MS = 55000;
  const DEEP_MIN_DEPTH = 12;
  const DEEP_MIN_MS = 90000;
  const DEEP_STABLE_DEPTHS = 3;
  const DEEP_MAX_DEPTH = 20;
  const DEEP_HARD_MAX_MS = 300000;
  const SETUP_ANALYSIS_MS = 5000;
  const SETUP_VISIBLE_MIN_MS = 6000;
  const MAX_DEPTH = 64;
  const WIN_SCORE = 100000000;

  class SearchTimeout extends Error {
    constructor() {
      super('CPU+ search time limit reached.');
      this.name = 'SearchTimeout';
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function clonePieces(pieces) {
    return pieces.map((piece) => ({ ...piece }));
  }

  function emptyDatabase() {
    return {
      version: DATABASE_VERSION,
      placements: {},
      human: { score: 0, games: 0 },
      updatedAt: null
    };
  }

  function sanitizeDatabase(value) {
    if (!value || value.version !== DATABASE_VERSION || typeof value.placements !== 'object') {
      return emptyDatabase();
    }
    const database = emptyDatabase();
    database.updatedAt = typeof value.updatedAt === 'string' ? value.updatedAt : null;
    const human = value.human || {};
    database.human = {
      score: Number.isFinite(human.score) ? Math.max(0, human.score) : 0,
      games: Number.isFinite(human.games) ? Math.max(0, human.games) : 0
    };
    for (const [key, raw] of Object.entries(value.placements)) {
      if (!raw || typeof raw !== 'object') continue;
      database.placements[key] = {
        weightedScore: Number.isFinite(raw.weightedScore) ? Math.max(0, raw.weightedScore) : 0,
        weightedGames: Number.isFinite(raw.weightedGames) ? Math.max(0, raw.weightedGames) : 0,
        rawGames: Number.isFinite(raw.rawGames) ? Math.max(0, raw.rawGames) : 0,
        wins: Number.isFinite(raw.wins) ? Math.max(0, raw.wins) : 0,
        draws: Number.isFinite(raw.draws) ? Math.max(0, raw.draws) : 0,
        losses: Number.isFinite(raw.losses) ? Math.max(0, raw.losses) : 0
      };
    }
    return database;
  }

  function defaultStorage() {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch (_) {
      return null;
    }
  }

  function loadDatabase(storage = defaultStorage()) {
    if (!storage) return emptyDatabase();
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? sanitizeDatabase(JSON.parse(raw)) : emptyDatabase();
    } catch (_) {
      return emptyDatabase();
    }
  }

  function saveDatabase(database, storage = defaultStorage()) {
    const clean = sanitizeDatabase(database);
    clean.updatedAt = new Date().toISOString();
    if (storage) {
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(clean));
      } catch (_) {
        // The game remains playable when storage is unavailable or full.
      }
    }
    return clean;
  }

  function clearDatabase(storage = defaultStorage()) {
    if (storage) {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (_) {
        // Ignore unavailable storage.
      }
    }
    return emptyDatabase();
  }

  function rotateCoord(coord) {
    if (typeof coord !== 'string' || !/^[A-G][1-7]$/.test(coord)) return coord;
    const column = String.fromCharCode('A'.charCodeAt(0) + (6 - (coord.charCodeAt(0) - 65)));
    const row = 8 - Number(coord[1]);
    return `${column}${row}`;
  }

  function normalizedCoord(owner, coord) {
    return owner === 'magenta' ? rotateCoord(coord) : coord;
  }

  function placementKey(owner, pieces) {
    const own = pieces.filter((piece) => piece.owner === owner && piece.status === 'board');
    const hunter = own.find((piece) => piece.type === 'hunter');
    const pawns = own
      .filter((piece) => piece.type === 'pawn')
      .map((piece) => normalizedCoord(owner, piece.position))
      .sort();
    if (!hunter || pawns.length !== 5) return null;
    const role = owner === 'cyan' ? 'first' : 'second';
    return `${role}|H:${normalizedCoord(owner, hunter.position)}|P:${pawns.join(',')}`;
  }

  function humanWinRate(database) {
    const clean = sanitizeDatabase(database);
    return (clean.human.score + 10) / (clean.human.games + 20);
  }

  function humanOpponentWeight(database) {
    return clamp(1 - 0.4 * humanWinRate(database), 0.6, 1);
  }

  function opponentWeight(opponentKind, database) {
    if (opponentKind === 'cpuplus') return 1;
    if (opponentKind === 'cpu3') return 0.66;
    if (opponentKind === 'cpu1') return 0.5;
    if (opponentKind === 'human') return humanOpponentWeight(database);
    return 0;
  }

  function placementStat(database, key) {
    const clean = sanitizeDatabase(database);
    return clean.placements[key] || {
      weightedScore: 0,
      weightedGames: 0,
      rawGames: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };
  }

  function recordResult(database, key, outcome, opponentKind) {
    const clean = sanitizeDatabase(database);
    if (!key || !['win', 'draw', 'loss'].includes(outcome)) return clean;
    const weight = opponentWeight(opponentKind, clean);
    if (weight <= 0) return clean;
    const value = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const stat = clean.placements[key] || {
      weightedScore: 0,
      weightedGames: 0,
      rawGames: 0,
      wins: 0,
      draws: 0,
      losses: 0
    };
    stat.weightedScore += value * weight;
    stat.weightedGames += weight;
    stat.rawGames += 1;
    if (outcome === 'win') stat.wins += 1;
    else if (outcome === 'draw') stat.draws += 1;
    else stat.losses += 1;
    clean.placements[key] = stat;

    if (opponentKind === 'human') {
      clean.human.score += value;
      clean.human.games += 1;
    }
    return clean;
  }

  function summary(database) {
    const clean = sanitizeDatabase(database);
    const placements = Object.keys(clean.placements).length;
    const games = Object.values(clean.placements).reduce((total, stat) => total + stat.rawGames, 0);
    return {
      placements,
      games,
      humanGames: clean.human.games,
      humanWinRate: humanWinRate(clean),
      humanWeight: humanOpponentWeight(clean)
    };
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

  function applySetup(Game, owner, pieces, setup) {
    if (!setup) return false;
    const own = pieces.filter((piece) => piece.owner === owner);
    own.forEach((piece) => {
      piece.position = null;
      piece.status = 'reserve';
      if (piece.type === 'pawn') piece.assigned = false;
    });
    const hunter = own.find((piece) => piece.type === 'hunter');
    const pawns = own.filter((piece) => piece.type === 'pawn').sort((a, b) => a.number - b.number);
    hunter.position = setup.hunterCell;
    hunter.status = 'board';
    pawns.forEach((pawn, index) => {
      pawn.assigned = true;
      pawn.position = setup.pawnCells[index];
      pawn.status = 'board';
    });
    return Game.validateSetup(owner, pieces);
  }

  function candidateKey(owner, hunterCell, pawnCells) {
    const role = owner === 'cyan' ? 'first' : 'second';
    const normalizedHunter = normalizedCoord(owner, hunterCell);
    const normalizedPawns = pawnCells.map((coord) => normalizedCoord(owner, coord)).sort();
    return `${role}|H:${normalizedHunter}|P:${normalizedPawns.join(',')}`;
  }

  function isolatedCandidatePieces(Game, owner, hunterCell, pawnCells) {
    const pieces = Game.createPieces();
    clearAllPieces(pieces);
    applySetup(Game, owner, pieces, { hunterCell, pawnCells });
    return pieces;
  }

  function randomSetupDescriptor(Game, owner, occupied, random) {
    const hunterCells = shuffle(Game.setupCells(owner, 'hunter').filter((coord) => !occupied.has(coord)), random);
    const hunterCell = hunterCells[0] || Game.setupCells(owner, 'hunter')[0];
    const pawnCells = shuffle(
      Game.setupCells(owner, 'pawn').filter((coord) => coord !== hunterCell && !occupied.has(coord)),
      random
    ).slice(0, 5);
    return { hunterCell, pawnCells };
  }

  function placementRankingScore(stat, baseScore = 0) {
    const weightedGames = Math.max(0, Number(stat?.weightedGames) || 0);
    const weightedScore = clamp(Number(stat?.weightedScore) || 0, 0, weightedGames);
    const alpha = 2 + weightedScore;
    const beta = 2 + weightedGames - weightedScore;
    const mean = alpha / (alpha + beta);
    const uncertainty = Math.sqrt((mean * (1 - mean)) / (weightedGames + 5));
    const conservativeRate = mean - 0.75 * uncertainty;
    return conservativeRate * 1000000
      + Math.log1p(weightedGames) * 1000
      + Number(baseScore || 0) * 0.01;
  }

  function buildPlacementLottery(candidates, database) {
    const clean = sanitizeDatabase(database);
    const known = [];
    const unknown = [];

    candidates.forEach((candidate) => {
      const stat = clean.placements[candidate.key];
      if (stat && stat.rawGames > 0) {
        known.push({
          ...candidate,
          stat,
          rankingScore: placementRankingScore(stat, candidate.baseScore)
        });
      } else {
        unknown.push({ ...candidate, stat: null, rankingScore: null });
      }
    });

    known.sort((a, b) => b.rankingScore - a.rankingScore
      || b.stat.weightedGames - a.stat.weightedGames
      || a.key.localeCompare(b.key));

    let knownMass = 0;
    known.forEach((candidate, index) => {
      candidate.rank = index + 1;
      candidate.probability = 0.1 / candidate.rank;
      knownMass += candidate.probability;
    });

    if (unknown.length > 0) {
      const unknownProbability = Math.max(0, 1 - knownMass) / unknown.length;
      unknown.forEach((candidate) => {
        candidate.rank = null;
        candidate.probability = unknownProbability;
      });
    } else if (knownMass > 0) {
      known.forEach((candidate) => {
        candidate.probability /= knownMass;
      });
      knownMass = 1;
    }

    const entries = known.concat(unknown);
    const totalProbability = entries.reduce((total, candidate) => total + candidate.probability, 0);
    if (entries.length && Math.abs(totalProbability - 1) > 1e-12) {
      entries[entries.length - 1].probability += 1 - totalProbability;
    }

    return {
      entries,
      knownCount: known.length,
      unknownCount: unknown.length
    };
  }

  function choosePlacementFromLottery(lottery, random = Math.random) {
    const entries = lottery?.entries || [];
    if (!entries.length) return null;
    const target = clamp(Number(random()) || 0, 0, 1 - Number.EPSILON);
    let cumulative = 0;
    for (const candidate of entries) {
      cumulative += candidate.probability;
      if (target < cumulative) return candidate;
    }
    return entries[entries.length - 1];
  }

  function createLearnedSetup(Game, owner, pieces, database, options = {}) {
    const random = options.random || Math.random;
    const startedAt = Date.now();
    const cleanDatabase = sanitizeDatabase(database);
    const candidates = [];

    for (const hunterCell of Game.setupCells(owner, 'hunter')) {
      const available = Game.setupCells(owner, 'pawn').filter((coord) => coord !== hunterCell);
      for (const pawnCells of combinations(available, 5)) {
        const key = candidateKey(owner, hunterCell, pawnCells);
        const stat = cleanDatabase.placements[key];
        let baseScore = 0;
        if (stat && stat.rawGames > 0) {
          const candidatePieces = isolatedCandidatePieces(Game, owner, hunterCell, pawnCells);
          baseScore = CPU3.setupScore(Game, owner, candidatePieces);
        }
        candidates.push({ hunterCell, pawnCells, key, baseScore });
      }
    }

    const lottery = buildPlacementLottery(candidates, cleanDatabase);
    const selected = choosePlacementFromLottery(lottery, random);
    if (!selected) return null;
    applySetup(Game, owner, pieces, selected);

    return {
      key: selected.key,
      hunterCell: selected.hunterCell,
      pawnCells: selected.pawnCells.slice(),
      score: selected.rankingScore,
      rank: selected.rank,
      known: Boolean(selected.stat),
      selectionProbability: selected.probability,
      candidates: candidates.length,
      knownPlacements: lottery.knownCount,
      unknownPlacements: lottery.unknownCount,
      simulations: 0,
      elapsedMs: Date.now() - startedAt
    };
  }

  function moveOrderingScore(Game, rootOwner, currentOwner, pieces, move) {
    const next = clonePieces(pieces);
    Game.applyMove(next, move);
    const win = Game.winner(next);
    let score = CPU3.evaluatePosition(Game, rootOwner, next);
    if (win) score += win.owner === rootOwner ? WIN_SCORE : -WIN_SCORE;
    if (move.exits) score += currentOwner === rootOwner ? 500000 : -500000;
    if (move.captureId) score += currentOwner === rootOwner ? 350000 : -350000;
    return score;
  }

  function orderedMoves(Game, rootOwner, currentOwner, pieces) {
    const maximizing = currentOwner === rootOwner;
    return Game.allLegalMoves(currentOwner, pieces)
      .map((move) => ({ move, score: moveOrderingScore(Game, rootOwner, currentOwner, pieces, move) }))
      .sort((a, b) => maximizing ? b.score - a.score : a.score - b.score)
      .map((entry) => entry.move);
  }

  function immediateWinningMoves(Game, owner, pieces) {
    return Game.allLegalMoves(owner, pieces).filter((move) => {
      const next = clonePieces(pieces);
      Game.applyMove(next, move);
      const winner = Game.winner(next);
      return winner && winner.owner === owner;
    });
  }

  function terminalScore(Game, rootOwner, pieces, depth) {
    const winner = Game.winner(pieces);
    if (!winner) return null;
    return winner.owner === rootOwner ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }

  function minimax(Game, rootOwner, currentOwner, pieces, depth, alpha, beta, passCount, context) {
    context.nodes += 1;
    if ((context.nodes & 127) === 0 && Date.now() >= context.deadline) throw new SearchTimeout();
    const terminal = terminalScore(Game, rootOwner, pieces, depth);
    if (terminal !== null) return terminal;
    if (depth <= 0) return CPU3.evaluatePosition(Game, rootOwner, pieces);

    const key = `${depth}|${passCount}|${Game.serializePosition(pieces, currentOwner)}`;
    const cached = context.cache.get(key);
    if (cached !== undefined) return cached;
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
        complete = false;
        break;
      }
    }
    if (complete) context.cache.set(key, best);
    return best;
  }

  function searchDepth(Game, owner, pieces, depth, context, random) {
    const moves = orderedMoves(Game, owner, owner, pieces);
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
      move: bestMoves[0],
      score: bestScore
    };
  }

  function moveSignature(move) {
    if (!move) return '';
    return [move.pieceId, move.from, move.to, move.captureId || '', move.exits ? 'exit' : 'board'].join('|');
  }

  function searchMove(Game, owner, pieces, options = {}) {
    const random = options.random || Math.random;
    const maxDepth = Math.max(1, Math.min(MAX_DEPTH, options.maxDepth || MAX_DEPTH));
    const maxTimeMs = Math.max(10, Math.min(DEEP_HARD_MAX_MS, options.maxTimeMs || MOVE_SEARCH_MS));
    const minDepth = Math.max(0, Math.min(maxDepth, options.minDepth || 0));
    const minTimeMs = Math.max(0, Math.min(maxTimeMs, options.minTimeMs || 0));
    const stableDepths = Math.max(1, options.stableDepths || DEEP_STABLE_DEPTHS);
    const stopWhenStable = Boolean(options.stopWhenStable);
    const startedAt = Date.now();
    const context = { deadline: startedAt + maxTimeMs, cache: new Map(), nodes: 0 };
    const legalMoves = orderedMoves(Game, owner, owner, pieces);
    if (legalMoves.length === 0) {
      return { move: null, completedDepth: 0, nodes: 0, elapsedMs: 0, timedOut: false, stopReason: 'no-move' };
    }
    const immediateWins = immediateWinningMoves(Game, owner, pieces);
    if (legalMoves.length === 1 || immediateWins.length > 0) {
      const choices = immediateWins.length > 0 ? immediateWins : legalMoves;
      return {
        move: choices[Math.floor(random() * choices.length)],
        completedDepth: 0,
        nodes: 0,
        elapsedMs: Date.now() - startedAt,
        timedOut: false,
        stopReason: 'fast-path',
        fastPath: immediateWins.length > 0 ? 'win' : 'only-move'
      };
    }

    let best = { move: legalMoves[0], score: -Infinity };
    let completedDepth = 0;
    let timedOut = false;
    let stableDepthCount = 0;
    let previousSignature = '';
    let stopReason = null;

    for (let depth = 1; depth <= maxDepth; depth += 1) {
      context.cache.clear();
      try {
        const result = searchDepth(Game, owner, pieces, depth, context, random);
        if (result.move) best = result;
        completedDepth = depth;
        const signature = moveSignature(result.move);
        stableDepthCount = signature && signature === previousSignature ? stableDepthCount + 1 : 1;
        previousSignature = signature;
        const elapsedMs = Date.now() - startedAt;
        if (depth >= maxDepth) {
          stopReason = 'max-depth';
          break;
        }
        if (stopWhenStable
          && depth >= minDepth
          && elapsedMs >= minTimeMs
          && stableDepthCount >= stableDepths) {
          stopReason = 'stable';
          break;
        }
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
      stableDepthCount,
      stopReason,
      fastPath: null
    };
  }

  async function sha256Hex(text) {
    if (!rootCryptoSubtle()) return null;
    const data = new TextEncoder().encode(String(text));
    const digest = await rootCryptoSubtle().digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function rootCryptoSubtle() {
    try {
      return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null;
    } catch (_) {
      return null;
    }
  }

  async function verifyResetPassword(password) {
    const hash = await sha256Hex(password);
    return hash !== null && hash === RESET_PASSWORD_SHA256;
  }

  return {
    STORAGE_KEY,
    DATABASE_VERSION,
    MOVE_MIN_MS,
    MOVE_SEARCH_MS,
    MOVE_HARD_MAX_MS,
    DEEP_MIN_DEPTH,
    DEEP_MIN_MS,
    DEEP_STABLE_DEPTHS,
    DEEP_MAX_DEPTH,
    DEEP_HARD_MAX_MS,
    SETUP_ANALYSIS_MS,
    SETUP_VISIBLE_MIN_MS,
    MAX_DEPTH,
    SearchTimeout,
    clonePieces,
    emptyDatabase,
    sanitizeDatabase,
    loadDatabase,
    saveDatabase,
    clearDatabase,
    rotateCoord,
    normalizedCoord,
    placementKey,
    humanWinRate,
    humanOpponentWeight,
    opponentWeight,
    recordResult,
    summary,
    applySetup,
    placementRankingScore,
    buildPlacementLottery,
    choosePlacementFromLottery,
    createLearnedSetup,
    immediateWinningMoves,
    searchMove,
    verifyResetPassword
  };
});