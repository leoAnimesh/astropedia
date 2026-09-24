import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePayload, normalizeRecommendations, reviveLoadedMessages } from '../utils/conversation-normalize';
import { ASSIGNMENT_MOCK_PAYLOAD, DEMO_EARLIER_SESSION } from '../constants/demo-conversation';
import { msg } from './helpers';

const opts = { threadId: 't', idPrefix: 't', startAt: Date.UTC(2026, 8, 24, 10), stepMs: 1000, humanAuthor: 'Meera' };

test('assignment payload maps every message type', () => {
  const out = normalizePayload(ASSIGNMENT_MOCK_PAYLOAD, opts);
  assert.deepEqual(out.map((m) => m.role), ['system', 'user', 'assistant', 'human']);
  assert.equal(out[2].recommendations?.length, 4);
  assert.deepEqual(out[2].recommendations?.map((r) => r.type), ['gemstone', 'tarot', 'consultation', 'article']);
  assert.equal(out[3].authorName, 'Meera');
  assert.equal(out[1].status, 'sent');
  // timestamps are synthesised in order
  assert.ok(out.every((m, i) => i === 0 || m.createdAt > out[i - 1].createdAt));
});

test('demo session keeps unknown rec types but drops malformed ones', () => {
  const out = normalizePayload(DEMO_EARLIER_SESSION, opts);
  const recs = out[2].recommendations ?? [];
  assert.deepEqual(recs.map((r) => r.type), ['promotion', 'remedy', 'live_session']);
});

test('unknown message types and empty text are dropped', () => {
  const out = normalizePayload([
    { id: '1', type: 'bot', text: 'x' },
    { id: '2', type: 'user', text: '   ' },
    { id: '3', type: 'user', text: 'ok' },
    'garbage',
  ], opts);
  assert.deepEqual(out.map((m) => m.content), ['ok']);
});

test('recommendations: undefined / non-array / duplicate ids', () => {
  assert.deepEqual(normalizeRecommendations(undefined), []);
  assert.deepEqual(normalizeRecommendations({}), []);
  const recs = normalizeRecommendations([
    { id: '1', type: 'tarot', title: 'A' },
    { id: '1', type: 'tarot', title: 'B' },
  ]);
  assert.equal(new Set(recs.map((r) => r.id)).size, 2);
});

test('a message persisted mid-send is revived as failed/interrupted', () => {
  const [a, b] = reviveLoadedMessages([
    msg({ role: 'user', status: 'sending' }),
    msg({ role: 'user', status: 'sent' }),
  ]);
  assert.equal(a.status, 'failed');
  assert.equal(a.failureReason, 'interrupted');
  assert.equal(b.status, 'sent');
});
