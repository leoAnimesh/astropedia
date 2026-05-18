import { useState, useEffect } from 'react';
import { Storage } from '@/utils/storage';
import { todayIso } from '@/utils/format';
import { generateDailyHoroscope, type HoroscopeSections } from '@/utils/horoscope';
import type { Profile } from '@/utils/database';

export type { HoroscopeSections };

export type HoroscopeState = {
  sections: HoroscopeSections | null;
  text:     string | null; // = energy section, for home teaser
  loading:  boolean;
  /** Friendly explanation when sections is null — surfaces in the UI. */
  error:    string | null;
};

function isUsableSection(s: string | undefined): boolean {
  if (!s) return false;
  const trimmed = s.trim();
  if (trimmed.length < 8) return false;
  // Reject leftover JSON/markup artifacts from prior LLM-cache shapes.
  if (/^[{[\]"]/.test(trimmed)) return false;
  return true;
}

function isUsableHoroscope(sections: HoroscopeSections | null): sections is HoroscopeSections {
  if (!sections) return false;
  return isUsableSection(sections.energy)
      && isUsableSection(sections.guidance);
}

export function useHoroscope(profile: Profile | null, refreshKey = 0): HoroscopeState {
  const [state, setState] = useState<HoroscopeState>({ sections: null, text: null, loading: false, error: null });

  useEffect(() => {
    if (!profile) {
      setState({ sections: null, text: null, loading: false, error: null });
      return;
    }
    if (!profile.birthDate) {
      setState({
        sections: null,
        text:     null,
        loading:  false,
        error:    'Add a birth date in your profile to unlock daily readings.',
      });
      return;
    }

    const today  = todayIso();
    const cached = Storage.getHoroscopeCache(profile.id, today);

    if (cached) {
      try {
        const sections = JSON.parse(cached) as HoroscopeSections;
        if (isUsableHoroscope(sections)) {
          setState({ sections, text: sections.energy, loading: false, error: null });
          return;
        }
      } catch {
        // cache corrupt — regenerate
      }
      // Cache exists but is malformed — drop it before regenerating.
      Storage.deleteHoroscopeCache(profile.id, today);
    }

    // Deterministic generation — no LLM, instant, works on every device.
    const sections = generateDailyHoroscope(profile, today);
    if (sections) {
      Storage.setHoroscopeCache(profile.id, today, JSON.stringify(sections));
      setState({ sections, text: sections.energy, loading: false, error: null });
    } else {
      setState({
        sections: null,
        text:     null,
        loading:  false,
        error:    "Couldn't generate today's reading from this chart — check your birth details.",
      });
    }
  }, [profile?.id, refreshKey]);

  return state;
}
