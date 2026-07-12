'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Game = require('../src/game.js');

function piece(pieces, id, position) {
  const target = Game.getPiece(pieces, id);
  target.assigned = true;
  target.status = 'board';
  target.position = position;
  return target;
}

test('board contains exactly 37 playable cells', () => {
  assert.equal(Game.playableCells().length, 37);
  assert.equal(Game.isPlayable('D4'), true);
  assert.equal(Game.isPlayable('A1'), false);
  assert.equal(Game.isPlayable('G7'), false);
});

test('pawn travels to the last empty square before a wall', () => {
  const pieces = Game.createPieces();
  const pawn = piece(pieces, 'cyan-pawn-1', 'B2');
  const right = Game.legalMovesForPiece(pawn, pieces).find((move) => move.direction === 'right');
  assert.equal(right.to, 'F2');
});

test('pawn stops immediately before another piece', () => {
  const pieces = Game.createPieces();
  const pawn = piece(pieces, 'cyan-pawn-1', 'B2');
  piece(pieces, 'cyan-pawn-2', 'E2');
  const right = Game.legalMovesForPiece(pawn, pieces).find((move) => move.direction === 'right');
  assert.equal(right.to, 'D2');
});

test('pawn crosses the exit when it is not the forced destination', () => {
  const pieces = Game.createPieces();
  const pawn = piece(pieces, 'cyan-pawn-1', 'A4');
  const right = Game.legalMovesForPiece(pawn, pieces).find((move) => move.direction === 'right');
  assert.equal(right.to, 'G4');
  assert.equal(right.exits, false);
});

test('pawn exits only when a blocker makes D4 the forced destination', () => {
  const pieces = Game.createPieces();
  const pawn = piece(pieces, 'cyan-pawn-1', 'A4');
  piece(pieces, 'magenta-pawn-1', 'E4');
  const right = Game.legalMovesForPiece(pawn, pieces).find((move) => move.direction === 'right');
  assert.equal(right.to, 'D4');
  assert.equal(right.exits, true);
  Game.applyMove(pieces, right);
  assert.equal(pawn.status, 'escaped');
  assert.equal(pawn.position, null);
});

test('hunter cannot enter the exit', () => {
  const pieces = Game.createPieces();
  const hunter = piece(pieces, 'cyan-hunter', 'C4');
  const destinations = Game.legalMovesForPiece(hunter, pieces).map((move) => move.to);
  assert.equal(destinations.includes('D4'), false);
});

test('hunter captures an opposing pawn but not an opposing hunter', () => {
  const pieces = Game.createPieces();
  const hunter = piece(pieces, 'cyan-hunter', 'C3');
  piece(pieces, 'magenta-pawn-1', 'D3');
  piece(pieces, 'magenta-hunter', 'C2');
  const moves = Game.legalMovesForPiece(hunter, pieces);
  const capture = moves.find((move) => move.to === 'D3');
  assert.ok(capture);
  assert.equal(capture.captureId, 'magenta-pawn-1');
  assert.equal(moves.some((move) => move.to === 'C2'), false);
  Game.applyMove(pieces, capture);
  assert.equal(Game.getPiece(pieces, 'magenta-pawn-1').status, 'captured');
});

test('two escaped pawns produce an escape victory', () => {
  const pieces = Game.createPieces();
  Game.getPiece(pieces, 'cyan-pawn-1').status = 'escaped';
  Game.getPiece(pieces, 'cyan-pawn-2').status = 'escaped';
  assert.deepEqual(Game.winner(pieces), { owner: 'cyan', reason: 'escape' });
});

test('three captured opposing pawns produce a hunter victory', () => {
  const pieces = Game.createPieces();
  for (let number = 1; number <= 3; number += 1) {
    Game.getPiece(pieces, `magenta-pawn-${number}`).status = 'captured';
  }
  assert.deepEqual(Game.winner(pieces), { owner: 'cyan', reason: 'capture' });
});
