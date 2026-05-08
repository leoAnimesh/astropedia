import { useMemo } from 'react';
import {
  getFullKundli,
  type BigThree,
  type PlanetPosition,
  type DashaInfo,
  type FullKundli,
} from '@/utils/astrology';
import type { ZodiacSign, Nakshatra } from '@/constants/astrology';

type Profile = {
  birthDate: string;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
};

type AstrologyResult = {
  kundli: FullKundli;
  bigThree: BigThree;
  sunSign: ZodiacSign | null;
  moonSign: ZodiacSign | null;
  risingSign: ZodiacSign | null;
  chartPositions: PlanetPosition[];
  nakshatra: Nakshatra | null;
  dasha: DashaInfo | null;
  moonLon: number;
  ascDeg: number | null;
};

export function useAstrology(profile: Profile): AstrologyResult {
  return useMemo(() => {
    if (!profile.birthDate) {
      return {
        kundli:         {} as FullKundli,
        bigThree:       { sun: null, moon: null, rising: null },
        sunSign:        null,
        moonSign:       null,
        risingSign:     null,
        chartPositions: [],
        nakshatra:      null,
        dasha:          null,
        moonLon:        0,
        ascDeg:         null,
      };
    }

    const kundli = getFullKundli({
      birthDate: profile.birthDate,
      birthTime: profile.birthTime,
      birthLat:  profile.birthLat,
      birthLng:  profile.birthLng,
    });

    return {
      kundli,
      bigThree:       kundli.bigThree,
      sunSign:        kundli.bigThree.sun,
      moonSign:       kundli.bigThree.moon,
      risingSign:     kundli.bigThree.rising,
      chartPositions: kundli.planets,
      nakshatra:      kundli.nakshatra,
      dasha:          kundli.dasha,
      moonLon:        kundli.moonLon,
      ascDeg:         kundli.ascDeg,
    };
  }, [profile.birthDate, profile.birthTime, profile.birthLat, profile.birthLng]);
}
