/**
 * Pure recommendation logic shared by the prompt, the stream filter and the
 * post-processing step. Recommendations are produced in a SINGLE generation:
 *
 *   1. The system prompt (RECS_PROMPT) asks the model to finish its prose
 *      answer with one `<recs>{"items":[...]}</recs>` block (0-3 items, fixed
 *      category list, 2 few-shot examples).
 *   2. While streaming, everything from `<recs` onward is hidden
 *      (stripRecsForDisplay), so the user only ever sees prose.
 *   3. After completion the block is parsed (utils/recommendations.ts uses
 *      react-native-executorch's fixAndValidateStructuredOutput → jsonrepair
 *      + JSON-schema) and sanitised here (sanitizeModelRecommendations).
 *   4. If the block is missing/malformed/empty-but-relevant — or the device is
 *      on the smallest model tier — the deterministic keyword → category
 *      mapper (buildRecommendations) runs over the real reply text instead.
 *
 * No React / RN imports (unit-tested in Node — see tests/).
 */
import type { Recommendation } from '../types/conversation';

export type Topic =
  | 'career' | 'love' | 'marriage' | 'money' | 'health'
  | 'family' | 'education' | 'spirituality' | 'timing';

export type Planet =
  | 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter'
  | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';

export const PLANETS: readonly Planet[] = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
];

const TOPIC_PATTERNS: Record<Topic, RegExp> = {
  career:       /\b(career|job|work|promotion|business|profession|boss|office|interview|startup)\b/i,
  love:         /\b(love|relationship|partner|romance|crush|dating|soulmate|boyfriend|girlfriend)\b/i,
  marriage:     /\b(marriage|marry|married|wedding|spouse|husband|wife)\b/i,
  money:        /\b(money|finance|financial|wealth|income|salary|debt|invest(ment)?|abundance)\b/i,
  health:       /\b(health|illness|sick|energy levels|sleep|stress|anxiety|body|wellbeing)\b/i,
  family:       /\b(family|mother|father|parents?|siblings?|children|kids?|home)\b/i,
  education:    /\b(study|studies|exam|education|college|university|school|learning)\b/i,
  spirituality: /\b(spiritual|meditation|karma|dharma|purpose|soul|mantra|peace)\b/i,
  timing:       /\b(when|today|tomorrow|this week|auspicious|muhurat|good day|right time|timing)\b/i,
};

/** Words that look like planet names but aren't about the planet. */
const PLANET_FALSE_POSITIVES = /\b(sun sign|moon sign|sunday|monday|honeymoon|full moon|new moon|sunlight|sunrise|sunset)\b/gi;

export const PLANET_INFO: Record<Planet, {
  gem: string; mantra: string; day: string; theme: string;
}> = {
  Sun:     { gem: 'Ruby',            mantra: 'Om Suryaya Namah',          day: 'Sunday',    theme: 'confidence and recognition' },
  Moon:    { gem: 'Pearl',           mantra: 'Om Chandraya Namah',        day: 'Monday',    theme: 'emotional balance' },
  Mars:    { gem: 'Red Coral',       mantra: 'Om Mangalaya Namah',        day: 'Tuesday',   theme: 'courage and drive' },
  Mercury: { gem: 'Emerald',         mantra: 'Om Budhaya Namah',          day: 'Wednesday', theme: 'clear communication' },
  Jupiter: { gem: 'Yellow Sapphire', mantra: 'Om Gurave Namah',           day: 'Thursday',  theme: 'growth and good counsel' },
  Venus:   { gem: 'Diamond',         mantra: 'Om Shukraya Namah',         day: 'Friday',    theme: 'love and harmony' },
  Saturn:  { gem: 'Blue Sapphire',   mantra: 'Om Shanaischaraya Namah',   day: 'Saturday',  theme: 'discipline and patience' },
  Rahu:    { gem: 'Hessonite',       mantra: 'Om Rahave Namah',           day: 'Saturday',  theme: 'ambition without confusion' },
  Ketu:    { gem: "Cat's Eye",       mantra: 'Om Ketave Namah',           day: 'Tuesday',   theme: 'detachment and insight' },
};

const TOPIC_LABEL: Record<Topic, string> = {
  career:       'Career',
  love:         'Love',
  marriage:     'Marriage',
  money:        'Wealth',
  health:       'Wellbeing',
  family:       'Family',
  education:    'Studies',
  spirituality: 'Inner Path',
  timing:       'Timing',
};

/** Topics where a longer, human-led reading genuinely adds value. */
const HIGH_STAKES: readonly Topic[] = ['marriage', 'career', 'health', 'money'];

// ─── <recs> block protocol ──────────────────────────────────────────────────

export const RECS_OPEN  = '<recs>';
export const RECS_CLOSE = '</recs>';

/** Categories the model may emit. Anything else is discarded. */
export const MODEL_RECOMMENDATION_TYPES = [
  'gemstone', 'tarot', 'consultation', 'article', 'remedy', 'promotion',
] as const;

export const MAX_MODEL_RECOMMENDATIONS = 3;

/**
 * Appended to the Saga system prompt (not on the floor tier). Kept short —
 * on-device context windows are small — with two few-shot examples: one with
 * items, one empty, so the model learns that "nothing" is a valid answer.
 */
export const RECS_PROMPT = `Recommendations
After your answer, add ONE final line: a <recs> block with 0 to 3 items that genuinely help with THIS question. Allowed types: gemstone, tarot, consultation, article, remedy, promotion. Titles are 2 to 5 plain words. Never mention the block in your answer.

Example
User: Will my career grow this year?
Answer: The next 12 months are a steady climb at work, with a bigger role likely by spring. Say yes to the harder project when it comes.
<recs>{"items":[{"type":"gemstone","title":"Blue Sapphire","subtitle":"For Saturn's discipline"},{"type":"tarot","title":"Career Tarot Reading"}]}</recs>

Example
User: Thanks, that helps!
Answer: Glad it helped. Come back any time.
<recs>{"items":[]}</recs>`;

/** JSON schema handed to fixAndValidateStructuredOutput. */
export const RECS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type:     { type: 'string' },
          title:    { type: 'string' },
          subtitle: { type: 'string' },
        },
        required: ['type', 'title'],
      },
    },
  },
  required: ['items'],
} as const;

/**
 * Split raw model output into the visible prose and the raw recs payload
 * (text after `<recs>`, up to `</recs>` if present). `hasBlock` is false when
 * the model never opened a block.
 */
export function splitRecsBlock(text: string): { prose: string; raw: string; hasBlock: boolean } {
  const open = text.search(/<\s*recs\s*>/i);
  if (open === -1) return { prose: text.trim(), raw: '', hasBlock: false };
  const after = text.slice(open).replace(/^<\s*recs\s*>/i, '');
  const close = after.search(/<\s*\/\s*recs\s*>/i);
  return {
    prose:    text.slice(0, open).trim(),
    raw:      (close === -1 ? after : after.slice(0, close)).trim(),
    hasBlock: true,
  };
}

// A `<recs>` opener that has only partially streamed in ("<", "<re", ...).
const PARTIAL_RECS_TAIL = /<(?:\s*r(?:e(?:c(?:s)?)?)?)?\s*$/i;

/**
 * Streaming-safe display text: hide everything from `<recs` onward, plus a
 * partially-typed opener at the very end of the buffer.
 */
export function stripRecsForDisplay(text: string): string {
  const open = text.search(/<\s*recs/i);
  const head = open === -1 ? text : text.slice(0, open);
  return head.replace(PARTIAL_RECS_TAIL, '').trimEnd();
}

/** Best-effort dependency-free parse, used when the library parser is unavailable. */
export function looseParseRecs(raw: string): unknown {
  const start = raw.search(/[{[]/);
  if (start === -1) throw new Error('no JSON in recs block');
  const opener = raw[start];
  const closer = opener === '{' ? '}' : ']';
  const end = raw.lastIndexOf(closer);
  const slice = end > start ? raw.slice(start, end + 1) : raw.slice(start);
  // Small models often use single quotes or leave trailing commas. Only swap
  // quotes when there are no double quotes, so apostrophes survive.
  const quoted = slice.includes('"') ? slice : slice.replace(/'/g, '"');
  const repaired = quoted.replace(/,\s*([}\]])/g, '$1');
  const parsed = JSON.parse(repaired) as unknown;
  return Array.isArray(parsed) ? { items: parsed } : parsed;
}

// ─── Detection ───────────────────────────────────────────────────────────────

export function detectTopics(text: string): Topic[] {
  return (Object.keys(TOPIC_PATTERNS) as Topic[]).filter((t) => TOPIC_PATTERNS[t].test(text));
}

/** Planets in order of first mention. */
export function detectPlanets(text: string): Planet[] {
  const scrubbed = text.replace(PLANET_FALSE_POSITIVES, ' ');
  const hits: { planet: Planet; index: number }[] = [];
  for (const planet of PLANETS) {
    const m = new RegExp(`\\b${planet}\\b`, 'i').exec(scrubbed);
    if (m) hits.push({ planet, index: m.index });
  }
  return hits.sort((a, b) => a.index - b.index).map((h) => h.planet);
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

export type RecommendationInput = {
  userText:   string;
  replyText:  string;
  /** Current life-period (mahadasha) ruler from the profile's chart, if known. */
  dashaLord?: Planet | null;
  /** Unique-ish seed so ids don't collide across replies. */
  idSeed:     string;
  max?:       number;
};

/**
 * Map the detected signals to cards. Returns [] when the turn has no
 * astrological substance (small talk, thanks, etc.) — recommendations should
 * feel earned, not bolted onto every reply.
 */
export function buildRecommendations(input: RecommendationInput): Recommendation[] {
  const { userText, replyText, dashaLord, idSeed, max = 4 } = input;
  const replyTopics = detectTopics(replyText);
  const userTopics  = detectTopics(userText);
  const topics = Array.from(new Set<Topic>([...userTopics, ...replyTopics]));

  // Planets the model actually talked about win over the chart's dasha lord.
  const mentioned = Array.from(new Set<Planet>([
    ...detectPlanets(replyText),
    ...detectPlanets(userText),
  ]));

  const asksForRemedy = /\b(remed(y|ies)|gem(stone)?s?|mantra|what should i do|how can i (fix|improve))\b/i.test(userText);
  const asksForTarot  = /\btarot\b/i.test(userText + ' ' + replyText);

  if (topics.length === 0 && mentioned.length === 0 && !asksForRemedy && !asksForTarot) return [];

  const planet: Planet | null = mentioned[0] ?? dashaLord ?? null;
  const primaryTopic: Topic | undefined = topics.find((t) => t !== 'timing') ?? topics[0];
  const out: Recommendation[] = [];
  let n = 0;
  const id = () => `${idSeed}-r${n++}`;

  if (planet) {
    const info = PLANET_INFO[planet];
    out.push({
      id: id(), type: 'gemstone',
      title: info.gem,
      subtitle: `Recommended for ${planet}`,
      meta: { planet, day: info.day, theme: info.theme },
    });
  }

  if ((primaryTopic && primaryTopic !== 'timing') || asksForTarot) {
    const label = primaryTopic && primaryTopic !== 'timing' ? TOPIC_LABEL[primaryTopic] : 'General';
    out.push({
      id: id(), type: 'tarot',
      title: `${label} Tarot Reading`,
      subtitle: 'Draw a card for this question',
      meta: { topic: primaryTopic ?? 'general' },
    });
  }

  if (planet) {
    out.push({
      id: id(), type: 'article',
      title: `Understanding ${planet} Mahadasha`,
      subtitle: planet === dashaLord ? 'Your current life period' : `What ${planet} brings`,
      meta: { corpusId: `dasha-${planet.toLowerCase()}`, planet },
    });
  }

  const stakesTopic = topics.find((t) => HIGH_STAKES.includes(t));
  if (stakesTopic) {
    out.push({
      id: id(), type: 'consultation',
      title: 'Talk to an Astrologer',
      subtitle: `A deeper ${TOPIC_LABEL[stakesTopic].toLowerCase()} reading`,
      meta: { topic: stakesTopic },
    });
  }

  if (planet && (asksForRemedy || topics.includes('spirituality') || topics.includes('health'))) {
    const info = PLANET_INFO[planet];
    out.push({
      id: id(), type: 'remedy',
      title: `${planet} mantra`,
      subtitle: `${info.mantra} · ${info.day}s`,
      meta: { planet, mantra: info.mantra, day: info.day },
    });
  }

  if (topics.includes('timing')) {
    out.push({
      id: id(), type: 'promotion',
      title: "Today's Panchang",
      subtitle: 'Auspicious windows & Rahu Kaal',
      meta: { route: '/panchang' },
    });
  } else if (topics.includes('love') || topics.includes('marriage')) {
    out.push({
      id: id(), type: 'promotion',
      title: 'Compatibility reading',
      subtitle: 'See how two charts meet',
      meta: { route: '/compatibility' },
    });
  }

  return out.slice(0, max);
}

// ─── Model output sanitising ─────────────────────────────────────────────────

function planetIn(text: string): Planet | null {
  return detectPlanets(text)[0] ?? null;
}

function planetForGem(title: string): Planet | null {
  const t = title.toLowerCase();
  return PLANETS.find((p) => t.includes(PLANET_INFO[p].gem.toLowerCase())) ?? planetIn(title);
}

function routeFor(title: string): string | null {
  if (/panchang|muhurat|auspicious|calendar/i.test(title)) return '/panchang';
  if (/compat|match|partner/i.test(title)) return '/compatibility';
  return null;
}

/**
 * Turn the parsed `{ items: [...] }` object into Recommendation cards:
 * enforce the category list and item cap, trim strings, drop duplicates, and
 * enrich each card with the metadata its renderer uses (planet, corpus id,
 * in-app route). Never throws.
 */
export function sanitizeModelRecommendations(parsed: unknown, idSeed: string): Recommendation[] {
  const items = (parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown }).items))
    ? (parsed as { items: unknown[] }).items
    : [];
  const allowed = MODEL_RECOMMENDATION_TYPES as readonly string[];
  const seen = new Set<string>();
  const out: Recommendation[] = [];

  for (const item of items) {
    if (out.length >= MAX_MODEL_RECOMMENDATIONS) break;
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const type = typeof rec.type === 'string' ? rec.type.trim().toLowerCase() : '';
    const title = typeof rec.title === 'string' ? rec.title.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
    if (!allowed.includes(type) || !title) continue;
    const dedupeKey = `${type}:${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const subtitle = typeof rec.subtitle === 'string' ? rec.subtitle.trim().slice(0, 80) : '';
    const meta: NonNullable<Recommendation['meta']> = {};
    if (type === 'gemstone') {
      const p = planetForGem(title);
      if (p) { meta.planet = p; meta.day = PLANET_INFO[p].day; meta.theme = PLANET_INFO[p].theme; }
    } else if (type === 'article' || type === 'remedy') {
      const p = planetIn(`${title} ${subtitle}`);
      if (p) {
        meta.planet = p;
        if (type === 'article') meta.corpusId = `dasha-${p.toLowerCase()}`;
        if (type === 'remedy') { meta.mantra = PLANET_INFO[p].mantra; meta.day = PLANET_INFO[p].day; }
      }
    } else if (type === 'promotion') {
      const route = routeFor(`${title} ${subtitle}`);
      if (route) meta.route = route;
    }

    out.push({
      id: `${idSeed}-m${out.length}`,
      type,
      title,
      ...(subtitle ? { subtitle } : {}),
      ...(Object.keys(meta).length ? { meta } : {}),
    });
  }
  return out;
}
