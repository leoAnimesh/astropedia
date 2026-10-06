import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Country, State, City } from 'country-state-city';
import { localCityName, localCountryName, localizePlace, localStateName } from '@/utils/place-names';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { LocationPickerModal, type PickerItem } from '@/components/molecules/LocationPickerModal';
import { DatePicker } from '@/components/molecules/DatePicker';
import { TimePicker } from '@/components/molecules/TimePicker';
import { PickerSheet } from '@/components/molecules/PickerSheet';
import { showDialog } from '@/components/overlays';
import { FONTS, RADIUS } from '@/constants/themes';
import { formatBirthDate, formatBirthTime, localDateIso } from '@/utils/format';
import { useAppLanguage } from '@/utils/i18n';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Picker = 'country' | 'state' | 'city' | null;

const DEFAULT_DATE = new Date(2000, 0, 1);

export default function EditProfileScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme }                = useAccent();
  const { t, i18n }              = useTranslation('profile');
  const lng = useAppLanguage();
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks
  const { id }                   = useLocalSearchParams<{ id: string }>();
  const { profiles, editProfile } = useProfiles();
  const profile                  = profiles.find((p) => p.id === id);

  const initialDate = profile?.birthDate ? new Date(profile.birthDate + 'T00:00:00') : null;
  const initialTime = profile?.birthTime || null;   // "HH:mm"

  const [name,   setName]   = useState(profile?.name ?? '');
  const [rel,    setRel]    = useState(profile?.relationship ?? '');
  const [gender, setGender] = useState<string>(profile?.gender ?? '');
  const [date,   setDate]   = useState<Date | null>(initialDate);
  const [time,   setTime]   = useState<string | null>(initialTime);
  const [loading, setLoading] = useState(false);

  // Date/time wheels open in a sheet; the draft is applied on Done.
  const [sheet,     setSheet]     = useState<'date' | 'time' | null>(null);
  const [draftDate, setDraftDate] = useState<Date>(DEFAULT_DATE);
  const [draftTime, setDraftTime] = useState('12:00');
  const [today] = useState(() => new Date());
  const openDate = () => { setDraftDate(date ?? DEFAULT_DATE); setSheet('date'); };
  const openTime = () => { setDraftTime(time ?? '12:00'); setSheet('time'); };

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
  const birthTimeStr = time ?? '';

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
      showDialog({ title: t('form.futureTitle'), message: t('form.futureBody') });
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

  const firstName = profile.name.split(' ')[0];

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>{t('edit.eyebrow')}</EyebrowLabel>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {firstName ? (
            <>
              {t('edit.titleBefore')}
              <Text style={styles.italic}>{t('edit.titleName', { name: firstName })}</Text>
              {t('edit.titleAfter')}
            </>
          ) : t('edit.titleNoName')}
        </Text>

        <Input
          label={t('form.nameLabel')}
          placeholder={t('form.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          containerStyle={styles.field}
        />
        {/* Relationship describes someone else; the onboarded (main) profile is "you". */}
        {!profile?.isYou && (
          <Input
            label={t('form.relLabel')}
            placeholder={t('form.relPlaceholder')}
            value={rel}
            onChangeText={setRel}
            containerStyle={styles.field}
          />
        )}

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>{t('form.genderLabel')}</EyebrowLabel>
        <View style={styles.genderRow}>
          {([
            { key: 'woman',       label: t('common:gender.woman') },
            { key: 'man',         label: t('common:gender.man') },
            { key: 'non_binary',  label: t('common:gender.non_binary') },
            { key: 'unspecified', label: t('common:skip') },
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

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>{t('form.dobLabel')}</EyebrowLabel>
        <TouchableOpacity
          style={[styles.locationField, { backgroundColor: theme.surface2 }]}
          onPress={openDate}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('form.dobLabel')}
        >
          <Text style={[styles.locationValue, { color: date ? theme.ink : theme.muted }]} numberOfLines={1}>
            {date ? formatBirthDate(birthDateIso) : t('form.dobPlaceholder')}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.muted} />
        </TouchableOpacity>

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>{t('form.tobLabel')}</EyebrowLabel>
        <TouchableOpacity
          style={[styles.locationField, { backgroundColor: theme.surface2 }]}
          onPress={openTime}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('form.tobLabel')}
        >
          <Text style={[styles.locationValue, { color: time ? theme.ink : theme.muted }]} numberOfLines={1}>
            {time ? formatBirthTime(time) : t('form.tobPlaceholder')}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* Location — show current + a "change" toggle */}
        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>{t('edit.locationLabel')}</EyebrowLabel>
        {!editingLocation ? (
          <View>
            <View style={[styles.locationField, { backgroundColor: theme.surface2 }]}>
              <Text style={[styles.locationValue, { color: profile.birthCity ? theme.ink : theme.muted }]} numberOfLines={1}>
                {profile.birthCity ? localizePlace(profile.birthCity, lng) : t('common:unknown')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setEditingLocation(true)} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: theme.accent }]}>{t('edit.changeLocation')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <EyebrowLabel style={styles.subLabel}>{t('common:location.country')}</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('country')}
              activeOpacity={0.7}
            >
              <Text style={[styles.locationValue, { color: countryName ? theme.ink : theme.muted }]} numberOfLines={1}>
                {countryName ? localCountryName(countryCode, countryName, lng) : t('common:location.selectCountry')}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>

            {countryCode && hasStates && (
              <>
                <EyebrowLabel style={styles.subLabel}>{t('common:location.state')}</EyebrowLabel>
                <TouchableOpacity
                  style={[styles.locationField, { backgroundColor: theme.surface2 }]}
                  onPress={() => setActivePicker('state')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.locationValue, { color: stateName ? theme.ink : theme.muted }]} numberOfLines={1}>
                    {stateName ? localStateName(countryCode, stateName, lng) : t('common:location.selectState')}
                  </Text>
                  <Icon name="chevron-down" size={16} color={theme.muted} />
                </TouchableOpacity>
              </>
            )}

            {countryCode && (!hasStates || stateCode) && (
              <>
                <EyebrowLabel style={styles.subLabel}>{t('common:location.city')}</EyebrowLabel>
                <TouchableOpacity
                  style={[styles.locationField, { backgroundColor: theme.surface2 }]}
                  onPress={() => setActivePicker('city')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.locationValue, { color: cityName ? theme.ink : theme.muted }]} numberOfLines={1}>
                    {cityName ? localCityName(countryCode, cityName, lng) : t('common:location.selectCity')}
                  </Text>
                  <Icon name="chevron-down" size={16} color={theme.muted} />
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity onPress={() => { setEditingLocation(false); setCountryCode(''); setCountryName(''); setStateCode(''); setStateName(''); setCityName(''); }} style={styles.linkBtn}>
              <Text style={[styles.linkText, { color: theme.muted }]}>{t('edit.cancelLocationChange')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t('edit.save')}
          variant="accent"
          fullWidth
          disabled={!valid}
          loading={loading}
          onPress={handleSave}
        />
      </View>

      <LocationPickerModal
        visible={activePicker === 'country'}
        title={t('common:location.pickCountryTitle')}
        items={countryItems}
        kind="country"
        selectedValue={countryCode}
        onSelect={handleSelectCountry}
        onClose={() => setActivePicker(null)}
      />
      <LocationPickerModal
        visible={activePicker === 'state'}
        title={t('common:location.pickStateTitle')}
        items={stateItems}
        kind="state"
        countryCode={countryCode}
        selectedValue={stateCode}
        onSelect={handleSelectState}
        onClose={() => setActivePicker(null)}
      />
      <LocationPickerModal
        visible={activePicker === 'city'}
        title={t('common:location.pickCityTitle')}
        items={cityItems}
        kind="city"
        countryCode={countryCode}
        selectedValue={cityName}
        onSelect={handleSelectCity}
        onClose={() => setActivePicker(null)}
        allowManual
      />
      <PickerSheet
        visible={sheet === 'date'}
        title={t('form.dobLabel')}
        onClose={() => setSheet(null)}
        onDone={() => setDate(draftDate)}
      >
        <DatePicker value={draftDate} maximumDate={today} onChange={setDraftDate} />
      </PickerSheet>
      <PickerSheet
        visible={sheet === 'time'}
        title={t('form.tobLabel')}
        onClose={() => setSheet(null)}
        onDone={() => setTime(draftTime)}
        secondaryLabel={t('form.clearTime')}
        onSecondary={() => setTime(null)}
      >
        <TimePicker value={draftTime} onChange={setDraftTime} />
      </PickerSheet>
    </ScreenLayout>
  );
}

const baseStyles = StyleSheet.create({
  header:  { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  back:    { padding: 4 },
  scroll:  { flex: 1 },
  content: { padding: 32, paddingTop: 12, paddingBottom: 40 },
  display: { fontFamily: FONTS.serifRegular, fontSize: 32, lineHeight: 38, marginBottom: 22 },
  displayIndic: { lineHeight: 46 },
  italic:  { fontFamily: FONTS.serifItalic },
  field:   { marginTop: 22 },
  subLabel:{ marginTop: 14, marginBottom: 8 },
  genderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: StyleSheet.hairlineWidth,
  },
  genderChipText: { fontFamily: FONTS.sansRegular, fontSize: 13 },
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
