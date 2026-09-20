import catalogJson from '../../../../data/backing-catalog.json';
import { titleKey } from '@shed/theory';

export interface CatalogTrack { videoId: string; title: string; channel?: string; bpm?: number; key?: string; anchorSec?: number; verified: boolean; durationSec?: number }
const catalog = catalogJson as { version: number; tracks: Record<string, CatalogTrack[]> };

/** Best known backing track for a tune title: a verified one first, else the top curated candidate. */
export function catalogTrack(title: string): CatalogTrack | null {
  const list = catalog.tracks[titleKey(title)] ?? [];
  return list.find((t) => t.verified) ?? list[0] ?? null;
}
