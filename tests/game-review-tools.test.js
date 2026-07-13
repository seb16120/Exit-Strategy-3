'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const payloadPath = path.join(__dirname, '..', 'src', 'game-review-tools.payload');

function readSource() {
  const payload = fs.readFileSync(payloadPath, 'utf8').trim();
  return zlib.gunzipSync(Buffer.from(payload, 'base64')).toString('utf8');
}

test('game review payload is valid JavaScript', () => {
  const source = readSource();
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /ES3-PGN\/1/);
  assert.match(source, /ES3-FEN\/1/);
});

test('game review payload includes the requested flows', () => {
  const source = readSource();
  assert.match(source, /Analyze game/);
  assert.match(source, /Return to menu/);
  assert.match(source, /Next CPU move/);
  assert.match(source, /Paste ES3-PGN \/ ES3-FEN/);
  assert.match(source, /You win/);
});
