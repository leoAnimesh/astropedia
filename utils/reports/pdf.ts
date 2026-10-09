/**
 * Report → printable HTML for "Save as PDF" (expo-print renders it in the
 * system web view: WKWebView on iOS, Android WebView). Pure, so Node tests
 * can check the output.
 *
 * Fonts: the app's Instrument Serif and Geist are embedded as base64
 * @font-face when the caller passes them (utils/reports/pdf-io.ts reads the
 * bundled .ttf assets). Neither has Devanagari or Bengali glyphs, so every
 * stack continues with the system Indic fonts of both platforms — iOS
 * "Kohinoor Devanagari" / "Kohinoor Bangla" (plus the older "Devanagari
 * Sangam MN" / "Bangla Sangam MN"), Android "Noto Sans Devanagari" / "Noto
 * Sans Bengali" (and the "Noto Serif" pair for headings) — and the web view
 * falls back per glyph. <html lang> is set so shaping picks the right script.
 * Same layout and tokens as the report screen (light theme).
 */
import type { Chapter, ReportPayload } from './types';

export type PdfFonts = {
  serif?: string;       // InstrumentSerif-Regular, base64 TTF
  serifItalic?: string; // InstrumentSerif-Italic
  sans?: string;        // Geist-Regular
  sansMedium?: string;  // Geist-Medium
};

export type PdfLabels = {
  /** "Career & money · Animesh". */
  heading: string;
  /** "Animesh · from birth chart". */
  subheading: string;
  inOneLine: string;
  why: string;
  helpsNote: string;
  /** "Made on this phone with Astropedia on 9 Oct 2026." */
  made: string;
  /** Approximate-chart note, or ''. */
  approx: string;
  /** "of 36 points", compat partner only. */
  ofPoints?: string;
  scoreNote?: string;
  marsCheck?: string;
};

const LIGHT = {
  bg: '#faf9f6', surface: '#ffffff', surface2: '#f3f1ec', ink: '#1d1a14', ink2: '#4a463c', muted: '#8a8578',
  faint: '#b6b1a3', hairline: 'rgba(29,26,20,0.10)', hairline2: 'rgba(29,26,20,0.18)', tile: 'rgba(180,130,0,0.10)',
};

const INDIC_SANS = `"Kohinoor Devanagari", "Kohinoor Bangla", "Devanagari Sangam MN", "Bangla Sangam MN", "Noto Sans Devanagari", "Noto Sans Bengali"`;
const INDIC_SERIF = `"Noto Serif Devanagari", "Noto Serif Bengali", ${INDIC_SANS}`;
export const FONT_STACK = {
  serif: `"Instrument Serif", ${INDIC_SERIF}, Georgia, "Times New Roman", serif`,
  sans: `"Geist", ${INDIC_SANS}, -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif`,
  mono: `"Geist Mono", ui-monospace, Menlo, "Roboto Mono", monospace, ${INDIC_SANS}`,
};

/** Escapes text for HTML; keeps the report's one allowed tag, <em>. */
export function esc(s: string, allowEm = false): string {
  const out = String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return allowEm ? out.replace(/&lt;(\/?)em&gt;/g, '<$1em>') : out;
}

function fontFaces(f: PdfFonts): string {
  const face = (family: string, data: string | undefined, weight: number, style = 'normal') =>
    data ? `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${data}) format("truetype");font-weight:${weight};font-style:${style};}` : '';
  return [
    face('Instrument Serif', f.serif, 400),
    face('Instrument Serif', f.serifItalic, 400, 'italic'),
    face('Geist', f.sans, 400),
    face('Geist', f.sansMedium, 500),
  ].join('');
}

function chapterHtml(c: Chapter, n: number, labels: PdfLabels, accent: string): string {
  const num = String(n).padStart(2, '0');
  const head = `<div class="ch-head"><span class="ch-n" style="color:${accent}">${num}</span><h2>${esc(c.title)}</h2></div>`;
  if (c.type === 'helps') {
    const rows = c.items.map((h) => `<div class="help"><span class="tick" style="color:${accent}">✓</span><div><div class="help-t">${esc(h.t)}</div><div class="help-s">${esc(h.s)}</div></div></div>`).join('');
    return `<section class="ch">${head}<div class="card">${rows}</div><p class="note">${esc(labels.helpsNote)}</p></section>`;
  }
  const why = `<div class="why"><b>${esc(labels.why)}</b> ${esc(c.why)}</div>`;
  if (c.type === 'timing') {
    const rows = c.items.map((t) => `<div class="tl ${t.state}"><div class="tl-dot" style="${t.state === 'now' ? `background:${accent};border-color:${accent}` : t.state === 'soon' ? `border-color:${accent}` : ''}"></div><div class="tl-body"><div class="tl-meta"><span class="tl-date" style="${t.state === 'now' ? `color:${accent}` : ''}">${esc(t.date)}</span><span class="tag">${esc(t.tag)}</span></div><div class="tl-title">${esc(t.title)}</div><div class="tl-sub">${esc(t.sub)}</div></div></div>`).join('');
    return `<section class="ch">${head}<p class="body">${esc(c.body, true)}</p><div class="timeline">${rows}</div>${why}</section>`;
  }
  const items = c.items.length
    ? `<ul>${c.items.map((it) => `<li><span class="dot" style="background:${c.tone === 'watch' ? LIGHT.faint : accent}"></span>${esc(it)}</li>`).join('')}</ul>`
    : '';
  return `<section class="ch">${head}<p class="body">${esc(c.body, true)}</p>${items}${why}</section>`;
}

export function reportHtml(r: ReportPayload, labels: PdfLabels, opts: { accent?: string; fonts?: PdfFonts } = {}): string {
  const accent = opts.accent ?? '#C68B2F';
  const c = LIGHT;
  const glance = r.summary.glance.map((g) => `<div class="g"><div class="gk">${esc(g.k)}</div><div class="gv">${esc(g.v)}</div></div>`).join('');
  const focus = r.summary.focus
    ? `<div class="focus"><div class="focus-row"><span class="focus-l">${esc(r.summary.focus.label)}</span><span class="bars">${[1, 2, 3].map((i) => `<i style="background:${i <= r.summary.focus!.dots ? accent : c.hairline2}"></i>`).join('')}</span></div><div class="focus-r">${esc(r.summary.focus.reason)}</div></div>`
    : '';
  const sc = r.compat?.score;
  const scoreTop = sc
    ? `<div class="score"><span class="big">${esc(String(sc.total))}</span><span class="of">${esc(labels.ofPoints ?? '')}</span><span class="band">${esc(sc.band)}</span></div>
       <div class="note">${esc(labels.scoreNote ?? '')}</div>`
    : '';
  const score = sc
    ? `<div class="kootas">${sc.kootas.map((k) => `<div class="k"><div class="kn">${esc(k.name)} <span class="kt">${esc(k.trad)}</span></div><div class="kb"><i style="width:${Math.round((k.score / k.max) * 100)}%;background:${accent}"></i></div><div class="ks">${esc(`${k.score}/${k.max}`)}</div></div>`).join('')}</div>
       <div class="why"><b>${esc(labels.marsCheck ?? '')}</b> ${esc(sc.mars)}</div>`
    : '';
  const chapters = r.chapters.map((ch, i) => chapterHtml(ch, i + 1, labels, accent)).join('');
  return `<!doctype html>
<html lang="${esc(r.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(labels.heading)}</title>
<style>
${fontFaces(opts.fonts ?? {})}
@page{margin:16mm 14mm}
*{box-sizing:border-box}
html,body{margin:0;background:${c.bg};color:${c.ink};font-family:${FONT_STACK.sans};font-size:11pt;line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
em{font-family:${FONT_STACK.serif};font-style:italic}
.wrap{max-width:680px;margin:0 auto;padding:8px 4px}
.eyebrow{font-family:${FONT_STACK.mono};font-size:8.5pt;letter-spacing:.08em;text-transform:uppercase;color:${c.muted}}
:lang(hi) .eyebrow,:lang(bn) .eyebrow{letter-spacing:0;text-transform:none}
h1{font-family:${FONT_STACK.serif};font-weight:400;font-size:22pt;line-height:1.25;margin:4px 0 0}
.sub{color:${c.muted};font-size:9.5pt;margin-bottom:14px}
.top{padding:10px 14px;border-radius:12px;background:${c.surface2};color:${c.ink2};font-size:9.5pt;margin-bottom:12px}
.summary{border:1px solid ${c.hairline};background:${c.surface};border-radius:16px;overflow:hidden;margin-bottom:18px;page-break-inside:avoid}
.summary .in{padding:14px 16px}
.line{font-family:${FONT_STACK.serif};font-size:17pt;line-height:1.35;margin:6px 0 0}
.g{display:flex;gap:12px;padding:8px 16px;border-top:1px solid ${c.hairline}}
.gk{flex:none;width:110px;color:${c.muted};font-size:9.5pt}
.gv{flex:1;font-size:10.5pt}
.focus{padding:10px 16px;border-top:1px solid ${c.hairline};background:${c.surface2}}
.focus-row{display:flex;align-items:center;gap:8px}
.focus-l{flex:1;font-weight:500;font-size:10pt}
.bars i{display:inline-block;width:18px;height:5px;border-radius:3px;margin-left:3px}
.focus-r{color:${c.ink2};font-size:9pt;margin-top:4px}
.score{display:flex;align-items:baseline;gap:8px;margin-top:6px}
.big{font-family:${FONT_STACK.serif};font-size:34pt;line-height:1}
.of{color:${c.ink2}}
.band{margin-left:auto;font-family:${FONT_STACK.mono};font-size:8pt;padding:2px 8px;border-radius:999px;background:${c.tile}}
.kootas{margin:8px 0}
.k{display:flex;align-items:center;gap:10px;padding:3px 0}
.kn{flex:1;font-size:9.5pt}.kt{font-family:${FONT_STACK.mono};font-size:7.5pt;color:${c.muted}}
.kb{width:90px;height:4px;border-radius:2px;background:${c.hairline};overflow:hidden}.kb i{display:block;height:4px}
.ks{width:34px;text-align:right;font-family:${FONT_STACK.mono};font-size:8.5pt;color:${c.ink2}}
.ch{margin:0 0 20px;page-break-inside:auto}
.ch-head{display:flex;align-items:baseline;gap:10px;page-break-after:avoid}
.ch-n{font-family:${FONT_STACK.mono};font-size:9pt}
h2{font-family:${FONT_STACK.serif};font-style:italic;font-weight:400;font-size:17pt;margin:0}
.body{margin:6px 0}
ul{list-style:none;margin:6px 0;padding:0}
li{display:flex;gap:10px;color:${c.ink2};margin:4px 0}
.dot{flex:none;width:6px;height:6px;border-radius:3px;margin-top:8px}
.why{margin-top:8px;padding:10px 12px;border-radius:12px;background:${c.surface2};color:${c.ink2};font-size:9pt;page-break-inside:avoid}
.timeline{margin:8px 0}
.tl{display:flex;gap:12px;page-break-inside:avoid}
.tl-dot{flex:none;width:10px;height:10px;border-radius:50%;border:2px solid ${c.faint};background:${c.bg};margin-top:5px}
.tl.now .tl-dot{width:12px;height:12px}
.tl-body{flex:1;padding-bottom:10px;border-left:0}
.tl-meta{display:flex;gap:8px;align-items:center}
.tl-date{font-family:${FONT_STACK.mono};font-size:8.5pt;color:${c.muted}}
.tag{font-family:${FONT_STACK.mono};font-size:7.5pt;padding:1px 6px;border-radius:999px;border:1px solid ${c.hairline2};color:${c.muted};text-transform:uppercase}
:lang(hi) .tag,:lang(bn) .tag{text-transform:none}
.tl-title{font-weight:500}
.tl-sub{color:${c.ink2};font-size:10pt}
.card{border:1px solid ${c.hairline};background:${c.surface};border-radius:14px;overflow:hidden}
.help{display:flex;gap:10px;padding:10px 14px;border-top:1px solid ${c.hairline};page-break-inside:avoid}
.help:first-child{border-top:0}
.tick{flex:none;font-weight:600}
.help-t{font-weight:500}.help-s{color:${c.ink2};font-size:10pt}
.note{color:${c.muted};font-size:9pt;margin-top:6px}
.foot{margin-top:24px;padding-top:10px;border-top:1px solid ${c.hairline};color:${c.muted};font-size:8.5pt}
</style></head>
<body><div class="wrap">
<div class="eyebrow">${esc(labels.subheading)}</div>
<h1>${esc(labels.heading)}</h1>
<div class="sub">${esc(labels.made)}</div>
${r.topNote ? `<div class="top">${esc(r.topNote)}</div>` : ''}
${labels.approx ? `<div class="top">${esc(labels.approx)}</div>` : ''}
<div class="summary"><div class="in"><div class="eyebrow">${esc(r.summary.eyebrow)}</div>${scoreTop}<p class="line">${esc(r.summary.line, true)}</p>${score}</div>${glance}${focus}</div>
${chapters}
<div class="foot">${esc(r.disclaimer)}</div>
</div></body></html>`;
}
