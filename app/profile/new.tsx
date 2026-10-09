'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { localCityName, localCountryName, localizePlace, localStateName } from '@/utils/place-names';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Icon } from '@/components/atoms/Icon';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import {
  LocationPickerModal, cityPickerItems, countryPickerItems, statePickerItems, type PickerItem,
} from '@/components/molecules/LocationPickerModal';
import { placeCountryName } from '@/utils/places';
import { DatePicker } from '@/components/molecules/DatePicker';
import { TimePicker } from '@/components/molecules/TimePicker';
import { PickerSheet } from '@/components/molecules/PickerSheet';
import { showDialog } from '@/components/overlays';
import { FONTS, RADIUS } from '@/constants/themes';
import { getSunSign } from '@/utils/astrology';
import { formatBirthDate, formatBirthTime, localDateIso } from '@/utils/format';
import { tSign, useAppLanguage } from '@/utils/i18n';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Picker = 'country' | 'state' | 'city' | null;

const DEFAULT_DATE = new Date(2000, 0, 1);

export default function NewProfileScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme }                    = useAccent();
  const { t, i18n } = useTranslation('profile');
  const lng = useAppLanguage();
  const indic = i18n.language !== 'en';   // taller line height for Devanagari/Bengali marks
  const { createProfile, profiles }  = useProfiles();
  // The primary profile is whichever was created first — the one onboarded
  // through the app's setup flow. `isYou` is the canonical flag, but profile
  // order is the reliable fallback in case the flag was never set.
  const primaryProfile = profiles.find((p) => p.isYou) ?? profiles[0];
  const primaryName    = (primaryProfile?.name ?? '').split(' ')[0];

  const [name,   setName]   = useState('');
  const [rel,    setRel]    = useState('');
  const [gender, setGender] = useState<string>('');
  const [date,   setDate]   = useState<Date | null>(null);
  const [time,   setTime]   = useState<string | null>(null);   // "HH:mm"
  const [loading, setLoading] = useState(false);

  // Date/time wheels open in a sheet; the draft is applied on Done.
  const [sheet,     setSheet]     = useState<'date' | 'time' | null>(null);
  const [draftDate, setDraftDate] = useState<Date>(DEFAULT_DATE);
  const [draftTime, setDraftTime] = useState('12:00');
  const [today] = useState(() => new Date());
  const openDate = () => { setDraftDate(date ?? DEFAULT_DATE); setSheet('date'); };
  const openTime = () => { setDraftTime(time ?? '12:00'); setSheet('time'); };

  // Location state
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [stateCode,   setStateCode]   = useState('');
  const [stateName,   setStateName]   = useState('');
  const [cityName,    setCityName]     = useState('');
  const [cityLat,     setCityLat]      = useState<number | null>(null);
  const [cityLng,     setCityLng]      = useState<number | null>(null);
  const [cityTz,      setCityTz]       = useState<string | null>(null);
  const [activePicker, setActivePicker] = useState<Picker>(null);

  const birthDateIso = date ? localDateIso(date) : '';
  const birthTimeStr = time ?? '';
  const sun          = birthDateIso ? getSunSign(birthDateIso) : null;
  const fullLocation = [cityName, stateName, countryName].filter(Boolean).join(', ');
  const valid        = name.trim().length > 0 && birthDateIso.length > 0;

  // ── Picker items ───────────────────────────────────────────────────────────

  const countryItems = useMemo<PickerItem[]>(() => countryPickerItems(), []);

  const stateItems = useMemo<PickerItem[]>(() => statePickerItems(countryCode), [countryCode]);

  // States are keyed by their English name (stateCode holds it too).
  const cityItems = useMemo<PickerItem[]>(() => cityPickerItems(countryCode, stateCode || null), [countryCode, stateCode]);

  const hasStates = stateItems.length > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSelectCountry = (item: PickerItem) => {
    setCountryCode(item.value);
    setCountryName(placeCountryName(item.value) ?? item.label.replace(/^\S+\s/, ''));
    setStateCode('');
    setStateName('');
    setCityName('');
    setCityLat(null);
    setCityLng(null);
    setCityTz(null);
    setActivePicker(null);
  };

  const handleSelectState = (item: PickerItem) => {
    setStateCode(item.value);
    setStateName(item.label);
    setCityName('');
    setCityLat(null);
    setCityLng(null);
    setCityTz(null);
    setActivePicker(null);
  };

  const handleSelectCity = (item: PickerItem) => {
    setCityName(item.label);
    setCityLat(item.lat ?? null);
    setCityLng(item.lng ?? null);
    setCityTz(item.tz ?? null);
    setActivePicker(null);
  };

  const handleSave = async () => {
    if (!valid) return;
    if (date && date.getTime() > Date.now() + 60_000) {
      showDialog({ title: t('form.futureTitle'), message: t('form.futureBody') });
      return;
    }
    setLoading(true);
    try {
      await createProfile({
        name:         name.trim(),
        relationship: rel.trim() || null,
        gender:       gender || null,
        birthDate:    birthDateIso,
        birthTime:    birthTimeStr || null,
        birthCity:    fullLocation || null,
        birthLat:     cityLat,
        birthLng:     cityLng,
        birthTz:      cityTz,
        isYou:        false,
      });
      router.back();
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <EyebrowLabel>{t('new.eyebrow')}</EyebrowLabel>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.display, { color: theme.ink }, indic && styles.displayIndic]}>
          {t('new.titleA')}{'\n'}
          <Text style={styles.italic}>{t('new.titleB')}</Text>
        </Text>

        <Input
          label={t('form.nameLabel')}
          placeholder={t('form.namePlaceholder')}
          value={name}
          onChangeText={setName}
          autoFocus
          autoCapitalize="words"
          containerStyle={styles.field}
        />
        <Input
          label={primaryName ? t('form.relLabelFor', { name: primaryName }) : t('form.relLabel')}
          placeholder={primaryName ? t('form.relPlaceholderFor', { name: primaryName }) : t('form.relPlaceholder')}
          value={rel}
          onChangeText={setRel}
          containerStyle={styles.field}
        />

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
                <Text style={[
                  styles.genderChipText,
                  { color: isSelected ? theme.accentFg : theme.ink2 },
                ]}>{opt.label}</Text>
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

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>
          {t('form.tobLabel')}
        </EyebrowLabel>
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

        {/* Location section */}
        <EyebrowLabel style={[styles.field, { marginBottom: 14 }]}>
          {t('new.locationLabel')}
        </EyebrowLabel>

        {/* Country */}
        <EyebrowLabel style={styles.subLabel}>{t('common:location.country')}</EyebrowLabel>
        <TouchableOpacity
          style={[styles.locationField, { backgroundColor: theme.surface2 }]}
          onPress={() => setActivePicker('country')}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.locationValue, { color: countryName ? theme.ink : theme.muted }]}
            numberOfLines={1}
          >
            {countryName ? localCountryName(countryCode, countryName, lng) : t('common:location.selectCountry')}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* State */}
        {countryCode && hasStates && (
          <>
            <EyebrowLabel style={styles.subLabel}>{t('common:location.state')}</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('state')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.locationValue, { color: stateName ? theme.ink : theme.muted }]}
                numberOfLines={1}
              >
                {stateName ? localStateName(countryCode, stateName, lng) : t('common:location.selectState')}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* City */}
        {countryCode && (!hasStates || stateCode) && (
          <>
            <EyebrowLabel style={styles.subLabel}>{t('common:location.city')}</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('city')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.locationValue, { color: cityName ? theme.ink : theme.muted }]}
                numberOfLines={1}
              >
                {cityName ? localCityName(countryCode, cityName, lng) : t('common:location.selectCity')}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Sun sign preview */}
        {sun && (
          <View style={[styles.signCard, { backgroundColor: theme.surface2 }]}>
            <Text style={[styles.signGlyph, { color: theme.accent }]}>{sun.glyph}</Text>
            <View>
              <EyebrowLabel size={10}>{name.trim() ? t('new.sunOf', { name: name.trim() }) : t('new.sunOfThem')}</EyebrowLabel>
              <Text style={[styles.signName, { color: theme.ink }]}>
                <Text style={styles.italic}>{tSign(sun.name)}</Text>
                {'  '}
                <Text style={[styles.signElement, { color: theme.muted }]}>{t(`common:element.${sun.element}`)}</Text>
              </Text>
              {fullLocation ? (
                <Text style={[styles.signLocation, { color: theme.muted }]}>{localizePlace(fullLocation, lng)}</Text>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={t('new.save')}
          variant="primary"
          fullWidth
          disabled={!valid}
          loading={loading}
          onPress={handleSave}
        />
      </View>

      {/* Pickers */}
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
  display: { fontFamily: FONTS.serifRegular, fontSize: 36, lineHeight: 40, marginBottom: 28 },
  displayIndic: { lineHeight: 50 },
  italic:  { fontFamily: FONTS.serifItalic },
  field:   { marginTop: 22 },
  genderRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  genderChip: {
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      999,
    borderWidth:       StyleSheet.hairlineWidth,
  },
  genderChipText: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
  },
  subLabel: { marginTop: 12, marginBottom: 8 },
  locationField: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 14,
    paddingVertical:  13,
    borderRadius:     RADIUS.medium,
    gap:              8,
  },
  locationValue: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
  },
  signCard: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
    marginTop:     28,
    padding:       18,
    borderRadius:  RADIUS.card,
  },
  signGlyph:    { fontSize: 26 },
  signName:     { fontFamily: FONTS.serifRegular, fontSize: 22, lineHeight: 26, marginTop: 4 },
  signElement:  { fontFamily: FONTS.sansRegular, fontSize: 13 },
  signLocation: { fontFamily: FONTS.sansRegular, fontSize: 12, marginTop: 4 },
  footer: { padding: 32, paddingTop: 12 },
});
