import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecommendations,
  detectPlanets,
  detectTopics,
  looseParseRecs,
  sanitizeModelRecommendations,
  splitRecsBlock,
  stripRecsForDisplay,
} from '../utils/recommendation-rules';

test('splitRecsBlock separates prose from a complete block', () => {
  const r = splitRecsBlock('Great year ahead.\n<recs>{"items":[]}</recs>');
  assert.equal(r.prose, 'Great year ahead.');
  assert.equal(r.raw, '{"items":[]}');
  assert.equal(r.hasBlock, true);
});

test('splitRecsBlock tolerates a missing closing tag and odd spacing', () => {
  const r = splitRecsBlock('Answer.\n< recs >{"items":[{"type":"tarot","title":"X"}]');
  assert.equal(r.prose, 'Answer.');
  assert.ok(r.raw.startsWith('{"items"'));
});

test('no block → hasBlock false, prose untouched', () => {
  assert.deepEqual(splitRecsBlock('Just prose.'), { prose: 'Just prose.', raw: '', hasBlock: false });
});

test('stripRecsForDisplay hides a block and a partially-streamed opener', () => {
  assert.equal(stripRecsForDisplay('Hello there. <recs>{"it'), 'Hello there.');
  assert.equal(stripRecsForDisplay('Hello there. <re'), 'Hello there.');
  assert.equal(stripRecsForDisplay('Hello there. <'), 'Hello there.');
  assert.equal(stripRecsForDisplay('3 < 5 is true'), '3 < 5 is true');
});

test('looseParseRecs repairs single quotes and trailing commas, keeps apostrophes', () => {
  assert.deepEqual(looseParseRecs("{'items':[{'type':'tarot','title':'Love Reading',}],}"), {
    items: [{ type: 'tarot', title: 'Love Reading' }],
  });
  const withApostrophe = looseParseRecs('{"items":[{"type":"gemstone","title":"Cat\'s Eye"}]}') as { items: { title: string }[] };
  assert.equal(withApostrophe.items[0].title, "Cat's Eye");
  assert.deepEqual(looseParseRecs('[{"type":"article","title":"A"}]'), { items: [{ type: 'article', title: 'A' }] });
  assert.throws(() => looseParseRecs('nothing here'));
});

test('sanitizeModelRecommendations enforces categories, cap, dedupe and enriches meta', () => {
  const recs = sanitizeModelRecommendations({
    items: [
      { type: 'Gemstone', title: '  Blue   Sapphire ', subtitle: 'For Saturn' },
      { type: 'gemstone', title: 'blue sapphire' },           // duplicate
      { type: 'crypto', title: 'Buy coins' },                  // unknown category
      { type: 'tarot' },                                        // no title
      { type: 'promotion', title: "Today's Panchang" },
      { type: 'article', title: 'Understanding Jupiter' },
      { type: 'remedy', title: 'Extra item beyond the cap' },
    ],
  }, 'x');
  assert.equal(recs.length, 3);
  assert.deepEqual(recs.map((r) => r.type), ['gemstone', 'promotion', 'article']);
  assert.equal(recs[0].title, 'Blue Sapphire');
  assert.equal(recs[0].meta?.planet, 'Saturn');
  assert.equal(recs[1].meta?.route, '/panchang');
  assert.equal(recs[2].meta?.corpusId, 'dasha-jupiter');
  assert.equal(new Set(recs.map((r) => r.id)).size, 3);
});

test('sanitize never throws on garbage', () => {
  for (const g of [null, undefined, 42, 'x', [], { items: 'no' }, { items: [null, 1, 'a'] }]) {
    assert.deepEqual(sanitizeModelRecommendations(g, 's'), []);
  }
});

test('topic + planet detection ignores sun-sign style false positives', () => {
  assert.deepEqual(detectTopics('When will my career take off?'), ['career', 'timing']);
  assert.deepEqual(detectPlanets('Your sun sign is Leo and Saturn slows things, then Jupiter helps'), ['Saturn', 'Jupiter']);
  assert.deepEqual(detectPlanets('Full moon on Monday'), []);
});

test('keyword fallback: career + Saturn → gemstone, tarot, article, consultation', () => {
  const recs = buildRecommendations({
    userText:  'Can you tell me about my career this year?',
    replyText: 'Saturn is shaping your work life right now.',
    idSeed:    'a',
  });
  assert.deepEqual(recs.map((r) => r.type), ['gemstone', 'tarot', 'article', 'consultation']);
  assert.equal(recs[0].title, 'Blue Sapphire');
  assert.equal(recs[2].title, 'Understanding Saturn Mahadasha');
});

test('keyword fallback: small talk → no cards; dasha lord used only when a topic exists', () => {
  assert.deepEqual(buildRecommendations({ userText: 'thanks!', replyText: 'Any time.', dashaLord: 'Venus', idSeed: 'b' }), []);
  const recs = buildRecommendations({ userText: 'How is my love life?', replyText: 'Warm months ahead.', dashaLord: 'Venus', idSeed: 'c' });
  assert.equal(recs[0].type, 'gemstone');
  assert.equal(recs[0].meta?.planet, 'Venus');
  assert.ok(recs.some((r) => r.type === 'promotion' && r.meta?.route === '/compatibility'));
});

test('keyword fallback respects max', () => {
  const recs = buildRecommendations({
    userText: 'When should I marry? Any remedy?', replyText: 'Jupiter blesses marriage.', idSeed: 'd', max: 2,
  });
  assert.equal(recs.length, 2);
});
