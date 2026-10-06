import type { Profile } from '@/utils/database';
import i18n, { tAsk } from '@/utils/i18n';

export type StarterChip = {
  id: string;
  /** Shown on the chip, in the app language. */
  label: string;
  /** Sent to the chat as the user's question (tAsk: app language when the model speaks it). */
  prompt: string;
};

const STARTER_IDS = ['love', 'career', 'money', 'family', 'self', 'today', 'vibes'];

export function buildPersonalizedStarters(profile: Profile): StarterChip[] {
  const who  = profile.isYou ? 'you' : 'other';
  const name = profile.name.split(' ')[0];

  return STARTER_IDS.map((id) => ({
    id,
    label:  i18n.t(`chat:starters.${id}`),
    prompt: tAsk(`chat:starterPrompts.${who}.${id}`, { name }),
  }));
}
