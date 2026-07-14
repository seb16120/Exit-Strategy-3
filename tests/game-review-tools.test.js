'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'game-review-tools.source.js');
const loaderPath = path.join(__dirname, '..', 'src', 'game-review-tools.js');
const seriesPath = path.join(__dirname, '..', 'src', 'cpu-series-tools.js');

function read(file) { return fs.readFileSync(file, 'utf8'); }

test('game review source and loader are valid JavaScript', () => {
  const source = read(sourcePath);
  assert.doesNotThrow(() => new vm.Script(source));
  assert.doesNotThrow(() => new vm.Script(read(loaderPath)));
  assert.match(source, /ES3-PGN\/1/);
  assert.match(source, /ES3-FEN\/1/);
});

test('a newly launched match replaces the previous review record', () => {
  const source = read(sourcePath);
  assert.match(source, /sameOpenRecord/);
  assert.match(source, /if \(launchTarget\) currentRecord = null/);
  assert.match(source, /function relaunchConfig\(config\) \{\s*currentRecord = null/);
});

test('wide desktop layout applies to every active match, except analysis', () => {
  const source = read(seriesPath);
  assert.match(source, /phaseCard\?\.textContent\.includes\('CURRENT TURN'\)/);
  assert.match(source, /classList\.contains\('analysis-mode'\)/);
});

test('game review includes the requested flows', () => {
  const source = read(sourcePath);
  assert.match(source, /Analyze game/);
  assert.match(source, /Return to menu/);
  assert.match(source, /Next CPU move/);
  assert.match(source, /Paste ES3-PGN \/ ES3-FEN/);
  assert.match(source, /You win/);
});
