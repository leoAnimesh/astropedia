import { getSunSign } from '@/utils/astrology';
import type { Profile } from '@/utils/database';

export type StarterChip = {
  id: string;
  label: string;
  prompt: string;
};

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
      label: 'Love',
      prompt: `What does ${my}${sunLabel} chart say about love and relationships right now?`,
    },
    {
      id: 'career',
      label: 'Career',
      prompt: `What is ${my} chart saying about career and purpose this season?`,
    },
    {
      id: 'money',
      label: 'Money',
      prompt: `What does ${my} chart show about financial energy and abundance?`,
    },
    {
      id: 'family',
      label: 'Family',
      prompt: `How does ${my} chart reflect ${my} family patterns and dynamics?`,
    },
    {
      id: 'self',
      label: 'Self',
      prompt: `What is ${my}${sunLabel} nature really working through right now?`,
    },
    {
      id: 'today',
      label: 'Today',
      prompt: `What should ${me} know about today's energy from ${my} chart?`,
    },
    {
      id: 'vibes',
      label: 'Vibes',
      prompt: `Read the current astrological vibes in ${my} chart — what stands out?`,
    },
  ];
}
