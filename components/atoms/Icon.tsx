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
  | 'download'
  | 'calendar'
  | 'book'
  | 'people'
  | 'clock'
  | 'moon'
  | 'home'
  | 'heart'
  | 'briefcase'
  | 'sprout'
  | 'house'
  | 'study'
  | 'history'
  | 'more'
  | 'restart'
  | 'phone'
  | 'kundli'
  | 'sun'
  | 'match'
  | 'diya'
  | 'saturn'
  | 'report'
  | 'money'
  | 'timeline'
  | 'lock'
  | 'pdf'
  | 'flag';

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
  download:          'square.and.arrow.down',
  calendar:          'calendar',
  book:              'book',
  people:            'person.2',
  clock:             'clock',
  moon:              'moon',
  home:              'house',
  heart:             'heart',
  briefcase:         'briefcase',
  sprout:            'leaf',
  house:             'house.lodge',
  study:             'book.pages',
  history:           'clock.arrow.circlepath',
  more:              'ellipsis',
  restart:           'arrow.counterclockwise',
  phone:             'phone',
  kundli:            'square.grid.3x3',
  sun:               'sun.max',
  match:             'circle.circle',
  diya:              'flame',
  saturn:            'circle.dashed',
  report:            'doc.text',
  money:             'indianrupeesign.circle',
  timeline:          'chart.bar.xaxis',
  lock:              'lock',
  pdf:               'doc.richtext',
  flag:              'flag',
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
  download:          'file-download',
  calendar:          'calendar-today',
  book:              'menu-book',
  people:            'group',
  clock:             'schedule',
  moon:              'dark-mode',
  home:              'home',
  heart:             'favorite-border',
  briefcase:         'work-outline',
  sprout:            'eco',
  house:             'cottage',
  study:             'auto-stories',
  history:           'history',
  more:              'more-horiz',
  restart:           'restart-alt',
  phone:             'phone',
  kundli:            'grid-view',
  sun:               'wb-sunny',
  match:             'join-inner',
  diya:              'local-fire-department',
  saturn:            'public',
  report:            'description',
  money:             'savings',
  timeline:          'timeline',
  lock:              'lock-outline',
  pdf:               'picture-as-pdf',
  flag:              'outlined-flag',
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
