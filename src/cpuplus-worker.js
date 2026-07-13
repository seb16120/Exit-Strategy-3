'use strict';

importScripts('game.js', 'cpu3.js', 'cpuplus.js');

self.onmessage = (event) => {
  const payload = event.data || {};
  try {
    if (payload.kind === 'setup') {
      const pieces = self.ExitStrategyGame.createPieces();
      const result = self.ExitStrategyCPUPlus.createLearnedSetup(
        self.ExitStrategyGame,
        payload.owner,
        pieces,
        payload.database,
        { analysisTimeMs: payload.analysisTimeMs }
      );
      self.postMessage({ ok: true, kind: 'setup', result });
      return;
    }

    const result = self.ExitStrategyCPUPlus.searchMove(
      self.ExitStrategyGame,
      payload.owner,
      payload.pieces,
      { maxDepth: payload.maxDepth, maxTimeMs: payload.maxTimeMs }
    );
    self.postMessage({ ok: true, kind: 'move', result });
  } catch (error) {
    self.postMessage({
      ok: false,
      kind: payload.kind || 'move',
      error: error && error.message ? error.message : String(error)
    });
  }
};