const test = require('node:test');
const assert = require('node:assert/strict');
const Timer = require('../src/timer.js');

test('move time is deducted from the player total', () => {
  const timer = Timer.createState(true);
  Timer.startTurn(timer, 'cyan', 1000);
  const result = Timer.commitTurn(timer, 'cyan', 16000);
  assert.equal(result.usedMs, 15000);
  assert.equal(timer.remainingByOwner.cyan, Timer.PLAYER_LIMIT_MS - 15000);
});

test('confirmation-like waiting counts toward both timers', () => {
  const timer = Timer.createState(true);
  Timer.startTurn(timer, 'magenta', 1000);
  const snapshot = Timer.remaining(timer, 31000);
  assert.equal(snapshot.moveMs, 30000);
  assert.equal(snapshot.totalMs, Timer.PLAYER_LIMIT_MS - 30000);
});

test('forced pass charges a full minute to the global clock', () => {
  const timer = Timer.createState(true);
  const result = Timer.forcePass(timer, 'cyan');
  assert.equal(result.usedMs, Timer.MOVE_LIMIT_MS);
  assert.equal(result.remainingMs, Timer.PLAYER_LIMIT_MS - Timer.MOVE_LIMIT_MS);
});

test('paused CPU matches do not consume time', () => {
  const timer = Timer.createState(true);
  Timer.startTurn(timer, 'cyan', 1000);
  Timer.pause(timer, 11000);
  assert.equal(Timer.remaining(timer, 41000).moveMs, 50000);
  Timer.resume(timer, 41000);
  assert.equal(Timer.remaining(timer, 51000).moveMs, 40000);
});
