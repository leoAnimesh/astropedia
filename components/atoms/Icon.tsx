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
  | 'pin-filled';

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
};

type Props = {
  name: IconName;
  size?: number;
  color?: string;
};

export function Icon({ name, size = 20, color = 'currentColor' }: Props) {
  if (Platform.OS === 'ios') {
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
