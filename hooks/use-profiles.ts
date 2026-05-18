import { useCallback, useEffect } from 'react';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import {
  getAllProfiles,
  insertProfile,
  updateProfile,
  deleteProfile as dbDeleteProfile,
  isSystemProfile,
  type Profile,
} from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { geocodeCity } from '@/utils/geocoding';
import { todayIso } from '@/utils/format';

type CreateProfileInput = {
  name: string;
  relationship?: string | null;
  gender?: string | null;
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
    getAllProfiles().then((all) => {
      const loaded = all.filter((p) => !isSystemProfile(p.id));
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
      gender:       input.gender ?? null,
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
    // Re-geocode if the birth city changed AND no explicit lat/lng was supplied.
    // The edit screen passes pre-resolved lat/lng from country-state-city, so
    // skip the geocoder call in that case to avoid clobbering correct coords.
    if (patch.birthCity !== undefined && patch.birthLat === undefined && patch.birthLng === undefined) {
      const geo = patch.birthCity ? await geocodeCity(patch.birthCity) : null;
      patch = { ...patch, birthLat: geo?.lat ?? null, birthLng: geo?.lng ?? null };
    }
    await updateProfile(id, patch);

    // Birth details directly drive the chart. Invalidate every cached
    // artifact keyed by the profile so the next read recomputes against the
    // new chart context.
    Storage.deleteChartReading(id);
    Storage.deleteHoroscopeCache(id, todayIso());
    // Semantic Q&A cache is auto-orphaned because its key is hash(question +
    // birthDate|birthTime|birthLat|birthLng) — any of those changing makes
    // old entries unreachable. No explicit clear needed.
    void Cache;

    const all = await getAllProfiles();
    storeSetProfiles(all.filter((p) => !isSystemProfile(p.id)));
  }, [storeSetProfiles]);

  const removeProfile = useCallback(async (id: string): Promise<void> => {
    await dbDeleteProfile(id);
    storeRemove(id);
    // SQLite cascades thread + message rows via FK, but the Zustand thread
    // store keeps an in-memory entry keyed by profile id. Wipe it so any
    // component still subscribed to threads[id] doesn't see dead data.
    useThreadStore.getState().setThreads(id, []);
    // Any per-profile cache (chart reading, today's horoscope) is now stale
    // for an id that no longer exists. Drop it.
    Storage.deleteChartReading(id);
    Storage.deleteHoroscopeCache(id, todayIso());
    // If the deleted profile was the active one, sync MMKV to whichever the
    // profile store auto-selected. If none remains, clear the key entirely
    // so we don't keep pointing at a dead id on next launch.
    const newActiveId = useProfileStore.getState().activeProfileId;
    if (newActiveId) Storage.setActiveProfileId(newActiveId);
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
