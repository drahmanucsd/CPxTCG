import { formatChord, type ChordSymbol } from '@shed/theory';

/** Quality suffix of a chord, e.g. "m7", "7alt" — used as a stats key. */
export function suffixOf(c: ChordSymbol): string {
  const t = formatChord(c, 'plain');
  const rest = t.slice(c.rootName.length);
  return rest.split('/')[0] || 'maj';
}

export const FAMILY_LABEL: Record<string, string> = {
  close: 'Close', inversions: 'Inv', shell: 'Shell', guide: 'LH 3-7', root37: 'LH root + RH 3-7', rootlessA: 'Rootless A', rootlessB: 'Rootless B', rootless3A: '3-note A', rootless3B: '3-note B',
  drop2: 'Drop 2', drop3: 'Drop 3', drop24: 'Drop 2+4', fourWayClose: 'Block', quartal: '4ths', quartal3: '4ths (3)', soWhat: 'So What', spread: 'Spread',
  twoHandRootless: '2H rootless', upperStructure: 'UST', kennyBarron: 'K. Barron', cluster: 'Cluster', sixNine: '6/9',
};
