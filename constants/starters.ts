import { getSunSign } from '@/utils/astrology';
import type { Profile } from '@/utils/database';
import i18n from '@/utils/i18n';

export type StarterChip = {
  id: string;
  /** Shown on the chip, in the app language. */
  label: string;
  /** Sent to the model — always English. */
  prompt: string;
};

const label = (id: string) => i18n.t(`chat:starters.${id}`);

export function buildPersonalizedStarters(profile: Profile): StarterChip[] {
  const sun      = getSunSign(profile.birthDate);
  const isYou    = profile.isYou;
  const first    = profile.name.split(' ')[0];
  const my       = isYou ? 'my' : `${first}'s`;
  const me       = isYou ? 'me' : first;
  const sunLabel = sun ? ` ${sun.name}` : '';

  return [
    {
      id: 'love',
      label: label('love'),
      prompt: `What does ${my}${sunLabel} chart say about love and relationships right now?`,
    },
    {
      id: 'career',
      label: label('career'),
      prompt: `What is ${my} chart saying about career and purpose this season?`,
    },
    {
      id: 'money',
      label: label('money'),
      prompt: `What does ${my} chart show about financial energy and abundance?`,
    },
    {
      id: 'family',
      label: label('family'),
      prompt: `How does ${my} chart reflect ${my} family patterns and dynamics?`,
    },
    {
      id: 'self',
      label: label('self'),
      prompt: `What is ${my}${sunLabel} nature really working through right now?`,
    },
    {
      id: 'today',
      label: label('today'),
      prompt: `What should ${me} know about today's energy from ${my} chart?`,
    },
    {
      id: 'vibes',
      label: label('vibes'),
      prompt: `Read the current astrological vibes in ${my} chart — what stands out?`,
    },
  ];
}
