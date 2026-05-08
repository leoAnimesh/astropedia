import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useAccent } from '@/hooks/use-accent';
import { useAstrology } from '@/hooks/use-astrology';
import { ZODIAC, ELEMENT_COLORS } from '@/constants/astrology';
import type { Profile } from '@/utils/database';

type Props = {
  profile: Pick<Profile, 'birthDate' | 'birthTime' | 'birthCity' | 'birthLat' | 'birthLng'>;
  size?: number;
};

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r1: number, r2: number, startDeg: number, endDeg: number): string {
  const [x1o, y1o] = polar(cx, cy, r2, startDeg);
  const [x2o, y2o] = polar(cx, cy, r2, endDeg);
  const [x1i, y1i] = polar(cx, cy, r1, startDeg);
  const [x2i, y2i] = polar(cx, cy, r1, endDeg);
  return `M ${x1o} ${y1o} A ${r2} ${r2} 0 0 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${r1} ${r1} 0 0 0 ${x1i} ${y1i} Z`;
}

export function BirthChart({ profile, size = 290 }: Props) {
  const { theme } = useAccent();
  const { sunSign, chartPositions, ascDeg } = useAstrology(profile);

  const cx = size / 2;
  const cy = size / 2;
  const rOuter    = size / 2 - 4;
  const rGlyph    = rOuter - 20;
  const rInner    = rOuter - 40;
  const rHouseRing = rInner - 8;
  const rHouseNum  = rInner - 24;
  const rPlanet    = rHouseNum - 20;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>

        {/* Element-tinted zodiac sector backgrounds */}
        {ZODIAC.map((z, i) => (
          <Path
            key={`sector-${z.name}`}
            d={arcPath(cx, cy, rInner, rOuter, i * 30, (i + 1) * 30)}
            fill={ELEMENT_COLORS[z.element]}
            opacity={0.18}
          />
        ))}

        {/* Ring borders */}
        <Circle cx={cx} cy={cy} r={rOuter}     fill="none" stroke={theme.hairline2} strokeWidth={0.75} />
        <Circle cx={cx} cy={cy} r={rInner}     fill="none" stroke={theme.hairline}  strokeWidth={0.5} />
        <Circle cx={cx} cy={cy} r={rHouseRing} fill="none" stroke={theme.hairline}  strokeWidth={0.5} />

        {/* 12 sector dividers (outer ring) */}
        {Array.from({ length: 12 }).map((_, i) => {
          const [x1, y1] = polar(cx, cy, rInner, i * 30);
          const [x2, y2] = polar(cx, cy, rOuter, i * 30);
          return <Line key={`div-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={theme.hairline2} strokeWidth={0.6} />;
        })}

        {/* Zodiac glyphs */}
        {ZODIAC.map((z, i) => {
          const [x, y] = polar(cx, cy, rGlyph, i * 30 + 15);
          const isSun = sunSign?.name === z.name;
          return (
            <SvgText
              key={z.name}
              x={x} y={y}
              textAnchor="middle"
              alignmentBaseline="central"
              fontSize={13}
              fill={isSun ? theme.accent : theme.ink2}
              fontWeight={isSun ? '700' : '400'}
            >
              {z.glyph}
            </SvgText>
          );
        })}

        {/* House numbers */}
        {Array.from({ length: 12 }).map((_, i) => {
          const [x, y] = polar(cx, cy, rHouseNum, i * 30 + 15);
          return (
            <SvgText
              key={`h-${i}`}
              x={x} y={y}
              textAnchor="middle"
              alignmentBaseline="central"
              fontSize={7.5}
              fill={theme.faint}
            >
              {String(i + 1).padStart(2, '0')}
            </SvgText>
          );
        })}

        {/* ASC line */}
        {ascDeg !== null && (
          <>
            <Line
              x1={cx} y1={cy}
              x2={polar(cx, cy, rInner - 2, ascDeg)[0]}
              y2={polar(cx, cy, rInner - 2, ascDeg)[1]}
              stroke={theme.accent}
              strokeWidth={1.2}
              strokeDasharray="3 2"
            />
            {(() => {
              const [ax, ay] = polar(cx, cy, rHouseNum - 4, ascDeg);
              return (
                <SvgText x={ax} y={ay} textAnchor="middle" alignmentBaseline="central" fontSize={7} fill={theme.accent}>
                  ASC
                </SvgText>
              );
            })()}
          </>
        )}

        {/* Planet glyphs (stagger overlapping planets by ±8° offset) */}
        {chartPositions.map((p, i) => {
          const stagger = (i % 2 === 0 ? 1 : -1) * (i % 4 > 1 ? 14 : 0);
          const r = rPlanet + stagger;
          const [x, y] = polar(cx, cy, r, p.degree);
          const isShadow = p.name === 'Rahu' || p.name === 'Ketu';
          return (
            <G key={p.name}>
              <Circle
                cx={x} cy={y} r={9.5}
                fill={theme.surface}
                stroke={isShadow ? theme.muted : theme.hairline2}
                strokeWidth={isShadow ? 0.8 : 0.5}
                strokeDasharray={isShadow ? '2 1.5' : undefined}
              />
              <SvgText
                x={x} y={y}
                textAnchor="middle"
                alignmentBaseline="central"
                fontSize={10.5}
                fill={isShadow ? theme.muted : theme.ink}
              >
                {p.glyph}
              </SvgText>
            </G>
          );
        })}

        {/* Center dot */}
        <Circle cx={cx} cy={cy} r={3.5} fill={theme.accent} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
  },
});
