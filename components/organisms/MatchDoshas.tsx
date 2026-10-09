'use no memo'; // renders language-dependent text (tPlanet, tSign …)

import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { FONTS, RADIUS } from '@/constants/themes';
import { NAK_GANA, nadiOf, signCount, type KundliMatch, type ManglikInfo } from '@/utils/ashtakoota';
import { localizeDigits, tPlanet } from '@/utils/i18n';
import { doshaReason, exemptionText, listJoin, maitriScore, type Tr } from '@/utils/match-detail';

type Person = { id: string; name: string };

/**
 * "Things to consider" for a partner match: Nadi, Bhakoot and Gana doshas
 * with their traditional cancellations, and each person's Manglik reading
 * (houses from the ascendant / Moon / Venus, exemptions, approximations).
 */
export function MatchDoshas({ match, bride, groom }: { match: KundliMatch; bride: Person; groom: Person }) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t } = useTranslation('compatibility');
  const num = (n: number) => localizeDigits(String(n));
  const tr: Tr = (k, v) => t(k, v);
  const reason = (d: KundliMatch['nadiDetail']) => doshaReason(d, match, tr, (n) => tPlanet(n), num);
  const first = (p: Person) => p.name.split(' ')[0] || p.name;

  const bCount = signCount(match.brideChart.moon.sign, match.groomChart.moon.sign);
  const gCount = signCount(match.groomChart.moon.sign, match.brideChart.moon.sign);

  const block = (key: string, title: string, flagged: boolean, text: string) => (
    <View key={key} style={styles.block}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: theme.ink }]}>{title}</Text>
        {flagged && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
      </View>
      <Text style={[styles.body, { color: theme.ink2 }]}>{text}</Text>
    </View>
  );
  const divider = (k: string) => <View key={k} style={[styles.divider, { backgroundColor: theme.hairline }]} />;

  const manglikPerson = (p: Person, m: ManglikInfo) => {
    const active = m.refs.filter((r) => r.flagged && !r.exemption);
    return (
      <View key={p.id} style={styles.person}>
        <Text style={[styles.body, { color: theme.ink2 }]}>
          <Text style={{ fontFamily: FONTS.sansMedium, color: theme.ink }}>{first(p)}: </Text>
          {t(`match.dosha.manglik.level.${m.level}`, {
            refs: listJoin(
              active.map((r) => t(`match.dosha.manglik.basis.${r.ref}`)),
              t('match.dosha.manglik.refJoin'), t('match.dosha.manglik.refJoinLast'),
            ),
            exemption: exemptionText(m, tr, undefined, num),
          })}
        </Text>
        <Text style={[styles.small, { color: theme.muted }]}>
          {m.refs.map((r) =>
            t('match.dosha.manglik.refItem', { ref: t(`match.dosha.manglik.basis.${r.ref}`), house: num(r.house) })
            + (r.flagged ? t(`match.dosha.manglik.refFlag.${r.exemption ? 'exempt' : 'flagged'}`) : ''),
          ).join(' · ')}
        </Text>
        {m.lagnaMissing && <Text style={[styles.small, { color: theme.muted }]}>{t(`match.dosha.manglik.approx.${m.lagnaMissing}`)}</Text>}
        {m.ageSoftened && <Text style={[styles.small, { color: theme.muted }]}>{t('match.dosha.manglik.ageNote')}</Text>}
      </View>
    );
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
      {block('nadi', t('match.dosha.nadi.title'), match.nadiDetail.status === 'present',
        t(`match.dosha.nadi.${match.nadiDetail.status}`, {
          nadi: t(`match.nadiName.${nadiOf(match.brideChart.moon.nak)}`),
          reason: reason(match.nadiDetail),
        }))}
      {divider('d1')}
      {block('bhakoot', t('match.dosha.bhakoot.title'), match.bhakootDetail.status === 'present',
        t(`match.dosha.bhakoot.${match.bhakootDetail.status}`, {
          count: `${num(Math.min(bCount, gCount))}/${num(Math.max(bCount, gCount))}`,
          reason: reason(match.bhakootDetail),
        }))}
      {divider('d2')}
      {block('gana', t('match.dosha.gana.title'), match.ganaDetail.status === 'present',
        t(`match.dosha.gana.${match.ganaDetail.status}`, {
          a: t(`match.ganaName.${NAK_GANA[match.brideChart.moon.nak]}`),
          b: t(`match.ganaName.${NAK_GANA[match.groomChart.moon.nak]}`),
          reason: match.ganaDetail.reason
            ? t(`match.dosha.gana.reason.${match.ganaDetail.reason}`, { score: num(maitriScore(match)) })
            : '',
        }))}
      {divider('d3')}
      <View style={styles.block}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: theme.ink }]}>{t('match.dosha.manglik.title')}</Text>
          {match.manglik.status === 'one' && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
        </View>
        {manglikPerson(bride, match.manglik.bride)}
        {manglikPerson(groom, match.manglik.groom)}
        <Text style={[styles.body, { color: theme.ink2 }]}>{t(`match.dosha.manglik.status.${match.manglik.status}`)}</Text>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 4 },
  block: { paddingVertical: 14, gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: FONTS.serifRegular, fontSize: 19, lineHeight: 24 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  divider: { height: StyleSheet.hairlineWidth },
  body: { fontFamily: FONTS.sansRegular, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: FONTS.sansRegular, fontSize: 12, lineHeight: 17 },
  person: { gap: 2 },
});
