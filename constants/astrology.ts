export type ZodiacElement = 'Fire' | 'Earth' | 'Air' | 'Water';

export type ZodiacSign = {
  name: string;
  glyph: string;
  element: ZodiacElement;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  description: string;
};

// Zodiac index: Aries=0 … Pisces=11
export const ZODIAC: ZodiacSign[] = [
  { name: 'Aries',       glyph: '♈', element: 'Fire',  startMonth: 3,  startDay: 21, endMonth: 4,  endDay: 19, description: 'Bold, ambitious, and driven by passion.' },
  { name: 'Taurus',      glyph: '♉', element: 'Earth', startMonth: 4,  startDay: 20, endMonth: 5,  endDay: 20, description: 'Grounded, patient, and deeply sensual.' },
  { name: 'Gemini',      glyph: '♊', element: 'Air',   startMonth: 5,  startDay: 21, endMonth: 6,  endDay: 20, description: 'Curious, adaptable, and endlessly communicative.' },
  { name: 'Cancer',      glyph: '♋', element: 'Water', startMonth: 6,  startDay: 21, endMonth: 7,  endDay: 22, description: 'Intuitive, nurturing, and deeply emotional.' },
  { name: 'Leo',         glyph: '♌', element: 'Fire',  startMonth: 7,  startDay: 23, endMonth: 8,  endDay: 22, description: 'Confident, creative, and naturally magnetic.' },
  { name: 'Virgo',       glyph: '♍', element: 'Earth', startMonth: 8,  startDay: 23, endMonth: 9,  endDay: 22, description: 'Analytical, precise, and quietly devoted.' },
  { name: 'Libra',       glyph: '♎', element: 'Air',   startMonth: 9,  startDay: 23, endMonth: 10, endDay: 22, description: 'Balanced, charming, and deeply fair-minded.' },
  { name: 'Scorpio',     glyph: '♏', element: 'Water', startMonth: 10, startDay: 23, endMonth: 11, endDay: 21, description: 'Intense, perceptive, and transformative.' },
  { name: 'Sagittarius', glyph: '♐', element: 'Fire',  startMonth: 11, startDay: 22, endMonth: 12, endDay: 21, description: 'Philosophical, free-spirited, and endlessly curious.' },
  { name: 'Capricorn',   glyph: '♑', element: 'Earth', startMonth: 12, startDay: 22, endMonth: 1,  endDay: 19, description: 'Disciplined, ambitious, and quietly powerful.' },
  { name: 'Aquarius',    glyph: '♒', element: 'Air',   startMonth: 1,  startDay: 20, endMonth: 2,  endDay: 18, description: 'Original, humanitarian, and intellectually daring.' },
  { name: 'Pisces',      glyph: '♓', element: 'Water', startMonth: 2,  startDay: 19, endMonth: 3,  endDay: 20, description: 'Empathic, dreamy, and spiritually attuned.' },
];

export type Planet = {
  name: string;
  glyph: string;
  symbol: string;
  meaning: string;
  isShadow?: boolean; // true for Rahu/Ketu
};

export const PLANETS: Planet[] = [
  { name: 'Sun',     glyph: '☉', symbol: 'sun',     meaning: 'Core identity and ego' },
  { name: 'Moon',    glyph: '☽', symbol: 'moon',    meaning: 'Emotions and instincts' },
  { name: 'Mercury', glyph: '☿', symbol: 'mercury', meaning: 'Communication and thought' },
  { name: 'Venus',   glyph: '♀', symbol: 'venus',   meaning: 'Love and beauty' },
  { name: 'Mars',    glyph: '♂', symbol: 'mars',    meaning: 'Drive and ambition' },
  { name: 'Jupiter', glyph: '♃', symbol: 'jupiter', meaning: 'Expansion and luck' },
  { name: 'Saturn',  glyph: '♄', symbol: 'saturn',  meaning: 'Discipline and karma' },
  { name: 'Rahu',    glyph: '☊', symbol: 'rahu',    meaning: 'Karmic north node', isShadow: true },
  { name: 'Ketu',    glyph: '☋', symbol: 'ketu',    meaning: 'Karmic south node', isShadow: true },
];

export type Nakshatra = {
  name: string;
  lord: string;   // Vimshottari dasha lord
  startDeg: number;
};

// 27 Nakshatras, each spanning 360/27 = 13.333...°
export const NAKSHATRAS: Nakshatra[] = [
  { name: 'Ashwini',            lord: 'Ketu',    startDeg: 0 },
  { name: 'Bharani',            lord: 'Venus',   startDeg: 13.333 },
  { name: 'Krittika',           lord: 'Sun',     startDeg: 26.667 },
  { name: 'Rohini',             lord: 'Moon',    startDeg: 40 },
  { name: 'Mrigashira',         lord: 'Mars',    startDeg: 53.333 },
  { name: 'Ardra',              lord: 'Rahu',    startDeg: 66.667 },
  { name: 'Punarvasu',          lord: 'Jupiter', startDeg: 80 },
  { name: 'Pushya',             lord: 'Saturn',  startDeg: 93.333 },
  { name: 'Ashlesha',           lord: 'Mercury', startDeg: 106.667 },
  { name: 'Magha',              lord: 'Ketu',    startDeg: 120 },
  { name: 'Purva Phalguni',     lord: 'Venus',   startDeg: 133.333 },
  { name: 'Uttara Phalguni',    lord: 'Sun',     startDeg: 146.667 },
  { name: 'Hasta',              lord: 'Moon',    startDeg: 160 },
  { name: 'Chitra',             lord: 'Mars',    startDeg: 173.333 },
  { name: 'Swati',              lord: 'Rahu',    startDeg: 186.667 },
  { name: 'Vishakha',           lord: 'Jupiter', startDeg: 200 },
  { name: 'Anuradha',           lord: 'Saturn',  startDeg: 213.333 },
  { name: 'Jyeshtha',           lord: 'Mercury', startDeg: 226.667 },
  { name: 'Mula',               lord: 'Ketu',    startDeg: 240 },
  { name: 'Purva Ashadha',      lord: 'Venus',   startDeg: 253.333 },
  { name: 'Uttara Ashadha',     lord: 'Sun',     startDeg: 266.667 },
  { name: 'Shravana',           lord: 'Moon',    startDeg: 280 },
  { name: 'Dhanishtha',         lord: 'Mars',    startDeg: 293.333 },
  { name: 'Shatabhisha',        lord: 'Rahu',    startDeg: 306.667 },
  { name: 'Purva Bhadrapada',   lord: 'Jupiter', startDeg: 320 },
  { name: 'Uttara Bhadrapada',  lord: 'Saturn',  startDeg: 333.333 },
  { name: 'Revati',             lord: 'Mercury', startDeg: 346.667 },
];

// Vimshottari dasha period lengths (years)
export const DASHA_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};

export const ELEMENT_COLORS: Record<ZodiacElement, string> = {
  Fire:  '#E8A87C',
  Earth: '#8FAF7C',
  Air:   '#9BB8D4',
  Water: '#9BA8D4',
};
