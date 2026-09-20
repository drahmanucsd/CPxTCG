import { AudioClock, ClickSynth, SynthPiano, Transport, type Instrument } from '@shed/engine';
import { useSettings } from '../store/settings';

let ctx: AudioContext | null = null;
let clock: AudioClock | null = null;
let click: ClickSynth | null = null;
let piano: Instrument | null = null;
let transport: Transport | null = null;

export function getAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    clock = new AudioClock(ctx);
    click = new ClickSynth(ctx);
    piano = new SynthPiano(ctx);
    transport = new Transport(clock, click, { bpm: 120 });
    const s = useSettings.getState();
    click.volume = s.clickVolume;
    (piano as SynthPiano).volume = s.pianoVolume;
    useSettings.subscribe((st) => { if (click) click.volume = st.clickVolume; if (piano && 'volume' in piano) (piano as SynthPiano).volume = st.pianoVolume; });
  }
  return { ctx: ctx!, clock: clock!, click: click!, piano: piano!, transport: transport! };
}

/** Browsers require a user gesture to start audio. Call from a click handler. */
export async function unlockAudio(): Promise<void> {
  const { ctx, clock } = getAudio();
  if (ctx.state !== 'running') await ctx.resume();
  clock.resync();
}

export function playVoicing(notes: number[], durationSec = 1.2): void {
  const { ctx, piano } = getAudio();
  if (ctx.state !== 'running') void ctx.resume();
  piano.playChord(notes, ctx.currentTime + 0.02, durationSec, 0.8);
}
