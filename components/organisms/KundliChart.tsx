'use no memo'; // renders call language helpers (tPlanet, tSign, ...) that the React Compiler would otherwise cache across language switches

import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Polygon, Rect, Text as SvgText, TSpan } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAccent } from '@/hooks/use-accent';
import { useAstrology } from '@/hooks/use-astrology';
import { useIndicStyles } from '@/hooks/use-indic-styles';
import { localizeDigits, tPlanet, tSign, useAppLanguage } from '@/utils/i18n';
import { ZODIAC } from '@/constants/astrology';
import type { Profile } from '@/utils/database';

type Props = {
  profile: Pick<Profile, 'birthDate' | 'birthTime' | 'birthCity' | 'birthLat' | 'birthLng' | 'birthTz'>;
  /** Maximum width in px. The chart fills its container up to this width. */
  size?: number;
};

type Pt = [number, number];
type PlanetItem = { name: string; retro: boolean };

// Chart is drawn in a fixed 300 x 300 box and scaled by the SVG viewBox.
const S = 300;
const PAD = 2;
const L0 = PAD;
const L1 = S - PAD;
const H = S / 2;
const Q1 = (L0 + H) / 2;       // quarter points of the square
const Q3 = (H + L1) / 2;

// Key points of the North Indian layout.
const TL: Pt = [L0, L0], TR: Pt = [L1, L0], BL: Pt = [L0, L1], BR: Pt = [L1, L1];
const T: Pt = [H, L0], R: Pt = [L1, H], B: Pt = [H, L1], L: Pt = [L0, H];
const C: Pt = [H, H];
const A: Pt = [Q1, Q1], A2: Pt = [Q3, Q1], D: Pt = [Q1, Q3], E: Pt = [Q3, Q3];

/**
 * Houses 1..12, counter-clockwise from the top-centre diamond. `inner` is the
 * vertex nearest the chart centre, where the sign number sits.
 */
const HOUSES: { pts: Pt[]; inner: Pt }[] = [
  { pts: [T, A, C, A2],  inner: C },   // 1  top diamond
  { pts: [TL, T, A],     inner: A },   // 2  top-left triangle
  { pts: [TL, A, L],     inner: A },   // 3  left-upper triangle
  { pts: [L, A, C, D],   inner: C },   // 4  left diamond
  { pts: [L, D, BL],     inner: D },   // 5  left-lower triangle
  { pts: [BL, D, B],     inner: D },   // 6  bottom-left triangle
  { pts: [B, D, C, E],   inner: C },   // 7  bottom diamond
  { pts: [B, E, BR],     inner: E },   // 8  bottom-right triangle
  { pts: [BR, E, R],     inner: E },   // 9  right-lower triangle
  { pts: [R, E, C, A2],  inner: C },   // 10 right diamond
  { pts: [R, A2, TR],    inner: A2 },  // 11 right-upper triangle
  { pts: [TR, A2, T],    inner: A2 },  // 12 top-right triangle
];

const centroid = (pts: Pt[]): Pt => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const toPoints = (pts: Pt[]) => pts.map((p) => `${p[0]},${p[1]}`).join(' ');

// Houses 3, 5, 9, 11 (indices 2, 4, 8, 10) are tall, narrow side triangles:
// stack their planets in a column. Top/bottom triangles are wide and shallow:
// lay planets out in a row.
const SIDE_TRIANGLES = new Set([2, 4, 8, 10]);

type Shape = 'diamond' | 'side' | 'flat';

function layoutFor(n: number, shape: Shape) {
  const fs = n <= 2 ? 12 : n <= 4 ? 10.5 : n <= 6 ? 9 : 8;
  let cols: number;
  if (shape === 'side')      cols = n <= 3 ? 1 : 2;
  else if (shape === 'flat') cols = n <= 3 ? n : 3;
  else                       cols = n <= 2 ? n : n <= 6 ? 2 : 3;
  const colW = shape === 'side' ? fs * 2.3 : fs * 2.6;
  return { fs, cols: Math.max(cols, 1), colW, rowH: fs * 1.3 };
}

export function KundliChart({ profile, size = 420 }: Props) {
  const { theme } = useAccent();
  const { t } = useTranslation(['profile', 'astro']);
  const lng = useAppLanguage();
  const styles = useIndicStyles(baseStyles);
  const { chartPositions, ascDeg } = useAstrology(profile);

  const hasPlanets = chartPositions.length > 0;
  const moon = chartPositions.find((p) => p.name === 'Moon');
  const isMoonChart = ascDeg === null;
  const lagnaSign =
    ascDeg !== null ? Math.floor(ascDeg / 30) : moon ? moon.signIndex : null;

  // house index (0..11) -> planets in it (whole-sign houses)
  const houses: PlanetItem[][] = Array.from({ length: 12 }, () => []);
  if (lagnaSign !== null) {
    for (const p of chartPositions) {
      const h = (((p.signIndex - lagnaSign) % 12) + 12) % 12;
      houses[h].push({ name: p.name, retro: p.retrograde && p.name !== 'Rahu' && p.name !== 'Ketu' });
    }
  }

  const abbr = (name: string) => t(`astro:planetShort.${name}`, { defaultValue: name });
  const num = (n: number) => localizeDigits(String(n), lng);

  const a11yLabel = (() => {
    if (lagnaSign === null) return t('profile:chart.a11yEmpty');
    const head = isMoonChart
      ? t('profile:chart.a11yMoon', { sign: tSign(ZODIAC[lagnaSign].name, lng) })
      : t('profile:chart.a11yLagna', { sign: tSign(ZODIAC[lagnaSign].name, lng) });
    const parts = houses.map((list, i) =>
      t('profile:chart.a11yHouse', {
        n: num(i + 1),
        planets: list.length ? list.map((p) => tPlanet(p.name, lng)).join(', ') : t('profile:chart.a11yNone'),
      }),
    );
    return `${head} ${parts.join('. ')}.`;
  })();

  return (
    <View style={[styles.wrap, { maxWidth: size }]}>
      <View
        style={styles.square}
        accessible
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${S} ${S}`}>
          <Rect x={L0} y={L0} width={L1 - L0} height={L1 - L0} rx={6} fill={theme.surface} />

          {/* Lagna house tint */}
          {lagnaSign !== null && (
            <Polygon points={toPoints(HOUSES[0].pts)} fill={theme.accent} fillOpacity={0.14} />
          )}

          {/* Frame, diagonals, inner diamond */}
          <Rect
            x={L0} y={L0} width={L1 - L0} height={L1 - L0} rx={6}
            fill="none" stroke={theme.accent} strokeWidth={1.5}
          />
          <Line x1={TL[0]} y1={TL[1]} x2={BR[0]} y2={BR[1]} stroke={theme.accent} strokeWidth={1.5} />
          <Line x1={TR[0]} y1={TR[1]} x2={BL[0]} y2={BL[1]} stroke={theme.accent} strokeWidth={1.5} />
          <Polygon points={toPoints([T, R, B, L])} fill="none" stroke={theme.accent} strokeWidth={1.5} strokeLinejoin="round" />

          {lagnaSign !== null && hasPlanets && HOUSES.map((house, i) => {
            const isDiamond = house.pts.length === 4;
            const list = houses[i];
            const signNo = ((lagnaSign + i) % 12) + 1;
            const cen = centroid(house.pts);
            const numPos = lerp(house.inner, cen, isDiamond ? 0.3 : 0.38);
            const shape: Shape = isDiamond ? 'diamond' : SIDE_TRIANGLES.has(i) ? 'side' : 'flat';
            // Planet block centre: diamonds sit a little toward the outer
            // corner; triangles at their centroid (the widest safe spot).
            const block: Pt = isDiamond ? lerp(house.inner, cen, 1.25) : cen;
            const { fs, cols, colW, rowH } = layoutFor(list.length, shape);
            const rows = Math.ceil(list.length / cols);

            return (
              <G key={i}>
                <SvgText
                  x={numPos[0]} y={numPos[1]}
                  textAnchor="middle" alignmentBaseline="central"
                  fontSize={9}
                  fontWeight={i === 0 ? '700' : '400'}
                  fill={i === 0 ? theme.accent : theme.muted}
                >
                  {num(signNo)}
                </SvgText>
                {list.map((p, k) => {
                  const r = Math.floor(k / cols);
                  const inRow = r === rows - 1 ? list.length - r * cols : cols;
                  const c = k - r * cols;
                  const x = block[0] + (c - (inRow - 1) / 2) * colW;
                  const y = block[1] + (r - (rows - 1) / 2) * rowH;
                  return (
                    <SvgText
                      key={p.name}
                      x={x} y={y}
                      textAnchor="middle" alignmentBaseline="central"
                      fontSize={fs}
                      fontWeight="600"
                      fill={theme.ink}
                    >
                      {abbr(p.name)}
                      {p.retro && (
                        <TSpan fontSize={fs * 0.7} fontWeight="400" fill={theme.ink2}>
                          {t('astro:retroMark')}
                        </TSpan>
                      )}
                    </SvgText>
                  );
                })}
              </G>
            );
          })}
        </Svg>
      </View>
      {isMoonChart && hasPlanets && (
        <Text style={[styles.caption, { color: theme.muted }]}>{t('profile:chart.moonCaption')}</Text>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrap: { width: '100%', alignSelf: 'center' },
  square: { width: '100%', aspectRatio: 1 },
  caption: { fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 8 },
});
