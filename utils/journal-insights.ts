/**
 * Journal pattern insights. Deterministic and honest: a sentence is produced
 * only when the data actually shows it, otherwise `null`.
 *
 * Entries are grouped by (a) the sub-period lord running on each entry's date
 * and (b) the lunar fortnight (paksha). A pattern is reported when, inside a
 * group of at least MIN_GROUP days, one mood is strictly the most frequent,
 * appears on at least MIN_GROUP days, makes up at least half the group, and
 * is clearly more common there than on the other days (by MIN_LIFT, with at
 * least MIN_GROUP days outside the group to compare against). Logging the same
 * mood every day therefore yields no "pattern".
 *
 * The sentence is display text in the app language (namespace `journal`);
 * moods are stored as English ids and translated via `journal:mood.<id>`.
 */

import { getLifeChapters } from './astrology';
import i18n, { tPlanet } from './i18n';
import { getTithi } from './panchang';

export const MIN_ENTRIES = 10;
export const MIN_GROUP   = 3;
const MIN_LIFT = 0.25;

type BirthInfo = { birthDate: string; birthTime?: string | null; birthLng?: number | null; birthTz?: string | null };
type EntryLike = { date: string; mood: string };

export type DayContext = {
  subLord:  string;
  chapter:  string;
  paksha:   'Shukla' | 'Krishna';
};

/** Life-phase context for a local YYYY-MM-DD date (taken at local noon). */
export function dayContext(profile: BirthInfo, date: string): DayContext | null {
  if (!profile.birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = new Date(date + 'T12:00:00');
  if (Number.isNaN(at.getTime())) return null;
  const life = getLifeChapters(profile, at);
  return {
    subLord: life.subs[life.currentSub].lord,
    chapter: life.chapters[life.currentIndex].lord,
    paksha:  getTithi(date).paksha,
  };
}

export type JournalInsight = {
  sentence: string;
  mood:     string;
  count:    number;
  of:       number;
};

type Candidate = JournalInsight & { share: number };

/** Translated label for a stored mood id ("Calm" → "शांत"). */
export function moodLabel(mood: string): string {
  return i18n.t(`journal:mood.${mood}`, { defaultValue: mood });
}

type Sentence = (key: string, vars: { mood: string; days: number; of: number }) => string;

function bestInGroups(
  groups: Map<string, string[]>,
  sentence: Sentence,
): Candidate[] {
  const out: Candidate[] = [];
  for (const [key, moods] of groups) {
    const rest = [...groups].filter(([k]) => k !== key).flatMap(([, m]) => m);
    if (moods.length < MIN_GROUP) continue;
    const counts = new Map<string, number>();
    for (const m of moods) counts.set(m, (counts.get(m) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const [mood, count] = sorted[0];
    if (sorted[1] && sorted[1][1] === count) continue; // tie: no single "most often"
    if (count < MIN_GROUP || count / moods.length < 0.5) continue;
    if (rest.length < MIN_GROUP) continue;
    const restShare = rest.filter((m) => m === mood).length / rest.length;
    if (count / moods.length - restShare < MIN_LIFT) continue;
    out.push({
      mood, count, of: moods.length, share: count / moods.length,
      sentence: sentence(key, { mood: moodLabel(mood), days: count, of: moods.length }),
    });
  }
  return out;
}

/** The strongest honest pattern, or null if there isn't one yet. */
export function journalInsight(profile: BirthInfo, entries: EntryLike[]): JournalInsight | null {
  if (!profile.birthDate || entries.length < MIN_ENTRIES) return null;

  const bySub    = new Map<string, string[]>();
  const byPaksha = new Map<string, string[]>();
  for (const e of entries) {
    const ctx = dayContext(profile, e.date);
    if (!ctx || !e.mood) continue;
    (bySub.get(ctx.subLord) ?? bySub.set(ctx.subLord, []).get(ctx.subLord)!).push(e.mood);
    (byPaksha.get(ctx.paksha) ?? byPaksha.set(ctx.paksha, []).get(ctx.paksha)!).push(e.mood);
  }

  const candidates = [
    // A sub-period pattern only means something if entries span more than one sub-period.
    ...(bySub.size > 1
      ? bestInGroups(bySub, (k, vars) => i18n.t('journal:insight.sub', { ...vars, planet: tPlanet(k) }))
      : []),
    ...bestInGroups(byPaksha, (k, vars) =>
      i18n.t(k === 'Shukla' ? 'journal:insight.waxing' : 'journal:insight.waning', vars)),
  ];
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.share - a.share || b.count - a.count);
  const { share: _share, ...best } = candidates[0];
  return best;
}
