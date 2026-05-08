/**
 * RAG (Retrieval-Augmented Generation) for astrology knowledge.
 *
 * Uses react-native-rag's MemoryVectorStore with a custom hash-based bag-of-words
 * embedder — no model download required, works fully offline, instant startup.
 *
 * The corpus covers: zodiac signs, planets, houses, nakshatras, Vimshottari dashas,
 * major yogas, aspects, compatibility, and planet-in-sign interpretations.
 */

import { MemoryVectorStore } from 'react-native-rag';

// ─── Corpus imports ───────────────────────────────────────────────────────────
// Static require so Metro bundles them into the app (no network needed)

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

// ─── Hash-based bag-of-words embeddings ───────────────────────────────────────
// 512-dimensional embedding using FNV-1a–style hashing of tokens.
// Gives meaningful cosine similarity for domain-specific vocabulary.

const DIM = 512;

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
  return Math.abs(h) % DIM;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

function makeEmbedding(text: string): number[] {
  const vec = new Array<number>(DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  // Term frequency with position weighting (earlier terms slightly upweighted)
  for (let i = 0; i < tokens.length; i++) {
    const bucket = hashToken(tokens[i]);
    const weight  = 1 + (tokens.length - i) / tokens.length;
    vec[bucket]  += weight;

    // Also hash 2-grams for better phrase matching
    if (i < tokens.length - 1) {
      const bigram = tokens[i] + '_' + tokens[i + 1];
      vec[hashToken(bigram)] += 0.5;
    }
  }

  // L2-normalize to unit vector for cosine similarity
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= norm;
  return vec;
}

// ─── Embeddings provider implementing react-native-rag interface ───────────────

class AstrologyEmbeddings {
  async load():   Promise<this>     { return this; }
  async unload(): Promise<void>     { /* nothing to release */ }
  async embed(text: string): Promise<number[]> {
    return makeEmbedding(text);
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
    const embeddings = new AstrologyEmbeddings();
    store = new MemoryVectorStore({ embeddings });
    await store.load();

    // Pre-compute and ingest all corpus entries
    for (const entry of ALL_CORPUS) {
      const embedding = makeEmbedding(entry.text); // sync, skip the async round-trip
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
  if (!store) return '';

  try {
    const queryEmbedding = makeEmbedding(query);
    const results = await store.query({
      queryEmbedding,
      nResults,
    });

    // Only include results with meaningful similarity (>0.15)
    const relevant = results.filter(r => r.similarity > 0.15);
    if (relevant.length === 0) return '';

    return relevant
      .map(r => r.document.length > MAX_CHUNK_CHARS
        ? r.document.slice(0, MAX_CHUNK_CHARS) + '…'
        : r.document)
      .join('\n\n');
  } catch {
    return '';
  }
}

/** Returns true once the vector store is ready to query. */
export function isRAGReady(): boolean {
  return store !== null;
}
