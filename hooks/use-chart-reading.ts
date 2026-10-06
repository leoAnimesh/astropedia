import { useState, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { askChartReading, replyLanguage } from '@/utils/ai';
import { isLLMReady, initLocalLLM, subscribeToLLMState, getLLMState } from '@/utils/local-llm';
import { Storage } from '@/utils/storage';
import type { Profile } from '@/utils/database';

export type ChartReading = {
  sun: string | null;
  moon: string | null;
  rising: string | null;
  nakshatra: string | null;
  dasha: string | null;
  overview: string | null;
};

type State = { reading: ChartReading | null; loading: boolean };

function parseReading(text: string): ChartReading {
  const lines = text.split('\n');
  const get = (key: string): string | null => {
    const pattern = new RegExp(`^[#*\\s]*${key}[:\\s*_]+`, 'i');
    const line = lines.find(l => pattern.test(l.trimStart()));
    if (!line) return null;
    const val = line.replace(pattern, '').trim().replace(/^[*_"'#]+|[*_"'#]+$/g, '').trim();
    return val || null;
  };
  const sun       = get('SUN');
  const moon      = get('MOON');
  const rising    = get('RISING');
  const nakshatra = get('NAKSHATRA');
  const dasha     = get('DASHA');
  const overview  = get('OVERVIEW');
  if (!sun && !moon && !overview) {
    return { sun: null, moon: null, rising: null, nakshatra: null, dasha: null, overview: text.trim() || null };
  }
  return { sun, moon, rising, nakshatra, dasha, overview };
}

export function useChartReading(profile: Profile | null): State {
  'use no memo'; // replyLanguage() has no reactive inputs; the compiler would cache it across language switches
  const llmStatus = useSyncExternalStore(subscribeToLLMState, getLLMState, getLLMState).status;
  const [state, setState] = useState<State>({ reading: null, loading: false });
  // Readings are written in the reply language, so a language switch needs
  // its own reading (once the model speaks it).
  const { i18n } = useTranslation();
  const lang = replyLanguage();

  useEffect(() => {
    if (!profile?.birthDate) return;
    let cancelled = false;

    const cached = Storage.getChartReading(profile.id, lang);
    if (cached) {
      try {
        setState({ reading: JSON.parse(cached), loading: false });
      } catch {
        Storage.deleteChartReading(profile.id);
      }
      return;
    }

    // The bundled model loads in about a second; kick it off and re-run when ready.
    if (!isLLMReady()) {
      initLocalLLM().catch(() => {});
      return;
    }

    setState({ reading: null, loading: true });

    // A hi/bn reading that comes out in the wrong script twice falls back to
    // the English reading (the cached one if there is one), so the card is
    // never empty; it is cached under this language too, so it isn't retried
    // on every visit.
    const cachedEnglish = lang === 'en' ? null : Storage.getChartReading(profile.id, 'en');
    askChartReading(profile, lang, { skipEnglishFallback: !!cachedEnglish }).then((result) => {
      if (cancelled) return;
      if (!result) {
        setState({ reading: null, loading: false });
        return;
      }
      let reading: ChartReading | null = null;
      if (result.text) {
        reading = parseReading(result.text);
        if (result.lang !== lang) Storage.setChartReading(profile.id, JSON.stringify(reading), result.lang);
      } else if (cachedEnglish) {
        try { reading = JSON.parse(cachedEnglish); } catch { /* fall through */ }
      }
      if (!reading) {
        setState({ reading: null, loading: false });
        return;
      }
      Storage.setChartReading(profile.id, JSON.stringify(reading), lang);
      setState({ reading, loading: false });
    }).catch(() => {
      if (!cancelled) setState({ reading: null, loading: false });
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, llmStatus, lang, i18n.language]);

  return state;
}
