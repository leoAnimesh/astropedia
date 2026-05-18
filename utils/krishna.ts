import type { StarterChip } from '@/constants/starters';
import type { Profile } from './database';

export const KRISHNA_PROFILE_ID = '__krishna__';
export const KRISHNA_NAME       = 'Krishna';

export const KRISHNA_PROFILE: Profile = {
  id:           KRISHNA_PROFILE_ID,
  name:         KRISHNA_NAME,
  relationship: null,
  birthDate:    '',
  birthTime:    null,
  birthCity:    null,
  birthLat:     null,
  birthLng:     null,
  gender:       null,
  isYou:        false,
  createdAt:    '',
  updatedAt:    '',
  syncedAt:     null,
};

export function isKrishnaProfile(id: string | null | undefined): boolean {
  return id === KRISHNA_PROFILE_ID;
}

export const KRISHNA_STARTERS: StarterChip[] = [
  { id: 'k-lost',       label: 'Feeling lost',         prompt: 'I feel lost. I don\'t know what the right thing to do is anymore.' },
  { id: 'k-fear',       label: 'Too much fear',        prompt: 'I have so much fear inside me. How do I stop feeling scared all the time?' },
  { id: 'k-tension',    label: 'Too much worry',       prompt: 'I worry about everything. My mind never settles. What do I do?' },
  { id: 'k-failure',    label: 'I keep failing',       prompt: 'I keep failing at the thing I really love. Should I just give up?' },
  { id: 'k-overthink',  label: 'Can\'t stop thinking', prompt: 'My mind never stops. I keep overthinking everything. How do I make it quieter?' },
  { id: 'k-purpose',    label: 'What\'s my purpose?',  prompt: 'I don\'t know what I\'m supposed to do with my life. What\'s the point of all this?' },
];
