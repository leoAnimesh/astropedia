/**
 * The assignment's mock payload, verbatim, plus a short "earlier session"
 * that exercises the parts the payload alone doesn't show (date separators,
 * grouping of consecutive AI messages, the promotion + remedy types, and an
 * unknown recommendation type that must fall back safely).
 *
 * Used ONLY by the dev "Seed demo conversation" action — real threads are
 * never pre-filled. After seeding, the thread is a normal persisted thread
 * and every new reply comes from the on-device model.
 */

export type RawPayloadMessage = {
  id?:              unknown;
  type?:            unknown;
  text?:            unknown;
  createdAt?:       unknown;
  author?:          unknown;
  recommendations?: unknown;
};

/** Exactly as given in the assignment brief. */
export const ASSIGNMENT_MOCK_PAYLOAD: RawPayloadMessage[] = [
  {
    id: '1',
    type: 'system',
    text: 'Your session with AI Astrologer has started.',
  },
  {
    id: '2',
    type: 'user',
    text: 'Can you tell me about my career this year?',
  },
  {
    id: '3',
    type: 'ai',
    text: 'I can already see a strong Saturn influence in your chart. Based on this, here are a few recommendations that may help you.',
    recommendations: [
      { id: '1', type: 'gemstone',     title: 'Blue Sapphire', subtitle: 'Recommended for Saturn' },
      { id: '2', type: 'tarot',        title: 'Career Tarot Reading' },
      { id: '3', type: 'consultation', title: 'Talk to an Astrologer' },
      { id: '4', type: 'article',      title: 'Understanding Saturn Mahadasha' },
    ],
  },
  {
    id: '4',
    type: 'human',
    text: 'I also recommend focusing on your upcoming Jupiter transit.',
  },
];

/** Earlier-day history (schema extension demo). Timestamps are relative offsets. */
export const DEMO_EARLIER_SESSION: RawPayloadMessage[] = [
  {
    id: 'e1',
    type: 'user',
    text: 'Is this week a good time to start something new?',
  },
  {
    id: 'e2',
    type: 'ai',
    text: 'The Moon is waxing through the middle of the week, which favours fresh starts. Wednesday and Thursday look strongest.',
  },
  {
    id: 'e3',
    type: 'ai',
    text: 'Here are a few things that can help you pick the exact moment.',
    recommendations: [
      { id: 'p1', type: 'promotion', title: "Today's Panchang", subtitle: 'Auspicious windows & Rahu Kaal', meta: { route: '/panchang' } },
      { id: 'p2', type: 'remedy',    title: 'Jupiter mantra',   subtitle: 'Om Gurave Namah · Thursdays' },
      // Deliberately unknown type — rendered by the registry's fallback card.
      { id: 'p3', type: 'live_session', title: 'Live Q&A: New Beginnings', subtitle: 'Coming soon' },
      // Deliberately malformed — dropped by the normalizer (no title).
      { id: 'p4', type: 'gemstone' },
    ],
  },
];

export const DEMO_HUMAN_ASTROLOGER = 'Astrologer Meera';
