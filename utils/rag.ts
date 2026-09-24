/**
 * RAG (Retrieval-Augmented Generation) — supports multiple isolated corpora.
 *
 * Two modes:
 *  - 'astrology' — zodiac signs, planets, houses, nakshatras, dashas, yogas, aspects
 *  - 'krishna'   — Bhagavad Gita verses + chapter summaries
 *
 * Each mode has its own MemoryVectorStore so retrieval never mixes scripture
 * with chart interpretations.
 *
 * Neural embeddings via react-native-executorch's TextEmbeddingsModule
 * (ALL_MINILM_L6_V2) when available; otherwise hash-based fallback — fully
 * offline, no model download required.
 */

import { Platform } from 'react-native';
import { MemoryVectorStore } from 'react-native-rag';

// ─── Corpus imports ───────────────────────────────────────────────────────────

// Astrology
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

// Krishna (Bhagavad Gita)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitaVerses: CorpusEntry[]       = require('@/assets/gita-corpus/verses.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const gitaChapters: CorpusEntry[]     = require('@/assets/gita-corpus/chapters.json');

type CorpusEntry = { id: string; text: string };

export type RagMode = 'astrology' | 'krishna';

const CORPORA: Record<RagMode, CorpusEntry[]> = {
  astrology: [
    ...signsData,
    ...planetsData,
    ...planetsInSigns,
    ...housesData,
    ...nakshatrasData,
    ...dashasData,
    ...yogasData,
    ...aspectsData,
  ],
  krishna: [
    ...gitaChapters,
    ...gitaVerses,
  ],
};

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
let _neuralLoadPromise: Promise<void> | null = null;
let _prefetchPromise: Promise<void> | null = null;

/**
 * Download the embeddings model's files without loading them. The on-device
 * LLM's background upgrade calls this first, so the small MiniLM download
 * never competes with the big one and a later load finds it on disk.
 */
export function prefetchEmbeddingModel(): Promise<void> {
  if (Platform.OS === 'web') return Promise.resolve();
  if (_prefetchPromise) return _prefetchPromise;
  _prefetchPromise = (async () => {
    try {
      const { ResourceFetcher, ALL_MINILM_L6_V2, initExecutorch } =
        require('react-native-executorch') as typeof import('react-native-executorch');
      const { ExpoResourceFetcher } =
        require('react-native-executorch-expo-resource-fetcher') as
        typeof import('react-native-executorch-expo-resource-fetcher');
      initExecutorch({ resourceFetcher: ExpoResourceFetcher });
      await ResourceFetcher.fetch(undefined, ALL_MINILM_L6_V2.modelSource, ALL_MINILM_L6_V2.tokenizerSource);
    } catch {
      // Offline or failed — tryLoadNeuralEmbeddings downloads on demand.
    }
  })();
  return _prefetchPromise;
}

async function tryLoadNeuralEmbeddings(): Promise<void> {
  if (_neuralLoadPromise) return _neuralLoadPromise;
  _neuralLoadPromise = (async () => {
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

      const module = await Promise.race<TextEmbeddingsModuleType | null>([
        // If a prefetch is downloading the same files, wait for it — a second
        // fetch of an in-flight file is rejected by the resource fetcher.
        (_prefetchPromise ?? Promise.resolve())
          .then(() => TextEmbeddingsModule.fromModelName(ALL_MINILM_L6_V2)),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 4000)),
      ]);

      if (module) {
        _embedModule = module;
        _usingNeural = true;
      }
    } catch {
      // Neural embeddings unavailable — hash fallback continues
    }
  })();
  return _neuralLoadPromise;
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

class SharedEmbeddings {
  async load():   Promise<this>     { return this; }
  async unload(): Promise<void>     { /* nothing to release */ }
  async embed(text: string): Promise<number[]> {
    return embed(text);
  }
}

// ─── Per-mode singleton vector stores ─────────────────────────────────────────

const stores: Partial<Record<RagMode, MemoryVectorStore>>  = {};
const initPromises: Partial<Record<RagMode, Promise<void>>> = {};

export async function initRAG(mode: RagMode = 'astrology'): Promise<void> {
  if (initPromises[mode]) return initPromises[mode]!;
  initPromises[mode] = (async () => {
    await tryLoadNeuralEmbeddings();

    const store = new MemoryVectorStore({ embeddings: new SharedEmbeddings() });
    await store.load();

    for (const entry of CORPORA[mode]) {
      const embedding = await embed(entry.text);
      await store.add({ id: entry.id, document: entry.text, embedding });
    }
    stores[mode] = store;
  })();
  return initPromises[mode]!;
}

const MAX_CHUNK_CHARS = 500;

/**
 * Retrieve the most relevant knowledge chunks for a given query from the
 * specified corpus. Returns formatted text ready for injection into a system
 * prompt.
 */
export async function retrieveContext(
  query:    string,
  nResults: number = 3,
  mode:     RagMode = 'astrology',
): Promise<string> {
  if (!stores[mode]) await initRAG(mode).catch(() => {});
  const store = stores[mode];
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

/** Returns true once the given corpus is ready to query. */
export function isRAGReady(mode: RagMode = 'astrology'): boolean {
  return stores[mode] != null;
}

/** Returns true if neural (MiniLM) embeddings are active. */
export function isNeuralRAG(): boolean {
  return _usingNeural;
}
