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

    const prompt = `Write a warm, simple personality description for ${firstName}. They know nothing about astrology — speak in plain everyday language, like a wise friend who knows them well. No jargon whatsoever.

Their chart: ${chartDesc}
Their moon personality style: ${nakshatra.name} nakshatra (intuitive, ${nakshatra.lord}-influenced)
Their current life phase: ${dasha.lord} period until ${dasha.endDate}

Reply in EXACTLY this format — one line per key, plain English only, no astrology terms, NO markdown (no ##, no **):
SUN: one sentence about who ${firstName} is at their core — their main personality strength and drive
MOON: one sentence about how ${firstName} feels and handles emotions — their inner world${rising ? `\nRISING: one sentence about how ${firstName} comes across to others at first meeting` : ''}
NAKSHATRA: one sentence about ${firstName}'s instinctive nature and what makes them unique
DASHA: one sentence about what kind of chapter of life ${firstName} is going through right now
OVERVIEW: two sentences describing ${firstName} as a whole person — what makes them special and what to embrace`;

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
