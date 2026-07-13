'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Game = require('../src/game.js');
const CPU = require('../src/cpu.js');

function piece(pieces, id, position) {
  const target = Game.getPiece(pieces, id);
  target.assigned = true;
  target.status = 'board';
  target.position = position;
  return target;
}

test('CPU creates a complete legal random setup', () => {
  const pieces = Game.createPieces();
  const values = [0.8, 0.1, 0.6, 0.2, 0.7, 0.3, 0.9, 0.4, 0.5];
  let index = 0;
  const random = () => values[index++ % values.length];

  assert.equal(CPU.createRandomSetup(Game, 'cyan', pieces, random), true);
  assert.equal(Game.validateSetup('cyan', pieces), true);
  assert.equal(new Set(pieces.filter((p) => p.owner === 'cyan').map((p) => p.position)).size, 6);
});

test('CPU takes an immediate escape victory', () => {
  const pieces = Game.createPieces();
  const pawn = piece(pieces, 'cyan-pawn-1', 'A4');
  Game.getPiece(pieces, 'cyan-pawn-2').status = 'escaped';
  piece(pieces, 'magenta-pawn-1', 'E4');

  const move = CPU.chooseMove(Game, 'cyan', pieces, () => 0);
  assert.equal(move.pieceId, pawn.id);
  assert.equal(move.to, 'D4');
  assert.equal(move.exits, true);
});

test('CPU checks all legal opponent replies for every candidate', () => {
  const pieces = Game.createPieces();
  piece(pieces, 'cyan-hunter', 'C3');
  piece(pieces, 'cyan-pawn-1', 'B2');
  piece(pieces, 'magenta-pawn-1', 'G4');
  piece(pieces, 'magenta-hunter', 'F6');

  const ranked = CPU.rankMoves(Game, 'cyan', pieces);
  assert.ok(ranked.length > 0);
  for (const entry of ranked) {
    const afterMove = CPU.clonePieces(pieces);
    Game.applyMove(afterMove, entry.move);
    assert.equal(entry.opponentReplies, Game.allLegalMoves('magenta', afterMove).length);
  }
});

test('CPU avoids creating an immediate opponent escape when safe moves exist', () => {
  const pieces = Game.createPieces();
  piece(pieces, 'cyan-hunter', 'C3');
  piece(pieces, 'cyan-pawn-1', 'B2');
  piece(pieces, 'magenta-pawn-1', 'G4');
  Game.getPiece(pieces, 'magenta-pawn-2').status = 'escaped';

  const dangerous = CPU.rankMoves(Game, 'cyan', pieces)
    .find((entry) => entry.move.pieceId === 'cyan-hunter' && entry.move.to === 'C4');
  assert.ok(dangerous);
  assert.equal(dangerous.losesNextTurn, true);

  const chosen = CPU.chooseMove(Game, 'cyan', pieces, () => 0);
  assert.notDeepEqual({ pieceId: chosen.pieceId, to: chosen.to }, { pieceId: 'cyan-hunter', to: 'C4' });
});