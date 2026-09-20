import type { ChordSymbol } from '@shed/theory';

const QUALITY_WORDS: Record<string, string> = {
  maj: '', min: 'minor', dom: '', halfdim: 'half diminished', dim: 'diminished', aug: 'augmented', sus4: 'sus four', sus2: 'sus two', minmaj: 'minor major', power: 'five',
};
const ROOT_WORDS: Record<string, string> = { '#': ' sharp', b: ' flat' };

/** "Dm7" → "D minor seven", "G7b9" → "G seven flat nine", "Cmaj7" → "C major seven" */
export function spokenChord(c: ChordSymbol): string {
  let s = c.rootName[0]! + (ROOT_WORDS[c.rootName[1] ?? ''] ?? '');
  const q = QUALITY_WORDS[c.quality] ?? '';
  if (q) s += ' ' + q;
  const ext = c.extensions.length ? Math.max(...c.extensions) : 7;
  if (c.seventh === 'maj7') s += (c.quality === 'minmaj' ? '' : ' major') + ' ' + numWord(ext);
  else if (c.seventh === 'min7' || c.seventh === 'dim7') s += ' ' + numWord(ext);
  else if (c.sixth) s += ' six' + (c.adds.includes(9) ? ' nine' : '');
  if (c.alt) s += ' altered';
  for (const a of c.alterations) s += ' ' + (a[0] === 'b' ? 'flat ' : 'sharp ') + numWord(+a.slice(1));
  if (c.bass !== null && c.bassName) s += ' over ' + c.bassName[0] + (ROOT_WORDS[c.bassName[1] ?? ''] ?? '');
  return s.replace(/\s+/g, ' ').trim();
}

function numWord(n: number): string {
  return { 5: 'five', 6: 'six', 7: 'seven', 9: 'nine', 11: 'eleven', 13: 'thirteen' }[n] ?? String(n);
}

export function speak(text: string): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.15;
  speechSynthesis.speak(u);
}
