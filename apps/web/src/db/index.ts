import Dexie, { type Table } from 'dexie';
import type { DrillSpec, DrillSummary, TargetResult } from '@shed/engine';
import type { Song } from '@shed/theory';

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
}

export interface DrillRow { id: string; spec: DrillSpec; createdAt: number; updatedAt: number; custom: boolean }

export interface SongRow { id: string; title: string; composer: string; source: Song['source']; song: Song; updatedAt: number; status?: 'new' | 'learning' | 'known' }

export class ShedDB extends Dexie {
  attempts!: Table<AttemptRow, number>;
  sessions!: Table<SessionRow, string>;
  drills!: Table<DrillRow, string>;
  songs!: Table<SongRow, string>;
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
  }
}

export const db = new ShedDB();
