/**
 * Build candidate backing tracks for a list of tune titles.
 *   YOUTUBE_API_KEY=… pnpm tsx scripts/curate-backing.ts titles.txt        (one title per line)
 *   YOUTUBE_API_KEY=… pnpm tsx scripts/curate-backing.ts --builtin         (the bundled library)
 * Writes/merges data/backing-catalog.json with up to 3 ranked, embeddable candidates per tune (verified: false).
 * Quota: ~100 units per search + 1 per details call; the free tier is 10,000/day ≈ 95 tunes/day.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { builtinSongs, titleKey } from '../packages/theory/src/index.ts';

const KEY = process.env['YOUTUBE_API_KEY'];
if (!KEY) { console.error('YOUTUBE_API_KEY missing'); process.exit(1); }
const arg = process.argv[2];
const titles = arg === '--builtin' ? builtinSongs().map((s) => s.title) : readFileSync(arg ?? 'titles.txt', 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
const catalogPath = new URL('../data/backing-catalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as { version: number; tracks: Record<string, Candidate[]> };

interface Candidate { videoId: string; title: string; channel: string; durationSec: number; bpm?: number; key?: string; score: number; verified: boolean; anchorSec?: number }

const GOOD_CHANNELS = [/learn jazz standards/i, /jazz backing tracks/i, /play ?along/i, /jamey aebersold/i, /quist/i, /jazz.?bass/i, /elevated jazz/i, /jazz tracks/i];
const BAD_WORDS = /tutorial|lesson|how to|cover|karaoke lyrics|drum cover|guitar cover|solo transcription|reaction|vlog/i;

function parseIso(d: string): number { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(d); return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : 0; }

async function search(title: string): Promise<Candidate[]> {
  const q = `"${title}" backing track`;
  const s = await (await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoSyndicated=true&maxResults=10&q=${encodeURIComponent(q)}&key=${KEY}`)).json() as { items?: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string } }> };
  const ids = (s.items ?? []).map((i) => i.id.videoId);
  if (!ids.length) return [];
  const d = await (await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,status&id=${ids.join(',')}&key=${KEY}`)).json() as { items?: Array<{ id: string; contentDetails: { duration: string }; statistics: { viewCount?: string }; status: { embeddable: boolean } }> };
  const details = new Map((d.items ?? []).map((i) => [i.id, i]));
  const tl = title.toLowerCase();
  const out: Candidate[] = [];
  for (const it of s.items ?? []) {
    const det = details.get(it.id.videoId);
    if (!det || !det.status.embeddable) continue;
    const t = it.snippet.title, ch = it.snippet.channelTitle;
    const dur = parseIso(det.contentDetails.duration);
    if (dur < 120 || dur > 900 || BAD_WORDS.test(t)) continue;
    let score = 0;
    if (t.toLowerCase().includes(tl)) score += 3;
    if (/backing track|play.?along|minus (one|piano)/i.test(t)) score += 2;
    if (GOOD_CHANNELS.some((re) => re.test(ch))) score += 3;
    if (/no piano|without piano|piano.?less|minus piano/i.test(t)) score += 2;
    score += Math.min(2, Math.log10(+(det.statistics.viewCount ?? '1')) / 3);
    const bpm = /(\d{2,3})\s*bpm/i.exec(t)?.[1];
    const key = /\b(?:in|key of)\s+([A-G][b#]?\s*(?:minor|major|m)?)\b/i.exec(t)?.[1];
    const c: Candidate = { videoId: it.id.videoId, title: t, channel: ch, durationSec: dur, score: Math.round(score * 10) / 10, verified: false };
    if (bpm) c.bpm = +bpm;
    if (key) c.key = key.trim();
    out.push(c);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

for (const title of titles) {
  const k = titleKey(title);
  if (catalog.tracks[k]?.some((c) => c.verified)) { console.log(`= ${title} (verified, skipped)`); continue; }
  try {
    const cands = await search(title);
    catalog.tracks[k] = cands;
    console.log(`${cands.length ? '+' : '-'} ${title}: ${cands.map((c) => `${c.title} [${c.score}]`).join(' | ') || 'no candidates'}`);
  } catch (e) { console.error(`! ${title}: ${(e as Error).message}`); }
  await new Promise((r) => setTimeout(r, 200));
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`wrote ${Object.keys(catalog.tracks).length} entries`);
