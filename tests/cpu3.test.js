const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../src/game.js');
const CPU3 = require('../src/cpu3.js');

function place(piece, position) {
  piece.position = position;
  piece.status = 'board';
  if (piece.type === 'pawn') piece.assigned = true;
}

test('CPU3 creates a valid logical setup without using opponent placement', () => {
  const piecesA = Game.createPieces();
  const piecesB = Game.createPieces();
  const enemyA = piecesA.filter((piece) => piece.owner === 'magenta');
  const enemyB = piecesB.filter((piece) => piece.owner === 'magenta');
  enemyA.forEach((piece, index) => place(piece, ['E2','F2','E3','F3','E5','G4'][index]));
  enemyB.forEach((piece, index) => place(piece, ['E7','F7','E6','F6','G6','G5'][index]));

  const zeroRandom = () => 0;
  assert.equal(CPU3.createLogicalSetup(Game, 'cyan', piecesA, zeroRandom), true);
  assert.equal(CPU3.createLogicalSetup(Game, 'cyan', piecesB, zeroRandom), true);
  const setupA = piecesA.filter((piece) => piece.owner === 'cyan').map((piece) => piece.position);
  const setupB = piecesB.filter((piece) => piece.owner === 'cyan').map((piece) => piece.position);
  assert.deepEqual(setupA, setupB);
});

test('CPU3 completes a three-ply search on a normal position', () => {
  const pieces = Game.createPieces();
  CPU3.createLogicalSetup(Game, 'cyan', pieces, () => 0.1);
  CPU3.createLogicalSetup(Game, 'magenta', pieces, () => 0.2);
  const result = CPU3.searchMove(Game, 'cyan', pieces, { maxDepth: 3, maxTimeMs: 5000, random: () => 0 });
  assert.ok(result.move);
  assert.equal(result.completedDepth, 3);
  assert.ok(result.nodes > 0);
  assert.ok(Game.allLegalMoves('cyan', pieces).some((move) => move.pieceId === result.move.pieceId && move.to === result.move.to));
});

test('CPU3 respects a tiny time budget and still returns a legal fallback', () => {
  const pieces = Game.createPieces();
  CPU3.createLogicalSetup(Game, 'cyan', pieces, () => 0.3);
  CPU3.createLogicalSetup(Game, 'magenta', pieces, () => 0.4);
  const result = CPU3.searchMove(Game, 'cyan', pieces, { maxDepth: 3, maxTimeMs: 10, random: () => 0 });
  assert.ok(result.move);
  assert.ok(result.elapsedMs < 1000);
});
