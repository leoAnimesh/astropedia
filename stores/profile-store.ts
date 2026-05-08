import { create } from 'zustand';
import type { Profile } from '@/utils/database';

type ProfileStore = {
  profiles: Profile[];
  activeProfileId: string | null;
  setProfiles: (profiles: Profile[]) => void;
  upsertProfile: (profile: Profile) => void;
  removeProfile: (id: string) => void;
  setActiveProfileId: (id: string | null) => void;
};

export const useProfileStore = create<ProfileStore>((set) => ({
  profiles:        [],
  activeProfileId: null,

  setProfiles: (profiles) => set({ profiles }),

  upsertProfile: (profile) =>
    set((s) => {
      const exists = s.profiles.some((p) => p.id === profile.id);
      return {
        profiles: exists
          ? s.profiles.map((p) => (p.id === profile.id ? profile : p))
          : [...s.profiles, profile],
      };
    }),

  removeProfile: (id) =>
    set((s) => ({
      profiles:        s.profiles.filter((p) => p.id !== id),
      activeProfileId: s.activeProfileId === id
        ? (s.profiles.find((p) => p.id !== id)?.id ?? null)
        : s.activeProfileId,
    })),

  setActiveProfileId: (id) => set({ activeProfileId: id }),
}));
