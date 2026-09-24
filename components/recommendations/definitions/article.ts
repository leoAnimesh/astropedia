import { Alert } from 'react-native';
import { registerRecommendation } from '../registry';

type CorpusEntry = { id: string; text: string };

// Same on-device corpus the RAG pipeline uses — articles are real content,
// available offline. Loaded lazily on first tap.
let corpus: Map<string, string> | null = null;
function lookup(id: string): string | null {
  if (!corpus) {
    const dashas: CorpusEntry[]  = require('@/assets/astrology-corpus/dashas/dashas.json');
    const planets: CorpusEntry[] = require('@/assets/astrology-corpus/planets/planet-details.json');
    corpus = new Map([...dashas, ...planets].map((e) => [e.id, e.text]));
  }
  return corpus.get(id) ?? null;
}

function excerpt(text: string, max = 520): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = cut.lastIndexOf('. ');
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…');
}

registerRecommendation({
  type:  'article',
  label: 'Read',
  glyph: '❡',
  tint:  '#8B6EC4',
  cta:   'Read article',
  onPress: (rec) => {
    const planet = typeof rec.meta?.planet === 'string' ? rec.meta.planet.toLowerCase() : null;
    const corpusId = typeof rec.meta?.corpusId === 'string'
      ? rec.meta.corpusId
      : planet ? `dasha-${planet}` : null;
    // Seeded payloads carry only a title — infer the planet from it.
    const inferred = corpusId ?? (() => {
      const m = /\b(sun|moon|mars|mercury|jupiter|venus|saturn|rahu|ketu)\b/i.exec(rec.title);
      return m ? `dasha-${m[1].toLowerCase()}` : null;
    })();
    const body = inferred ? lookup(inferred) : null;
    Alert.alert(rec.title, body ? excerpt(body) : (rec.subtitle ?? 'This article is coming soon.'));
  },
});
