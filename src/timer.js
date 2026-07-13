(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ExitStrategyTimer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MOVE_LIMIT_MS = 60 * 1000;
  const PLAYER_LIMIT_MS = 50 * 60 * 1000;

  function createState(enabled = false) {
    return {
      enabled: Boolean(enabled),
      remainingByOwner: { cyan: PLAYER_LIMIT_MS, magenta: PLAYER_LIMIT_MS },
      activeOwner: null,
      startedAt: null,
      elapsedBeforePause: 0,
      paused: false
    };
  }

  function reset(timer, enabled = timer.enabled) {
    timer.enabled = Boolean(enabled);
    timer.remainingByOwner = { cyan: PLAYER_LIMIT_MS, magenta: PLAYER_LIMIT_MS };
    timer.activeOwner = null;
    timer.startedAt = null;
    timer.elapsedBeforePause = 0;
    timer.paused = false;
    return timer;
  }

  function startTurn(timer, owner, now = Date.now()) {
    if (!timer.enabled) return timer;
    timer.activeOwner = owner;
    timer.startedAt = now;
    timer.elapsedBeforePause = 0;
    timer.paused = false;
    return timer;
  }

  function elapsed(timer, now = Date.now()) {
    if (!timer.enabled || !timer.activeOwner) return 0;
    const running = timer.startedAt === null ? 0 : Math.max(0, now - timer.startedAt);
    return Math.max(0, timer.elapsedBeforePause + running);
  }

  function remaining(timer, now = Date.now()) {
    const owner = timer.activeOwner;
    const used = elapsed(timer, now);
    return {
      owner,
      moveMs: owner ? Math.max(0, MOVE_LIMIT_MS - used) : MOVE_LIMIT_MS,
      totalMs: owner ? Math.max(0, timer.remainingByOwner[owner] - used) : null,
      usedMs: used
    };
  }

  function pause(timer, now = Date.now()) {
    if (!timer.enabled || !timer.activeOwner || timer.paused) return timer;
    timer.elapsedBeforePause = elapsed(timer, now);
    timer.startedAt = null;
    timer.paused = true;
    return timer;
  }

  function resume(timer, now = Date.now()) {
    if (!timer.enabled || !timer.activeOwner || !timer.paused) return timer;
    timer.startedAt = now;
    timer.paused = false;
    return timer;
  }

  function stopTurn(timer) {
    timer.activeOwner = null;
    timer.startedAt = null;
    timer.elapsedBeforePause = 0;
    timer.paused = false;
    return timer;
  }

  function commitTurn(timer, owner, now = Date.now()) {
    if (!timer.enabled) return { usedMs: 0, remainingMs: PLAYER_LIMIT_MS };
    const usedMs = timer.activeOwner === owner ? Math.min(MOVE_LIMIT_MS, elapsed(timer, now)) : 0;
    timer.remainingByOwner[owner] = Math.max(0, timer.remainingByOwner[owner] - usedMs);
    const remainingMs = timer.remainingByOwner[owner];
    stopTurn(timer);
    return { usedMs, remainingMs };
  }

  function forcePass(timer, owner) {
    if (!timer.enabled) return { usedMs: 0, remainingMs: PLAYER_LIMIT_MS };
    timer.remainingByOwner[owner] = Math.max(0, timer.remainingByOwner[owner] - MOVE_LIMIT_MS);
    const remainingMs = timer.remainingByOwner[owner];
    stopTurn(timer);
    return { usedMs: MOVE_LIMIT_MS, remainingMs };
  }

  function timeoutReason(timer, now = Date.now()) {
    if (!timer.enabled || !timer.activeOwner || timer.paused) return null;
    const snapshot = remaining(timer, now);
    if (snapshot.totalMs <= 0) return 'total';
    if (snapshot.moveMs <= 0) return 'move';
    return null;
  }

  return {
    MOVE_LIMIT_MS,
    PLAYER_LIMIT_MS,
    createState,
    reset,
    startTurn,
    elapsed,
    remaining,
    pause,
    resume,
    stopTurn,
    commitTurn,
    forcePass,
    timeoutReason
  };
});
