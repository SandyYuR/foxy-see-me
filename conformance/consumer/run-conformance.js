#!/usr/bin/env node
'use strict';

/*
 * Foxy layout conformance runner (zero dependencies).
 *
 * Copy this file into the third-party editor repository, then provide an
 * adapter module that maps the editor's compiler to the canonical shape in
 * `conformance/cases/<case>/expected.json`.
 *
 *   node run-conformance.js --root ../conformance --adapter ./foxy-adapter.js
 *
 * Adapter contract:
 *
 *   module.exports = {
 *     // Optional: return true when the profile is accepted by the editor.
 *     validateProfile(input, meta) { ... },
 *
 *     // Required: compile one named layout under one Rime status.
 *     // meta = { name, layoutId, schemaId, splitRequested, statusName, status }
 *     // Return the same object shape as expected.statuses[statusName], or null.
 *     compile(input, meta) { ... },
 *   };
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { root: path.join(__dirname, '..'), adapter: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') args.root = argv[++i];
    else if (arg === '--adapter') args.adapter = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: node run-conformance.js --root <conformance-dir> --adapter <module.js>');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  if (!args.adapter) throw new Error('missing --adapter <module.js>');
  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/* Recursively sort object keys so comparison does not depend on key order.
 * Numbers compare numerically: 1 and 1.0 are the same value. */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  return value;
}

function firstDiff(expected, actual, at) {
  at = at || '';
  if (expected === actual) return null;
  if (typeof expected === 'number' && typeof actual === 'number') {
    return expected === actual ? null : at + ': expected ' + expected + ', got ' + actual;
  }
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    return at + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual);
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      return at + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual);
    }
    if (expected.length !== actual.length) {
      return at + ': expected length ' + expected.length + ', got ' + actual.length;
    }
    for (let i = 0; i < expected.length; i++) {
      const diff = firstDiff(expected[i], actual[i], at + '[' + i + ']');
      if (diff) return diff;
    }
    return null;
  }
  if (typeof expected === 'object') {
    const keys = new Set([].concat(Object.keys(expected), Object.keys(actual)));
    for (const key of Array.from(keys).sort()) {
      const diff = firstDiff(expected[key], actual[key], at ? at + '.' + key : key);
      if (diff) return diff;
    }
    return null;
  }
  return at + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual);
}

function main() {
  const args = parseArgs(process.argv);
  const root = path.resolve(args.root);
  const adapter = require(path.resolve(args.adapter));
  if (typeof adapter.compile !== 'function') {
    throw new Error('adapter must export compile(input, meta)');
  }

  const manifest = readJson(path.join(root, 'manifest.json'));
  let checks = 0;
  let failed = 0;

  for (const name of manifest.cases) {
    const dir = path.join(root, 'cases', name);
    const input = readJson(path.join(dir, 'input.json'));
    const meta = readJson(path.join(dir, 'case.json'));
    const expected = readJson(path.join(dir, 'expected.json'));

    if (typeof adapter.validateProfile === 'function') {
      checks++;
      const actualProfile = !!adapter.validateProfile(input, meta);
      if (actualProfile !== expected.profile) {
        failed++;
        console.error('✗ ' + name + ' profile: expected ' + expected.profile + ', got ' + actualProfile);
      }
    }

    for (const statusName of Object.keys(expected.statuses)) {
      checks++;
      let actual;
      try {
        actual = adapter.compile(input, Object.assign({}, meta, {
          statusName,
          status: meta.statuses[statusName],
        }));
      } catch (error) {
        failed++;
        console.error('✗ ' + name + '/' + statusName + ' threw: ' + (error && error.message));
        continue;
      }
      const diff = firstDiff(stable(expected.statuses[statusName]), stable(actual));
      if (diff) {
        failed++;
        console.error('✗ ' + name + '/' + statusName + ' ' + diff);
      }
    }
  }

  if (failed > 0) {
    console.error('\n' + failed + '/' + checks + ' conformance checks failed.');
    process.exit(1);
  }
  console.log('conformance v' + manifest.version + ': ' + checks + ' checks passed.');
}

main();
