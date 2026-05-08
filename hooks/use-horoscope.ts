import { useState, useEffect } from 'react';
import { Storage } from '@/utils/storage';
import { askAI } from '@/utils/ai';
import { getFullKundli, getTodayTransits, getLunarPhase } from '@/utils/astrology';
import { ZODIAC } from '@/constants/astrology';
import { todayIso, formatFullDate } from '@/utils/format';
import type { Profile } from '@/utils/database';

export type HoroscopeSections = {
  energy:    string;
  love:      string;
  career:    string;
  wellness:  string;
  guidance:  string;
  mantra:    string;
};

export type HoroscopeState = {
  sections: HoroscopeSections | null;
  text:     string | null; // = energy section, for home teaser
  loading:  boolean;
};

function parseSections(raw: string): HoroscopeSections | null {
  const get = (key: string): string => {
    const lines = raw.split('\n');
    // Match: "ENERGY:", "## Energy:", "**ENERGY:**", "Energy:" etc.
    const pattern = new RegExp(`^[#*\\s]*${key}[:\\s*_]+`, 'i');
    const line = lines.find(l => pattern.test(l.trimStart()));
    if (!line) return '';
    return line.replace(pattern, '').trim()
      .replace(/^[*_"'#]+|[*_"'#]+$/g, '').trim();
  };
  const energy   = get('ENERGY');
  const love     = get('LOVE');
  const career   = get('CAREER');
  const wellness = get('WELLNESS');
  const guidance = get('GUIDANCE');
  const mantra   = get('MANTRA');
  if (!energy && !guidance) return null;
  return { energy, love, career, wellness, guidance, mantra };
}

function buildHoroscopePrompt(profile: Profile, today: string): string {
  const kundli  = getFullKundli({
    birthDate: profile.birthDate,
    birthTime: profile.birthTime ?? undefined,
    birthLat:  profile.birthLat,
    birthLng:  profile.birthLng,
  });

  const { sun, moon, rising } = kundli.bigThree;
  const { nakshatra, dasha }  = kundli;

  const transits    = getTodayTransits();
  const lunarPhase  = getLunarPhase(today);
  const transitText = transits.map(t => `${t.name} in ${t.signName} ${t.degInSign}°`).join(', ');

  const todayDate   = new Date(today + 'T12:00:00');
  const days        = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName     = days[todayDate.getDay()];
  const dateLabel   = formatFullDate(todayDate);

  const firstName = profile.name.split(' ')[0];

  // Identify strong transit aspects (simplified: if a transiting planet is in same sign as natal)
  const natalSigns = kundli.planets.map(p => ({ name: p.name, signIndex: p.signIndex }));
  const conjunctions = transits
    .filter(t => natalSigns.some(n => n.name !== t.name && ZODIAC[natalSigns.find(n2 => n2.name === t.name)?.signIndex ?? -1]?.name === t.signName))
    .map(t => t.name)
    .slice(0, 2);
  const aspectNote = conjunctions.length
    ? `Notable: transiting ${conjunctions.join(' & ')} activating natal placements.`
    : '';

  return `Write a warm, friendly daily reading for ${firstName} for ${dayName}, ${dateLabel}.

About ${firstName}: They are a ${sun?.name ?? ''} at heart, feel things like a ${moon?.name ?? ''}, and come across as ${rising?.name ?? 'themselves'}.${dasha ? ` They are in a life chapter ruled by ${dasha.lord === 'Rahu' || dasha.lord === 'Ketu' ? 'change and karmic growth' : dasha.lord === 'Jupiter' ? 'growth, wisdom, and expansion' : dasha.lord === 'Venus' ? 'love, beauty, and enjoyment' : dasha.lord === 'Saturn' ? 'hard work, discipline, and long-term building' : dasha.lord === 'Sun' ? 'identity and purpose' : dasha.lord === 'Moon' ? 'emotions and intuition' : dasha.lord === 'Mars' ? 'action and courage' : dasha.lord === 'Mercury' ? 'learning and communication' : 'transformation'}.` : ''}

Write EXACTLY this format — one labeled line per section, NO astrology terms, NO markdown (no ##, no **), plain text only:
ENERGY: [How ${firstName} will feel today overall — their mood and inner energy in 1–2 plain sentences]
LOVE: [What's happening in their close relationships and heart today — warm and practical, 1–2 sentences]
CAREER: [What to focus on at work or with personal goals today — specific and grounded, 1–2 sentences]
WELLNESS: [A simple note on their physical energy and mental wellbeing today, 1–2 sentences]
GUIDANCE: [One clear, actionable piece of advice for ${firstName} today — like a wise friend would give]
MANTRA: [A short uplifting phrase for today — 5 to 8 words, no quotes]`;
}

export function useHoroscope(profile: Profile | null, refreshKey = 0): HoroscopeState {
  const [state, setState] = useState<HoroscopeState>({ sections: null, text: null, loading: false });

  useEffect(() => {
    if (!profile?.birthDate) return;
    let cancelled = false;

    const today  = todayIso();
    const cached = Storage.getHoroscopeCache(profile.id, today);

    if (cached) {
      try {
        const sections = JSON.parse(cached) as HoroscopeSections;
        setState({ sections, text: sections.energy, loading: false });
        return;
      } catch {
        // cache corrupt — regenerate
      }
    }

    setState({ sections: null, text: null, loading: true });

    const userMessage = buildHoroscopePrompt(profile, today);

    askAI({
      profile,
      history:      [],
      userMessage,
      isHoroscope:  true,
    }).then(({ text }) => {
      if (cancelled) return;
      const sections = parseSections(text);
      if (sections) {
        Storage.setHoroscopeCache(profile.id, today, JSON.stringify(sections));
        setState({ sections, text: sections.energy, loading: false });
      } else {
        // AI didn't follow format — show raw text as energy fallback
        const fallback: HoroscopeSections = {
          energy:   text.split('\n').find(l => l.trim()) ?? text,
          love:     '',
          career:   '',
          wellness: '',
          guidance: text,
          mantra:   '',
        };
        Storage.setHoroscopeCache(profile.id, today, JSON.stringify(fallback));
        setState({ sections: fallback, text: fallback.energy, loading: false });
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn('Horoscope generation failed:', err);
        setState({ sections: null, text: null, loading: false });
      }
    });

    return () => { cancelled = true; };
  }, [profile?.id, refreshKey]);

  return state;
}
