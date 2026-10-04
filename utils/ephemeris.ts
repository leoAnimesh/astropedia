/**
 * Geocentric ephemeris: TROPICAL ecliptic longitudes (equinox of date) for
 * the Sun, Moon and the five classical planets, plus the mean lunar node.
 *
 * Pure math, no React Native or i18n imports, so it runs under Node too
 * (ml/data/gen_profiles.ts and the verification scripts).
 *
 * Methods
 * - Sun and planets: Paul Schlyter, "How to compute planetary positions"
 *   (osculating-style orbital elements of the date, solved with Kepler's
 *   equation, heliocentric → geocentric via the Sun's position), including
 *   his Jupiter/Saturn mutual perturbation terms.
 * - Moon: Meeus, Astronomical Algorithms ch. 47 (ELP-2000/82 truncation,
 *   the largest 59 periodic terms in longitude + the A1/A2/L'−F additive terms).
 *
 * Checked against JPL Horizons apparent ecliptic-of-date longitudes for
 * 1900–2100 (see the verification script in the change notes): Sun and Moon
 * within ~0.01°, planets within a few arc-minutes.
 *
 * All functions take a Julian Day in UT; ΔT (TT − UT) is added internally.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed difference a − b wrapped to (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  let d = norm360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/**
 * ΔT = TT − UT in seconds (Espenak & Meeus polynomial fits, NASA eclipse
 * site). Only matters for the Moon (~0.5″ of arc per second of time).
 */
export function deltaTSeconds(jdUT: number): number {
  const y = 2000 + (jdUT - 2451544.5) / 365.25;
  let t: number;
  if (y < 1900) { const u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4; }
  if (y < 1941) { t = y - 1920; return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3; }
  if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547; }
  if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718; }
  if (y < 2005) {
    t = y - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  }
  if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t ** 2; }
  if (y < 2150) { const u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y); }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

function toTT(jdUT: number): number {
  return jdUT + deltaTSeconds(jdUT) / 86400;
}

// ─── Sun and planets (Schlyter) ──────────────────────────────────────────────

/** [N, i, w, a, e, M] at d = 0 and their rates per day (d = JD_TT − 2451543.5). */
type Orbit = { el: [number, number, number, number, number, number]; rate: [number, number, number, number, number, number] };

const ORBITS: Record<'Sun' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn', Orbit> = {
  // For the Sun these are the elements of the Earth–Sun orbit seen from Earth.
  Sun:     { el: [0, 0, 282.9404, 1.0, 0.016709, 356.047],
             rate: [0, 0, 4.70935e-5, 0, -1.151e-9, 0.9856002585] },
  Mercury: { el: [48.3313, 7.0047, 29.1241, 0.387098, 0.205635, 168.6562],
             rate: [3.24587e-5, 5.0e-8, 1.01444e-5, 0, 5.59e-10, 4.0923344368] },
  Venus:   { el: [76.6799, 3.3946, 54.891, 0.72333, 0.006773, 48.0052],
             rate: [2.4659e-5, 2.75e-8, 1.38374e-5, 0, -1.302e-9, 1.6021302244] },
  Mars:    { el: [49.5574, 1.8497, 286.5016, 1.523688, 0.093405, 18.6021],
             rate: [2.11081e-5, -1.78e-8, 2.92961e-5, 0, 2.516e-9, 0.5240207766] },
  Jupiter: { el: [100.4542, 1.303, 273.8777, 5.20256, 0.048498, 19.895],
             rate: [2.76854e-5, -1.557e-7, 1.64505e-5, 0, 4.469e-9, 0.0830853001] },
  Saturn:  { el: [113.6634, 2.4886, 339.3939, 9.55475, 0.055546, 316.967],
             rate: [2.3898e-5, -1.081e-7, 2.97661e-5, 0, -9.499e-9, 0.0334442282] },
};

type PlanetName = keyof typeof ORBITS;

function elements(body: PlanetName, d: number) {
  const { el, rate } = ORBITS[body];
  const [N, i, w, a, e, M] = el.map((v, k) => v + rate[k] * d);
  return { N, i, w, a, e, M: norm360(M) };
}

/** Heliocentric ecliptic position (equinox of date): longitude °, latitude °, distance AU. */
function heliocentric(body: Exclude<PlanetName, 'Sun'>, d: number): { lon: number; lat: number; r: number } {
  const { N, i, w, a, e, M } = elements(body, d);
  const Mr = M * RAD;
  let E = Mr + e * Math.sin(Mr) * (1 + e * Math.cos(Mr));
  for (let k = 0; k < 10; k++) {
    const dE = (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const Nr = N * RAD, ir = i * RAD, vw = v + w * RAD;
  const xh = r * (Math.cos(Nr) * Math.cos(vw) - Math.sin(Nr) * Math.sin(vw) * Math.cos(ir));
  const yh = r * (Math.sin(Nr) * Math.cos(vw) + Math.cos(Nr) * Math.sin(vw) * Math.cos(ir));
  const zh = r * Math.sin(vw) * Math.sin(ir);
  let lon = Math.atan2(yh, xh) * DEG;
  let lat = Math.atan2(zh, Math.hypot(xh, yh)) * DEG;

  // Jupiter–Saturn mutual perturbations ("great inequality" etc.), degrees.
  if (body === 'Jupiter' || body === 'Saturn') {
    const Mj = elements('Jupiter', d).M * RAD;
    const Ms = elements('Saturn', d).M * RAD;
    const s = (x: number) => Math.sin(x * RAD);
    const c = (x: number) => Math.cos(x * RAD);
    const j = Mj * DEG, sa = Ms * DEG;
    if (body === 'Jupiter') {
      lon += -0.332 * s(2 * j - 5 * sa - 67.6)
           - 0.056 * s(2 * j - 2 * sa + 21)
           + 0.042 * s(3 * j - 5 * sa + 21)
           - 0.036 * s(j - 2 * sa)
           + 0.022 * c(j - sa)
           + 0.023 * s(2 * j - 3 * sa + 52)
           - 0.016 * s(j - 5 * sa - 69);
    } else {
      lon += 0.812 * s(2 * j - 5 * sa - 67.6)
           - 0.229 * c(2 * j - 4 * sa - 2)
           + 0.119 * s(j - 2 * sa - 3)
           + 0.046 * s(2 * j - 6 * sa - 69)
           + 0.014 * s(j - 3 * sa + 32);
      lat += -0.02 * c(2 * j - 4 * sa - 2) + 0.018 * s(2 * j - 6 * sa - 49);
    }
  }
  return { lon: norm360(lon), lat, r };
}

/** Geocentric Sun: true longitude (equinox of date) and distance in AU. */
function sunPosition(d: number): { lon: number; r: number } {
  const { w, e, M } = elements('Sun', d);
  const Mr = M * RAD;
  const E = Mr + e * Math.sin(Mr) * (1 + e * Math.cos(Mr));
  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv) * DEG;
  return { lon: norm360(v + w), r: Math.hypot(xv, yv) };
}

/** Light-time aberration of the Sun as seen from Earth (−20.5″). */
const SUN_ABERRATION = -20.4898 / 3600;

function planetGeocentric(body: Exclude<PlanetName, 'Sun'>, d: number): number {
  const sun = sunPosition(d);
  const xs = sun.r * Math.cos(sun.lon * RAD);
  const ys = sun.r * Math.sin(sun.lon * RAD);
  // One light-time iteration: the planet is seen where it was Δ/c ago.
  let h = heliocentric(body, d);
  for (let k = 0; k < 2; k++) {
    const xh = h.r * Math.cos(h.lat * RAD) * Math.cos(h.lon * RAD);
    const yh = h.r * Math.cos(h.lat * RAD) * Math.sin(h.lon * RAD);
    const zh = h.r * Math.sin(h.lat * RAD);
    const dist = Math.hypot(xh + xs, yh + ys, zh);
    h = heliocentric(body, d - 0.0057755183 * dist);
  }
  const xg = h.r * Math.cos(h.lat * RAD) * Math.cos(h.lon * RAD) + xs;
  const yg = h.r * Math.cos(h.lat * RAD) * Math.sin(h.lon * RAD) + ys;
  return norm360(Math.atan2(yg, xg) * DEG + SUN_ABERRATION * Math.cos((Math.atan2(yg, xg) * DEG - sun.lon) * RAD));
}

// ─── Moon (Meeus ch. 47) ──────────────────────────────────────────────────────

/** [D, M, M', F, Σl coefficient in 1e-6 °] — Meeus Table 47.A, longitude column. */
const MOON_TERMS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
  [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689],
  [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390], [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236],
  [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
  [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110], [3, 0, -1, 0, -892],
  [2, 1, 1, 0, -810], [4, -1, -2, 0, 759], [0, 2, -1, 0, -713], [2, 2, -1, 0, -700],
  [2, 1, -2, 0, 691], [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
  [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399], [0, 0, 2, -2, -381],
  [1, 1, 1, 0, 351], [3, 0, -2, 0, -340], [4, 0, -3, 0, 330], [2, -1, 2, 0, 327],
  [0, 2, 1, 0, -323], [1, 1, -1, 0, 299], [2, 0, 3, 0, 294],
];

function moonTropicalTT(jdTT: number): number {
  const T = (jdTT - 2451545.0) / 36525;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000);
  const D  = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000);
  const M  = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000);
  const F  = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000);
  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.29 * T);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;

  let sum = 0;
  for (const [d, m, mp, f, coef] of MOON_TERMS) {
    const arg = (d * D + m * M + mp * Mp + f * F) * RAD;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sum += coef * ecc * Math.sin(arg);
  }
  sum += 3958 * Math.sin(A1 * RAD) + 1962 * Math.sin((Lp - F) * RAD) + 318 * Math.sin(A2 * RAD);
  return norm360(Lp + sum / 1e6);
}

// ─── Nutation in longitude (main terms, ±17″) ────────────────────────────────

function nutationLongitude(jdTT: number): number {
  const T = (jdTT - 2451545.0) / 36525;
  const omega = (125.04452 - 1934.136261 * T) * RAD;
  const Ls = (280.4665 + 36000.7698 * T) * RAD;
  const Lm = (218.3165 + 481267.8813 * T) * RAD;
  return (-17.2 * Math.sin(omega) - 1.32 * Math.sin(2 * Ls) - 0.23 * Math.sin(2 * Lm) + 0.21 * Math.sin(2 * omega)) / 3600;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type Body = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn' | 'Rahu';

/**
 * Apparent geocentric TROPICAL ecliptic longitude (equinox of date) in degrees,
 * at the given Julian Day (UT). Rahu is the mean ascending lunar node.
 */
export function tropicalLongitude(body: Body, jdUT: number): number {
  const jdTT = toTT(jdUT);
  if (body === 'Rahu') {
    const T = (jdTT - 2451545.0) / 36525;
    return norm360(125.0445479 - 1934.1362608 * T + 0.0020754 * T * T);
  }
  const dpsi = nutationLongitude(jdTT);
  if (body === 'Moon') return norm360(moonTropicalTT(jdTT) + dpsi);
  const d = jdTT - 2451543.5;
  if (body === 'Sun') return norm360(sunPosition(d).lon + SUN_ABERRATION + dpsi);
  return norm360(planetGeocentric(body, d) + dpsi);
}

/**
 * Nutation in longitude (Δψ, degrees) at a Julian Day (UT). Apparent
 * longitudes include it; sidereal (Lahiri) longitudes take it back out
 * together with the mean ayanamsa, as Swiss Ephemeris does.
 */
export function nutationInLongitude(jdUT: number): number {
  return nutationLongitude(toTT(jdUT));
}

/** Daily motion in degrees/day (negative = retrograde), central difference over ±12 h. */
export function dailyMotion(body: Body, jdUT: number): number {
  return angleDiff(tropicalLongitude(body, jdUT + 0.5), tropicalLongitude(body, jdUT - 0.5));
}
