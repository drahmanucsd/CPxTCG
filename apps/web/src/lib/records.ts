/**
 * Records: the user's own audio for a tune — a full mix or separated stems (from Moises, Demucs, …).
 * Stored locally as blobs. Played on the audio clock so sync with the chart is sample-accurate.
 */
import { db, type RecordRow, type StemRef } from '../db';

export const STEM_NAMES = ['vocals', 'drums', 'bass', 'piano', 'guitar', 'other', 'mix'] as const;
export type StemName = (typeof STEM_NAMES)[number];

export function stemNameFromFile(name: string): StemName {
  const n = name.toLowerCase();
  if (/vocal|voice|vox/.test(n)) return 'vocals';
  if (/drum|perc/.test(n)) return 'drums';
  if (/bass/.test(n)) return 'bass';
  if (/piano|keys|rhodes/.test(n)) return 'piano';
  if (/guitar/.test(n)) return 'guitar';
  if (/other|horn|sax|trumpet|melody/.test(n)) return 'other';
  return 'mix';
}

export async function addRecord(songId: string, tuneTitle: string, files: File[]): Promise<RecordRow> {
  const id = `rec-${Date.now().toString(36)}`;
  const stems: StemRef[] = [];
  for (const f of files) {
    const blobId = `${id}-${stems.length}`;
    await db.audio.put({ id: blobId, blob: f, name: f.name, createdAt: Date.now() });
    const name = files.length === 1 ? 'mix' : stemNameFromFile(f.name);
    stems.push({ name, blobId, gain: 1, muted: name === 'piano' });
  }
  const row: RecordRow = { id, songId, tuneTitle, label: files.length === 1 ? files[0]!.name : `${files.length} stems`, stems, createdAt: Date.now() };
  await db.records.put(row);
  return row;
}

export interface LoadedStem { ref: StemRef; buffer: AudioBuffer }

export async function loadStems(ctx: AudioContext, rec: RecordRow): Promise<LoadedStem[]> {
  const out: LoadedStem[] = [];
  for (const ref of rec.stems) {
    const row = await db.audio.get(ref.blobId);
    if (!row) continue;
    const buffer = await ctx.decodeAudioData(await row.blob.arrayBuffer());
    out.push({ ref, buffer });
  }
  return out;
}

/** A set of stems playing in lockstep with per-stem gain/mute. */
export class StemPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private gains = new Map<string, GainNode>();
  startTime: number | null = null;
  constructor(private readonly ctx: AudioContext, readonly stems: LoadedStem[]) {
    for (const s of stems) { const g = ctx.createGain(); g.gain.value = s.ref.muted ? 0 : s.ref.gain; g.connect(ctx.destination); this.gains.set(s.ref.name + s.ref.blobId, g); }
  }
  get duration(): number { return Math.max(0, ...this.stems.map((s) => s.buffer.duration)); }
  play(at: number, offset = 0): void {
    this.stop();
    this.startTime = at - offset;
    for (const s of this.stems) {
      const src = this.ctx.createBufferSource();
      src.buffer = s.buffer;
      src.connect(this.gains.get(s.ref.name + s.ref.blobId)!);
      src.start(at, offset);
      this.sources.push(src);
    }
  }
  stop(): void { for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } } this.sources = []; this.startTime = null; }
  /** current position in the recording (seconds) */
  position(now: number): number { return this.startTime === null ? 0 : now - this.startTime; }
  setStem(key: string, gain: number, muted: boolean): void { const g = this.gains.get(key); if (g) g.gain.setTargetAtTime(muted ? 0 : gain, this.ctx.currentTime, 0.02); }
}
