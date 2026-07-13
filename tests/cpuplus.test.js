'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Game = require('../src/game.js');
const CPUPlus = require('../src/cpuplus.js');

function place(pieces, id, position, status = 'board') {
  const piece = Game.getPiece(pieces, id);
  piece.assigned = true;
  piece.status = status;
  piece.position = status === 'board' ? position : null;
  return piece;
}

test('CPU+ rotates placements by 180 degrees for color normalization', () => {
  assert.equal(CPUPlus.rotateCoord('A1'), 'G7');
  assert.equal(CPUPlus.rotateCoord('B3'), 'F5');
  assert.equal(CPUPlus.rotateCoord('D4'), 'D4');
});

test('CPU+ human weight starts at 80% and adapts to the local opponent', () => {
  const neutral = CPUPlus.emptyDatabase();
  assert.equal(CPUPlus.humanOpponentWeight(neutral), 0.8);

  const difficult = CPUPlus.emptyDatabase();
  difficult.human = { score: 0, games: 20 };
  assert.equal(CPUPlus.humanOpponentWeight(difficult), 0.9);

  const easy = CPUPlus.emptyDatabase();
  easy.human = { score: 20, games: 20 };
  assert.equal(CPUPlus.humanOpponentWeight(easy), 0.7);
});

test('CPU+ opponent strengths use the agreed weighting', () => {
  const database = CPUPlus.emptyDatabase();
  assert.equal(CPUPlus.opponentWeight('cpuplus', database), 1);
  assert.equal(CPUPlus.opponentWeight('cpu3', database), 0.66);
  assert.equal(CPUPlus.opponentWeight('cpu1', database), 0.5);
  assert.equal(CPUPlus.opponentWeight('human', database), 0.8);
});

test('placement keys ignore pawn numbering but distinguish first and second player', () => {
  const cyan = Game.createPieces();
  place(cyan, 'cyan-hunter', 'A2');
  ['B1', 'C1', 'A2', 'B2', 'C2'].forEach((coord, index) => {
    place(cyan, `cyan-pawn-${index + 1}`, coord);
  });
  place(cyan, 'cyan-hunter', 'A3');
  const cyanKey = CPUPlus.placementKey('cyan', cyan);

  const magenta = Game.createPieces();
  place(magenta, 'magenta-hunter', CPUPlus.rotateCoord('A3'));
  const reversed = ['C2', 'B2', 'A2', 'C1', 'B1'];
  reversed.forEach((coord, index) => {
    place(magenta, `magenta-pawn-${index + 1}`, CPUPlus.rotateCoord(coord));
  });
  const magentaKey = CPUPlus.placementKey('magenta', magenta);

  assert.ok(cyanKey.startsWith('first|'));
  assert.ok(magentaKey.startsWith('second|'));
  assert.equal(cyanKey.replace('first|', ''), magentaKey.replace('second|', ''));
});

test('CPU+ records a placement result with the opponent strength weight', () => {
  const database = CPUPlus.recordResult(CPUPlus.emptyDatabase(), 'first|test', 'win', 'cpu3');
  assert.equal(database.placements['first|test'].weightedGames, 0.66);
  assert.equal(database.placements['first|test'].weightedScore, 0.66);
  assert.equal(database.placements['first|test'].wins, 1);
});

test('CPU+ fast path detects a move that wins the game, not a mere first escape', () => {
  const pieces = Game.createPieces();
  Game.getPiece(pieces, 'cyan-pawn-1').status = 'escaped';
  place(pieces, 'cyan-pawn-2', 'A4');
  place(pieces, 'magenta-pawn-1', 'E4');
  const winningMoves = CPUPlus.immediateWinningMoves(Game, 'cyan', pieces);
  assert.ok(winningMoves.some((move) => move.pieceId === 'cyan-pawn-2' && move.to === 'D4'));

  Game.getPiece(pieces, 'cyan-pawn-1').status = 'reserve';
  const nonWinningMoves = CPUPlus.immediateWinningMoves(Game, 'cyan', pieces);
  assert.equal(nonWinningMoves.some((move) => move.pieceId === 'cyan-pawn-2' && move.to === 'D4'), false);
});