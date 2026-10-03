import { Platform } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { MaterialIcons } from '@expo/vector-icons';

export type IconName =
  | 'back'
  | 'plus'
  | 'send'
  | 'mic'
  | 'settings'
  | 'sparkle'
  | 'chevron'
  | 'chevron-down'
  | 'edit'
  | 'archive'
  | 'trash'
  | 'chat'
  | 'person'
  | 'close'
  | 'search'
  | 'check'
  | 'refresh'
  | 'lotus'
  | 'pin'
  | 'pin-filled'
  | 'bell'
  | 'bookmark'
  | 'bookmark-filled'
  | 'share'
  | 'calendar'
  | 'book'
  | 'people'
  | 'clock'
  | 'moon';

type IOSMap = Record<IconName, SymbolViewProps['name']>;
type AndroidMap = Record<IconName, string>;

const IOS_MAP: IOSMap = {
  back:         'chevron.left',
  plus:         'plus',
  send:         'arrow.up',
  mic:          'mic',
  settings:     'gearshape',
  sparkle:      'sparkles',
  chevron:      'chevron.right',
  'chevron-down': 'chevron.down',
  edit:         'pencil',
  archive:      'archivebox',
  trash:        'trash',
  chat:         'bubble.left',
  person:       'person',
  close:        'xmark',
  search:       'magnifyingglass',
  check:        'checkmark',
  refresh:      'arrow.clockwise',
  lotus:        'leaf',
  pin:          'pin',
  'pin-filled': 'pin.fill',
  bell:              'bell',
  bookmark:          'bookmark',
  'bookmark-filled': 'bookmark.fill',
  share:             'square.and.arrow.up',
  calendar:          'calendar',
  book:              'book',
  people:            'person.2',
  clock:             'clock',
  moon:              'moon',
};

const ANDROID_MAP: AndroidMap = {
  back:         'chevron-left',
  plus:         'add',
  send:         'arrow-upward',
  mic:          'mic',
  settings:     'settings',
  sparkle:      'auto-awesome',
  chevron:      'chevron-right',
  'chevron-down': 'expand-more',
  edit:         'edit',
  archive:      'archive',
  trash:        'delete',
  chat:         'chat-bubble-outline',
  person:       'person',
  close:        'close',
  search:       'search',
  check:        'check',
  refresh:      'refresh',
  lotus:        'spa',
  pin:          'push-pin',
  'pin-filled': 'push-pin',
  bell:              'notifications-none',
  bookmark:          'bookmark-border',
  'bookmark-filled': 'bookmark',
  share:             'ios-share',
  calendar:          'calendar-today',
  book:              'menu-book',
  people:            'group',
  clock:             'schedule',
  moon:              'dark-mode',
};

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

// SF Symbols are off for now: mounting expo-symbols' SymbolView corrupts the
// Hermes heap on React Native 0.86.2+'s prebuilt iOS core and crashes the app
// at launch (react-native#57916). Material Icons are used on every platform
// until React Native ships a fix or we build the core from source.
const USE_SF_SYMBOLS = false;

export function Icon({ name, size = 20, color = 'currentColor' }: Props) {
  if (USE_SF_SYMBOLS && Platform.OS === 'ios') {
    return (
      <SymbolView
        name={IOS_MAP[name]}
        size={size}
        tintColor={color}
        resizeMode="scaleAspectFit"
      />
    );
  }
  return (
    <MaterialIcons
      name={ANDROID_MAP[name] as any}
      size={size}
      color={color}
    />
  );
}
