import { StyleSheet, Text, TouchableOpacity, View, Modal, FlatList, Pressable } from 'react-native';
import { useAccent } from '@/hooks/use-accent';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { getSunSign } from '@/utils/astrology';
import type { Profile } from '@/utils/database';

type Props = {
  visible: boolean;
  profiles: Profile[];
  activeProfileId: string | null;
  onSelect: (profile: Profile) => void;
  onCreateNew: () => void;
  onClose: () => void;
};

export function ProfileSwitcherSheet({
  visible,
  profiles,
  activeProfileId,
  onSelect,
  onCreateNew,
  onClose,
}: Props) {
  const { theme } = useAccent();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.bg, borderTopColor: theme.hairline }]}
          onPress={() => {}} // prevent close on sheet tap
        >
          <View style={[styles.handle, { backgroundColor: theme.hairline2 }]} />
          <EyebrowLabel style={styles.sheetTitle}>Switch chart</EyebrowLabel>

          <FlatList
            data={profiles}
            keyExtractor={(p) => p.id}
            renderItem={({ item: p }) => {
              const sun = getSunSign(p.birthDate);
              const isActive = p.id === activeProfileId;
              return (
                <TouchableOpacity
                  style={styles.profileRow}
                  onPress={() => { onSelect(p); onClose(); }}
                  activeOpacity={0.75}
                >
                  <Avatar name={p.name} size={40} />
                  <View style={styles.profileText}>
                    <Text style={[styles.profileName, { color: theme.ink }]}>
                      {p.name}
                      {p.isYou && (
                        <Text style={[styles.youBadge, { color: theme.accent }]}> · You</Text>
                      )}
                    </Text>
                    <Text style={[styles.profileSub, { color: theme.muted }]}>
                      {sun ? sun.name : 'No birth date'}
                    </Text>
                  </View>
                  {isActive && (
                    <View style={[styles.activeDot, { backgroundColor: theme.accent }]} />
                  )}
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.hairline }]} />
            )}
          />

          <TouchableOpacity
            style={[styles.addBtn, { borderColor: theme.hairline2 }]}
            onPress={() => { onCreateNew(); onClose(); }}
          >
            <Icon name="plus" size={16} color={theme.ink2} />
            <Text style={[styles.addLabel, { color: theme.ink2 }]}>Add a chart</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Pill button that triggers the sheet
type TriggerProps = {
  profile: Profile | null;
  onPress: () => void;
};

export function ProfileSwitcherTrigger({ profile, onPress }: TriggerProps) {
  const { theme } = useAccent();
  if (!profile) return null;

  return (
    <TouchableOpacity
      style={[styles.trigger, { backgroundColor: theme.surface, borderColor: theme.hairline2 }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Avatar name={profile.name} size={28} />
      <Text style={[styles.triggerName, { color: theme.ink }]} numberOfLines={1}>
        {profile.name}
      </Text>
      <Icon name="chevron-down" size={12} color={theme.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent:  'flex-end',
  },
  sheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingBottom:        36,
    paddingTop:           14,
    borderTopWidth:       StyleSheet.hairlineWidth,
    maxHeight:            '70%',
  },
  handle: {
    width:        36,
    height:       4,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: 14,
  },
  sheetTitle: {
    paddingHorizontal: 26,
    marginBottom:      10,
  },
  profileRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingVertical: 12,
    paddingHorizontal: 26,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      15,
    letterSpacing: -0.1,
  },
  youBadge: {
    fontFamily: FONTS.monoRegular,
    fontSize:   10,
  },
  profileSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13,
    marginTop:  1,
  },
  activeDot: {
    width:        6,
    height:       6,
    borderRadius: 3,
  },
  separator: {
    height:            StyleSheet.hairlineWidth,
    marginHorizontal:  26,
  },
  addBtn: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    marginHorizontal: 26,
    marginTop:        14,
    paddingVertical:  12,
    borderRadius:     RADIUS.card,
    borderWidth:      1,
    justifyContent:   'center',
  },
  addLabel: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
  },
  trigger: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    borderRadius:     RADIUS.pill,
    borderWidth:      1,
    paddingVertical:  5,
    paddingLeft:      5,
    paddingRight:     12,
    maxWidth:         200,
  },
  triggerName: {
    fontFamily:    FONTS.sansRegular,
    fontSize:      14,
    letterSpacing: -0.1,
    flex:          1,
  },
});
