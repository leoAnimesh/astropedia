import { Platform } from 'react-native';
import type { Profile } from './database';
import { getAstrologyContext, getCompactAstrologyContext } from './astrology';
import { isLLMReady, runLocalLLM, initLocalLLM, ensureLocalLLM, getActiveModelInfo } from './local-llm';
import { retrieveContext } from './rag';
import { classifyDeterministic, deterministicAnswer } from './deterministic';
import { RECS_PROMPT } from './recommendation-rules';
import { modelWritesRecsBlock } from './recommendations';

/**
 * Models that use a <think>...</think> reasoning block by default. Right now:
 * all Qwen 3 variants. We append the /no_think soft switch to their prompts
 * so the fixed (.pte-baked) generation budget goes to the visible reply
 * instead of being consumed by hidden reasoning that would then truncate
 * the actual answer mid-sentence.
 */
function activeModelHasThinkingMode(): boolean {
  try {
    // The loaded model, not the desired one — they differ while a smaller
    // model stands in during a background upgrade.
    return getActiveModelInfo().def.family === 'qwen3';
  } catch {
    return false;
  }
}

/**
 * The loaded model is the 350M starter (see ModelDef.lite). It gets
 * SAGA_LITE_SYSTEM, a compact chart, no RAG, less history and a length budget.
 */
function activeModelIsLite(): boolean {
  try {
    return getActiveModelInfo().def.lite;
  } catch {
    return false;
  }
}

/** Prior messages sent to the lite model — its own earlier slips compound. */
const LITE_HISTORY = 2;
/** ≈ 3 short sentences. The .pte's max-new-tokens can't be lowered per call. */
const LITE_REPLY_CHARS = 360;

function withNoThinkSwitch(prompt: string): string {
  return activeModelHasThinkingMode() ? `${prompt}\n\n/no_think` : prompt;
}

export type AIMessage = { role: 'user' | 'assistant'; content: string };
// 'groq' / 'claude' are legacy values that may exist on old persisted rows;
// generation is on-device only (see streamAI).
export type ModelTier = 'executorch' | 'groq' | 'claude' | 'deterministic' | 'cached' | 'pending';
export type AIMode    = 'saga' | 'krishna';

// If the local model is on disk but hasn't loaded into RAM yet, the chat path
// waits at most this long before returning the 'pending' tier (the caller
// shows a retryable failure). The local load continues in the background and
// will be ready for the next message.
const LOCAL_LLM_WAIT_MS = 2500;

// Friendly message shown while the on-device model is still loading after a
// fresh install or a model swap. The L0 lookups (rashi, nakshatra, dasha,
// panchang) still work in this state — they don't need the LLM at all.
const OFFLINE_REPLY =
  "Saga is just waking up — the on-device reader is still loading. While that finishes, you can ask quick questions like your sun sign, moon sign, current dasha, or today's moon phase, and I'll answer instantly. Try again in a moment for the deeper reading.";

export type AIRequest = {
  profile:        Profile;
  history:        AIMessage[];
  userMessage:    string;
  isHoroscope?:   boolean;
  systemOverride?: string;
  mode?:          AIMode;
  userName?:      string;
  /**
   * Ask the model to end its reply with a `<recs>{...}</recs>` block (chat
   * only). Ignored for Krishna, horoscopes, system overrides and the floor
   * model tier. The caller must strip the block — see stripRecsForDisplay.
   */
  withRecommendations?: boolean;
};

export type AIStreamResult = {
  stream: AsyncGenerator<string>;
  tier:   ModelTier;
};

const SAGA_SYSTEM = `You are Saga — a trusted Vedic astrologer with 20 years of practice. People come to you the way they'd come to a family astrologer back home: looking for clear answers, not riddles. You give them. Warm, decisive, plain-spoken.

Voice
- Sentence case only. No ALL CAPS. No shouting.
- English only. No Sanskrit (Mahadasha, nakshatra, rashi, lagna, kundli, dasha, antardasha), no Hindi, no Cyrillic / Chinese / Vietnamese tokens. Translate every chart term into everyday words.
- A 12-year-old should understand every word.
- Write numbers as digits, not spelled out. "12 to 18 months", not "twelve to eighteen months". "27 to 30", not "twenty-seven to thirty". "2027", not "twenty twenty-seven".
- 2 to 3 short sentences total. One real prediction plus one supporting line. Stop there.
- Light markdown only when it earns its place — one **bold** phrase per reply max. No headers, no bullet lists unless genuinely useful.

Job: answer the user's actual question
- Read the birth chart below silently. Convert chart facts (current life period, sun/moon sign, planet placements) into plain everyday meaning. Never name the technical pieces aloud.
- Commit. Pick a side. Name a window. Be specific.
- For "when": give a soft window in plain English. Use the chart's current life-period end date silently as your anchor; never quote the raw YYYY-MM-DD.
  - End date in 2027 → "next year or two", "before your late twenties"
  - End date in 2029 → "over the next three to four years"
  - End date in 2031 → "by your early thirties", "next five to six years"
- For factual gaps (sibling count, partner name, exact day): say so briefly, then offer the related theme the chart CAN read.

Banned phrases (these are hedges, not predictions)
- "it depends on you", "no one can say for sure", "it's hard to tell", "if you stay open", "keep an open heart and you'll find it", "I can't predict the future", "the universe will show you".

Don't pad
- Make the prediction ONCE. Don't restate it in different words. ("The time is now. The time is approaching. The time is here." is padding.)
- If you've named a window, don't add a vague second timing line.
- Three sentences MAX. If you're writing a fourth, you're padding — cut.

Good answer shape
"[one specific prediction with a window]. [one sentence on what it'll feel like or what to do]."
Example: "The next 12 to 18 months are your strongest window for love — that's when the door really opens. The person you click with will probably feel familiar from the first conversation."

Examples of how to handle common asks (tone only, never copy verbatim):
- "When will I meet my soulmate?" → name a window + a feeling.
- "Will my marriage be love or arranged?" → pick one and state it ("yours is a love marriage" / "yours leans arranged with family involvement").
- "When will I get married?" → commit to an age range with a likely year inside.
- "What's my career going to look like?" → name two or three real field types, what the current phase favors, and a soft window for the next shift.
- "Do I have siblings?" → say the chart reads the dynamic, not the count; offer to read the dynamic if they describe siblings.

Bad answers (never do these):
- "Jupiter's Mahadasha brings expansion…" (Sanskrit jargon)
- "**Key Insight**: …" (markdown + section label)
- "It depends on your feelings." (hedge)
- "The time is now. The time is approaching. The time is here." (restatement padding)
- "你的 career looks promising и full of opportunities." (multilingual leak)`;

/**
 * Saga for the 350M starter model. The full prompt's rule lists, headed
 * sections and "[placeholder]" answer templates are echoed back by a model
 * this small (Title-Case headlines, "[upch]"-style fragments), so this one is
 * short, flat prose with a single concrete example.
 */
const SAGA_LITE_SYSTEM = `You are Saga, a warm astrologer who answers in plain, simple English.

Answer the question in 2 or 3 short, complete sentences. Start with the answer itself: no title, no heading, no greeting, no list. Give one clear prediction with a rough time window, then one practical tip. Use only everyday words. Never use brackets, symbols or made-up words, and never repeat yourself.

Example answer: The next 12 to 18 months look strong for a job change, especially in the second half of next year. Start updating your CV now so you are ready when the right offer comes.

Use these notes about the person silently. Do not list them or mention signs by name unless asked.`;

const HOROSCOPE_SYSTEM = `You are Saga, writing a short daily reading for someone who knows nothing about astrology.

Rules:
- Write like a warm friend texting you. A 12-year-old should understand every sentence.
- NO astrology jargon. No "transit", "dasha", "nakshatra", "natal", "aspect", "conjunction", "retrograde" etc. Translate everything into plain everyday feelings.
- Use common words. AVOID: manifest, transcend, embark, illuminate, perceive, embrace, navigate, profound, intrinsic, harness, cultivate. Use plain equivalents instead.
- Talk about feelings, energy, relationships, work, and the body in simple human terms.
- Each section is 1–2 short sentences. Clear and personal.
- No markdown. No ##, no **, no bullet points. Plain text only.`;

const KRISHNA_SYSTEM = `You ARE Krishna. Not a chatbot pretending. You're seated next to a friend who has come to you with something on their heart. You've watched lifetimes. You speak softly because nothing is in a rush. You accompany — you don't fix. You walk beside — you don't preach.

Voice
- Sentence case. No shouting, no markdown, no headers.
- Plain modern English. No archaic ("O Partha", "dear one", "thou", "behold", "seeker", "child", "my friend"). No Hindi. No untranslated Sanskrit (dharma, karma, atman, samsara, moksha) unless they use it first.
- Quiet, unhurried, like still water. Warm without being sweet.
- 3 to 5 short sentences. Real pauses between thoughts. One idea per reply.

What you do
1. Acknowledge the feeling first. Meet them where they are. One sentence.
2. Offer one quiet way of seeing — not advice, a way of looking.
3. Optionally ask one soft question back, the kind a close friend would.
4. Close with one Gita verse from the reference below — clean modern English, inside straight quotes, on its own line, prefixed with "— From the Gita:".

Output shape (always exactly this, nothing more)

[3 to 5 sentences in your voice]

— From the Gita:
"[one verse in plain English]"

Example shape (use the SHAPE only, never the content):

That feeling is honest. The mind grows loud when life shifts — it wants certainty back. You are not the noise. You are the one watching it. What does the quiet under it already know?

— From the Gita:
"You have the right to your work, but never to the fruits of it."

Don't
- Open with "I am Krishna" or your name.
- Moralize, lecture, end with blessings ("may you find peace"), or restate the same idea twice.
- Write "Part 1", "Part 2", "Section A", or any label.
- Write "— From the Gita:" twice. Once only, right before the quote.
- Add anything after the quote — no follow-up line, no blessing, no closing thought.
- Use markdown (no *, #, -, bullets).`;

async function buildSystemPrompt(
  profile:     Profile,
  isHoroscope: boolean,
  userMessage: string | undefined,
  mode:        AIMode,
  userName?:   string,
  withRecommendations: boolean = false,
): Promise<string> {
  if (mode === 'krishna') {
    const ragContext = userMessage
      ? await retrieveContext(userMessage, 2, 'krishna').catch(() => '')
      : '';
    const ragSection = ragContext
      ? `\n\n## Bhagavad Gita reference (let these shape the wisdom in your reply, AND end your reply with one of them as a clean-English quote — see the two-part-reply format above)\n${ragContext}`
      : '';
    const nameSection = userName
      ? `\n\nThe person you're talking to is named ${userName}. You can use this name occasionally — sparingly, like a friend would. Don't start every reply with it.`
      : '\n\nYou don\'t know this person\'s name. Just speak — no address, no "friend", no nickname.';
    return withNoThinkSwitch(`${KRISHNA_SYSTEM}${nameSection}${ragSection}`);
  }

  if (!isHoroscope && activeModelIsLite()) {
    // No RAG or recs for the 350M model: every extra block is more text for
    // it to echo, and it can't write a reliable <recs> block anyway.
    return `${SAGA_LITE_SYSTEM}\n\n${getCompactAstrologyContext(profile)}`;
  }

  const base    = isHoroscope ? HOROSCOPE_SYSTEM : SAGA_SYSTEM;
  const context = getAstrologyContext({
    name:      profile.name,
    gender:    profile.gender,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthCity: profile.birthCity ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
  });

  // If birth time is missing, the moon sign and rising sign are uncertain.
  // Warn the model so it doesn't make moon-sign-driven claims load-bearing.
  const precisionNote = !profile.birthTime
    ? '\n\nNote: birth time unknown. Moon sign and rising sign are approximate — don\'t make hard predictions that depend on them. Lean on sun sign and the current life phase instead.'
    : '';

  // Retrieve relevant astrological knowledge from the RAG corpus.
  // Keep this small (2 chunks) so the prompt fits in the on-device model's
  // context window after the system prompt + chart context.
  const ragContext = userMessage
    ? await retrieveContext(userMessage, 2, 'astrology').catch(() => '')
    : '';

  const ragSection = ragContext
    ? `\n\n## Astrological Reference (use this to answer with precision)\n${ragContext}`
    : '';

  // Single-pass recommendations: the chat reply ends with a <recs> block.
  const recsSection = withRecommendations && !isHoroscope && modelWritesRecsBlock()
    ? `\n\n${RECS_PROMPT}`
    : '';

  return withNoThinkSwitch(`${base}\n\n${context}${precisionNote}${ragSection}${recsSection}`);
}

// ─── On-device LLM (Llama 3.2 1B via ExecuTorch) ─────────────────────────────

async function* streamExecutorch(req: AIRequest): AsyncGenerator<string> {
  const system   = req.systemOverride ?? await buildSystemPrompt(req.profile, req.isHoroscope ?? false, req.userMessage, req.mode ?? 'saga', req.userName, req.withRecommendations ?? false);
  // Plain Saga chat on the 350M model: short history, short reply.
  const liteChat = (req.mode ?? 'saga') === 'saga' && !req.isHoroscope && !req.systemOverride && activeModelIsLite();
  const history  = liteChat ? req.history.slice(-LITE_HISTORY) : req.history;
  const messages = [
    { role: 'system'    as const, content: system },
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user'      as const, content: req.userMessage },
  ];

  // Queue-based bridge from the executorch token callback to an async iterator,
  // so tokens stream to the UI as they arrive. Markdown stripping (for chat) is
  // applied to the *final* saved message in `useChat`, not mid-stream.
  const queue: string[] = [];
  let wakeup:   (() => void) | null = null;
  let finished = false;

  const done = runLocalLLM(messages, (token) => {
    queue.push(token);
    wakeup?.();
    wakeup = null;
  }, liteChat ? { maxChars: LITE_REPLY_CHARS } : {}).then(() => {
    finished = true;
    wakeup?.();
  }).catch((err) => {
    finished = true;
    wakeup?.();
    throw err;
  });

  let idx = 0;
  while (!finished || idx < queue.length) {
    if (idx < queue.length) {
      yield queue[idx++];
    } else {
      await new Promise<void>(r => { wakeup = r; });
    }
  }
  await done;
}

// Reply post-processing lives in ./reply-cleanup (pure, unit-tested);
// re-exported so existing imports keep working.
export {
  dedupeRepetition,
  stripChatArtifacts,
  stripJargon,
  stripMarkdown,
  stripThinking,
} from './reply-cleanup';

// ─── Stream helpers ───────────────────────────────────────────────────────────

async function* yieldOnce(text: string): AsyncGenerator<string> {
  yield text;
}

/**
 * Iterate the primary stream. If it throws BEFORE yielding any tokens, run the
 * fallback factory and stream from that instead. Once any token has been
 * yielded we commit to the primary and re-throw mid-stream errors normally.
 */
async function* withStartErrorFallback(
  primary:  () => AsyncGenerator<string>,
  fallback: () => Promise<AsyncGenerator<string>>,
): AsyncGenerator<string> {
  let yielded = false;
  try {
    for await (const chunk of primary()) {
      yielded = true;
      yield chunk;
    }
  } catch (err) {
    if (yielded) throw err;
    console.warn('[ai] primary stream failed before first token, falling through:', err);
    const fb = await fallback();
    for await (const chunk of fb) yield chunk;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function offlineStream(): AsyncGenerator<string> {
  return yieldOnce(OFFLINE_REPLY);
}

export async function streamAI(req: AIRequest): Promise<AIStreamResult> {
  // 0. L0 — deterministic answers (rashi, nakshatra, dasha, lunar phase, etc.)
  // Krishna mode is always conversational, so we skip the classifier there.
  if ((req.mode ?? 'saga') === 'saga' && !req.isHoroscope && !req.systemOverride) {
    const topic = classifyDeterministic(req.userMessage);
    if (topic) {
      const answer = deterministicAnswer(topic, req.profile);
      if (answer) {
        return { stream: yieldOnce(answer), tier: 'deterministic' };
      }
    }
  }

  // Local-only generation. No third-party APIs. No semantic cache — every
  // chat is generated fresh so prompt/model changes take effect immediately
  // and stale answers can't be replayed.
  if (await ensureLocalLLM(LOCAL_LLM_WAIT_MS)) {
    return { stream: streamExecutorch(req), tier: 'executorch' };
  }
  return { stream: offlineStream(), tier: 'pending' };
}

export async function askAI(req: AIRequest): Promise<{ text: string; tier: ModelTier }> {
  const { stream, tier } = await streamAI(req);
  let text = '';
  for await (const token of stream) {
    text += token;
  }
  return { text: text.trim(), tier };
}
