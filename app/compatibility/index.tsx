'use no memo'; // renders call language helpers (tPlanet, intlLocale, ...) that the React Compiler would otherwise cache across language switches

import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useProfiles } from '@/hooks/use-profiles';
import { Icon } from '@/components/atoms/Icon';
import { Avatar } from '@/components/atoms/Avatar';
import { EyebrowLabel } from '@/components/atoms/EyebrowLabel';
import { ScreenLayout } from '@/components/templates/ScreenLayout';
import {
  matchCharts, matchNotes, NAK_GANA, nadiOf, personChart, SIGN_LORD, SIGN_NAMES, signCount,
  type DoshaDetail, type KundliMatch, type ManglikExemption, type ManglikInfo, type PersonChart,
} from '@/utils/ashtakoota';
import { NAKSHATRAS } from '@/constants/astrology';
import { askLanguage, tAsk, tNakshatra, tPlanet, tSign, type AppLanguage } from '@/utils/i18n';
import { FONTS, RADIUS } from '@/constants/themes';
import type { Profile } from '@/utils/database';
import { useIndicStyles } from '@/hooks/use-indic-styles';

type Role = 'bride' | 'groom';

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Bride first, groom second — guessed from gender when it's known. */
function orient(x: Profile | null, y: Profile | null): [Profile | null, Profile | null] {
  if (x?.gender === 'man' || y?.gender === 'woman') return [y, x];
  return [x, y];
}

const firstName = (p: Profile) => p.name.split(' ')[0];

export default function KundliMatchScreen() {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('compatibility');
  const tallScript = i18n.language !== 'en';
  const params = useLocalSearchParams<{ a?: string; b?: string }>();
  const { profiles, activeProfile } = useProfiles();

  // Numbers in the app language's digits (Bengali uses its own numerals).
  const num = (n: number) => {
    const s = String(n);
    return i18n.language === 'bn' ? s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]) : s;
  };

  const [picking, setPicking] = useState<Role | null>(null);

  // Defaults: ?a=&b= if given, else "you" + someone else, oriented by gender.
  const defaults = useMemo(() => {
    if (profiles.length === 0) return { bride: null, groom: null };
    const byId = (id?: string) => (id ? profiles.find((p) => p.id === id) ?? null : null);
    const x = byId(params.a) ?? profiles.find((p) => p.isYou) ?? activeProfile ?? profiles[0];
    const y = byId(params.b)
      ?? profiles.find((p) => p.id !== x?.id && !!p.birthDate)
      ?? profiles.find((p) => p.id !== x?.id)
      ?? null;
    const [b, g] = orient(x, y);
    return { bride: b?.id ?? null, groom: g?.id ?? null };
  }, [profiles, activeProfile, params.a, params.b]);

  // The user's own choice, once they pick or swap.
  const [chosen, setChosen] = useState<{ bride: string | null; groom: string | null } | null>(null);
  const brideId = (chosen ?? defaults).bride;
  const groomId = (chosen ?? defaults).groom;

  const bride = profiles.find((p) => p.id === brideId) ?? null;
  const groom = profiles.find((p) => p.id === groomId) ?? null;

  const charts = useMemo(() => ({
    bride: bride?.birthDate ? personChart(bride) : null,
    groom: groom?.birthDate ? personChart(groom) : null,
  }), [bride, groom]);

  const match: KundliMatch | null = useMemo(
    () => (bride && groom && bride.id !== groom.id ? matchCharts(bride, groom) : null),
    [bride, groom],
  );

  const swap = () => {
    setChosen({ bride: groomId, groom: brideId });
    setPicking(null);
  };

  const pick = (role: Role, id: string) => {
    const other = role === 'bride' ? groomId : brideId;
    if (id === other) swap(); // picking the person in the other slot swaps them
    else setChosen(role === 'bride' ? { bride: id, groom: groomId } : { bride: brideId, groom: id });
    setPicking(null);
  };

  // Asked in the app language when the on-device model speaks it, else English.
  const askSaga = () => {
    if (!match || !bride || !groom) return;
    const lng = askLanguage();
    const Q = (key: string, vars?: Record<string, unknown>) => tAsk(`compatibility:question.${key}`, vars);
    const parts = match.kootas
      .map((k) => Q('part', { name: tAsk(`compatibility:match.koota.${k.key}.name`), score: k.score, max: k.max }))
      .join(', ');
    const manglikLine = (p: Profile, m: ManglikInfo) => {
      const active = m.refs.filter((r) => r.flagged && !r.exemption);
      const shown  = m.level === 'none' || m.level === 'cancelled' ? m.refs : active;
      return Q(`manglik.${m.level}`, {
        name:      firstName(p),
        refs:      listJoin(shown.map((r) => Q(`basis.${r.ref}`)), Q('refJoin'), Q('refJoinLast')),
        exemption: exemptionText(m, (k, v) => tAsk(`compatibility:${k}`, v), lng),
        approx:    m.approximate ? Q('approx') : '',
        age:       m.ageSoftened ? Q('age') : '',
      });
    };
    const statusQ = (status: string, reason: string) => Q(`status.${status}`, { reason });
    const askReason = (d: DoshaDetail) =>
      doshaReason(d, match, (k, v) => tAsk(`compatibility:${k}`, v), (n) => tPlanet(n, lng), String);
    const q = [
      Q('intro', {
        bride:     firstName(bride),
        brideSign: tSign(SIGN_NAMES[match.brideChart.moon.sign], lng),
        brideNak:  tNakshatra(NAKSHATRAS[match.brideChart.moon.nak].name, lng),
        groom:     firstName(groom),
        groomSign: tSign(SIGN_NAMES[match.groomChart.moon.sign], lng),
        groomNak:  tNakshatra(NAKSHATRAS[match.groomChart.moon.nak].name, lng),
        total:     match.total,
        parts,
      }),
      Q('dosha', {
        nadi:    statusQ(match.nadiDetail.status, askReason(match.nadiDetail)),
        bhakoot: statusQ(match.bhakootDetail.status, askReason(match.bhakootDetail)),
        gana:    statusQ(match.ganaDetail.status, match.ganaDetail.reason
          ? tAsk(`compatibility:match.dosha.gana.reason.${match.ganaDetail.reason}`, { score: match.kootas[4].score })
          : ''),
      }),
      Q('manglikPair', { a: manglikLine(bride, match.manglik.bride), b: manglikLine(groom, match.manglik.groom) }),
      match.manglik.status === 'none' ? '' : Q(`pair.${match.manglik.status}`),
      Q(bride.isYou || groom.isYou ? 'ask.us' : 'ask.them'),
    ].filter(Boolean).join(' ');
    const owner = bride.isYou ? bride : groom.isYou ? groom : bride;
    const tempId = 't_' + Math.random().toString(36).slice(2, 11);
    router.push(`/chat/${tempId}?profileId=${owner.id}&isNew=true&ask=${encodeURIComponent(q)}`);
  };

  const tr = (k: string, v?: Record<string, unknown>) => t(k, v);
  const reasonText = (d: DoshaDetail) => (match ? doshaReason(d, match, tr, (n) => tPlanet(n), num) : '');

  const notes   = matchNotes(bride, groom);
  const byRole  = { bride, groom };
  const missing = [bride, groom].filter((p): p is Profile => !!p && !p.birthDate);
  const noTime  = notes.noTime.map((r) => byRole[r]).filter((p): p is Profile => !!p);
  const noPlace = notes.noPlace.map((r) => byRole[r]).filter((p): p is Profile => !!p);
  const minors  = notes.minors.map((r) => byRole[r]).filter((p): p is Profile => !!p);
  const bothNoTime = noTime.length === 2;

  return (
    <ScreenLayout edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.back, { borderColor: theme.hairline2 }]}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <Icon name="back" size={20} color={theme.ink} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Title */}
        <View style={styles.section}>
          <EyebrowLabel size={11}>{t('match.eyebrow')}</EyebrowLabel>
          <Text style={[styles.title, { color: theme.ink }, tallScript && styles.titleTall]}>
            {t('match.heading.before')}
            <Text style={[styles.titleItalic, { color: theme.accent }]}>{t('match.heading.em')}</Text>
          </Text>
          <Text style={[styles.lead, { color: theme.ink2 }]}>{t('match.lead')}</Text>
        </View>

        {/* Bride & groom */}
        <View style={styles.section}>
          <View style={styles.pairRow}>
            <PersonSlot
              role="bride" profile={bride} chart={charts.bride} active={picking === 'bride'}
              onPress={() => setPicking(picking === 'bride' ? null : 'bride')}
            />
            <TouchableOpacity
              onPress={swap}
              style={[styles.swapBtn, { borderColor: theme.hairline2, backgroundColor: theme.bg }]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('match.swap')}
            >
              <Text style={[styles.swapGlyph, { color: theme.ink2 }]}>⇄</Text>
            </TouchableOpacity>
            <PersonSlot
              role="groom" profile={groom} chart={charts.groom} active={picking === 'groom'}
              onPress={() => setPicking(picking === 'groom' ? null : 'groom')}
            />
          </View>

          {picking && (
            <View style={[styles.picker, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
              <EyebrowLabel size={10.5} style={styles.pickerLabel}>{t(`match.pickTitle.${picking}`)}</EyebrowLabel>
              {profiles.map((p, i) => {
                const selected = p.id === (picking === 'bride' ? brideId : groomId);
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => pick(picking, p.id)}
                    style={[styles.pickRow, i > 0 && { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Avatar name={p.name} size={30} />
                    <Text style={[styles.pickName, { color: theme.ink }]} numberOfLines={1}>{p.name}</Text>
                    {selected ? <Icon name="check" size={16} color={theme.accent} /> : null}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity onPress={() => router.push('/profile/new')} style={[styles.pickRow, { borderTopColor: theme.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.link, { color: theme.accent }]}>{t('addProfileCta')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {missing.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => router.push(`/profile/edit/${p.id}`)} hitSlop={6} style={styles.inlineLink}>
              <Text style={[styles.link, { color: theme.accent }]}>{t('match.addDetails', { name: firstName(p) })}</Text>
            </TouchableOpacity>
          ))}
          {bothNoTime && <Text style={[styles.note, { color: theme.muted }]}>{t('match.notes.noTimeBoth')}</Text>}
          {noTime.map((p) => (
            <View key={p.id}>
              {!bothNoTime && <Text style={[styles.note, { color: theme.muted }]}>{t('match.noTimeNote', { name: firstName(p) })}</Text>}
              <TouchableOpacity onPress={() => router.push(`/profile/edit/${p.id}`)} hitSlop={6} style={styles.inlineLink}>
                <Text style={[styles.link, { color: theme.accent }]}>
                  {bothNoTime ? `${firstName(p)} · ${t('match.addTime')}` : t('match.addTime')}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          {noPlace.map((p) => (
            <View key={p.id}>
              <Text style={[styles.note, { color: theme.muted }]}>{t('match.notes.noPlace', { name: firstName(p) })}</Text>
              <TouchableOpacity onPress={() => router.push(`/profile/edit/${p.id}`)} hitSlop={6} style={styles.inlineLink}>
                <Text style={[styles.link, { color: theme.accent }]}>{t('match.notes.addPlace')}</Text>
              </TouchableOpacity>
            </View>
          ))}

          {profiles.length < 2 && <Text style={[styles.note, { color: theme.muted }]}>{t('hintNeedTwo')}</Text>}
          {notes.sameProfile && <Text style={[styles.note, { color: theme.muted }]}>{t('hintSame')}</Text>}
          {notes.identicalBirth && <Text style={[styles.note, { color: theme.muted }]}>{t('match.notes.identical')}</Text>}
          {bride && groom && !notes.sameProfile && notes.rolesManual && (
            <Text style={[styles.note, { color: theme.muted }]}>{t('match.notes.roles')}</Text>
          )}
          {!notes.sameProfile && minors.map((p) => (
            <Text key={`minor-${p.id}`} style={[styles.note, { color: theme.muted }]}>{t('match.notes.minor', { name: firstName(p) })}</Text>
          ))}
          {notes.ageGap != null && (
            <Text style={[styles.note, { color: theme.muted }]}>{t('match.notes.ageGap', { years: num(notes.ageGap) })}</Text>
          )}
        </View>

        {match && (
          <>
            {/* Score */}
            <View style={styles.section}>
              <EyebrowLabel size={11}>{t(`match.verdict.${match.verdict}`)}</EyebrowLabel>
              <Text style={[styles.score, { color: theme.ink }]}>
                {num(match.total)}
                <Text style={[styles.scoreDenom, { color: theme.muted }]}> {t('match.outOf')} {t('match.gunas')}</Text>
              </Text>
              <View
                style={[styles.track, { backgroundColor: theme.hairline }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 36, now: match.total }}
              >
                <View style={[styles.fill, { width: `${(match.total / 36) * 100}%`, backgroundColor: theme.accent }]} />
                {[18, 25, 33].map((m) => (
                  <View key={m} style={[styles.tick, { left: `${(m / 36) * 100}%`, backgroundColor: theme.bg }]} />
                ))}
              </View>
              <Text style={[styles.lead, { color: theme.ink2 }]}>{t(`match.verdictLine.${match.verdict}`)}</Text>
            </View>

            {/* Eight kootas */}
            <View>
              <EyebrowLabel size={11}>{t('match.kootas')}</EyebrowLabel>
              {match.kootas.map((k) => {
                const level = k.score === k.max ? 'full' : k.score === 0 ? 'none' : 'some';
                return (
                  <View key={k.key} style={[styles.row, { borderBottomColor: theme.hairline }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: theme.ink }]}>{t(`match.koota.${k.key}.name`)}</Text>
                      <Text style={[styles.rowSub, { color: theme.ink2 }]}>
                        {t(`match.koota.${k.key}.${level}`, { defaultValue: t(`match.koota.${k.key}.full`) })}
                      </Text>
                    </View>
                    <Text style={[styles.rowScore, { color: k.score === 0 ? theme.muted : theme.ink }]}>
                      {num(k.score)}<Text style={{ color: theme.muted }}> / {num(k.max)}</Text>
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Doshas */}
            <View style={styles.section}>
              <EyebrowLabel size={11}>{t('match.doshas')}</EyebrowLabel>
              <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.hairline }]}>
                <DoshaBlock
                  title={t('match.dosha.nadi.title')}
                  flagged={match.nadiDetail.status === 'present'}
                  text={t(`match.dosha.nadi.${match.nadiDetail.status}`, {
                    nadi:   t(`match.nadiName.${nadiOf(match.brideChart.moon.nak)}`),
                    reason: reasonText(match.nadiDetail),
                  })}
                />
                <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
                <DoshaBlock
                  title={t('match.dosha.bhakoot.title')}
                  flagged={match.bhakootDetail.status === 'present'}
                  text={t(`match.dosha.bhakoot.${match.bhakootDetail.status}`, {
                    count:  (() => {
                      const c = signCount(match.brideChart.moon.sign, match.groomChart.moon.sign);
                      const back = signCount(match.groomChart.moon.sign, match.brideChart.moon.sign);
                      return `${num(Math.min(c, back))}/${num(Math.max(c, back))}`;
                    })(),
                    reason: reasonText(match.bhakootDetail),
                  })}
                />
                <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
                <DoshaBlock
                  title={t('match.dosha.gana.title')}
                  flagged={match.ganaDetail.status === 'present'}
                  text={t(`match.dosha.gana.${match.ganaDetail.status}`, {
                    a:      t(`match.ganaName.${NAK_GANA[match.brideChart.moon.nak]}`),
                    b:      t(`match.ganaName.${NAK_GANA[match.groomChart.moon.nak]}`),
                    reason: match.ganaDetail.reason
                      ? t(`match.dosha.gana.reason.${match.ganaDetail.reason}`, { score: num(match.kootas[4].score) })
                      : '',
                  })}
                />
                <View style={[styles.divider, { backgroundColor: theme.hairline }]} />
                <View style={styles.doshaBlock}>
                  <View style={styles.doshaHead}>
                    <Text style={[styles.doshaTitle, { color: theme.ink }]}>{t('match.dosha.manglik.title')}</Text>
                    {match.manglik.status === 'one' && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
                  </View>
                  {bride && groom && ([[bride, match.manglik.bride], [groom, match.manglik.groom]] as const).map(([p, m]) => {
                    const active = m.refs.filter((r) => r.flagged && !r.exemption);
                    return (
                      <View key={p.id} style={styles.manglikPerson}>
                        <Text style={[styles.body, { color: theme.ink2 }]}>
                          <Text style={{ fontFamily: FONTS.sansMedium, color: theme.ink }}>{firstName(p)}: </Text>
                          {t(`match.dosha.manglik.level.${m.level}`, {
                            refs:      listJoin(
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
                        {m.lagnaMissing && (
                          <Text style={[styles.small, { color: theme.muted }]}>{t(`match.dosha.manglik.approx.${m.lagnaMissing}`)}</Text>
                        )}
                        {m.ageSoftened && (
                          <Text style={[styles.small, { color: theme.muted }]}>{t('match.dosha.manglik.ageNote')}</Text>
                        )}
                      </View>
                    );
                  })}
                  <Text style={[styles.body, { color: theme.ink2 }]}>{t(`match.dosha.manglik.status.${match.manglik.status}`)}</Text>
                </View>
              </View>

              <TouchableOpacity onPress={askSaga} style={styles.askLink} hitSlop={6} accessibilityRole="button">
                <Text style={[styles.askText, { color: theme.accent }]}>{t('match.ask')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.footer, { color: theme.muted }]}>{t('match.footer')}</Text>
          </>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

type Tr = (key: string, vars?: Record<string, unknown>) => string;

/** "a", "a and b", "a, b and c" with the language's separators. */
function listJoin(items: string[], sep: string, last: string): string {
  return items.length <= 1 ? (items[0] ?? '') : items.slice(0, -1).join(sep) + last + items[items.length - 1];
}

/** The plain-language reason a Nadi/Bhakoot dosha is cancelled ('' if none). */
function doshaReason(
  d: DoshaDetail, match: KundliMatch, tr: Tr, planet: (name: string) => string, num: (n: number) => string,
): string {
  if (!d.reason) return '';
  const a = match.brideChart.moon, b = match.groomChart.moon;
  return tr(`match.dosha.reason.${d.reason}`, {
    planet: planet(SIGN_LORD[a.sign]),
    a:      planet(SIGN_LORD[a.sign]),
    b:      planet(SIGN_LORD[b.sign]),
    padaA:  num(a.pada),
    padaB:  num(b.pada),
  });
}

/** Why a person's Manglik placement is exempt, e.g. "Mars is exalted in Capricorn". */
function exemptionText(m: ManglikInfo, tr: Tr, lng?: AppLanguage, num: (n: number) => string = String): string {
  return m.exemptions.map((e: ManglikExemption) => {
    const ref = m.refs.find((r) => r.exemption === e);
    return tr(`match.dosha.manglik.exemption.${e}`, {
      sign:  tSign(SIGN_NAMES[m.marsSign], lng),
      house: num(ref?.house ?? m.house),
    });
  }).join('; ');
}

function PersonSlot({ role, profile, chart, active, onPress }: {
  role: Role; profile: Profile | null; chart: PersonChart | null; active: boolean; onPress: () => void;
}) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  const { t, i18n } = useTranslation('compatibility');
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.slot,
        { backgroundColor: theme.surface, borderColor: active ? theme.accent : theme.hairline },
      ]}
      accessibilityRole="button"
      accessibilityLabel={t(`match.pickTitle.${role}`)}
    >
      <EyebrowLabel size={10}>{t(`match.${role}`)}</EyebrowLabel>
      {profile ? (
        <>
          <Avatar name={profile.name} size={44} />
          <Text style={[styles.slotName, { color: theme.ink }]} numberOfLines={1}>{firstName(profile)}</Text>
          <Text style={[styles.slotSub, { color: theme.muted }]} numberOfLines={2}>
            {chart
              ? t('match.moonLine', {
                  sign:      tSign(SIGN_NAMES[chart.moon.sign]),
                  nakshatra: tNakshatra(NAKSHATRAS[chart.moon.nak].name),
                  pada:      i18n.language === 'bn' ? BN_DIGITS[chart.moon.pada] : chart.moon.pada,
                })
              : t('match.noDetails')}
          </Text>
        </>
      ) : (
        <Text style={[styles.slotSub, { color: theme.accent }]}>{t('match.choose')}</Text>
      )}
    </TouchableOpacity>
  );
}

function DoshaBlock({ title, text, flagged }: { title: string; text: string; flagged: boolean }) {
  const styles = useIndicStyles(baseStyles);
  const { theme } = useAccent();
  return (
    <View style={styles.doshaBlock}>
      <View style={styles.doshaHead}>
        <Text style={[styles.doshaTitle, { color: theme.ink }]}>{title}</Text>
        {flagged && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
      </View>
      <Text style={[styles.body, { color: theme.ink2 }]}>{text}</Text>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: {
    paddingHorizontal: 22,
    paddingTop:        12,
    paddingBottom:     6,
  },
  back: {
    width:          44,
    height:         44,
    borderRadius:   22,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 26,
    paddingTop:        24,
    paddingBottom:     60,
    gap:               40,
  },
  section: { gap: 14 },
  title: {
    fontFamily:    FONTS.serifRegular,
    fontSize:      44,
    lineHeight:    46,
    letterSpacing: -0.5,
  },
  titleTall:   { lineHeight: 58, letterSpacing: 0 },
  titleItalic: { fontFamily: FONTS.serifItalic },
  lead: {
    fontFamily: FONTS.sansRegular,
    fontSize:   16,
    lineHeight: 24,
  },

  pairRow: {
    flexDirection: 'row',
    alignItems:    'center',
  },
  slot: {
    flex:              1,
    alignItems:        'center',
    paddingVertical:   18,
    paddingHorizontal: 12,
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    gap:               8,
    minHeight:         176,
  },
  slotName: {
    fontFamily: FONTS.serifRegular,
    fontSize:   20,
  },
  slotSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12,
    lineHeight: 17,
    textAlign:  'center',
  },
  swapBtn: {
    width:            36,
    height:           36,
    borderRadius:     18,
    borderWidth:      1,
    alignItems:       'center',
    justifyContent:   'center',
    marginHorizontal: -8,
    zIndex:           1,
  },
  swapGlyph: { fontSize: 16 },

  picker: {
    borderRadius:      RADIUS.card,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical:   8,
  },
  pickerLabel: { marginTop: 6, marginBottom: 4 },
  pickRow: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             12,
    minHeight:       48,
  },
  pickName: {
    flex:       1,
    fontFamily: FONTS.sansRegular,
    fontSize:   15,
  },

  inlineLink: { minHeight: 32, justifyContent: 'center' },
  link: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14,
  },
  note: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 20,
  },

  score: {
    fontFamily: FONTS.serifRegular,
    fontSize:   64,
    lineHeight: 70,
  },
  scoreDenom: {
    fontFamily: FONTS.serifItalic,
    fontSize:   24,
  },
  track: {
    height:       4,
    borderRadius: 2,
    overflow:     'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
  tick: {
    position: 'absolute',
    top:      0,
    bottom:   0,
    width:    2,
  },

  row: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               16,
    paddingVertical:   14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    fontFamily:   FONTS.sansMedium,
    fontSize:     15.5,
    lineHeight:   21,
    marginBottom: 2,
  },
  rowSub: {
    fontFamily: FONTS.sansRegular,
    fontSize:   13.5,
    lineHeight: 19,
  },
  rowScore: {
    fontFamily: FONTS.monoRegular,
    fontSize:   14,
  },

  card: {
    borderRadius:      RADIUS.card + 4,
    borderWidth:       StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical:   6,
  },
  divider: { height: StyleSheet.hairlineWidth },
  doshaBlock: { paddingVertical: 16, gap: 6 },
  doshaHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doshaTitle: {
    fontFamily: FONTS.serifRegular,
    fontSize:   21,
    lineHeight: 26,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: {
    fontFamily: FONTS.sansRegular,
    fontSize:   14.5,
    lineHeight: 21,
  },
  small: {
    fontFamily: FONTS.sansRegular,
    fontSize:   12.5,
    lineHeight: 18,
  },
  manglikPerson: { gap: 2 },

  askLink: {
    minHeight:      44,
    justifyContent: 'center',
  },
  askText: {
    fontFamily: FONTS.sansMedium,
    fontSize:   14.5,
  },
  footer: {
    fontFamily: FONTS.serifItalic,
    fontSize:   16,
    lineHeight: 23,
  },
});
