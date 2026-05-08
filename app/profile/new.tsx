import { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
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
import { getSunSign } from '@/utils/astrology';

type Picker = 'country' | 'state' | 'city' | null;

export default function NewProfileScreen() {
  const { theme }          = useAccent();
  const { createProfile }  = useProfiles();

  const [name, setName]     = useState('');
  const [rel,  setRel]      = useState('');
  const [date, setDate]     = useState<Date | null>(null);
  const [time, setTime]     = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  // Location state
  const [countryCode, setCountryCode] = useState('');
  const [countryName, setCountryName] = useState('');
  const [stateCode,   setStateCode]   = useState('');
  const [stateName,   setStateName]   = useState('');
  const [cityName,    setCityName]     = useState('');
  const [cityLat,     setCityLat]      = useState<number | null>(null);
  const [cityLng,     setCityLng]      = useState<number | null>(null);
  const [activePicker, setActivePicker] = useState<Picker>(null);

  const birthDateIso = date ? date.toISOString().slice(0, 10) : '';
  const birthTimeStr = time
    ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : '';
  const sun          = birthDateIso ? getSunSign(birthDateIso) : null;
  const fullLocation = [cityName, stateName, countryName].filter(Boolean).join(', ');
  const valid        = name.trim().length > 0 && birthDateIso.length > 0;

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
    setStateCode('');
    setStateName('');
    setCityName('');
    setCityLat(null);
    setCityLng(null);
    setActivePicker(null);
  };

  const handleSelectState = (item: PickerItem) => {
    setStateCode(item.value);
    setStateName(item.label);
    setCityName('');
    setCityLat(null);
    setCityLng(null);
    setActivePicker(null);
  };

  const handleSelectCity = (item: PickerItem) => {
    setCityName(item.label);
    setCityLat(item.lat ?? null);
    setCityLng(item.lng ?? null);
    setActivePicker(null);
  };

  const handleSave = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await createProfile({
        name:         name.trim(),
        relationship: rel.trim() || null,
        birthDate:    birthDateIso,
        birthTime:    birthTimeStr || null,
        birthCity:    fullLocation || null,
        birthLat:     cityLat,
        birthLng:     cityLng,
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
        <EyebrowLabel>New chart</EyebrowLabel>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.display, { color: theme.ink }]}>
          A chart for{'\n'}
          <Text style={styles.italic}>someone you love.</Text>
        </Text>

        <Input
          label="Name"
          placeholder="e.g. Mom, Sam, Priya"
          value={name}
          onChangeText={setName}
          autoFocus
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

        <EyebrowLabel style={[styles.field, { marginBottom: 8 }]}>
          Time of birth · optional
        </EyebrowLabel>
        <DateTimePicker
          value={time ?? new Date(0, 0, 0, 12, 0)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, t) => t && setTime(t)}
          style={styles.picker}
          themeVariant={theme.bg === '#faf9f6' ? 'light' : 'dark'}
        />

        {/* Location section */}
        <EyebrowLabel style={[styles.field, { marginBottom: 14 }]}>
          Birth location · optional
        </EyebrowLabel>

        {/* Country */}
        <EyebrowLabel style={styles.subLabel}>Country</EyebrowLabel>
        <TouchableOpacity
          style={[styles.locationField, { backgroundColor: theme.surface2 }]}
          onPress={() => setActivePicker('country')}
          activeOpacity={0.7}
        >
          <Text
            style={[styles.locationValue, { color: countryName ? theme.ink : theme.muted }]}
            numberOfLines={1}
          >
            {countryName || 'Select country…'}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* State */}
        {countryCode && hasStates && (
          <>
            <EyebrowLabel style={styles.subLabel}>State / Province</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('state')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.locationValue, { color: stateName ? theme.ink : theme.muted }]}
                numberOfLines={1}
              >
                {stateName || 'Select state…'}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* City */}
        {countryCode && (!hasStates || stateCode) && (
          <>
            <EyebrowLabel style={styles.subLabel}>City</EyebrowLabel>
            <TouchableOpacity
              style={[styles.locationField, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('city')}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.locationValue, { color: cityName ? theme.ink : theme.muted }]}
                numberOfLines={1}
              >
                {cityName || 'Select or type city…'}
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
              <EyebrowLabel size={10}>{name || 'They'}'s sun</EyebrowLabel>
              <Text style={[styles.signName, { color: theme.ink }]}>
                <Text style={styles.italic}>{sun.name}</Text>
                {'  '}
                <Text style={[styles.signElement, { color: theme.muted }]}>{sun.element}</Text>
              </Text>
              {fullLocation ? (
                <Text style={[styles.signLocation, { color: theme.muted }]}>{fullLocation}</Text>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Save chart"
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
  display: { fontFamily: FONTS.serifRegular, fontSize: 36, lineHeight: 40, marginBottom: 28 },
  italic:  { fontFamily: FONTS.serifItalic },
  field:   { marginTop: 22 },
  picker:  { alignSelf: 'flex-start' },
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
