'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function read(name) { return fs.readFileSync(path.join(__dirname, '..', name), 'utf8'); }

for (const file of ['src/cpuplus-worker-v2.js', 'src/last-move.js', 'src/game-review-tools.source.js', 'src/pre-game-navigation.js']) {
  test(`${file} is valid JavaScript`, () => {
    assert.doesNotThrow(() => new vm.Script(read(file)));
  });
}

test('CPU+ progress reports a principal variation', () => {
  const source = read('src/cpuplus-worker-v2.js');
  assert.match(source, /bestMoveCache/);
  assert.match(source, /buildPrincipalVariation/);
  assert.match(source, /principalVariation: result\.principalVariation/);
});

test('progress UI uses fully evaluated wording and optional sequences', () => {
  const source = read('src/last-move.js');
  assert.match(source, /fully evaluated/);
  assert.match(source, /Display the best sequence/);
  assert.match(source, /ExitStrategyCpuProgressUI/);
  assert.match(source, /Best depth-/);
  assert.match(source, /renderSignature/);
  assert.match(source, /existingSequence\.replaceWith/);
  assert.match(source, /isProgressMutationNode/);
  assert.match(source, /queueDepthDisplayRefresh/);
});

test('analysis shows CPU thinking and live depth progress', () => {
  const source = read('src/game-review-tools.source.js');
  assert.match(source, /thinking-dot/);
  assert.match(source, /analysisCpuProgress/);
  assert.match(source, /exit-strategy:cpuplus-progress/);
});

test('pre-game screens can return to the main menu', () => {
  const source = read('src/pre-game-navigation.js');
  assert.match(source, /Return to main menu/);
  assert.match(source, /newGameButton\.click/);
  assert.match(read('index.html'), /pre-game-navigation\.js/);
});

test('trained CPU+ starter profile is downloadable and keeps a valid checksum', () => {
  const source = read('src/pre-game-navigation.js');
  const profileText = read('downloads/cpuplus-trained-profile-2026-07-14.json');
  const profile = JSON.parse(profileText);
  const body = {
    format: profile.format,
    schemaVersion: profile.schemaVersion,
    exportedAt: profile.exportedAt,
    database: profile.database
  };
  const checksum = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  assert.equal(profile.checksum, checksum);
  const placements = Object.keys(profile.database.placements).length;
  const games = Object.values(profile.database.placements).reduce((sum, stat) => sum + stat.rawGames, 0);
  assert.ok(placements > 0);
  assert.ok(games > 0);
  assert.match(source, /Download trained profile/);
  assert.match(source, /cpuplus-trained-profile-2026-07-14\.json/);
  assert.match(source, new RegExp(`${placements} placements and ${games} recorded results`));
  const readme = read('README.md');
  assert.match(readme, /Download the trained CPU\+ starter profile/);
  assert.match(readme, new RegExp(`${placements} learned placements and ${games} recorded results`));
});


test('human versus CPU supports safe undo and replaying previous setups', () => {
  const app = read('src/app-v2.js');
  const review = read('src/game-review-tools.source.js');
  assert.match(app, /undoHumanMove/);
  assert.match(app, /queueReplaySetup/);
  assert.match(app, /state\.undoStack/);
  assert.match(review, /Replay the same starting setups/);
  assert.match(review, /commonLength/);
  assert.match(read('index.html'), /undoMoveButton/);
});

test('move history has one explicit move number and side-colored rows', () => {
  const app = read('src/app-v2.js');
  const styles = read('styles.css');
  assert.match(app, /history-cyan/);
  assert.match(app, /history-magenta/);
  assert.match(styles, /list-style: none/);
  assert.match(styles, /border-left-color: var\(--cyan\)/);
  assert.match(styles, /border-left-color: var\(--magenta\)/);
});


test('browser assets are cache-busted and a favicon is installed', () => {
  const index = read('index.html');
  assert.match(index, /favicon\.svg\?v=20260714-5/);
  assert.match(index, /styles\.css\?v=20260714-5/);
  assert.match(index, /src\/app-v2\.js\?v=20260714-5/);
  assert.match(index, /src\/last-move\.js\?v=20260714-5/);
  assert.match(index, /<ul id="history"/);
  assert.match(read('favicon.svg'), /Exit Strategy 3 favicon/);
});

test('CPU workers use the current build version', () => {
  const app = read('src/app-v2.js');
  assert.match(app, /cpu3-worker\.js\?v=20260714-5/);
  assert.match(app, /cpuplus-worker\.js\?v=20260714-5/);
});


test('CPU+ non-timed search uses depth, time, stability and absolute limits', () => {
  const cpuplus = require('../src/cpuplus.js');
  const app = read('src/app-v2.js');
  const worker = read('src/cpuplus-worker-v2.js');
  assert.equal(cpuplus.DEEP_MIN_DEPTH, 12);
  assert.equal(cpuplus.DEEP_MIN_MS, 90000);
  assert.equal(cpuplus.DEEP_STABLE_DEPTHS, 3);
  assert.equal(cpuplus.DEEP_MAX_DEPTH, 20);
  assert.equal(cpuplus.DEEP_HARD_MAX_MS, 300000);
  assert.match(app, /Play best fully evaluated move now/);
  assert.match(app, /stopWhenStable: true/);
  assert.match(worker, /stableDepthCount/);
  assert.match(worker, /stopReason = 'max-time'/);
});

test('CPU+ placement lottery ranks tried setups and shares the remainder equally', () => {
  const cpuplus = require('../src/cpuplus.js');
  const candidates = [
    { key: 'first|H:A2|P:B1,B2,B3,B5,B6', baseScore: 1 },
    { key: 'first|H:A3|P:B1,B2,B3,B5,B6', baseScore: 1 },
    { key: 'first|H:A4|P:B1,B2,B3,B5,B6', baseScore: 1 },
    { key: 'first|H:A2|P:C1,C2,C3,C5,C6', baseScore: 1 }
  ];
  const database = cpuplus.emptyDatabase();
  database.placements[candidates[0].key] = { weightedScore: 8, weightedGames: 10, rawGames: 10, wins: 8, draws: 0, losses: 2 };
  database.placements[candidates[1].key] = { weightedScore: 0.66, weightedGames: 0.66, rawGames: 1, wins: 1, draws: 0, losses: 0 };
  const lottery = cpuplus.buildPlacementLottery(candidates, database);
  const known = lottery.entries.filter((entry) => entry.rank);
  const unknown = lottery.entries.filter((entry) => !entry.rank);
  assert.equal(known[0].probability, 0.1);
  assert.equal(known[1].probability, 0.05);
  assert.equal(unknown.length, 2);
  assert.ok(Math.abs(unknown[0].probability - 0.425) < 1e-12);
  assert.equal(unknown[0].probability, unknown[1].probability);
  assert.ok(Math.abs(lottery.entries.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-12);
});

test('the last untried placement may become more likely than rank one', () => {
  const cpuplus = require('../src/cpuplus.js');
  const candidates = Array.from({ length: 1716 }, (_, index) => ({ key: `first|candidate-${index}`, baseScore: 1716 - index }));
  const database = cpuplus.emptyDatabase();
  candidates.slice(0, -1).forEach((candidate, index) => {
    database.placements[candidate.key] = {
      weightedScore: 1,
      weightedGames: 2 + index / 10000,
      rawGames: 1,
      wins: 1,
      draws: 0,
      losses: 0
    };
  });
  const lottery = cpuplus.buildPlacementLottery(candidates, database);
  const unknown = lottery.entries.find((entry) => !entry.rank);
  const rankOne = lottery.entries.find((entry) => entry.rank === 1);
  assert.ok(unknown.probability > 0.19);
  assert.equal(rankOne.probability, 0.1);
  assert.ok(unknown.probability > rankOne.probability);
});
