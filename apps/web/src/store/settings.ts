import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DisplayStyle, Spelling } from '@shed/theory';

export interface Settings {
  displayStyle: DisplayStyle;
  spelling: Spelling | 'key';
  latencyOffsetMs: number;
  midiDeviceId: string | null;
  clickVolume: number;
  pianoVolume: number;
  visualPulse: boolean;
  speakPrompts: boolean;
  level: 'learning' | 'tunes' | 'fluency';
  onboarded: boolean;
  /** chosen YouTube backing track per tune id */
  backingBySong: Record<string, { videoId: string; title: string; bpm?: number; anchorSec?: number; verified?: boolean; tuneTitle?: string }>;
  set: (patch: Partial<Settings>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      displayStyle: 'realbook', spelling: 'key', latencyOffsetMs: 0, midiDeviceId: null, clickVolume: 0.6, pianoVolume: 0.5,
      visualPulse: true, speakPrompts: false, level: 'fluency', onboarded: false, backingBySong: {},
      set: (patch) => set(patch),
    }),
    { name: 'shed.settings', partialize: (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v !== 'function')) as Partial<Settings> },
  ),
);
