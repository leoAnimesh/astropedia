import { useCallback, useEffect } from 'react';
import { useProfileStore } from '@/stores/profile-store';
import {
  getAllProfiles,
  insertProfile,
  updateProfile,
  deleteProfile as dbDeleteProfile,
  type Profile,
} from '@/utils/database';
import { Storage } from '@/utils/storage';
import { geocodeCity } from '@/utils/geocoding';

type CreateProfileInput = {
  name: string;
  relationship?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
  // Pre-geocoded coordinates; if provided, Nominatim is skipped
  birthLat?: number | null;
  birthLng?: number | null;
  isYou?: boolean;
};

function generateId(): string {
  return 'p_' + Math.random().toString(36).slice(2, 11);
}

export function useProfiles() {
  const profiles        = useProfileStore((s) => s.profiles);
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const storeSetProfiles  = useProfileStore((s) => s.setProfiles);
  const storeUpsert       = useProfileStore((s) => s.upsertProfile);
  const storeRemove       = useProfileStore((s) => s.removeProfile);
  const storeSetActive    = useProfileStore((s) => s.setActiveProfileId);

  useEffect(() => {
    getAllProfiles().then((loaded) => {
      storeSetProfiles(loaded);
      // Restore active profile from MMKV
      const saved = Storage.getActiveProfileId();
      if (saved && loaded.some((p) => p.id === saved)) {
        storeSetActive(saved);
      } else if (loaded.length > 0) {
        const self = loaded.find((p) => p.isYou) ?? loaded[0];
        storeSetActive(self.id);
        Storage.setActiveProfileId(self.id);
      }
    });
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  const createProfile = useCallback(async (input: CreateProfileInput): Promise<Profile> => {
    // Use pre-geocoded coordinates if provided; otherwise geocode the city string.
    // The city string already contains country/state context so Nominatim is very accurate.
    let lat: number | null = input.birthLat ?? null;
    let lng: number | null = input.birthLng ?? null;
    if (!lat && !lng && input.birthCity) {
      const geo = await geocodeCity(input.birthCity);
      if (geo) { lat = geo.lat; lng = geo.lng; }
    }

    const profile = await insertProfile({
      id:           generateId(),
      name:         input.name,
      relationship: input.relationship ?? null,
      birthDate:    input.birthDate,
      birthTime:    input.birthTime ?? null,
      birthCity:    input.birthCity ?? null,
      birthLat:     lat,
      birthLng:     lng,
      isYou:        input.isYou ?? false,
    });
    storeUpsert(profile);
    return profile;
  }, [storeUpsert]);

  const editProfile = useCallback(async (id: string, patch: Partial<Profile>): Promise<void> => {
    // Re-geocode if the birth city changed
    if (patch.birthCity !== undefined) {
      const geo = patch.birthCity ? await geocodeCity(patch.birthCity) : null;
      patch = { ...patch, birthLat: geo?.lat ?? null, birthLng: geo?.lng ?? null };
    }
    await updateProfile(id, patch);
    Storage.deleteChartReading(id); // birth info changed — regenerate chart reading
    const all = await getAllProfiles();
    storeSetProfiles(all);
  }, [storeSetProfiles]);

  const removeProfile = useCallback(async (id: string): Promise<void> => {
    await dbDeleteProfile(id);
    storeRemove(id);
  }, [storeRemove]);

  const setActiveProfile = useCallback((id: string) => {
    storeSetActive(id);
    Storage.setActiveProfileId(id);
  }, [storeSetActive]);

  return {
    profiles,
    activeProfile,
    activeProfileId,
    createProfile,
    editProfile,
    removeProfile,
    setActiveProfile,
  };
}
