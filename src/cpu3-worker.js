'use strict';

importScripts('game.js', 'cpu3.js');

self.onmessage = (event) => {
  const { owner, pieces, maxDepth = 3, maxTimeMs = 45000 } = event.data || {};
  try {
    const result = self.ExitStrategyCPU3.searchMove(
      self.ExitStrategyGame,
      owner,
      pieces,
      { maxDepth, maxTimeMs }
    );
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
};
