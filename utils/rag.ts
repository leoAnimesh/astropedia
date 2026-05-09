/**
 * RAG (Retrieval-Augmented Generation) for astrology knowledge.
 *
 * Uses react-native-executorch's TextEmbeddingsModule (ALL_MINILM_L6_V2) when
 * available for neural semantic search. Falls back to a hash-based bag-of-words
 * embedder — no model download required, fully offline, instant startup.
 *
 * The corpus covers: zodiac signs, planets, houses, nakshatras, Vimshottari dashas,
 * major yogas, aspects, compatibility, and planet-in-sign interpretations.
 */

import { Platform } from 'react-native';
import { MemoryVectorStore } from 'react-native-rag';

// ─── Corpus imports ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-var-requires
const signsData: CorpusEntry[]        = require('@/assets/astrology-corpus/signs/zodiac-signs.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const planetsData: CorpusEntry[]      = require('@/assets/astrology-corpus/planets/planet-details.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const planetsInSigns: CorpusEntry[]   = require('@/assets/astrology-corpus/planets/planets-in-signs.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const housesData: CorpusEntry[]       = require('@/assets/astrology-corpus/houses/houses.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nakshatrasData: CorpusEntry[]   = require('@/assets/astrology-corpus/nakshatras/nakshatras.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dashasData: CorpusEntry[]       = require('@/assets/astrology-corpus/dashas/dashas.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yogasData: CorpusEntry[]        = require('@/assets/astrology-corpus/yogas/yogas.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const aspectsData: CorpusEntry[]      = require('@/assets/astrology-corpus/aspects/aspects-compatibility.json');

type CorpusEntry = { id: string; text: string };

// ─── Hash-based bag-of-words embeddings (fallback) ────────────────────────────

const HASH_DIM = 512;

const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can','need',
  'this','that','these','those','it','its','they','them','their','there',
  'when','where','which','who','whom','how','what','if','then','than','so',
  'also','as','by','from','into','through','during','each','any','all',
  'both','not','no','up','out','about','more','most','other',
]);

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % HASH_DIM;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function hashEmbedding(text: string): number[] {
  const vec = new Array<number>(HASH_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  for (let i = 0; i < tokens.length; i++) {
    const bucket = hashToken(tokens[i]);
    const weight  = 1 + (tokens.length - i) / tokens.length;
    vec[bucket]  += weight;
    if (i < tokens.length - 1) {
      vec[hashToken(tokens[i] + '_' + tokens[i + 1])] += 0.5;
    }
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < HASH_DIM; i++) vec[i] /= norm;
  return vec;
}

// ─── Neural embeddings (TextEmbeddingsModule) ─────────────────────────────────

type TextEmbeddingsModuleType = import('react-native-executorch').TextEmbeddingsModule;

let _embedModule: TextEmbeddingsModuleType | null = null;
let _usingNeural = false;

async function tryLoadNeuralEmbeddings(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const {
      TextEmbeddingsModule,
      ALL_MINILM_L6_V2,
      initExecutorch,
    } = require('react-native-executorch') as typeof import('react-native-executorch');

    const { ExpoResourceFetcher } =
      require('react-native-executorch-expo-resource-fetcher') as
      typeof import('react-native-executorch-expo-resource-fetcher');

    initExecutorch({ resourceFetcher: ExpoResourceFetcher });

    // 4-second timeout — if model isn't cached it'll download in background; we use hash now
    const module = await Promise.race<TextEmbeddingsModuleType | null>([
      TextEmbeddingsModule.fromModelName(ALL_MINILM_L6_V2),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
    ]);

    if (module) {
      _embedModule = module;
      _usingNeural = true;
    }
  } catch {
    // Neural embeddings unavailable — hash fallback continues
  }
}

async function embed(text: string): Promise<number[]> {
  if (_usingNeural && _embedModule) {
    try {
      return Array.from(await _embedModule.forward(text));
    } catch {
      // On failure, fall through to hash
    }
  }
  return hashEmbedding(text);
}

// ─── Embeddings provider ──────────────────────────────────────────────────────

class AstrologyEmbeddings {
  async load():   Promise<this>     { return this; }
  async unload(): Promise<void>     { /* nothing to release */ }
  async embed(text: string): Promise<number[]> {
    return embed(text);
  }
}

// ─── Singleton vector store ────────────────────────────────────────────────────

let store: MemoryVectorStore | null = null;
let initPromise: Promise<void>      | null = null;

const ALL_CORPUS: CorpusEntry[] = [
  ...signsData,
  ...planetsData,
  ...planetsInSigns,
  ...housesData,
  ...nakshatrasData,
  ...dashasData,
  ...yogasData,
  ...aspectsData,
];

export async function initRAG(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // Try to load neural embeddings first (uses cached model if available)
    await tryLoadNeuralEmbeddings();

    const embeddings = new AstrologyEmbeddings();
    store = new MemoryVectorStore({ embeddings });
    await store.load();

    // Embed all corpus entries using whichever embedder loaded
    for (const entry of ALL_CORPUS) {
      const embedding = await embed(entry.text);
      await store.add({ id: entry.id, document: entry.text, embedding });
    }
  })();
  return initPromise;
}

const MAX_CHUNK_CHARS = 500;

/**
 * Retrieve the most relevant astrology knowledge chunks for a given query.
 * Returns formatted text ready for injection into a system prompt.
 */
export async function retrieveContext(
  query:    string,
  nResults: number = 3,
): Promise<string> {
  // Auto-init on first use — no need to call initRAG() at app startup
  if (!store) await initRAG().catch(() => {});
  if (!store) return '';

  try {
    const queryEmbedding = await embed(query);
    const results = await store.query({
      queryEmbedding,
      nResults,
    });

    const threshold = _usingNeural ? 0.25 : 0.15;
    const relevant = results.filter(r => r.similarity > threshold);
    if (relevant.length === 0) return '';

    return relevant
      .map(r => {
        const doc = r.document ?? '';
        return doc.length > MAX_CHUNK_CHARS ? doc.slice(0, MAX_CHUNK_CHARS) + '…' : doc;
      })
      .join('\n\n');
  } catch {
    return '';
  }
}

/** Returns true once the vector store is ready to query. */
export function isRAGReady(): boolean {
  return store !== null;
}

/** Returns true if neural (MiniLM) embeddings are active. */
export function isNeuralRAG(): boolean {
  return _usingNeural;
}
