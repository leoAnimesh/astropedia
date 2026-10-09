import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { FONTS } from '@/constants/themes';

type Props = {
  title: string;
  /** Mono uppercase line under the title (person · context). */
  subtitle?: string;
  /** Optional action on the right (share, calendar …). */
  right?: { icon: IconName; onPress: () => void; label: string };
  backLabel?: string;
};

/**
 * Header for the detail screens pushed over the tabs (Horoscope, Panchang,
 * Sade sati, Life chapters, Festivals, Gita): back chevron, sans title, mono
 * subtitle, optional right action, hairline underneath.
 */
export function FeatureHeader({ title, subtitle, right, backLabel }: Props) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('common');
  const latin = i18n.language === 'en';
  return (
    <View style={[styles.header, { borderBottomColor: theme.hairline }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.iconBtn}
        accessibilityRole="button"
        accessibilityLabel={backLabel ?? t('back')}
      >
        <Icon name="back" size={22} color={theme.ink} />
      </TouchableOpacity>
      <View style={styles.titles}>
        <Text style={[styles.title, { color: theme.ink }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.muted }, !latin && styles.noTracking]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? (
        <TouchableOpacity onPress={right.onPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={right.label}>
          <Icon name={right.icon} size={19} color={theme.ink2} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    paddingLeft:       10,
    paddingRight:      16,
    paddingTop:        8,
    paddingBottom:     10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titles:  { flex: 1, gap: 1 },
  title: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
    lineHeight: 19,
  },
  subtitle: {
    fontFamily:    FONTS.monoRegular,
    fontSize:      10.5,
    lineHeight:    14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  noTracking: { letterSpacing: 0 },
});
