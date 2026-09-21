/**
 * Spoken chord names → ChordSymbol. Tolerant of speech-recognition output:
 * "b flat minor seven flat five", "E flat major seventh", "G seven altered", "D half diminished",
 * "C sharp minor", "F sharp seven sharp nine", "a minor 7" (digits), "see major seven" (mishearings).
 */
import { type ChordSymbol, tryParseChord } from './chord.js';

const LETTER_WORDS: Record<string, string> = {
  a: 'A', eh: 'A', ay: 'A', hey: 'A',
  b: 'B', be: 'B', bee: 'B',
  c: 'C', see: 'C', sea: 'C', si: 'C',
  d: 'D', de: 'D', dee: 'D', the: 'D',
  e: 'E', ee: 'E', he: 'E',
  f: 'F', ef: 'F', eff: 'F',
  g: 'G', gee: 'G', ji: 'G',
};
const NUM_WORDS: Record<string, string> = { five: '5', six: '6', seven: '7', seventh: '7', nine: '9', ninth: '9', eleven: '11', eleventh: '11', thirteen: '13', thirteenth: '13', two: '2', four: '4' };

export function spokenToChord(text: string): ChordSymbol | null {
  const t = text.toLowerCase().replace(/[^a-z0-9#♯♭ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const words = t.split(' ');
  // root
  let i = 0;
  let root = LETTER_WORDS[words[0]!];
  if (!root) {
    // "a flat" may come as "aflat", "bflat"…
    const m = /^([a-g])(flat|sharp)$/.exec(words[0]!);
    if (m) { root = m[1]!.toUpperCase(); words.splice(1, 0, m[2]!); }
  }
  if (!root) return null;
  i = 1;
  let acc = '';
  if (words[i] === 'flat' || words[i] === '♭') { acc = 'b'; i++; }
  else if (words[i] === 'sharp' || words[i] === '♯' || words[i] === '#') { acc = '#'; i++; }
  let rest = words.slice(i).join(' ');
  rest = rest.replace(/\b(\w+)\b/g, (w) => NUM_WORDS[w] ?? w);
  let out = '';
  const take = (re: RegExp, repl: string) => { if (re.test(rest)) { rest = rest.replace(re, ' '); out += repl; return true; } return false; };
  // qualities (order matters)
  if (take(/\bhalf ?diminished\b|\bhalf dim\b/, 'ø')) { /* seventh implied */ rest = rest.replace(/\b7\b/, ' '); }
  else if (take(/\bdiminished\b|\bdim\b/, '°')) { if (take(/\b7\b/, '7')) { /* dim7 */ } }
  else if (take(/\bminor major\b|\bminor maj\b/, 'mMaj')) { take(/\b(7|9)\b/, '7'); }
  else if (take(/\bminor\b|\bmin\b/, 'm')) {
    if (take(/\bmajor 7\b|\bmaj 7\b|\bmajor seventh\b/, 'Maj7')) { /* minMaj */ }
    else if (take(/\b(7|9|11|13|6)\b/, '$')) { /* placeholder */ }
  } else if (take(/\bmajor\b|\bmaj\b/, 'maj')) {
    if (!take(/\b(7|9|13)\b/, '$')) { out = out.replace(/maj$/, ''); } // plain major triad
  } else if (take(/\baugmented\b|\baug\b/, '+')) { take(/\b7\b/, '7'); }
  else if (take(/\bsus ?(4|four)?\b|\bsuspended\b/, 'sus4')) { /* maybe 7sus4 later */ }
  else if (take(/\bdominant\b|\bdom\b/, '')) { /* handled by number */ }
  // pending number placeholder
  if (out.endsWith('$')) {
    const m = /\$/.exec(out);
    void m;
    const num = /(7|9|11|13|6)/.exec(text.toLowerCase().replace(/\b(\w+)\b/g, (w) => NUM_WORDS[w] ?? w).split(/minor|min|major|maj/).pop() ?? '');
    out = out.replace('$', num ? num[1]! : '7');
  } else if (/\b6\b/.test(rest) && !out) { out = '6'; rest = rest.replace(/\b6\b/, ' '); if (/\b9\b/.test(rest)) { out = '6/9'; rest = rest.replace(/\b9\b/, ' '); } }
  else if (/\b(7|9|11|13)\b/.test(rest) && !/maj|m|ø|°|\+/.test(out)) {
    const m = /\b(7|9|11|13)\b/.exec(rest)!;
    out += m[1]!;
    rest = rest.replace(m[0], ' ');
    if (out === '7' && /\bsus/.test(rest)) { out += 'sus4'; rest = rest.replace(/\bsus ?(4|four)?\b/, ' '); }
  }
  if (out === 'sus4' && /\b7\b/.test(rest)) { out = '7sus4'; rest = rest.replace(/\b7\b/, ' '); }
  // alterations
  if (/\baltered\b|\balt\b/.test(rest)) { out += 'alt'; rest = rest.replace(/\baltered\b|\balt\b/, ' '); if (!/7/.test(out)) out = '7' + out; }
  const altRe = /\b(flat|sharp)\s*(5|9|11|13)\b/g;
  let am: RegExpExecArray | null;
  while ((am = altRe.exec(rest))) out += (am[1] === 'flat' ? 'b' : '#') + am[2];
  rest = rest.replace(altRe, ' ');
  if (/\badd (9|2|4|11)\b/.test(rest)) { const m = /\badd (9|2|4|11)\b/.exec(rest)!; out += `add${m[1]}`; }
  // bass: "over E flat"
  let bass = '';
  const om = /\bover ([a-g]|see|sea|be|bee|dee|gee|eh|ay)\s*(flat|sharp)?/.exec(rest);
  if (om) { const l = LETTER_WORDS[om[1]!] ?? om[1]!.toUpperCase(); bass = `/${l}${om[2] === 'flat' ? 'b' : om[2] === 'sharp' ? '#' : ''}`; }
  const sym = `${root}${acc}${out}${bass}`;
  return tryParseChord(sym);
}

/** Navigation commands a drill understands. */
export type VoiceCommand = 'next' | 'again' | 'slower' | 'faster' | 'stop' | 'pause' | 'resume' | 'hint' | 'play';
export function spokenToCommand(text: string): VoiceCommand | null {
  const t = text.toLowerCase().trim();
  if (/^(next|skip|go on)\b/.test(t)) return 'next';
  if (/^(again|repeat|one more)/.test(t)) return 'again';
  if (/^slower|slow down/.test(t)) return 'slower';
  if (/^faster|speed up/.test(t)) return 'faster';
  if (/^(stop|end|finish|quit)\b/.test(t)) return 'stop';
  if (/^(pause|hold on|wait)\b/.test(t)) return 'pause';
  if (/^(resume|continue|go)\b/.test(t)) return 'resume';
  if (/^(hint|help|show me)\b/.test(t)) return 'hint';
  if (/^(play it|play that|reference)\b/.test(t)) return 'play';
  return null;
}
