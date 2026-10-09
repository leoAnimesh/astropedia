import { forwardRef, useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Trans, useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS, RADIUS } from '@/constants/themes';

export type GuruNoticeSheetRef = BottomSheetModal;

/**
 * One-time "Chats are now organised by guru" sheet, shown on the first visit
 * to the Chat tab after the upgrade that moved existing chats (schema v7).
 */
export const GuruNoticeSheet = forwardRef<GuruNoticeSheetRef, { onClose: () => void }>(
  function GuruNoticeSheet({ onClose }, ref) {
    const styles = useIndicStyles(baseStyles);
    const { theme } = useAccent();
    const { t, i18n } = useTranslation('chat');
    const indic = i18n.language !== 'en';

    const dismiss = useCallback(() => {
      (ref as React.RefObject<BottomSheetModal>)?.current?.dismiss();
    }, [ref]);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.42} />
      ),
      [],
    );

    const points: { icon: IconName; key: string }[] = [
      { icon: 'heart',   key: 'notice.p1' },
      { icon: 'sparkle', key: 'notice.p2' },
      { icon: 'history', key: 'notice.p3' },
    ];

    return (
      <BottomSheetModal
        ref={ref}
        enableDynamicSizing
        enablePanDownToClose
        onDismiss={onClose}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: theme.hairline2, width: 40 }}
        backgroundStyle={{ backgroundColor: theme.bg }}
        accessibilityViewIsModal
      >
        <BottomSheetView style={styles.content}>
          <EyebrowLabel size={11}>{t('notice.eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, indic && styles.titleIndic, { color: theme.ink }]} accessibilityRole="header">
            <Trans t={t} i18nKey="notice.title" components={{ em: <Text style={styles.italic} /> }} />
          </Text>
          <Text style={[styles.sub, { color: theme.ink2 }]}>{t('notice.sub')}</Text>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
            {points.map((p) => (
              <View key={p.key} style={styles.point}>
                <View style={[styles.pointIcon, { backgroundColor: 'rgba(180,130,0,0.10)' }]}>
                  <Icon name={p.icon} size={16} color={theme.accent} />
                </View>
                <Text style={[styles.pointText, { color: theme.ink }]}>
                  <Trans t={t} i18nKey={p.key} components={{ b: <Text style={styles.bold} /> }} />
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={dismiss}
            style={[styles.button, { backgroundColor: theme.ink }]}
            accessibilityRole="button"
          >
            <Text style={[styles.buttonText, { color: theme.bg }]}>{t('notice.ok')}</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const baseStyles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop:        6,
    paddingBottom:     40,
    gap:               18,
  },
  title: {
    marginTop:  -8,
    fontFamily: FONTS.serifRegular,
    fontSize:   30,
    lineHeight: 34,
  },
  titleIndic: { fontSize: 26, lineHeight: 40 },
  italic: { fontFamily: FONTS.serifItalic },
  bold: { fontFamily: FONTS.sansSemiBold },
  sub: {
    marginTop:  -4,
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
    lineHeight: 21,
  },
  card: {
    gap:               14,
    paddingHorizontal: 18,
    paddingVertical:   16,
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
  },
  point: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  pointIcon: {
    width:          32,
    height:         32,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
  },
  pointText: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   14,
    lineHeight: 20,
  },
  button: {
    height:         52,
    borderRadius:   RADIUS.pill,
    alignItems:     'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   15.5,
  },
});
