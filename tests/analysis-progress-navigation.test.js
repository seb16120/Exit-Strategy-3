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
  assert.equal(Object.keys(profile.database.placements).length, 14);
  assert.equal(Object.values(profile.database.placements).reduce((sum, stat) => sum + stat.rawGames, 0), 43);
  assert.match(source, /Download trained profile/);
  assert.match(source, /cpuplus-trained-profile-2026-07-14\.json/);
  assert.match(read('README.md'), /Download the trained CPU\+ starter profile/);
});
