import { forwardRef, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  BottomSheetFlatList,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useAccent } from '@/hooks/use-accent';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';
import { getSunSign } from '@/utils/astrology';
import type { Profile } from '@/utils/database';

type SheetProps = {
  profiles: Profile[];
  activeProfileId: string | null;
  onSelect: (profile: Profile) => void;
  onCreateNew: () => void;
  onEdit?: (profile: Profile) => void;
};

export type ProfileSwitcherSheetRef = BottomSheetModal;

export const ProfileSwitcherSheet = forwardRef<ProfileSwitcherSheetRef, SheetProps>(
  function ProfileSwitcherSheet({ profiles, activeProfileId, onSelect, onCreateNew, onEdit }, ref) {
    const { theme } = useAccent();

    const dismiss = useCallback(() => {
      (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss();
    }, [ref]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.32}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: theme.hairline2, width: 36 }}
        backgroundStyle={{ backgroundColor: theme.surface }}
      >
        <BottomSheetView style={styles.content}>
          <EyebrowLabel style={styles.sheetTitle}>Switch chart</EyebrowLabel>

          {profiles.map((p, i) => {
            const sun = getSunSign(p.birthDate);
            const isActive = p.id === activeProfileId;
            return (
              <View key={p.id}>
                {i > 0 && (
                  <View style={[styles.separator, { backgroundColor: theme.hairline }]} />
                )}
                <View style={styles.profileRow}>
                  <TouchableOpacity
                    style={styles.profileMain}
                    onPress={() => { onSelect(p); dismiss(); }}
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
                  {onEdit && (
                    <TouchableOpacity
                      hitSlop={10}
                      style={styles.editBtn}
                      onPress={() => { onEdit(p); dismiss(); }}
                      activeOpacity={0.7}
                    >
                      <Icon name="edit" size={16} color={theme.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.addBtn, { borderColor: theme.hairline2 }]}
            onPress={() => { onCreateNew(); dismiss(); }}
          >
            <Icon name="plus" size={16} color={theme.ink2} />
            <Text style={[styles.addLabel, { color: theme.ink2 }]}>Add a chart</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

// Pill trigger button
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
  content: {
    paddingBottom: 40,
  },
  sheetTitle: {
    paddingHorizontal: 26,
    marginTop: 4,
    marginBottom: 10,
  },
  profileRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 26,
  },
  profileMain: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    paddingVertical: 12,
  },
  editBtn: {
    padding:    10,
    marginLeft: 4,
  },
  profileText: {
    flex:     1,
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
    height:           StyleSheet.hairlineWidth,
    marginHorizontal: 26,
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
    flexDirection:   'row',
    alignItems:      'center',
    alignSelf:       'flex-start',  // size to content, don't stretch
    gap:             8,
    borderRadius:    RADIUS.pill,
    borderWidth:     1,
    paddingVertical: 5,
    paddingLeft:     5,
    paddingRight:    12,
    maxWidth:        240,            // cap so a very long name still truncates
  },
  triggerName: {
    fontFamily:      FONTS.sansRegular,
    fontSize:        14,
    letterSpacing:   -0.1,
    flexShrink:      1,
  },
});
