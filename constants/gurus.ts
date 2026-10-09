/**
 * Gurus: topic-focused chat agents. Each profile has one ongoing chat per
 * guru (threads.agent, schema v7); Krishna is one chat for everyone.
 *
 * The bundled model (astro-gemma v2.1) only knows the [saga] and [krishna]
 * tasks, so every chart guru runs the [saga] task. What makes a guru feel
 * like a Love or Career guru today is app-side: its welcome text and starter
 * questions (locales <lang>/chat.json `gurus.<id>.*`), its safety rules
 * below, and the "Ask <guru> →" nudge when a question belongs elsewhere.
 * Topic-focused chart context (`context` below) is implemented but OFF
 * (GURU_CONTEXT_FOCUS) until it has been evaluated against the model: v2.1
 * was trained on the full 9-line Life areas block only.
 *
 * Pure data with type-only imports, so Node tests can load it.
 */
import type { IconName } from '../components/atoms/Icon';
import type { AgentId } from '../utils/db-schema';
import type { FollowUpTopic } from '../utils/follow-ups';

export type { AgentId };

/**
 * Send each guru only the chart lines its topic needs (AnswerPlan.focus →
 * utils/guru-context.ts focusContext). OFF: evaluated 2026-10-09 with the
 * v2.1 .pte (ml/scripts/timing_eval/focus_gen.ts + focus_score.py, greedy,
 * validator against the full chart). 40 non-timing guru questions x en/hi/bn:
 * v4 pass 83.3% full vs 75.8% focused (hi 85.0 → 72.5, bn 77.5 → 65.0; more
 * Latin words and misattributed dates), on-topic 93.3% → 95.8%. 69 timing
 * questions: v4 85.5% → 87.0%, first date in the best window 68.1% → 73.9%
 * (the verify layer already makes every shown date in-window). Worse overall
 * (84.1% → 79.9% v4 on all 189), so the model keeps the full context; v2.1 was
 * trained on the full Life areas block only. Re-run before turning it on for
 * a model trained with focused contexts.
 */
export const GURU_CONTEXT_FOCUS = false as boolean;

/** Labels of the v2 context "Life areas:" lines (utils/astrology.ts lifeAreaLines). */
export type LifeArea =
  | 'Self/health' | 'Love/marriage' | 'Career' | 'Money' | 'Home/family'
  | 'Romance/children/study' | 'Abroad/spending/spiritual' | 'Mind' | 'Growth/luck';

/** Planets of the v2 context "Now (sky today):" lines. */
export type TransitPlanet = 'Saturn' | 'Jupiter' | 'Rahu';

export type GuruSpec = {
  id: AgentId;
  icon: IconName;
  /** Model task: chart gurus all use [saga] with the v2.1 model. */
  mode: 'saga' | 'krishna';
  /**
   * Question topics (utils/follow-ups.ts detectTopic) this guru covers. A
   * question about another guru's topic gets an "Ask <guru> →" chip.
   * Empty = answers anything (Saga, Krishna): no nudges.
   */
  topics: FollowUpTopic[];
  /** Chart lines kept when GURU_CONTEXT_FOCUS is on; null = full context. */
  context: { areas: LifeArea[]; transits: TransitPlanet[] } | null;
  /** Under-18 profiles can't open this chat (a gentle notice points to Family / Study). */
  adultsOnly: boolean;
  /** Self-harm / suicide messages get a fixed helpline reply; the model isn't called. */
  crisisGuard: boolean;
  /** Not-medical-advice + helpline note under the welcome bubble. */
  wellbeingNote: boolean;
};

export const GURUS: Record<AgentId, GuruSpec> = {
  saga: {
    id: 'saga', icon: 'sparkle', mode: 'saga', topics: [], context: null,
    adultsOnly: false, crisisGuard: true, wellbeingNote: false,
  },
  love: {
    id: 'love', icon: 'heart', mode: 'saga', topics: ['love', 'marriage'],
    context: { areas: ['Love/marriage', 'Romance/children/study', 'Mind'], transits: ['Jupiter', 'Saturn'] },
    adultsOnly: true, crisisGuard: true, wellbeingNote: false,
  },
  career: {
    id: 'career', icon: 'briefcase', mode: 'saga', topics: ['career', 'money', 'abroad'],
    context: {
      areas: ['Career', 'Money', 'Growth/luck', 'Abroad/spending/spiritual'],
      transits: ['Saturn', 'Jupiter', 'Rahu'],
    },
    adultsOnly: false, crisisGuard: true, wellbeingNote: false,
  },
  health: {
    id: 'health', icon: 'sprout', mode: 'saga', topics: ['health'],
    context: { areas: ['Self/health', 'Mind', 'Abroad/spending/spiritual'], transits: ['Saturn'] },
    adultsOnly: false, crisisGuard: true, wellbeingNote: true,
  },
  family: {
    id: 'family', icon: 'house', mode: 'saga', topics: ['family', 'marriage'],
    context: {
      areas: ['Home/family', 'Romance/children/study', 'Love/marriage', 'Mind'],
      transits: ['Saturn', 'Jupiter'],
    },
    adultsOnly: false, crisisGuard: true, wellbeingNote: false,
  },
  study: {
    id: 'study', icon: 'study', mode: 'saga', topics: ['study', 'abroad', 'career'],
    context: { areas: ['Romance/children/study', 'Growth/luck', 'Mind', 'Career'], transits: ['Jupiter', 'Saturn'] },
    adultsOnly: false, crisisGuard: true, wellbeingNote: false,
  },
  krishna: {
    id: 'krishna', icon: 'lotus', mode: 'krishna', topics: [], context: null,
    adultsOnly: false, crisisGuard: true, wellbeingNote: false,
  },
};

/** Chart gurus in the Chat tab's order ("Gurus for <name>"). Krishna is listed apart. */
export const PROFILE_GURUS: readonly AgentId[] = ['saga', 'love', 'career', 'health', 'family', 'study'];

/** Home "Ask a guru" row, left to right. */
export const HOME_GURU_ROW: readonly AgentId[] = ['love', 'career', 'health', 'family', 'study', 'saga', 'krishna'];

/** Where a question on each topic belongs (the nudge chip's target). */
export const TOPIC_GURU: Record<FollowUpTopic, AgentId> = {
  love: 'love', marriage: 'love', career: 'career', money: 'career', abroad: 'career',
  health: 'health', family: 'family', study: 'study',
};

/** Guru starter questions: chat:gurus.<id>.starters.<you|other>.<key>. */
export const GURU_STARTER_KEYS = ['s1', 's2', 's3', 's4'] as const;
