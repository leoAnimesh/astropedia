import { Platform } from 'react-native';
import type { Profile } from './database';
import { getAstrologyContext } from './astrology';
import { isLLMReady, runLocalLLM, initLocalLLM, ensureLocalLLM } from './local-llm';
import { retrieveContext } from './rag';

export type AIMessage = { role: 'user' | 'assistant'; content: string };
export type ModelTier = 'executorch' | 'groq' | 'claude' | 'pending';

export type AIRequest = {
  profile:        Profile;
  history:        AIMessage[];
  userMessage:    string;
  isHoroscope?:   boolean;
  systemOverride?: string;
};

export type AIStreamResult = {
  stream: AsyncGenerator<string>;
  tier:   ModelTier;
};

const SAGA_SYSTEM = `You are Saga, a warm and friendly astrologer — like a knowledgeable best friend who gives clear, honest answers without overloading.

Rules you must follow:
- Keep every reply to 2–4 short sentences. That's it.
- Plain, everyday language only. No jargon unless the user asks.
- Share ONE key insight per message. Save the rest for follow-up questions.
- Never list more than 2 things. Never use bullet points or headers.
- Sound warm and human, never like a textbook.
- If the user wants more, they'll ask — don't front-load everything.`;

const HOROSCOPE_SYSTEM = `You are Saga, writing a short personalized daily reading. Each section (ENERGY, LOVE, CAREER, WELLNESS, GUIDANCE, MANTRA) must be 1–2 sentences only. Warm, clear, and specific to this person's chart. No filler, no repetition.`;

async function buildSystemPrompt(
  profile:     Profile,
  isHoroscope: boolean,
  userMessage?: string,
): Promise<string> {
  const base    = isHoroscope ? HOROSCOPE_SYSTEM : SAGA_SYSTEM;
  const context = getAstrologyContext({
    name:      profile.name,
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthCity: profile.birthCity ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
  });

  // Retrieve relevant astrological knowledge from the RAG corpus (3 chunks, ~400 chars each)
  const ragContext = userMessage
    ? await retrieveContext(userMessage, 3).catch(() => '')
    : '';

  const ragSection = ragContext
    ? `\n\n## Astrological Reference (use this to answer with precision)\n${ragContext}`
    : '';

  return `${base}\n\n${context}${ragSection}`;
}

// ─── On-device LLM (Llama 3.2 1B via ExecuTorch) ─────────────────────────────

async function* streamExecutorch(req: AIRequest): AsyncGenerator<string> {
  const system   = req.systemOverride ?? await buildSystemPrompt(req.profile, req.isHoroscope ?? false, req.userMessage);
  const messages = [
    { role: 'system'    as const, content: system },
    ...req.history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user'      as const, content: req.userMessage },
  ];

  const queue: string[] = [];
  let wakeup: (() => void) | null = null;
  let finished = false;

  const done = runLocalLLM(messages, (token) => {
    queue.push(token);
    wakeup?.();
    wakeup = null;
  }).then(() => {
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

// ─── Groq API (FREE — get key at console.groq.com, no credit card) ────────────

async function* streamGroq(req: AIRequest): AsyncGenerator<string> {
  const key = process.env.EXPO_PUBLIC_GROQ_KEY;
  if (!key || key.startsWith('your_')) return;

  const system   = req.systemOverride ?? await buildSystemPrompt(req.profile, req.isHoroscope ?? false, req.userMessage);
  const res      = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body:    JSON.stringify({
      model:      'llama-3.1-8b-instant',
      max_tokens: req.isHoroscope ? 600 : 200,
      messages:   [
        { role: 'system', content: system },
        ...req.history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user',   content: req.userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('[Groq]', res.status, body.slice(0, 300));
    throw new Error(`Groq API ${res.status}: ${body.slice(0, 100)}`);
  }

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (text) yield text;
}

// ─── Claude API (optional — get key at console.anthropic.com) ─────────────────

async function* streamClaude(req: AIRequest): AsyncGenerator<string> {
  const key = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
  if (!key || key.startsWith('your_')) return;

  const system = req.systemOverride ?? await buildSystemPrompt(req.profile, req.isHoroscope ?? false, req.userMessage);
  const res    = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: req.isHoroscope ? 600 : 200,
      system,
      messages:   [
        ...req.history.slice(-6).map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: req.userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Claude API ${res.status}: ${body.slice(0, 100)}`);
  }

  const data = await res.json() as { content?: Array<{ type: string; text: string }> };
  const text = data.content?.find(b => b.type === 'text')?.text ?? '';
  if (text) yield text;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function streamAI(req: AIRequest): Promise<AIStreamResult> {
  // 1. On-device LLM — wait for it if the model is already on disk
  if (await ensureLocalLLM()) {
    return { stream: streamExecutorch(req), tier: 'executorch' };
  }

  // 2. Groq (free, fast, Llama 3.1 8B — get key at console.groq.com)
  const groqKey = process.env.EXPO_PUBLIC_GROQ_KEY;
  if (groqKey && !groqKey.startsWith('your_')) {
    return { stream: streamGroq(req), tier: 'groq' };
  }

  // 3. Claude (optional paid fallback)
  const claudeKey = process.env.EXPO_PUBLIC_ANTHROPIC_KEY;
  if (claudeKey && !claudeKey.startsWith('your_')) {
    return { stream: streamClaude(req), tier: 'claude' };
  }

  // 4. No key configured
  async function* noKey(): AsyncGenerator<string> {
    yield "Add a free Groq API key to your .env file (EXPO_PUBLIC_GROQ_KEY) — get one free at console.groq.com to unlock Saga's readings.";
  }
  return { stream: noKey(), tier: 'pending' };
}

export async function askAI(req: AIRequest): Promise<{ text: string; tier: ModelTier }> {
  const { stream, tier } = await streamAI(req);
  let text = '';
  for await (const token of stream) {
    text += token;
  }
  return { text: text.trim(), tier };
}
