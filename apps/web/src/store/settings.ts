import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DisplayStyle, Spelling } from '@shed/theory';

export interface Settings {
  displayStyle: DisplayStyle;
  spelling: Spelling | 'key';
  latencyOffsetMs: number;
  /** when the input latency was last measured; null = never, and timing verdicts cannot be trusted */
  calibratedAt: number | null;
  midiDeviceId: string | null;
  clickVolume: number;
  pianoVolume: number;
  visualPulse: boolean;
  speakPrompts: boolean;
  /** where hints appear: as text under the chord, on the keyboard, or both */
  hintStyle: 'text' | 'keyboard' | 'both' | 'off';
  level: 'learning' | 'tunes' | 'fluency';
  /** which stage of each voicing course you are on */
  courseStage: Record<string, import('@shed/engine').StageId>;
  onboarded: boolean;
  /** which stage of learning each tune is at */
  tuneStage: Record<string, import('@shed/engine').TuneStageId>;
  /** how many clean runs at the memory stage, per tune — steps the chart fade */
  tuneMemory: Record<string, number>;
  /**
   * One reference recording per tune: a link the learner picked, opened or embedded, never
   * synced and never searched for. The app does not choose your recording.
   */
  reference: Record<string, { url: string; label?: string }>;
  /** how the melody-timing screen is set up; remembered because you change it once and then work */
  melodyRun: {
    swing: boolean;
    subdivision: import('@shed/theory').Subdivision;
    clickBeats: number[] | null;
    /** audible click subdivision: 1 = quarters, 2 = eighths */
    clickSubdivision: number;
    countInBars: number;
    choruses: number;
    /** grade against the head you recorded, when there is one */
    useWritten: boolean;
  };
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      displayStyle: 'realbook', spelling: 'key', latencyOffsetMs: 0, calibratedAt: null, midiDeviceId: null, clickVolume: 0.6, pianoVolume: 0.5,
      visualPulse: true, speakPrompts: false, hintStyle: 'both', level: 'fluency', onboarded: false, courseStage: {}, tuneStage: {}, tuneMemory: {}, reference: {},
      melodyRun: { swing: true, subdivision: 'eighth', clickBeats: [1, 3], clickSubdivision: 1, countInBars: 1, choruses: 1, useWritten: true },
      set: (patch) => set(patch),
    }),
    { name: 'shed.settings', partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as Partial<Settings> },
  ),
);
