import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Country, State, City } from 'country-state-city';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { Button } from '@/components/atoms/Button';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { LocationPickerModal, type PickerItem } from '@/components/molecules/LocationPickerModal';
import { Storage } from '@/utils/storage';
import { FONTS, RADIUS } from '@/constants/themes';
import { getSunSign } from '@/utils/astrology';
import OnboardingStore from './_store';

type Picker = 'country' | 'state' | 'city' | null;

export default function BirthPlaceScreen() {
  const { theme } = useAccent();
  const { createProfile } = useProfiles();

  const [countryCode, setCountryCode] = useState(OnboardingStore.countryCode);
  const [countryName, setCountryName] = useState(OnboardingStore.countryName);
  const [stateCode,   setStateCode]   = useState(OnboardingStore.stateCode);
  const [stateName,   setStateName]   = useState(OnboardingStore.stateName);
  const [cityName,    setCityName]     = useState(OnboardingStore.cityName);
  const [cityLat,     setCityLat]      = useState<number | null>(OnboardingStore.birthLat);
  const [cityLng,     setCityLng]      = useState<number | null>(OnboardingStore.birthLng);
  const [activePicker, setActivePicker] = useState<Picker>(null);
  const [loading, setLoading] = useState(false);

  // ── Picker item arrays ────────────────────────────────────────────────────

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
      lat:   c.latitude ? parseFloat(c.latitude) : undefined,
      lng:   c.longitude ? parseFloat(c.longitude) : undefined,
    }));
  }, [countryCode, stateCode]);

  const hasStates = stateItems.length > 0;

  // ── Derived values ────────────────────────────────────────────────────────

  const sun = OnboardingStore.birthDate ? getSunSign(OnboardingStore.birthDate) : null;

  const fullLocation = [cityName, stateName, countryName].filter(Boolean).join(', ');

  const canContinue = !!(countryCode && cityName);

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

  const handleFinish = async () => {
    if (!canContinue) return;
    // Persist to store
    OnboardingStore.countryCode = countryCode;
    OnboardingStore.countryName = countryName;
    OnboardingStore.stateCode   = stateCode;
    OnboardingStore.stateName   = stateName;
    OnboardingStore.cityName    = cityName;
    OnboardingStore.birthLat    = cityLat;
    OnboardingStore.birthLng    = cityLng;

    setLoading(true);
    try {
      await createProfile({
        name:      OnboardingStore.name || 'You',
        birthDate: OnboardingStore.birthDate,
        birthTime: OnboardingStore.birthTime || null,
        birthCity: fullLocation,
        birthLat:  cityLat,
        birthLng:  cityLng,
        isYou:     true,
      });
      Storage.setOnboardingDone(true);
      router.replace('/(app)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Icon name="back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text style={[styles.step, { color: theme.muted }]}>04 / 04 — Place</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.display, { color: theme.ink }]}>
          Where did you{'\n'}
          <Text style={styles.italic}>first breathe?</Text>
        </Text>

        <Text style={[styles.hint, { color: theme.ink2 }]}>
          Your birth location anchors your chart to the sky at exactly that moment and place on Earth.
        </Text>

        {/* Country */}
        <EyebrowLabel style={styles.fieldLabel}>Country</EyebrowLabel>
        <TouchableOpacity
          style={[styles.field, { backgroundColor: theme.surface2 }]}
          onPress={() => setActivePicker('country')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.fieldValue,
              { color: countryName ? theme.ink : theme.muted },
            ]}
            numberOfLines={1}
          >
            {countryName || 'Select country…'}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.muted} />
        </TouchableOpacity>

        {/* State / Province */}
        {countryCode && (
          <>
            <EyebrowLabel style={styles.fieldLabel}>
              {hasStates ? 'State / Province' : 'State / Province · none for this country'}
            </EyebrowLabel>
            {hasStates ? (
              <TouchableOpacity
                style={[styles.field, { backgroundColor: theme.surface2 }]}
                onPress={() => setActivePicker('state')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.fieldValue,
                    { color: stateName ? theme.ink : theme.muted },
                  ]}
                  numberOfLines={1}
                >
                  {stateName || 'Select state…'}
                </Text>
                <Icon name="chevron-down" size={16} color={theme.muted} />
              </TouchableOpacity>
            ) : (
              <View style={[styles.field, { backgroundColor: theme.surface2, opacity: 0.5 }]}>
                <Text style={[styles.fieldValue, { color: theme.muted }]}>N/A</Text>
              </View>
            )}
          </>
        )}

        {/* City */}
        {countryCode && (!hasStates || stateCode) && (
          <>
            <EyebrowLabel style={styles.fieldLabel}>City</EyebrowLabel>
            <TouchableOpacity
              style={[styles.field, { backgroundColor: theme.surface2 }]}
              onPress={() => setActivePicker('city')}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.fieldValue,
                  { color: cityName ? theme.ink : theme.muted },
                ]}
                numberOfLines={1}
              >
                {cityName || 'Select or type city…'}
              </Text>
              <Icon name="chevron-down" size={16} color={theme.muted} />
            </TouchableOpacity>
          </>
        )}

        {/* Preview card */}
        {sun && fullLocation && (
          <View style={[styles.summaryCard, { backgroundColor: theme.surface2 }]}>
            <EyebrowLabel size={10} style={styles.summaryEyebrow}>Your chart preview</EyebrowLabel>
            <View style={styles.summaryRow}>
              <Text style={[styles.summaryGlyph, { color: theme.accent }]}>{sun.glyph}</Text>
              <View style={styles.summaryText}>
                <Text style={[styles.summaryName, { color: theme.ink }]}>
                  <Text style={styles.italic}>{OnboardingStore.name || 'You'}</Text>
                </Text>
                <Text style={[styles.summaryMeta, { color: theme.muted }]}>
                  {sun.name} · {fullLocation}
                </Text>
                {cityLat !== null && (
                  <Text style={[styles.summaryCoords, { color: theme.muted }]}>
                    {cityLat.toFixed(4)}°, {cityLng?.toFixed(4)}°
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        <Text style={[styles.privacy, { color: theme.muted }]}>
          Your chart stays on your device. Saga reads it gently — like a thoughtful friend who happens to know astrology.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Open my chart"
          variant="accent"
          fullWidth
          disabled={!canContinue}
          loading={loading}
          onPress={handleFinish}
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
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingTop:        20,
    paddingBottom:     8,
  },
  backBtn: { padding: 4 },
  step: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  scroll:  { flex: 1 },
  content: { padding: 32, paddingTop: 20, paddingBottom: 40 },
  display: {
    fontFamily:   FONTS.serifRegular,
    fontSize:     40,
    lineHeight:   44,
    marginBottom: 16,
  },
  italic: { fontFamily: FONTS.serifItalic },
  hint: {
    fontFamily:   FONTS.sansRegular,
    fontSize:     14.5,
    lineHeight:   22,
    marginBottom: 28,
  },
  fieldLabel: { marginBottom: 8, marginTop: 18 },
  field: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 16,
    paddingVertical:  14,
    borderRadius:     RADIUS.medium,
    gap:              8,
  },
  fieldValue: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
  },
  summaryCard: {
    borderRadius:  RADIUS.card,
    padding:       20,
    marginTop:     24,
    marginBottom:  20,
  },
  summaryEyebrow: { marginBottom: 12 },
  summaryRow:     { flexDirection: 'row', alignItems: 'center', gap: 14 },
  summaryGlyph:   { fontSize: 28 },
  summaryText:    { flex: 1 },
  summaryName: {
    fontFamily: FONTS.serifRegular,
    fontSize:   22,
    lineHeight: 26,
  },
  summaryMeta: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    marginTop:  2,
  },
  summaryCoords: {
    fontFamily: FONTS.monoRegular,
    fontSize:   10,
    marginTop:  4,
    letterSpacing: 0.3,
  },
  privacy: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    lineHeight: 19,
  },
  footer: { padding: 32, paddingTop: 12 },
});
