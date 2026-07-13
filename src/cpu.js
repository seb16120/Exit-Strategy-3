(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExitStrategyCPU = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  function createRandomSetup(Game, owner, pieces, random = Math.random) {
    const ownPieces = pieces.filter((piece) => piece.owner === owner);
    ownPieces.forEach((piece) => {
      piece.position = null;
      piece.status = 'reserve';
      if (piece.type === 'pawn') piece.assigned = false;
    });

    const hunter = ownPieces.find((piece) => piece.type === 'hunter');
    const hunterCells = shuffle(Game.setupCells(owner, 'hunter'), random);
    hunter.position = hunterCells[0];
    hunter.status = 'board';

    const pawnCells = shuffle(
      Game.setupCells(owner, 'pawn').filter((coord) => coord !== hunter.position),
      random
    );
    const pawns = ownPieces
      .filter((piece) => piece.type === 'pawn')
      .sort((a, b) => a.number - b.number);

    pawns.forEach((pawn, index) => {
      pawn.assigned = true;
      pawn.position = pawnCells[index];
      pawn.status = 'board';
    });

    return Game.validateSetup(owner, pieces);
  }

  function evaluatePosition(Game, owner, pieces) {
    const opponent = Game.otherOwner(owner);
    const win = Game.winner(pieces);
    if (win) return win.owner === owner ? 1000000 : -1000000;

    const ownMoves = Game.allLegalMoves(owner, pieces);
    const opponentMoves = Game.allLegalMoves(opponent, pieces);
    const ownEscapes = Game.escapedCount(owner, pieces);
    const opponentEscapes = Game.escapedCount(opponent, pieces);
    const ownCaptures = Game.captureCount(owner, pieces);
    const opponentCaptures = Game.captureCount(opponent, pieces);

    let score = 0;
    score += (ownEscapes - opponentEscapes) * 5000;
    score += (ownCaptures - opponentCaptures) * 3500;
    score += (ownMoves.length - opponentMoves.length) * 4;
    score += ownMoves.filter((move) => move.exits).length * 450;
    score -= opponentMoves.filter((move) => move.exits).length * 650;
    score += ownMoves.filter((move) => move.captureId).length * 260;
    score -= opponentMoves.filter((move) => move.captureId).length * 340;
    return score;
  }

  function analyzeMove(Game, owner, pieces, move) {
    const opponent = Game.otherOwner(owner);
    const afterOwnMove = clonePieces(pieces);
    Game.applyMove(afterOwnMove, move);

    const ownWin = Game.winner(afterOwnMove);
    if (ownWin && ownWin.owner === owner) {
      return { move, score: 1000000, opponentReplies: 0, losesNextTurn: false };
    }

    const opponentReplies = Game.allLegalMoves(opponent, afterOwnMove);
    let worstReplyScore = evaluatePosition(Game, owner, afterOwnMove);
    let losesNextTurn = false;

    for (const reply of opponentReplies) {
      const afterReply = clonePieces(afterOwnMove);
      Game.applyMove(afterReply, reply);
      const replyWin = Game.winner(afterReply);
      if (replyWin && replyWin.owner === opponent) losesNextTurn = true;
      worstReplyScore = Math.min(worstReplyScore, evaluatePosition(Game, owner, afterReply));
    }

    let tacticalBonus = 0;
    if (move.exits) tacticalBonus += 7000;
    if (move.captureId) tacticalBonus += 4200;
    if (opponentReplies.length === 0) tacticalBonus += 350;

    return {
      move,
      score: worstReplyScore + tacticalBonus,
      opponentReplies: opponentReplies.length,
      losesNextTurn
    };
  }

  function rankMoves(Game, owner, pieces) {
    return Game.allLegalMoves(owner, pieces)
      .map((move) => analyzeMove(Game, owner, pieces, move))
      .sort((a, b) => b.score - a.score);
  }

  function chooseMove(Game, owner, pieces, random = Math.random) {
    const ranked = rankMoves(Game, owner, pieces);
    if (ranked.length === 0) return null;
    const bestScore = ranked[0].score;
    const bestMoves = ranked.filter((entry) => entry.score === bestScore);
    return bestMoves[Math.floor(random() * bestMoves.length)].move;
  }

  return {
    clonePieces,
    createRandomSetup,
    evaluatePosition,
    analyzeMove,
    rankMoves,
    chooseMove
  };
});