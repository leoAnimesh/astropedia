import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import {
  AppTextInput,
  KeyboardHost,
  KeyboardSpacer,
  KeyboardTouchZone,
  useKeyboardApi,
} from '@/components/keyboard';
import { FONTS, RADIUS } from '@/constants/themes';
import { useAppLanguage } from '@/utils/i18n';
import { localCityName, localCountryName, localStateName } from '@/utils/place-names';
import { filterBySearch, placeCities, placeCountries, placeStates, searchKeys, type SearchKeys } from '@/utils/places';

export type PickerItem = {
  label: string;
  value: string;
  sublabel?: string;
  lat?: number;
  lng?: number;
  /** IANA zone of a city (from the place data). */
  tz?: string;
  /** Other spellings, matched by search but not shown (Bangalore for Bengaluru). */
  aka?: string[];
};

// ─── Items from the bundled place data (utils/places.ts) ─────────────────────

/** Countries: label "<flag> <English name>", value = ISO code. */
export function countryPickerItems(): PickerItem[] {
  return placeCountries().map((c) => ({ label: `${c.flag} ${c.name}`, value: c.code, sublabel: c.code }));
}

/** States of a country: label and value = English name. [] when it has none. */
export function statePickerItems(countryCode: string): PickerItem[] {
  if (!countryCode) return [];
  return placeStates(countryCode).map((name) => ({ label: name, value: name }));
}

/**
 * Cities of a state (or of the whole country when it has no states). A name
 * that repeats within the state shows its district underneath.
 */
export function cityPickerItems(countryCode: string, state: string | null): PickerItem[] {
  if (!countryCode) return [];
  return placeCities(countryCode, state || null).map((c) => ({
    label: c.name,
    value: c.district ? `${c.name} (${c.district})` : c.name,
    sublabel: c.district,
    lat: c.lat,
    lng: c.lng,
    tz: c.tz,
    aka: c.aka.length ? c.aka : undefined,
  }));
}

type Props = {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedValue?: string;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  allowManual?: boolean; // show "Use '{query}'" when no match
  /** Which list this is — enables Hindi/Bengali display names (display only). */
  kind?: 'country' | 'state' | 'city';
  /** ISO code of the chosen country (needed for state / city names). */
  countryCode?: string;
};

type Row = { item: PickerItem; main: string; english?: string; keys: SearchKeys };

export function LocationPickerModal({
  visible, title, items, selectedValue, onSelect, onClose, allowManual, kind, countryCode,
}: Props) {
  const { theme, isDark } = useAccent();
  const { t }      = useTranslation('common');
  const [query, setQuery] = useState('');
  const keyboard   = useKeyboardApi();

  const lng = useAppLanguage();

  // Display rows. item.label / item.value (what callers store) are never altered;
  // only the shown label changes in Hindi/Bengali, with English kept underneath.
  const rows = useMemo<Row[]>(() => {
    const localized = lng === 'hi' || lng === 'bn';
    const built = items.map<Row>((item) => {
      if (!localized || !kind) return { item, main: item.label, keys: searchKeys(item.label, item.aka) };
      let flag = '';
      let english = item.label;
      let main = item.label;
      if (kind === 'country') {
        const m = item.label.match(/^(\S+)\s(.*)$/);
        flag = m ? `${m[1]} ` : '';
        english = m ? m[2] : item.label;
        main = flag + localCountryName(item.value, english, lng);
      } else if (kind === 'state') {
        main = localStateName(countryCode ?? '', english, lng);
      } else {
        main = localCityName(countryCode ?? '', english, lng);
      }
      const shown = main.slice(flag.length);
      return {
        item,
        main,
        english: shown !== english ? english : undefined,
        keys: searchKeys(shown, [english, ...(item.aka ?? [])]),
      };
    });
    if (localized && kind) {
      built.sort((a, b) => a.main.localeCompare(b.main, lng));
    }
    return built;
  }, [items, kind, countryCode, lng]);

  // Plain matches first, then other spellings of the same sounds (utils/places.ts).
  const filtered = useMemo(() => filterBySearch(rows, query, (r) => r.keys), [rows, query]);

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (item: PickerItem) => {
    setQuery('');
    onSelect(item);
  };

  const showManual = allowManual && query.trim().length > 0 && filtered.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      // Android: draw edge-to-edge like the rest of the app; we pad by the insets ourselves.
      statusBarTranslucent
      navigationBarTranslucent
      // Android back: close the keyboard first, then the picker.
      onRequestClose={() => { if (!keyboard?.dismiss()) handleClose(); }}
    >
      {/* A Modal is its own window, so it gets its own insets provider. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ModalFrame backgroundColor={theme.bg}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <Icon name="close" size={20} color={theme.muted} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <KeyboardTouchZone style={[styles.searchWrap, { backgroundColor: theme.surface2 }]}>
          <Icon name="search" size={16} color={theme.muted} />
          <AppTextInput
            style={[styles.searchInput, { color: theme.ink }]}
            placeholder={t('search')}
            placeholderTextColor={theme.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="words"
            returnKeyType="search"
            submitBehavior="blurAndSubmit"
            accessibilityLabel={t('search')}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={t('keyboard:a11y.clear')}
            >
              <Icon name="close" size={16} color={theme.muted} />
            </TouchableOpacity>
          )}
        </KeyboardTouchZone>

        {/* Manual entry fallback */}
        {showManual && (
          <TouchableOpacity
            style={[styles.manualRow, { borderBottomColor: theme.hairline }]}
            onPress={() => handleSelect({ label: query.trim(), value: query.trim() })}
          >
            <Text style={[styles.manualText, { color: theme.accent }]}>
              {t('location.useQuery', { query: query.trim() })}
            </Text>
            <Text style={[styles.manualSub, { color: theme.muted }]}>
              {t('location.geocodedNote')}
            </Text>
          </TouchableOpacity>
        )}

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(r, i) => `${r.item.value}#${i}`}
          keyboardShouldPersistTaps="always"
          renderItem={({ item: row }) => {
            const item = row.item;
            return (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: theme.hairline },
                item.value === selectedValue && { backgroundColor: theme.surface2 },
              ]}
              onPress={() => handleSelect(item)}
            >
              <View style={styles.rowLabelWrap}>
                <Text style={[styles.rowLabel, { color: theme.ink }]} numberOfLines={1}>
                  {row.main}
                </Text>
                {row.english && (
                  <Text style={[styles.rowEnglish, { color: theme.muted }]} numberOfLines={1}>
                    {row.english}
                  </Text>
                )}
              </View>
              {item.sublabel && (
                <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>
                  {item.sublabel}
                </Text>
              )}
              {item.value === selectedValue && (
                <Icon name="check" size={16} color={theme.accent} />
              )}
            </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            !showManual ? (
              <Text style={[styles.empty, { color: theme.muted }]}>{t('noResults')}</Text>
            ) : null
          }
        />
      </ModalFrame>
      </SafeAreaProvider>
    </Modal>
  );
}

/**
 * Root of the picker window. On Android the window is full-screen edge-to-edge,
 * so pad the top by the status-bar inset; on iOS the pageSheet already starts
 * below the status bar, so no top padding there.
 */
function ModalFrame({ backgroundColor, children }: { backgroundColor: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'android' ? insets.top : 0;
  return (
    <View style={[styles.root, { backgroundColor, paddingTop: top, paddingBottom: insets.bottom + 8 }]}>
      {children}
      {/* The picker is its own window: reserve room for, and draw, the app keyboard here. */}
      <KeyboardSpacer offset={insets.bottom + 8} system={false} />
      <KeyboardHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
    paddingHorizontal: 20,
    paddingVertical:  16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontFamily: FONTS.sansMedium,
    fontSize:   16,
  },
  searchWrap: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    margin:           16,
    paddingHorizontal: 12,
    paddingVertical:  10,
    borderRadius:     RADIUS.medium,
  },
  searchInput: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
    padding:    0,
  },
  manualRow: {
    paddingHorizontal: 20,
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  manualText: { fontFamily: FONTS.sansMedium, fontSize: 14 },
  manualSub:  { fontFamily: FONTS.sansRegular, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 20,
    paddingVertical:  14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap:              8,
  },
  rowLabelWrap: { flex: 1 },
  rowLabel: { fontFamily: FONTS.sansRegular, fontSize: 15 },
  rowEnglish: { fontFamily: FONTS.sansRegular, fontSize: 12, marginTop: 2 },
  rowSub:   { fontFamily: FONTS.sansRegular, fontSize: 12 },
  empty: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    14,
    textAlign:   'center',
    marginTop:   40,
  },
});
