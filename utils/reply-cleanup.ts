/**
 * Chat reply post-processing — pure string functions (no React Native
 * imports, so the whole pipeline runs under `node --test`).
 *
 *   token stream ──createThinkStreamFilter──▶ streaming buffer (live bubble,
 *                                             shown via cleanForDisplay)
 *   streaming buffer ──cleanFinalReply──▶ stored message content
 *
 * Every step is conservative: well-formed prose passes through unchanged
 * except for the documented edits (jargon, ISO dates, scaffolding labels,
 * sentence loops, leaked tags).
 */
import { splitRecsBlock, stripRecsForDisplay } from './recommendation-rules';

// ─── <think> handling ────────────────────────────────────────────────────────

export const THINK_OPEN  = '<think>';
export const THINK_CLOSE = '</think>';

/**
 * Remove <think>...</think> reasoning blocks that thinking-mode models
 * (Qwen 3) emit before the actual reply. Also handles orphan opening or
 * closing tags — small models sometimes emit a lone "</think>" without ever
 * opening one, or vice versa.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')   // paired
    .replace(/<think>[\s\S]*$/g, '')             // unclosed open (drop everything after)
    .replace(/^[\s\S]*?<\/think>/, '')           // orphan close at start
    .replace(/<\/?think>/g, '')                  // any leftover tags
    .trim();
}

export type ThinkStreamEvents = {
  /** Visible text that is safe to append to the streaming buffer. */
  emit:          (text: string) => void;
  /** A think block started — the caller wipes any pre-amble it showed. */
  enterThinking: () => void;
};

/**
 * Streaming filter that hides <think>...</think> from the visible buffer.
 * Token boundaries can split tags, so it works off an accumulating buffer and
 * holds back only a tag-sized tail. Visible text is emitted verbatim: the
 * concatenation of every `emit` equals the input minus think blocks.
 *
 *  - <think> after some pre-amble ("Sure! <think>...") → enterThinking so the
 *    caller can wipe the pre-amble.
 *  - </think> with no preceding <think> (the model truncated the opener) →
 *    everything before the closer is thinking; hide it.
 */
export function createThinkStreamFilter(events: ThinkStreamEvents) {
  let buf     = '';
  let inThink = false;

  return {
    push(token: string): void {
      buf += token;
      // Pump the buffer through the state machine until no more boundaries
      // are visible this iteration.
      for (;;) {
        if (!inThink) {
          const openIdx  = buf.indexOf(THINK_OPEN);
          const closeIdx = buf.indexOf(THINK_CLOSE);

          if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
            events.enterThinking();
            buf = buf.slice(closeIdx + THINK_CLOSE.length);
            continue;
          }

          if (openIdx === -1) {
            // No tag — emit the safe prefix, keep a tail in case a partial
            // tag bridges into the next chunk. The tail must fit the longer
            // tag: holding back only `<think>`-sized tails let a split orphan
            // `</think>` slip through undetected.
            const safeEnd = Math.max(0, buf.length - (THINK_CLOSE.length - 1));
            if (safeEnd > 0) {
              events.emit(buf.slice(0, safeEnd));
              buf = buf.slice(safeEnd);
            }
            return;
          }
          buf = buf.slice(openIdx + THINK_OPEN.length);
          inThink = true;
          events.enterThinking();
        } else {
          const end = buf.indexOf(THINK_CLOSE);
          if (end === -1) {
            // Still thinking — drop all but a tail for a partial close tag.
            buf = buf.slice(Math.max(0, buf.length - (THINK_CLOSE.length - 1)));
            return;
          }
          buf = buf.slice(end + THINK_CLOSE.length);
          inThink = false;
        }
      }
    },
    /** Flush trailing safe text (unless the stream ended mid-think). */
    end(): void {
      if (!inThink && buf.length > 0) events.emit(buf);
      buf = '';
    },
  };
}

/**
 * Defensive scrub for the chat bubble — drop any <think>...</think> blocks,
 * orphan tags, raw `<think` fragments and the trailing <recs> block before
 * they reach the markdown renderer.
 */
export function cleanForDisplay(raw: string): string {
  return stripRecsForDisplay(
    raw
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*$/g, '')
      .replace(/^[\s\S]*?<\/think>/, '')
      .replace(/<\/?think[^>]*>?/g, ''),
  ).trim();
}

// ─── Degenerate-output guards ────────────────────────────────────────────────

// Sentence end: . ! ? (optionally followed by closing quotes/brackets) before
// whitespace or the end of the text. "3.5" and "e.g" don't count.
const SENTENCE_END = /[.!?…]["'”’)]*(?=\s|$)/g;

// Inline HTML a model may use instead of markdown — harmless, just unwrap it.
const HARMLESS_HTML = /<\/?(?:b|i|em|strong|u|br|p|span)\s*\/?>/gi;

// Tag- or placeholder-shaped fragments that never belong in a chat reply once
// <think>/<recs> are gone: "<upch", "</x", "twoch>", "[upch]" (a markdown
// link "[text](url)" is not debris).
const MARKUP_DEBRIS = /<\/?[A-Za-z]|[A-Za-z]\/?>|\[[^\]\n]{0,40}\](?!\()/;

/**
 * Small models (LFM2.5 350M) sometimes collapse mid-reply into tag-like
 * gibberish ("…Job Switch—[upch]twoch>threeuch>"). Keep the complete
 * sentences before the first such fragment and drop the rest. If no complete
 * sentence precedes it, nothing is salvageable and '' is returned (the caller
 * surfaces a retryable failure rather than storing gibberish).
 */
export function cutAtMarkupDebris(text: string): string {
  const unwrapped = text.replace(HARMLESS_HTML, '');
  const m = MARKUP_DEBRIS.exec(unwrapped);
  if (!m) return unwrapped;
  const head = unwrapped.slice(0, m.index);
  let lastEnd = -1;
  for (const s of head.matchAll(SENTENCE_END)) lastEnd = (s.index ?? 0) + s[0].length;
  return lastEnd === -1 ? '' : head.slice(0, lastEnd).trim();
}

/**
 * Output-length budget for models whose .pte bakes in a large max-new-tokens
 * (executorch exposes no per-call cap). Past `maxChars` the reply ends at the
 * next sentence end — the rest of that token is dropped and `stop` asks the
 * caller to interrupt generation. At twice the budget it stops regardless.
 */
export function createReplyBudget(maxChars: number) {
  let used = 0;
  let done = false;
  return {
    feed(token: string): { text: string; stop: boolean } {
      if (done) return { text: '', stop: true };
      const start = used;
      used += token.length;
      if (used < maxChars) return { text: token, stop: false };
      let cut = -1;
      for (const s of token.matchAll(SENTENCE_END)) {
        cut = (s.index ?? 0) + s[0].length;
        if (start + cut >= maxChars) break;   // first sentence end past the budget
      }
      if (cut !== -1) {
        done = true;
        return { text: token.slice(0, cut), stop: true };
      }
      if (used >= maxChars * 2) {
        done = true;
        return { text: token.slice(0, Math.max(0, maxChars * 2 - start)), stop: true };
      }
      return { text: token, stop: false };
    },
  };
}

const HEADLINE_MIN_WORDS = 3;
const HEADLINE_MAX_WORDS = 14;

/**
 * Drop a Title-Cased headline line ("Your Chart Says About Career This
 * Season") the model put above its actual answer. Only fires when the first
 * line has no sentence punctuation, reads as Title Case, and real text
 * follows — a reply that is ONLY a headline is left alone.
 */
export function stripLeadingHeadline(text: string): string {
  const m = /^[ \t]*([^\n]+?)[ \t]*\n+(?=[\s\S]*\S)/.exec(text);
  if (!m) return text;
  const line = m[1];
  if (/[.!?:,;…]["'”’)]*$/.test(line)) return text;
  const words = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < HEADLINE_MIN_WORDS || words.length > HEADLINE_MAX_WORDS) return text;
  const capitalised = words.filter((w) => /^[^A-Za-z]*[A-Z]/.test(w)).length;
  if (capitalised / words.length < 0.75) return text;
  return text.slice(m[0].length);
}

/**
 * Trim runaway sentence-level repetition that small LLMs fall into when their
 * generation lacks a repetition penalty. Stops at the first sentence we've
 * already shown (case-insensitive). Whitespace between kept sentences —
 * including paragraph breaks — is preserved.
 *
 * Conservative — only kicks in when there's a near-verbatim duplicate; the
 * model is free to re-use short connectors ("but", "still") without penalty.
 */
export function dedupeRepetition(text: string): string {
  // [sentence, separator, sentence, separator, ..., sentence]
  const parts = text.split(/(?<=[.!?])(\s+)/);
  if (Math.ceil(parts.length / 2) < 4) return text;

  const seen = new Set<string>();
  let out = '';
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const sep      = parts[i + 1] ?? '';
    const norm = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    // Don't dedupe very short sentences ("Right.", "Yes.") — too false-positive prone.
    if (norm.length >= 15) {
      if (seen.has(norm)) break;   // loop detected — drop everything from here
      seen.add(norm);
    }
    out += sentence + sep;
  }
  return out.trim();
}

// ─── Format / jargon scrubbing ───────────────────────────────────────────────

/**
 * Strip structural artifacts small models leak from prompt scaffolding —
 * "Part 1 — your voice", duplicated "— From the Gita:" prefixes, etc.
 * Applied to every chat reply; harmless for replies that don't contain them.
 */
export function stripChatArtifacts(text: string): string {
  return text
    // Drop "Part 1 — heading text" style labels (with em-dash, en-dash, hyphen, or colon)
    .replace(/^[ \t]*Part\s+\d+\s*[—\-–:][^\n]*\n?/gim, '')
    .replace(/Part\s+\d+\s*[—\-–:]\s*(your voice|from the gita)[:.]?\s*/gi, '')
    // Collapse repeated "— From the Gita:" prefixes into a single, normalized one
    .replace(/(?:[—\-–]\s*From\s+the\s+Gita\s*[:\s]+){2,}/gi, '— From the Gita:\n')
    // Normalize a single occurrence so it always sits on its own line
    .replace(/[—\-–]\s*From\s+the\s+Gita\s*:\s*/gi, '\n— From the Gita:\n')
    // Clean the artifacts of all of the above
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n+/, '')
    .trim();
}

/**
 * Defensive post-processing for chat replies — strips astrology jargon and
 * raw dates that small on-device models leak even when explicitly banned in
 * the system prompt. Replaces Sanskrit period names with plain English and
 * collapses ISO-format dates to just the year.
 *
 * Examples:
 *   "during the Mahadasha of Jupiter" → "during the Jupiter phase"
 *   "your current Mahadasha (Saturn)" → "your current Saturn phase"
 *   "by 2031-08-12"                   → "by 2031"
 */
export function stripJargon(text: string): string {
  return text
    // "(<planet>) Mahadasha" / "Mahadasha of <planet>" → "<planet> phase"
    .replace(/\bMahadasha\s+of\s+([A-Z][a-z]+)\b/g, '$1 phase')
    .replace(/\b([A-Z][a-z]+)['’]?s?\s+Mahadasha\b/g, '$1 phase')
    .replace(/\(\s*Mahadasha\s+([A-Z][a-z]+)\s*\)/g, '($1 phase)')
    .replace(/\(\s*([A-Z][a-z]+)\s+Mahadasha\s*\)/g, '($1 phase)')
    .replace(/\bMahadasha\b/g, 'life phase')
    .replace(/\bantardasha\b/gi, 'sub-period')
    .replace(/\b(maha\s*)?dasha\b/gi, 'phase')
    // Lone Sanskrit terms that don't have a clean replacement → drop them
    .replace(/\b(nakshatra|rashi|lagna|kundli|janma\s+star)\b/gi, '')
    // Collapse raw ISO dates (YYYY-MM-DD) to the year alone
    .replace(/\b(\d{4})-\d{2}-\d{2}\b/g, '$1')
    // Clean up artifacts. IMPORTANT: only collapse horizontal whitespace
    // (spaces, tabs) — never newlines. Markdown paragraphs depend on \n\n.
    .replace(/[ \t]+([,.;:])/g, '$1')
    .replace(/\([ \t]+/g, '(')
    .replace(/[ \t]+\)/g, ')')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strip markdown formatting that small/medium LLMs leak even when prompted
 * with "no markdown" rules. Used for thread titles; chat replies keep their
 * markdown (the bubble renders it).
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')         // **bold**
    .replace(/__([^_\n]+)__/g, '$1')              // __bold__
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1') // *italic*
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')     // _italic_
    .replace(/^#{1,6}\s+/gm, '')                  // ## headers
    .replace(/^[-*+]\s+/gm, '')                   // - bullets
    .replace(/^\d+\.\s+/gm, '')                   // 1. ordered list
    .replace(/`([^`\n]+)`/g, '$1')                // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')      // [text](url)
    .replace(/\n{3,}/g, '\n\n')                   // collapse extra blank lines
    .trim();
}

// ─── Full pipeline ───────────────────────────────────────────────────────────

/**
 * The streaming buffer → stored message content. Order matters — markdown
 * stays (the chat bubble renders it) but everything else harmful or
 * off-format goes:
 *  - splitRecsBlock / stripRecsForDisplay : drop the trailing <recs> block
 *  - stripThinking        : remove <think>...</think> blocks
 *  - cutAtMarkupDebris    : cut a small model's tag-shaped gibberish tail
 *  - stripLeadingHeadline : drop a Title-Case headline above the answer
 *  - stripJargon          : translate Sanskrit + collapse raw ISO dates
 *  - stripChatArtifacts   : remove "Part 1" labels, dedupe Gita prefixes
 *  - dedupeRepetition     : trim sentence-level loops
 * Returns '' when nothing usable is left.
 */
export function cleanFinalReply(raw: string): string {
  const { prose } = splitRecsBlock(raw);
  const noTags = stripThinking(stripRecsForDisplay(prose));
  return dedupeRepetition(
    stripChatArtifacts(stripJargon(stripLeadingHeadline(cutAtMarkupDebris(noTags)))),
  ).trim();
}
