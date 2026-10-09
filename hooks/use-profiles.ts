import { useCallback, useEffect } from 'react';
import { useProfileStore } from '@/stores/profile-store';
import { useThreadStore } from '@/stores/thread-store';
import {
  getAllProfiles,
  insertProfile,
  updateProfile,
  deleteProfile as dbDeleteProfile,
  isSystemProfile,
  birthTzFor,
  clearReportPayloads,
  takeBackfilledProfileIds,
  type Profile,
} from '@/utils/database';
import { Storage } from '@/utils/storage';
import { Cache } from '@/utils/cache';
import { geocodeCity } from '@/utils/geocoding';
import { isKnownZone } from '@/utils/timezone';
import { todayIso } from '@/utils/format';

type CreateProfileInput = {
  name: string;
  relationship?: string | null;
  gender?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthCity?: string | null;
  // Coordinates from the place picker; without them the bundled place data is searched by name
  birthLat?: number | null;
  birthLng?: number | null;
  /** IANA zone from the place picker; otherwise derived from the place. */
  birthTz?: string | null;
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
      // Profiles that just got their birth time zone: the chart moved, so
      // drop readings cached against the old (local-mean-time) chart.
      for (const id of takeBackfilledProfileIds()) {
        Storage.deleteChartReading(id);
        Storage.deleteHoroscopeCache(id, todayIso());
      }
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
    // Coordinates from the picker; a typed-in city is looked up in the
    // bundled place data ("City, State, Country" — on this phone, no network).
    let lat: number | null = input.birthLat ?? null;
    let lng: number | null = input.birthLng ?? null;
    let tz: string | null = input.birthTz ?? null;
    if (lat == null && lng == null && input.birthCity) {
      const geo = geocodeCity(input.birthCity);
      if (geo) { lat = geo.lat; lng = geo.lng; tz ??= geo.tz; }
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
      // IANA zone of the birth place, so the birth time is read as that
      // place's civil time (historical offsets, DST) rather than mean solar time.
      birthTz:      isKnownZone(tz) ? tz : birthTzFor({ birthCity: input.birthCity ?? null, birthLat: lat, birthLng: lng }),
      isYou:        input.isYou ?? false,
    });
    storeUpsert(profile);
    return profile;
  }, [storeUpsert]);

  const editProfile = useCallback(async (id: string, patch: Partial<Profile>): Promise<void> => {
    // The birth city changed without coordinates (typed in by hand): look it
    // up in the bundled place data. Picked places come with lat/lng (and zone).
    if (patch.birthCity !== undefined && patch.birthLat == null && patch.birthLng == null) {
      const geo = patch.birthCity ? geocodeCity(patch.birthCity) : null;
      patch = { ...patch, birthLat: geo?.lat ?? null, birthLng: geo?.lng ?? null };
      if (geo && patch.birthTz === undefined) patch = { ...patch, birthTz: geo.tz };
    }
    if (patch.birthTz != null && !isKnownZone(patch.birthTz)) {
      const { birthTz: _drop, ...rest } = patch;
      patch = rest;
    }
    // The birth place changed: re-derive its time zone from the merged values.
    if (patch.birthTz === undefined
        && (patch.birthCity !== undefined || patch.birthLat !== undefined || patch.birthLng !== undefined)) {
      const cur = useProfileStore.getState().profiles.find((p) => p.id === id);
      patch = {
        ...patch,
        birthTz: birthTzFor({
          birthCity: patch.birthCity !== undefined ? patch.birthCity : cur?.birthCity ?? null,
          birthLat:  patch.birthLat  !== undefined ? patch.birthLat  : cur?.birthLat ?? null,
          birthLng:  patch.birthLng  !== undefined ? patch.birthLng  : cur?.birthLng ?? null,
        }),
      };
    }
    await updateProfile(id, patch);
    // Reports are cached by chart hash (which also covers the name), so they
    // would regenerate anyway; dropping the text now frees the space at once.
    await clearReportPayloads(id).catch(() => {});

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
