import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

export function useHoroscope(profile: Profile | null, refreshKey = 0): HoroscopeState {
  const { t, i18n } = useTranslation('horoscope');
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
        error:    t('errors.noBirthDate'),
      });
      return;
    }

    // Deterministic generation — no LLM, instant, works on every device.
    // Not cached: it's cheap, and rebuilding means the text follows the app
    // language and any edit to the birth details.
    const sections = generateDailyHoroscope(profile, todayIso());
    if (sections) {
      setState({ sections, text: sections.energy, loading: false, error: null });
    } else {
      setState({
        sections: null,
        text:     null,
        loading:  false,
        error:    t('errors.failed'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.birthDate, profile?.birthTime, profile?.birthLat, profile?.birthLng, refreshKey, i18n.language]);

  return state;
}
