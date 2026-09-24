import { useMemo, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Country, State, City } from 'country-state-city';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { LocationPickerModal, type PickerItem } from '@/components/molecules/LocationPickerModal';
import { FONTS, RADIUS } from '@/constants/themes';
import { localDateIso } from '@/utils/format';

type Picker = 'country' | 'state' | 'city' | null;

export default function EditProfileScreen() {
  const { theme }                = useAccent();
  const { id }                   = useLocalSearchParams<{ id: string }>();
  const { profiles, editProfile } = useProfiles();
  const profile                  = profiles.find((p) => p.id === id);

  const initialDate = profile?.birthDate ? new Date(profile.birthDate + 'T12:00:00') : null;
  const initialTime = (() => {
    if (!profile?.birthTime) return null;
    const [h, m] = profile.birthTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  })();

  const [name,   setName]   = useState(profile?.name ?? '');
  const [rel,    setRel]    = useState(profile?.relationship ?? '');
  const [gender, setGender] = useState<string>(profile?.gender ?? '');
  const [date,   setDate]   = useState<Date | null>(initialDate);
  const [time,   setTime]   = useState<Date | null>(initialTime);
  const [loading, setLoading] = useState(false);

  // Location editing flow: we don't try to parse the saved string back into
  // country/state/city codes. Instead, the saved location is shown as-is and
  // remains unchanged unless the user opts in to "Change location", at which
  // point a fresh pick replaces it.
  const [editingLocation, setEditingLocation] = useState(false);
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [stateCode,   setStateCode]   = useState('');
  const [stateName,   setStateName]   = useState('');
  const [cityName,    setCityName]    = useState('');
  const [cityLat,     setCityLat]     = useState<number | null>(null);
  const [cityLng,     setCityLng]     = useState<number | null>(null);
  const [activePicker, setActivePicker] = useState<Picker>(null);

  const newLocation = [cityName, stateName, countryName].filter(Boolean).join(', ');
  const locationToSave = editingLocation && newLocation ? newLocation : (profile?.birthCity ?? null);

  const birthDateIso = date ? localDateIso(date) : '';
  const birthTimeStr = time
    ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : '';

  const valid = name.trim().length > 0 && birthDateIso.length > 0;

  // ── Picker items ───────────────────────────────────────────────────────────

  const countryItems = useMemo<PickerItem[]>(() =>
    Country.getAllCountries().map(c => ({
      label:    `${c.flag} ${c.name}`,
      value:    c.isoCode,
      sublabel: c.isoCode,
    })),
  []);

  const stateItems = useMemo<PickerItem[]>(() => {
    if (!countryCode) return [];
    return State.getStatesOfCountry(countryCode).map(s => ({
      label: s.name,
      value: s.isoCode,
    }));
  }, [countryCode]);

  const cityItems = useMemo<PickerItem[]>(() => {
    if (!countryCode) return [];
    const cities = stateCode
      ? City.getCitiesOfState(countryCode, stateCode)
      : City.getCitiesOfCountry(countryCode) ?? [];
    return cities.map(c => ({
      label: c.name,
      value: c.name,
      lat:   c.latitude  ? parseFloat(c.latitude)  : undefined,
      lng:   c.longitude ? parseFloat(c.longitude) : undefined,
    }));
  }, [countryCode, stateCode]);

  const hasStates = stateItems.length > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectCountry = (item: PickerItem) => {
    setCountryCode(item.value);
    setCountryName(Country.getCountryByCode(item.value)?.name ?? item.label.replace(/^\S+\s/, ''));
    setStateCode(''); setStateName('');
    setCityName(''); setCityLat(null); setCityLng(null);
    setActivePicker(null);
  };
  const handleSelectState = (item: PickerItem) => {
    setStateCode(item.value); setStateName(item.label);
    setCityName(''); setCityLat(null); setCityLng(null);
    setActivePicker(null);
  };
  const handleSelectCity = (item: PickerItem) => {
    setCityName(item.label);
    setCityLat(item.lat ?? null);
    setCityLng(item.lng ?? null);
    setActivePicker(null);
  };

  const handleSave = async () => {
    if (!valid || !profile) return;
    if (date && date.getTime() > Date.now() + 60_000) {
      Alert.alert(
        'That date is in the future',
        "Pick a real past birth date — a chart needs a moment that's already happened.",
      );
      return;
    }
    setLoading(true);
    try {
      // Only patch location-related fields when the user actually picked a
      // new one — otherwise leave them alone so we don't blow away existing
      // lat/lng on no-op edits.
      const patch: Parameters<typeof editProfile>[1] = {
        name:         name.trim(),
        relationship: rel.trim() || null,
        gender:       gender || null,
        birthDate:    birthDateIso,
        birthTime:    birthTimeStr || null,
      };
      if (editingLocation && newLocation) {
        patch.birthCity = locationToSave;
        patch.birthLat  = cityLat;
        patch.birthLng  = cityLng;
      }
      await editProfile(profile.id, patch);
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (!profile) {
    router.back();
    return null;
  }

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>Edit chart</EyebrowLabel>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.display, { color: theme.ink }]}>
          Update <Text style={styles.italic}>{profile.name.split(' ')[0] || 'their'}&apos;s</Text> details
        </Text>

        <Input
          label="Name"
          placeholder="e.g. Mom, Sam, Priya"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          containerStyle={styles.field}
        />
        <Input
          label="Relationship · optional"
          placeholder="Partner, friend, parent…"
          value={rel}
          onChangeText={setRel}
          containerStyle={styles.field}
        />

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>Gender · optional</EyebrowLabel>
        <View style={styles.genderRow}>
          {([
            { key: 'woman',       label: 'Woman' },
            { key: 'man',         label: 'Man' },
            { key: 'non_binary',  label: 'Non-binary' },
            { key: 'unspecified', label: 'Skip' },
          ] as const).map((opt) => {
            const isSelected = gender === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                onPress={() => setGender(isSelected ? '' : opt.key)}
                activeOpacity={0.85}
                style={[
                  styles.genderChip,
                  {
                    backgroundColor: isSelected ? theme.accent : 'transparent',
                    borderColor:     isSelected ? theme.accent : theme.hairline,
                  },
                ]}
              >
                <Text style={[styles.genderChipText, { color: isSelected ? theme.accentFg : theme.ink2 }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>Date of birth</EyebrowLabel>
        <DateTimePicker
          value={date ?? new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={(_, d) => d && setDate(d)}
          style={styles.picker}
          themeVariant={theme.bg === '#faf9f6' ? 'light' : 'dark'}
        />

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>Time of birth · optional</EyebrowLabel>
        <DateTimePicker
          value={time ?? new Date(0, 0, 0, 12, 0)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minuteInterval={1}
          onChange={(_, t) => t && setTime(t)}
          style={styles.picker}
          themeVariant={theme.bg === '#faf9f6' ? 'light' : 'dark'}
        />

        {/* Location — show current + a "change" toggle */}
        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>Birth location</EyebrowLabel>
        {!editingLocation ? (
          <View>
            <View style={[styles.locationField, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.locationValue, { color: profile.birthCity ? theme.ink : theme.muted }]} numberOfLines={1}>
                {profile.birthCity ?? 'Unknown'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setEditingLocation(true)} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: theme.accent }]}>Change location</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <EyebrowLabel style={styles.subLabel}>Country</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('country')}
              activeOpacity={0.7}
            >
              <Text style={[styles.locationValue, { color: countryName ? theme.ink : theme.muted }]} numberOfLines={1}>
                {countryName || 'Select country…'}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>

            {countryCode && hasStates && (
              <>
                <EyebrowLabel style={styles.subLabel}>State / Province</EyebrowLabel>
                <TouchableOpacity
                  style={[styles.locationField, { backgroundColor: theme.surface2 }]}
                  onPress={() => setActivePicker('state')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.locationValue, { color: stateName ? theme.ink : theme.muted }]} numberOfLines={1}>
                    {stateName || 'Select state…'}
                  </Text>
                  <Icon name="chevron-down" size={16} color={theme.muted} />
                </TouchableOpacity>
              </>
            )}

            {countryCode && (!hasStates || stateCode) && (
              <>
                <EyebrowLabel style={styles.subLabel}>City</EyebrowLabel>
                <TouchableOpacity
                  style={[styles.locationField, { backgroundColor: theme.surface2 }]}
                  onPress={() => setActivePicker('city')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.locationValue, { color: cityName ? theme.ink : theme.muted }]} numberOfLines={1}>
                    {cityName || 'Select or type city…'}
                  </Text>
                  <Icon name="chevron-down" size={16} color={theme.muted} />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => { setEditingLocation(false); setCountryCode(''); setCountryName(''); setStateCode(''); setStateName(''); setCityName(''); }} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: theme.muted }]}>Cancel location change</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Save changes"
          variant="accent"
          fullWidth
          disabled={!valid}
          loading={loading}
          onPress={handleSave}
        />
      </View>

      <LocationPickerModal
        visible={activePicker === 'country'}
        title="Select Country"
        items={countryItems}
        selectedValue={countryCode}
        onSelect={handleSelectCountry}
        onClose={() => setActivePicker(null)}
      />
      <LocationPickerModal
        visible={activePicker === 'state'}
        title="Select State / Province"
        items={stateItems}
        selectedValue={stateCode}
        onSelect={handleSelectState}
        onClose={() => setActivePicker(null)}
      />
      <LocationPickerModal
        visible={activePicker === 'city'}
        title="Select City"
        items={cityItems}
        selectedValue={cityName}
        onSelect={handleSelectCity}
        onClose={() => setActivePicker(null)}
        allowManual
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  back:    { padding: 4 },
  scroll:  { flex: 1 },
  content: { padding: 32, paddingTop: 12, paddingBottom: 40 },
  display: { fontFamily: FONTS.serifRegular, fontSize: 32, lineHeight: 38, marginBottom: 22 },
  italic:  { fontFamily: FONTS.serifItalic },
  field:   { marginTop: 22 },
  subLabel:{ marginTop: 14, marginBottom: 8 },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  genderChipText: { fontFamily: FONTS.sansRegular, fontSize: 13 },
  picker: { alignSelf: 'stretch' },
  locationField: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: RADIUS.medium, gap: 8,
  },
  locationValue: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 15 },
  linkBtn:  { marginTop: 10, alignSelf: 'flex-start' },
  linkText: { fontFamily: FONTS.sansRegular, fontSize: 13 },
  footer:   { padding: 32, paddingTop: 12 },
});
