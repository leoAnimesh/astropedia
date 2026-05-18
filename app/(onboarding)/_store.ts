// Persistent draft of the user's in-flight onboarding answers. Every field
// writes through to MMKV so closing the app mid-flow doesn't lose progress.
// The wrapper preserves the simple `OnboardingStore.field = value` API the
// onboarding screens already use.

import { Storage } from '@/utils/storage';

type Draft = {
  name: string;
  gender: string;
  birthDate: string;
  birthTime: string;
  countryCode: string;
  countryName: string;
  stateCode: string;
  stateName: string;
  cityName: string;
  birthLat: number | null;
  birthLng: number | null;
};

const DEFAULT_DRAFT: Draft = {
  name:        '',
  gender:      '',
  birthDate:   '',
  birthTime:   '',
  countryCode: '',
  countryName: '',
  stateCode:   '',
  stateName:   '',
  cityName:    '',
  birthLat:    null,
  birthLng:    null,
};

const inMemory: Draft = {
  ...DEFAULT_DRAFT,
  ...(Storage.getOnboardingDraft() as Partial<Draft> ?? {}),
};

export function resetOnboardingDraft(): void {
  Object.assign(inMemory, DEFAULT_DRAFT);
  Storage.clearOnboardingDraft();
}

const OnboardingStore = new Proxy(inMemory, {
  get(target, prop: string) {
    return target[prop as keyof Draft];
  },
  set(target, prop: string, value: Draft[keyof Draft]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (target as any)[prop] = value;
    Storage.setOnboardingDraft({ ...target });
    return true;
  },
}) as Draft;

export default OnboardingStore;
