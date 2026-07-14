'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'cpuplus-merge-version.js');
const source = fs.readFileSync(sourcePath, 'utf8');

test('CPU+ merge and version module is valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(source));
});

test('CPU+ merge module includes links, JSON and duplicate protection', () => {
  assert.match(source, /Merge again anyway/);
  assert.match(source, /Choose JSON file/);
  assert.match(source, /cpuplus-share/);
  assert.match(source, /cpuplus-part/);
  assert.match(source, /v2026\.07 · Learning Lab/);
  assert.match(source, /confirmMoves/);
});
