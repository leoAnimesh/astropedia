import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/use-accent';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';

export type PickerItem = {
  label: string;
  value: string;
  sublabel?: string;
  lat?: number;
  lng?: number;
};

type Props = {
  visible: boolean;
  title: string;
  items: PickerItem[];
  selectedValue?: string;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  allowManual?: boolean; // show "Use '{query}'" when no match
};

export function LocationPickerModal({
  visible, title, items, selectedValue, onSelect, onClose, allowManual,
}: Props) {
  const { theme }  = useAccent();
  const insets     = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.label.toLowerCase().includes(q));
  }, [items, query]);

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
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { backgroundColor: theme.bg, paddingBottom: insets.bottom + 8 }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
          <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={12}>
            <Icon name="close" size={20} color={theme.muted} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchWrap, { backgroundColor: theme.surface2 }]}>
          <Icon name="search" size={16} color={theme.muted} />
          <TextInput
            style={[styles.searchInput, { color: theme.ink }]}
            placeholder="Search…"
            placeholderTextColor={theme.muted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {/* Manual entry fallback */}
        {showManual && (
          <TouchableOpacity
            style={[styles.manualRow, { borderBottomColor: theme.hairline }]}
            onPress={() => handleSelect({ label: query.trim(), value: query.trim() })}
          >
            <Text style={[styles.manualText, { color: theme.accent }]}>
              Use &quot;{query.trim()}&quot;
            </Text>
            <Text style={[styles.manualSub, { color: theme.muted }]}>
              Will be geocoded automatically
            </Text>
          </TouchableOpacity>
        )}

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.value}
          keyboardShouldPersistTaps="always"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.row,
                { borderBottomColor: theme.hairline },
                item.value === selectedValue && { backgroundColor: theme.surface2 },
              ]}
              onPress={() => handleSelect(item)}
            >
              <Text style={[styles.rowLabel, { color: theme.ink }]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.sublabel && (
                <Text style={[styles.rowSub, { color: theme.muted }]} numberOfLines={1}>
                  {item.sublabel}
                </Text>
              )}
              {item.value === selectedValue && (
                <Icon name="check" size={16} color={theme.accent} />
              )}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !showManual ? (
              <Text style={[styles.empty, { color: theme.muted }]}>No results</Text>
            ) : null
          }
        />
      </View>
    </Modal>
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
  rowLabel: { flex: 1, fontFamily: FONTS.sansRegular, fontSize: 15 },
  rowSub:   { fontFamily: FONTS.sansRegular, fontSize: 12 },
  empty: {
    fontFamily:  FONTS.sansRegular,
    fontSize:    14,
    textAlign:   'center',
    marginTop:   40,
  },
});
