/**
 * Speech input (Web Speech API): continuous recognition → chord names and commands.
 * Chrome/Edge: good. Safari: ok. Firefox: mostly unsupported. Falls back silently.
 */
import { type ChordSymbol, spokenToChord, spokenToCommand, type VoiceCommand } from '@shed/theory';
import { Emitter } from './clock.js';

export interface SpeechEvents extends Record<string, unknown> {
  chord: { chord: ChordSymbol; heard: string; time: number };
  command: { command: VoiceCommand; heard: string; time: number };
  transcript: { text: string; final: boolean };
  state: { listening: boolean };
  error: { message: string };
}

type RecognitionCtor = new () => SpeechRecognitionLike;
interface SpeechRecognitionLike {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

export function speechSupported(): boolean {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export class SpeechInput extends Emitter<SpeechEvents> {
  private rec: SpeechRecognitionLike | null = null;
  private wantListening = false;
  private lastHeard = '';
  private lastAt = 0;
  lang = 'en-US';

  start(): void {
    const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { this.emit('error', { message: 'Speech recognition is not available in this browser (use Chrome or Edge).' }); return; }
    this.wantListening = true;
    const rec = new Ctor();
    rec.continuous = true; rec.interimResults = true; rec.lang = this.lang; rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        const text = r[0]!.transcript.trim();
        this.emit('transcript', { text, final: r.isFinal });
        // act on final results, and on interim ones that already parse (lower latency)
        const now = performance.now();
        if (text === this.lastHeard && now - this.lastAt < 1500) continue;
        const cmd = spokenToCommand(text);
        if (cmd) { this.lastHeard = text; this.lastAt = now; this.emit('command', { command: cmd, heard: text, time: now }); continue; }
        const chord = spokenToChord(text) ?? (r.length > 1 ? spokenToChord(r[1]!.transcript) : null);
        if (chord && (r.isFinal || text.split(' ').length >= 2)) { this.lastHeard = text; this.lastAt = now; this.emit('chord', { chord, heard: text, time: now }); }
      }
    };
    rec.onerror = (e) => { if (e.error !== 'no-speech' && e.error !== 'aborted') this.emit('error', { message: `Speech: ${e.error}` }); };
    rec.onend = () => { this.emit('state', { listening: false }); if (this.wantListening) { try { rec.start(); this.emit('state', { listening: true }); } catch { /* ignore */ } } };
    this.rec = rec;
    try { rec.start(); this.emit('state', { listening: true }); } catch (e) { this.emit('error', { message: (e as Error).message }); }
  }

  stop(): void {
    this.wantListening = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    this.rec = null;
    this.emit('state', { listening: false });
  }
}
