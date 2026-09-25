import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TUNE_STAGES, TUNE_STAGE_BY_ID, memoryReveal, nextTuneStage, tuneStageIndex, type BandSpec, type TuneStageId,
} from '@shed/engine';
import {
  chooseVoicing, difficultyOf, formToChords, generateVoicings, guideTones, resolveForm, songKeyName, transposeSong,
  type Song, type Voicing,
} from '@shed/theory';
import { ChordGrid, formBars } from '../components/ChordGrid';
import { SongAnalysis } from '../components/SongAnalysis';
import { BackLink } from '../components/BackLink';
import { db } from '../db';
import { loadSong, tuneDrillSpec, type TunePracticeOptions } from '../lib/songs';
import { STATUS_LABEL, STATUS_TONE, tuneProgress } from '../lib/repertoire';
import { FAMILY_LABEL } from '../lib/suffix';
import { useSettings } from '../store/settings';
import { playVoicing, unlockAudio } from '../audio/context';
import { addRecord } from '../lib/records';

const PRACTICE_FAMILIES = ['rootlessA', 'rootlessB', 'shell', 'guide', 'drop2', 'spread', 'twoHandRootless', 'quartal', 'upperStructure', 'fourWayClose'];

/**
 * A tune is a stage, not a page of options (docs/12-tune-stages.md).
 * The screen shows where you are, one thing to do, and the chart at the level that stage needs.
 * Everything else is behind Options.
 */
export default function Tune() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const [base, setBase] = useState<Song | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [options, setOptions] = useState(false);
  const [listening, setListening] = useState(false);
  const [refUrl, setRefUrl] = useState('');
  const [opts, setOpts] = useState<Omit<TunePracticeOptions, 'mode' | 'transpose' | 'range'>>({
    families: ['rootlessA', 'rootlessB'], voiceLeading: 'off',
    band: { style: 'swing', bass: true, drums: true, piano: false }, bpm: 120, passes: 2, halfTime: false,
  });

  useEffect(() => { void loadSong(decodeURIComponent(id ?? '')).then((s) => { setBase(s); if (s?.tempo) setOpts((o) => ({ ...o, bpm: s.tempo! })); }); }, [id]);
  useEffect(() => {
    let url: string | null = null;
    if (base?.scan) void db.images.get(base.scan.imageId).then((row) => { if (row) { url = URL.createObjectURL(row.blob); setImgUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [base]);

  const song = useMemo(() => (base ? transposeSong(base, transpose) : null), [base, transpose]);
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(400).toArray(), []) ?? [];
  const records = useLiveQuery(() => (base ? db.records.where('songId').equals(base.id).toArray() : Promise.resolve([] as import('../db').RecordRow[])), [base]) ?? [];
  const [recordId, setRecordId] = useState<string | null>(null);
  const form = useMemo(() => (song ? resolveForm(song) : []), [song]);
  if (!song || !base) return <div className="text-ink-dim">Loading…</div>;

  const stageId: TuneStageId = settings.tuneStage[base.id] ?? 'listen';
  const stage = TUNE_STAGE_BY_ID[stageId];
  const after = nextTuneStage(stageId);
  const prog = tuneProgress(sessions, base.id);
  const diff = difficultyOf(base);
  const reference = settings.reference[base.id];
  const cleanRuns = settings.tuneMemory[base.id] ?? 0;
  const reveal = stageId === 'memory' ? memoryReveal(cleanRuns) : stage.reveal;

  const setStage = (s: TuneStageId) => settings.set({ tuneStage: { ...settings.tuneStage, [base.id]: s } });

  /** Every stage compiles to a drill; the stage decides the settings, not the learner. */
  const go = async () => {
    if (stageId === 'listen') {
      if (reference?.url) window.open(reference.url, '_blank', 'noreferrer');
      else setOptions(true);
      return;
    }
    // the head is a line, not a set of chords: it gets timed, not graded (docs/13-melody-timing.md)
    if (stageId === 'melody') { nav(`/melody/${encodeURIComponent(base.id)}`); return; }
    const mode: TunePracticeOptions['mode'] =
      stageId === 'map' ? 'quiz' : stageId === 'perform' && records.length ? 'record' : 'changes';
    const families =
      stageId === 'roots' ? ['close'] : stageId === 'guide' ? ['guide'] : opts.families;
    const rec = mode === 'record' ? records.find((r) => r.id === (recordId ?? records[0]?.id)) : undefined;
    const spec = tuneDrillSpec(base, {
      ...opts, families, mode, transpose, range: sel,
      melody: stage.handSplit,
      reveal,
      band: stageId === 'perform' ? null : opts.band,
      ...(rec ? { recordId: rec.id, anchorSec: rec.anchorSec, bpm: rec.bpm ?? opts.bpm } : {}),
    });
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    nav(`/drill/${spec.id}`);
  };

  /** Play the changes back with model voicings — the ear before the hands. */
  const listen = async () => {
    await unlockAudio();
    const range = sel ? form.slice(sel[0], sel[1] + 1) : form;
    const chords = formToChords(range);
    const beat = 60 / (opts.bpm || song.tempo || 120);
    let prev: Voicing | null = null;
    let t = 0;
    setListening(true);
    for (const c of chords) {
      let cands: Voicing[] = [];
      for (const f of opts.families) cands = cands.concat(generateVoicings(c.chord, f));
      const v: Voicing | undefined = chooseVoicing(prev, cands) ?? cands[0];
      if (v) { const at = t; setTimeout(() => playVoicing(v.notes, Math.max(0.4, c.beats * beat * 0.95)), at * 1000); prev = v; }
      t += c.beats * beat;
    }
    setTimeout(() => setListening(false), t * 1000 + 300);
  };

  const remove = async () => { if (base.source !== 'builtin' && confirm('Delete this tune?')) { await db.songs.delete(base.id); nav('/tunes'); } };
  const onBarClick = (i: number, shift: boolean) => setSel((cur) => (shift && cur ? [Math.min(cur[0], i), Math.max(cur[1], i)] : [i, i]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <BackLink to="/tunes" label="Tunes" />
          <h1 className="text-3xl font-semibold tracking-tight truncate mt-1">{song.title}</h1>
          <div className="text-ink-dim flex flex-wrap items-center gap-2">
            <span>{song.composer}</span>
            <span className={`text-[10px] rounded px-1.5 py-0.5 ${STATUS_TONE[prog.status]}`}>{STATUS_LABEL[prog.status]}</span>
            <span className="text-xs text-ink-faint" title={diff.reasons.join(' · ')}>difficulty {diff.score}/5 · {diff.label}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-ink-dim">Key</span>
          <button className="btn btn-ghost !px-2 !py-1" onClick={() => setTranspose((t) => t - 1)}>♭</button>
          <span className="w-10 text-center font-medium">{songKeyName(song)}</span>
          <button className="btn btn-ghost !px-2 !py-1" onClick={() => setTranspose((t) => t + 1)}>♯</button>
          {transpose !== 0 && <button className="text-xs text-ink-faint hover:text-ink" onClick={() => setTranspose(0)}>reset</button>}
          <span className="text-ink-faint ml-2">{song.timeSig.join('/')} · {song.style}{song.tempo ? ` · ${song.tempo}` : ''}</span>
        </div>
      </div>

      {/* where you are, and the one thing to do */}
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="label">Stage {tuneStageIndex(stageId) + 1} of {TUNE_STAGES.length} · {stage.name}</div>
            <div className="text-lg mt-0.5">{stage.blurb}</div>
          </div>
          <div className="flex gap-2">
            {/* the head against the click is worth reaching from any stage, not only stage 2 */}
            <button className="btn btn-ghost" onClick={() => nav(`/rhythm/${encodeURIComponent(base.id)}`)}>Drill a rhythm</button>
            {stageId !== 'melody' && (
              <button className="btn btn-ghost" onClick={() => nav(`/melody/${encodeURIComponent(base.id)}`)}>Time the head</button>
            )}
            {stageId !== 'listen' && <button className="btn btn-ghost" disabled={listening} onClick={() => void listen()}>{listening ? 'Playing…' : 'Hear it'}</button>}
            <button className="btn btn-primary" onClick={() => void go()}>{stage.action}</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {TUNE_STAGES.map((s, i) => (
            <button
              key={s.id}
              title={s.blurb}
              className={`rounded-md px-2 py-1 text-xs ${s.id === stageId ? 'bg-accent text-bg' : i < tuneStageIndex(stageId) ? 'bg-good/20 text-good' : 'bg-panel-2 text-ink-faint hover:text-ink'}`}
              onClick={() => setStage(s.id)}
            >{i + 1}. {s.name}</button>
          ))}
        </div>
        {after && <div className="text-xs text-ink-faint">Next: {after.name} — {after.blurb}</div>}
      </section>

      {/* the chart, at the level this stage wants */}
      <div className="card overflow-x-auto space-y-2">
        {stageId === 'map' ? (
          <SongAnalysis song={song} selected={sel} onPickSection={(from, to) => setSel([from, to])} />
        ) : stageId === 'guide' ? (
          <GuideTones song={song} />
        ) : base.scan && imgUrl ? (
          <PageImage url={imgUrl} boxes={base.scan.boxes} />
        ) : reveal === 'blank' ? (
          <div className="text-ink-faint text-sm py-6 text-center">No chart at this stage — you know it or you don&rsquo;t.</div>
        ) : (
          <ChordGrid bars={formBars(form)} selection={sel} onBarClick={onBarClick} />
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <span>Loop:</span>
          <button className={`rounded-full px-3 py-1 ${!sel ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim hover:text-ink'}`} onClick={() => setSel(null)}>Whole form</button>
          {sectionsOf(form).map((s) => (
            <button key={`${s.label}${s.from}`} className={`rounded-full px-3 py-1 ${sel && sel[0] === s.from && sel[1] === s.to ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim hover:text-ink'}`} onClick={() => setSel([s.from, s.to])}>{s.label}</button>
          ))}
          {sel && <span className="text-accent">bars {sel[0] + 1}–{sel[1] + 1}</span>}
          <span className="ml-auto">click a bar, shift-click to extend</span>
        </div>
      </div>

      <button className="text-sm text-ink-dim hover:text-ink" onClick={() => setOptions((v) => !v)}>
        {options ? '− Hide options' : '+ Options (voicings, band, tempo, your recordings)'}
      </button>

      {options && (
        <div className="card space-y-4 text-sm">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-ink-dim">Voicings</div>
              <div className="flex flex-wrap gap-1.5">
                {PRACTICE_FAMILIES.map((f) => { const on = opts.families.includes(f); return <button key={f} className={`rounded-full px-3 py-1 text-xs border ${on ? 'bg-accent text-bg border-accent' : 'border-line text-ink-dim hover:text-ink'}`} onClick={() => setOpts((o) => ({ ...o, families: on ? o.families.filter((x) => x !== f) : [...o.families, f] }))}>{FAMILY_LABEL[f] ?? f}</button>; })}
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.voiceLeading === 'strict'} onChange={(e) => setOpts((o) => ({ ...o, voiceLeading: e.target.checked ? 'strict' : 'off' }))} /> Enforce voice leading</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={opts.halfTime} onChange={(e) => setOpts((o) => ({ ...o, halfTime: e.target.checked }))} /> Half-time changes</label>
            </div>
            <div className="space-y-2">
              <div className="text-ink-dim">Band</div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!opts.band?.bass} onChange={(e) => setOpts((o) => ({ ...o, band: { ...(o.band ?? { style: 'swing', bass: false, drums: false } as BandSpec), bass: e.target.checked } }))} /> Bass</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!opts.band?.drums} onChange={(e) => setOpts((o) => ({ ...o, band: { ...(o.band ?? { style: 'swing', bass: false, drums: false } as BandSpec), drums: e.target.checked } }))} /> Drums</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={!!opts.band?.piano} onChange={(e) => setOpts((o) => ({ ...o, band: { ...(o.band ?? { style: 'swing', bass: false, drums: false } as BandSpec), piano: e.target.checked } }))} /> Piano (model voicings — mute it once you know them)</label>
              <div className="flex items-center gap-2">Tempo <input type="number" className="input w-24" value={opts.bpm} min={30} max={300} onChange={(e) => setOpts((o) => ({ ...o, bpm: +e.target.value }))} /> bpm
                <span className="ml-3">Choruses</span> <input type="number" className="input w-16" value={opts.passes} min={1} max={20} onChange={(e) => setOpts((o) => ({ ...o, passes: +e.target.value }))} /></div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-ink-dim">Reference recording <span className="text-ink-faint">(stage 1 — one link, opened in a new tab, never synced)</span></div>
            <div className="flex gap-2">
              <input className="input flex-1" placeholder="https://… a recording you want to learn from" value={refUrl || reference?.url || ''} onChange={(e) => setRefUrl(e.target.value)} />
              <button className="btn btn-ghost !py-1" disabled={!refUrl.trim()} onClick={() => { settings.set({ reference: { ...settings.reference, [base.id]: { url: refUrl.trim() } } }); setRefUrl(''); }}>Save</button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-ink-dim">Your audio <span className="text-ink-faint">(stage 9 — a file you own; split it with Demucs first and drop the piano stem)</span></div>
            <div className="flex flex-wrap items-center gap-2">
              {records.map((r) => <button key={r.id} className={`rounded-full px-3 py-1 text-xs border ${(recordId ?? records[0]?.id) === r.id ? 'bg-accent text-bg border-accent' : 'border-line text-ink-dim'}`} onClick={() => setRecordId(r.id)}>{r.label}{r.anchorSec !== undefined ? ' ✓' : ''}</button>)}
              <label className="btn btn-ghost !py-1 cursor-pointer">Add audio<input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addRecord(base.id, base.title, fs).then((r) => setRecordId(r.id)); }} /></label>
              {records.length > 0 && <button className="btn btn-danger !py-1" onClick={() => { const rid = recordId ?? records[0]!.id; void db.records.delete(rid); setRecordId(null); }}>Remove</button>}
            </div>
            <div className="text-xs text-ink-faint">
              <code>demucs -n htdemucs yourfile.mp3</code> gives four stems; for a piano trio, drop <code>other.wav</code> and
              keep bass and drums. Everything stays on this device.
            </div>
          </div>

          {base.source !== 'builtin' && <button className="btn btn-danger !py-1" onClick={() => void remove()}>Delete this tune</button>}
        </div>
      )}
    </div>
  );
}

/** Section ranges in form-bar indices, for the loop bar. */
function sectionsOf(form: ReturnType<typeof resolveForm>): Array<{ label: string; from: number; to: number }> {
  const out: Array<{ label: string; from: number; to: number }> = [];
  for (const b of form) {
    const last = out[out.length - 1];
    if (b.section !== undefined && (!last || last.label !== b.section)) out.push({ label: b.section, from: b.formIndex, to: b.formIndex });
    else if (last) last.to = b.formIndex;
  }
  return out.length > 1 ? out : [];
}

function GuideTones({ song }: { song: Song }) {
  const form = resolveForm(song);
  const chords = formToChords(form);
  const gt = guideTones(chords.map((c) => ({ chord: c.chord })));
  const perLine = 8;
  const rows: Array<typeof chords> = [];
  let cur: typeof chords = [];
  let lastBar = -1;
  for (const c of chords) { if (c.formIndex !== lastBar && cur.length && (c.formIndex % perLine === 0)) { rows.push(cur); cur = []; } cur.push(c); lastBar = c.formIndex; }
  if (cur.length) rows.push(cur);
  let k = 0;
  const y = (midi: number) => 78 - (midi - 55) * 2.2; // G3 at the bottom line, ~C5 at the top
  return (
    <div className="space-y-4">
      <div className="text-xs text-ink-dim">3rds (amber) and 7ths (blue) of every chord — the line that makes voice leading obvious. Play just these two notes through the tune.</div>
      {rows.map((row, ri) => {
        const W = 900, cellW = W / row.length;
        const start = k;
        k += row.length;
        return (
          <svg key={ri} viewBox={`0 0 ${W} 100`} className="w-full">
            {[0, 1, 2, 3, 4].map((l) => <line key={l} x1={0} x2={W} y1={30 + l * 10} y2={30 + l * 10} stroke="#2a323d" />)}
            {row.map((c, i) => {
              const g = gt[start + i]!;
              const x = i * cellW + cellW / 2;
              const nextG = gt[start + i + 1];
              return (
                <g key={i}>
                  <text x={x} y={14} fontSize={11} textAnchor="middle" fill="#9aa4b2">{c.chord.text}</text>
                  <circle cx={x} cy={y(g.third)} r={4} fill="#e8b34a" />
                  <circle cx={x} cy={y(g.seventh)} r={4} fill="#6ea8ff" />
                  {nextG && i < row.length - 1 && <>
                    <line x1={x} y1={y(g.third)} x2={x + cellW} y2={y(nextG.third)} stroke="#e8b34a" strokeOpacity={0.5} />
                    <line x1={x} y1={y(g.seventh)} x2={x + cellW} y2={y(nextG.seventh)} stroke="#6ea8ff" strokeOpacity={0.5} />
                  </>}
                  <text x={x} y={92} fontSize={9} textAnchor="middle" fill="#5b6570">{noteName(g.seventh)} · {noteName(g.third)}</text>
                </g>
              );
            })}
          </svg>
        );
      })}
    </div>
  );
}

function noteName(n: number): string { return ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][n % 12]! + (Math.floor(n / 12) - 1); }

/** The scanned page with the detected bar boxes, for reference. */
export function PageImage({ url, boxes, cursor }: { url: string; boxes: Array<{ x: number; y: number; w: number; h: number } | null>; cursor?: number }) {
  return (
    <div className="relative w-full">
      <img src={url} alt="scanned page" className="w-full block rounded-lg" />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1 1" preserveAspectRatio="none">
        {boxes.map((b, i) => b && (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} fill={cursor === i ? 'rgba(232,179,74,0.28)' : 'none'} stroke={cursor === i ? '#e8b34a' : 'rgba(232,179,74,0.25)'} strokeWidth={cursor === i ? 0.004 : 0.0015} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </div>
  );
}
