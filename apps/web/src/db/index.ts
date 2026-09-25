import Dexie, { type Table } from 'dexie';
import type { DrillSpec, DrillSummary, TargetResult } from '@shed/engine';
import type { Melody, Song, TimingReport } from '@shed/theory';

export interface AttemptRow extends TargetResult {
  id?: number;
  sessionId: string;
  specId: string;
  ts: number;
  /** quality class + family + root, denormalized for the heatmap */
  root: number;
  suffix: string;
}

export interface SessionRow {
  id: string;
  specId: string;
  specName: string;
  startedAt: number;
  endedAt: number;
  total: number;
  correct: number;
  avgLatenessMs: number | null;
  finalBpm: number;
  hintsUsed: number;
  summary: DrillSummary;
  /** what was actually played: [type(1=on,0=off), note, seconds from session start, velocity] */
  midi?: Array<[number, number, number, number]>;
}

export interface DrillRow { id: string; spec: DrillSpec; createdAt: number; updatedAt: number; custom: boolean }

export interface StemRef { name: string; blobId: string; gain: number; muted: boolean }
export interface RecordRow { id: string; songId: string; tuneTitle: string; label: string; stems: StemRef[]; bpm?: number; anchorSec?: number; createdAt: number }
export interface AudioRow { id: string; blob: Blob; name: string; createdAt: number }

export interface ImageRow { id: string; blob: Blob; width: number; height: number; createdAt: number }

export interface SongRow { id: string; title: string; composer: string; source: Song['source']; song: Song; updatedAt: number; status?: 'new' | 'learning' | 'known' }

/**
 * A head, as the user played it or typed it.
 *
 * No melody ships with the app (see CLAUDE.md): for anything still in copyright the reference
 * line is one you recorded yourself, which is also the better exercise.
 */
export interface MelodyRow { songId: string; title: string; melody: Melody; formBeats: number; updatedAt: number }

/** One timed run of a head, kept so "is my time getting better" has an answer. */
export interface TakeRow {
  id?: number;
  songId: string;
  title: string;
  at: number;
  bpm: number;
  swing: boolean;
  clickBeats: number[] | null;
  bars: number;
  /** denormalized for the history list without deserialising the whole report */
  steadiness: number;
  spreadMs: number;
  medianMs: number;
  playedBpm: number | null;
  swingRatio: number | null;
  /** null when the run had no written melody to compare against */
  melodyMatch: number | null;
  report: TimingReport;
}

export class ShedDB extends Dexie {
  attempts!: Table<AttemptRow, number>;
  sessions!: Table<SessionRow, string>;
  drills!: Table<DrillRow, string>;
  songs!: Table<SongRow, string>;
  images!: Table<ImageRow, string>;
  records!: Table<RecordRow, string>;
  audio!: Table<AudioRow, string>;
  melodies!: Table<MelodyRow, string>;
  takes!: Table<TakeRow, number>;
  constructor() {
    super('shed');
    this.version(1).stores({
      attempts: '++id, sessionId, specId, ts, [root+suffix], family, ok',
      sessions: 'id, specId, startedAt',
      drills: 'id, updatedAt',
    });
    this.version(2).stores({
      attempts: '++id, sessionId, specId, ts, [root+suffix], family, ok',
      sessions: 'id, specId, startedAt',
      drills: 'id, updatedAt',
      songs: 'id, title, source, updatedAt',
    });
    this.version(3).stores({
      attempts: '++id, sessionId, specId, ts, [root+suffix], family, ok',
      sessions: 'id, specId, startedAt',
      drills: 'id, updatedAt',
      songs: 'id, title, source, updatedAt',
      images: 'id',
    });
    this.version(4).stores({
      attempts: '++id, sessionId, specId, ts, [root+suffix], family, ok',
      sessions: 'id, specId, startedAt',
      drills: 'id, updatedAt',
      songs: 'id, title, source, updatedAt',
      images: 'id',
      records: 'id, songId, createdAt',
      audio: 'id',
    });
    this.version(5).stores({
      attempts: '++id, sessionId, specId, ts, [root+suffix], family, ok',
      sessions: 'id, specId, startedAt',
      drills: 'id, updatedAt',
      songs: 'id, title, source, updatedAt',
      images: 'id',
      records: 'id, songId, createdAt',
      audio: 'id',
      melodies: 'songId, updatedAt',
      takes: '++id, songId, at',
    });
  }
}

export const db = new ShedDB();
