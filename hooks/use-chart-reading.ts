import { useState, useEffect, useSyncExternalStore } from 'react';
import { getFullKundli } from '@/utils/astrology';
import { askAI } from '@/utils/ai';
import { isLLMReady, subscribeToLLMState, getLLMState } from '@/utils/local-llm';
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
  const get = (prefix: string): string | null => {
    const line = lines.find(l => l.trimStart().startsWith(prefix));
    if (!line) return null;
    const val = line.slice(line.indexOf(prefix) + prefix.length).trim();
    return val || null;
  };
  const sun       = get('SUN:');
  const moon      = get('MOON:');
  const rising    = get('RISING:');
  const nakshatra = get('NAKSHATRA:');
  const dasha     = get('DASHA:');
  const overview  = get('OVERVIEW:');
  if (!sun && !moon && !overview) {
    return { sun: null, moon: null, rising: null, nakshatra: null, dasha: null, overview: text.trim() || null };
  }
  return { sun, moon, rising, nakshatra, dasha, overview };
}

export function useChartReading(profile: Profile | null): State {
  const llmStatus = useSyncExternalStore(subscribeToLLMState, getLLMState, getLLMState).status;
  const [state, setState] = useState<State>({ reading: null, loading: false });

  useEffect(() => {
    if (!profile?.birthDate) return;
    let cancelled = false;

    const cached = Storage.getChartReading(profile.id);
    if (cached) {
      try {
        setState({ reading: JSON.parse(cached), loading: false });
      } catch {
        Storage.deleteChartReading(profile.id);
      }
      return;
    }

    if (!isLLMReady()) return;

    setState({ reading: null, loading: true });

    const kundli = getFullKundli({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime ?? undefined,
      birthLat:  profile.birthLat,
      birthLng:  profile.birthLng,
    });

    const { bigThree: { sun, moon, rising }, nakshatra, dasha } = kundli;
    const firstName = profile.name.split(' ')[0];

    const chartDesc = [
      sun    && `Sun in ${sun.name}`,
      moon   && `Moon in ${moon.name}`,
      rising && `Rising in ${rising.name}`,
    ].filter(Boolean).join(', ');

    const prompt = `Write a warm, personal astrological reading for ${firstName}.
Chart: ${chartDesc}
Moon nakshatra: ${nakshatra.name} (ruled by ${nakshatra.lord})
Current Mahadasha: ${dasha.lord} (until ${dasha.endDate})

Reply in exactly this format — one line per key, no preamble, no extra text:
SUN: one warm sentence about their ${sun?.name ?? 'sun'} core self
MOON: one warm sentence about their ${moon?.name ?? 'moon'} emotional world${rising ? `\nRISING: one warm sentence about their ${rising.name} outer presence` : ''}
NAKSHATRA: one warm sentence about what ${nakshatra.name} nakshatra brings them
DASHA: one warm sentence about what the ${dasha.lord} Mahadasha means for them right now
OVERVIEW: two warm sentences synthesizing how all these placements blend together`;

    askAI({ profile, history: [], userMessage: prompt }).then(({ text }) => {
      if (cancelled) return;
      const reading = parseReading(text);
      Storage.setChartReading(profile.id, JSON.stringify(reading));
      setState({ reading, loading: false });
    }).catch(() => {
      if (!cancelled) setState({ reading: null, loading: false });
    });

    return () => { cancelled = true; };
  }, [profile?.id, llmStatus]);

  return state;
}
