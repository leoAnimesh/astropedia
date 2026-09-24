import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanFinalReply,
  cleanForDisplay,
  createReplyBudget,
  createThinkStreamFilter,
  cutAtMarkupDebris,
  dedupeRepetition,
  stripLeadingHeadline,
} from '../utils/reply-cleanup';

/**
 * Mirrors useChat's pumpStream: tokens → think filter → streaming buffer
 * (with the leading-whitespace trim and the pre-amble wipe on <think>).
 */
function pump(tokens: string[]): string {
  let out = '';
  let seen = false;
  const filter = createThinkStreamFilter({
    emit: (t) => {
      let chunk = t;
      if (!seen) {
        chunk = chunk.replace(/^\s+/, '');
        if (!chunk) return;
        seen = true;
      }
      out += chunk;
    },
    enterThinking: () => { out = ''; seen = false; },
  });
  for (const t of tokens) filter.push(t);
  filter.end();
  return out;
}

function chunk(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// Realistic, well-formed replies in the shapes each model produces.
const SAGA_REPLY =
  'The next 12 to 18 months are your **strongest window** for a job switch, especially from mid-2027.\n\n' +
  "Start talking to people in design or teaching now — that's where the chart leans. " +
  'Don’t rush the first offer; the second one fits better.';

const KRISHNA_REPLY =
  'That feeling is honest. The mind grows loud when life shifts. What does the quiet under it already know?\n\n' +
  '— From the Gita:\n"You have the right to your work, but never to the fruits of it."';

const QWEN_RAW =
  '<think>\nThe user asks about career. Saturn phase until 2029-03-14.\n</think>\n\n' +
  SAGA_REPLY +
  '\n<recs>{"items":[{"type":"tarot","title":"Career Tarot Reading"}]}</recs>';

test('well-formed replies pass through the full pipeline unchanged', () => {
  assert.equal(cleanFinalReply(SAGA_REPLY), SAGA_REPLY);
  assert.equal(cleanFinalReply(KRISHNA_REPLY), KRISHNA_REPLY);
  assert.equal(cleanForDisplay(SAGA_REPLY), SAGA_REPLY);
  assert.equal(cleanForDisplay(KRISHNA_REPLY), KRISHNA_REPLY);
});

test('only the intended edits are made: think, recs, jargon, ISO dates', () => {
  assert.equal(cleanFinalReply(QWEN_RAW), SAGA_REPLY);
  assert.equal(
    cleanFinalReply('Your Mahadasha of Saturn ends by 2029-03-14. Work steadies after that.'),
    'Your Saturn phase ends by 2029. Work steadies after that.',
  );
});

test('streaming at every chunk size reproduces the text exactly', () => {
  const cases: [string, string][] = [
    [SAGA_REPLY, SAGA_REPLY],
    [KRISHNA_REPLY, KRISHNA_REPLY],
    [QWEN_RAW, SAGA_REPLY],
    // Pre-amble before <think> is wiped from the live buffer.
    ['Sure! <think>hmm</think>' + SAGA_REPLY, SAGA_REPLY],
  ];
  for (const [raw, expected] of cases) {
    for (let size = 1; size <= 12; size++) {
      const buffer = pump(chunk(raw, size));
      assert.equal(cleanFinalReply(buffer), expected, `chunk size ${size}`);
    }
  }
  // Prose without tags is streamed byte-for-byte.
  for (let size = 1; size <= 12; size++) assert.equal(pump(chunk(SAGA_REPLY, size)), SAGA_REPLY);
});

test('an orphan </think> split across tokens hides everything before it', () => {
  for (let size = 1; size <= 10; size++) {
    assert.equal(pump(chunk('reasoning here</think>Answer.', size)), 'Answer.', `chunk size ${size}`);
  }
});

test('the on-device garble is not produced by post-processing', () => {
  // Reply 2 from the demo contains no tags; the pipeline leaves it as the
  // model wrote it — the nonsense words came from the model itself.
  const modelText =
    'A genuine opportunity might appear as an “upch” within “upwards” this season. ' +
    'A stronger opportunity may emerge from “twoch” alongside “threech”.';
  assert.equal(cleanFinalReply(modelText), modelText);
  // Partial-<recs> hiding only trims an opener at the very end of the buffer.
  assert.equal(cleanForDisplay('A job switch—<re'), 'A job switch—');
  assert.equal(cleanForDisplay('Choose 3 < 5 options.'), 'Choose 3 < 5 options.');
});

test('tag-shaped gibberish is cut back to the last complete sentence', () => {
  assert.equal(cutAtMarkupDebris('Your Chart Says When I Will Do A Job Switch—[upch]twoch>threeuch>'), '');
  assert.equal(cleanFinalReply('Your Chart Says When I Will Do A Job Switch—[upch]twoch>threeuch>'), '');
  assert.equal(
    cleanFinalReply('A switch looks likely within 12 months. Prepare now. The upch>two<ch> window'),
    'A switch looks likely within 12 months. Prepare now.',
  );
  // Harmless inline HTML is unwrapped, markdown links are not debris.
  assert.equal(cutAtMarkupDebris('This is <b>your</b> year.'), 'This is your year.');
  assert.equal(cutAtMarkupDebris('Read [this guide](https://x.y) first.'), 'Read [this guide](https://x.y) first.');
});

test('a Title-Case headline above the answer is dropped, a lone one is kept', () => {
  const headline = 'Your Chart Says About Career Giving Opportunities This Season';
  assert.equal(stripLeadingHeadline(headline), headline);
  assert.equal(stripLeadingHeadline(`${headline}\n\nThe next year is strong for work.`), 'The next year is strong for work.');
  // Sentence-case first lines and punctuated lines stay.
  const normal = 'Good news on work.\nThe next year is strong.';
  assert.equal(stripLeadingHeadline(normal), normal);
  const plain = 'here is how the year looks\nThe next year is strong.';
  assert.equal(stripLeadingHeadline(plain), plain);
});

test('dedupeRepetition keeps paragraph breaks and still cuts loops', () => {
  const para = 'First line is here now. Second line is here now.\n\nThird line is here now. Fourth line is here now.';
  assert.equal(dedupeRepetition(para), para);
  const loop = 'The time is coming soon. Be patient with it. The time is coming soon. Be patient with it.';
  assert.equal(dedupeRepetition(loop), 'The time is coming soon. Be patient with it.');
});

test('reply budget ends on the first sentence end past the limit', () => {
  const budget = createReplyBudget(20);
  assert.deepEqual(budget.feed('The next year looks '), { text: 'The next year looks ', stop: false });
  assert.deepEqual(budget.feed('good. Start now'), { text: 'good.', stop: true });
  assert.deepEqual(budget.feed(' please.'), { text: '', stop: true });
});

test('reply budget stops at twice the limit without a sentence end', () => {
  const budget = createReplyBudget(10);
  assert.equal(budget.feed('aaaaaaaaaaaa').stop, false);
  const r = budget.feed('bbbbbbbbbbbb');
  assert.equal(r.stop, true);
  assert.equal(r.text, 'bbbbbbbb');
});
