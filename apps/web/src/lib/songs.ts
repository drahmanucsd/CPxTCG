import { analyzeSong, builtinSongs, formToChords, resolveForm, romanPerBar, transposeSong, type FormBar, type ProgressionChord, type Song } from '@shed/theory';
import type { DrillSpec, SongRef, BandSpec } from '@shed/engine';
import { db } from '../db';

export async function loadSong(id: string): Promise<Song | null> {
  const b = builtinSongs().find((s) => s.id === id);
  if (b) return b;
  const row = await db.songs.get(id);
  return row?.song ?? null;
}

export async function saveSong(song: Song): Promise<void> {
  await db.songs.put({ id: song.id, title: song.title, composer: song.composer ?? '', source: song.source, song, updatedAt: Date.now() });
}

export interface TunePracticeOptions {
  mode: 'changes' | 'quiz' | 'iiVs' | 'track' | 'record';
  families: string[];
  voiceLeading: 'strict' | 'off';
  band: BandSpec | null;
  bpm: number;
  transpose: number;
  /** inclusive form-bar range; null = whole form */
  range: [number, number] | null;
  passes: number;
  halfTime: boolean;
  strictness?: DrillSpec['strictness'];
  /** play the melody in the right hand: grade the left hand only */
  melody?: boolean;
  /** how much of the chart you get while playing — the memorisation ladder */
  reveal?: 'chart' | 'roman' | 'sections' | 'blank';
  youtube?: string;
  anchorSec?: number;
  recordId?: string;
}

function songRef(song: Song, form: FormBar[], from: number, to: number): SongRef {
  const ref: SongRef = {
    songId: song.id, title: song.title, from, to,
    bars: form.map((b) => ({ formIndex: b.formIndex, barIndex: b.barIndex, section: b.section, chords: b.chords.map((c) => ({ text: c.chord ? c.chord.text : 'N.C.', beats: c.beats })) })),
  };
  if (song.scan) ref.scan = song.scan;
  // numerals are computed once here so the drill screen can fade the chart down to them
  try { ref.romans = romanPerBar(song, analyzeSong(song)); } catch { /* an odd chart should not stop practice */ }
  return ref;
}

/** Build a drill spec that plays a tune's changes. */
export function tuneDrillSpec(base: Song, o: TunePracticeOptions): DrillSpec {
  const song = transposeSong(base, o.transpose);
  const form = resolveForm(song);
  const from = o.range ? o.range[0] : 0;
  const to = o.range ? o.range[1] : form.length - 1;
  const slice = form.slice(from, to + 1);
  let chords: ProgressionChord[] = formToChords(slice).map((c) => ({ chord: c.chord, beats: c.beats * (o.halfTime ? 2 : 1), formIndex: c.formIndex, barIndex: c.barIndex, beat: c.beat }));
  let name = `${song.title} — play the changes`;
  if (o.mode === 'iiVs') {
    const out: ProgressionChord[] = [];
    for (let i = 0; i < chords.length - 1; i++) {
      const a = chords[i]!.chord, b = chords[i + 1]!.chord;
      const isII = a.quality === 'min' && a.seventh === 'min7' || a.quality === 'halfdim';
      const isV = b.quality === 'dom' && ((b.root - a.root + 12) % 12) === 5;
      if (isII && isV) {
        out.push({ ...chords[i]!, beats: 4 }, { ...chords[i + 1]!, beats: 4 });
        const c = chords[i + 2]?.chord;
        if (c && ((c.root - b.root + 12) % 12) === 5) out.push({ ...chords[i + 2]!, beats: 4 });
        i += 1;
      }
    }
    chords = out;
    name = `${song.title} — the ii-Vs`;
  }
  if (o.mode === 'quiz') name = `${song.title} — chord quiz`;
  const timed = o.mode !== 'quiz';
  const spec: DrillSpec = {
    id: `tune-${song.id}-${o.mode}`,
    name,
    description: o.range ? `bars ${from + 1}–${to + 1}` : undefined,
    generator: { kind: 'progression', chords, label: song.title },
    families: o.families,
    strictness: o.strictness ?? (o.mode === 'quiz' ? 'chordTones' : 'family'),
    voiceLeading: o.voiceLeading,
    pacing: timed
      // a tune always moves with the bar: repeating one chord would break the form
      ? { mode: 'timed', bpm: o.bpm, beatsPerChord: 4, countInBars: 1, timeSig: { beats: song.timeSig[0], unit: song.timeSig[1] }, advance: 'onTime' }
      : { mode: 'free', bpm: 0, beatsPerChord: 4, countInBars: 0, timeSig: { beats: song.timeSig[0], unit: song.timeSig[1] }, holdMs: 400 },
    lookAhead: 'always',
    length: { passes: o.passes },
    prompt: o.mode === 'quiz' ? 'hidden' : 'symbol',
    tags: ['tune'],
    song: songRef(song, form, from, to),
  };
  if (o.melody) spec.hands = { grade: 'below' };
  if (o.reveal && o.reveal !== 'chart') { spec.song!.reveal = o.reveal; spec.id += `-${o.reveal}`; }
  if (o.band && timed) spec.band = { ...o.band, style: song.style };
  const vid = o.mode === 'track' && o.youtube ? youtubeId(o.youtube) : null;
  if (vid && timed) {
    spec.backing = { kind: 'youtube', videoId: vid, ...(o.anchorSec !== undefined ? { anchorSec: o.anchorSec, bpm: o.bpm } : {}) };
    spec.pacing.countInBars = o.anchorSec !== undefined ? 1 : 0; spec.band = undefined; spec.name = `${song.title} — with backing track`; spec.id += `-${vid}`;
  }
  if (o.mode === 'record' && o.recordId && timed) {
    spec.backing = { kind: 'record', recordId: o.recordId, ...(o.anchorSec !== undefined ? { anchorSec: o.anchorSec, bpm: o.bpm } : {}) };
    spec.pacing.countInBars = 1; spec.band = undefined; spec.name = `${song.title} — with the record`; spec.id += `-${o.recordId}`;
  }
  return spec;
}

export function youtubeId(url: string): string | null {
  const t = url.trim();
  if (/^[\w-]{11}$/.test(t)) return t;
  const m = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(t);
  return m ? m[1]! : null;
}
