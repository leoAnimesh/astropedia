import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISK_HEADROOM_BYTES,
  hasRoomForDownload,
  planModels,
  upgradeRetryDelayMs,
} from '../utils/model-plan';

const MB = 1024 ** 2;
const SIZES: Record<string, number> = {
  lfm2_5_350m_q: 200 * MB,
  lfm2_5_1_2b_q: 740 * MB,
  qwen3_1_7b_q:  900 * MB,
};
const sizeOf  = (v: string) => SIZES[v] ?? Number.MAX_SAFE_INTEGER;
const STARTER = 'lfm2_5_350m_q';
const plan = (target: string, onDisk: string[]) =>
  planModels({ target, starter: STARTER, onDisk, sizeOf });

test('fresh install on a big tier: starter in the foreground, target in the background', () => {
  assert.deepEqual(plan('qwen3_1_7b_q', []), {
    load: null, foreground: STARTER, background: 'qwen3_1_7b_q', removable: [],
  });
});

test('fresh install on the floor tier: one blocking download, no upgrade', () => {
  assert.deepEqual(plan(STARTER, []), {
    load: null, foreground: STARTER, background: null, removable: [],
  });
});

test('starter on disk, upgrade unfinished (e.g. app killed): load starter, resume upgrade', () => {
  assert.deepEqual(plan('lfm2_5_1_2b_q', [STARTER]), {
    load: STARTER, foreground: null, background: 'lfm2_5_1_2b_q', removable: [],
  });
});

test('target on disk: load it and mark the starter removable', () => {
  assert.deepEqual(plan('qwen3_1_7b_q', [STARTER, 'qwen3_1_7b_q']), {
    load: 'qwen3_1_7b_q', foreground: null, background: null, removable: [STARTER],
  });
});

test('floor target never marks itself removable', () => {
  assert.deepEqual(plan(STARTER, [STARTER]).removable, []);
});

test('picker upgrade: keep the best smaller model on disk while the new one downloads', () => {
  const p = plan('qwen3_1_7b_q', [STARTER, 'lfm2_5_1_2b_q']);
  assert.equal(p.load, 'lfm2_5_1_2b_q');
  assert.equal(p.background, 'qwen3_1_7b_q');
  assert.equal(p.foreground, null);
});

test('never loads a model heavier than the target', () => {
  // Downgraded in Settings to 1.2B; only Qwen (bigger) and the starter are on disk.
  assert.equal(plan('lfm2_5_1_2b_q', ['qwen3_1_7b_q', STARTER]).load, STARTER);
  // …and with only Qwen on disk, fall back to the starter download.
  assert.deepEqual(plan('lfm2_5_1_2b_q', ['qwen3_1_7b_q']), {
    load: null, foreground: STARTER, background: 'lfm2_5_1_2b_q', removable: [],
  });
});

test('versions unknown to this build are ignored', () => {
  assert.equal(plan('lfm2_5_1_2b_q', ['llama3_2_1b_spinquant']).load, null);
});

test('retry backoff grows and is capped at an hour', () => {
  assert.equal(upgradeRetryDelayMs(0), 30_000);
  assert.equal(upgradeRetryDelayMs(1), 120_000);
  assert.equal(upgradeRetryDelayMs(2), 480_000);
  assert.equal(upgradeRetryDelayMs(10), 3_600_000);
  assert.equal(upgradeRetryDelayMs(-3), 30_000);
});

test('disk check keeps headroom and tolerates unknown free space', () => {
  assert.equal(hasRoomForDownload(null, 900 * MB), true);
  assert.equal(hasRoomForDownload(900 * MB + DISK_HEADROOM_BYTES, 900 * MB), true);
  assert.equal(hasRoomForDownload(900 * MB + DISK_HEADROOM_BYTES - 1, 900 * MB), false);
  assert.equal(hasRoomForDownload(Number.NaN, 900 * MB), true);
});
