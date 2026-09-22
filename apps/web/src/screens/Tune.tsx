import { useEffect, useMemo, useState } from 'react';
import { BackLink } from '../components/BackLink';
import { useNavigate, useParams } from 'react-router';
import { FAMILIES, formToChords, guideTones, resolveForm, sectionRanges, songKeyName, transposeSong, type Song } from '@shed/theory';
import type { BandSpec } from '@shed/engine';
import { ChordGrid, formBars, writtenBars } from '../components/ChordGrid';
import { db } from '../db';
import { loadSong, tuneDrillSpec, type TunePracticeOptions } from '../lib/songs';
import { FAMILY_LABEL } from '../lib/suffix';
import { useSettings } from '../store/settings';
import { BackingTracks } from '../components/BackingTracks';
import { useLiveQuery } from 'dexie-react-hooks';
import { addRecord } from '../lib/records';

const PRACTICE_FAMILIES = ['rootlessA', 'rootlessB', 'shell', 'guide', 'drop2', 'spread', 'twoHandRootless', 'quartal', 'upperStructure', 'fourWayClose'];

export default function Tune() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const [base, setBase] = useState<Song | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [view, setView] = useState<'written' | 'form' | 'guide' | 'page'>('written');
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [opts, setOpts] = useState<Omit<TunePracticeOptions, 'mode' | 'transpose' | 'range'>>({ families: ['rootlessA', 'rootlessB'], voiceLeading: 'off', band: { style: 'swing', bass: true, drums: true }, bpm: 120, passes: 2, halfTime: false });
  useEffect(() => { void loadSong(decodeURIComponent(id ?? '')).then((s) => { setBase(s); if (s?.tempo) setOpts((o) => ({ ...o, bpm: s.tempo! })); if (s?.scan) setView('page'); }); }, [id]);
  useEffect(() => {
    let url: string | null = null;
    if (base?.scan) void db.images.get(base.scan.imageId).then((row) => { if (row) { url = URL.createObjectURL(row.blob); setImgUrl(url); } });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [base]);
  const song = useMemo(() => (base ? transposeSong(base, transpose) : null), [base, transpose]);
  const records = useLiveQuery(() => (base ? db.records.where('songId').equals(base.id).toArray() : Promise.resolve([] as import('../db').RecordRow[])), [base]) ?? [];
  const [recordId, setRecordId] = useState<string | null>(null);
  const form = useMemo(() => (song ? resolveForm(song) : []), [song]);
  const sections = useMemo(() => (song ? sectionRanges(song) : []), [song]);
  if (!song) return <div className="text-ink-dim">Loading…</div>;

  const go = async (mode: TunePracticeOptions['mode']) => {
    const rec = mode === 'record' ? records.find((r) => r.id === (recordId ?? records[0]?.id)) : undefined;
    const spec = tuneDrillSpec(base!, { ...opts, mode, transpose, range: view === 'form' ? sel : null, ...(rec ? { recordId: rec.id, anchorSec: rec.anchorSec, bpm: rec.bpm ?? opts.bpm } : {}) });
    await db.drills.put({ id: spec.id, spec, createdAt: Date.now(), updatedAt: Date.now(), custom: false });
    nav(`/drill/${spec.id}`);
  };
  const selectSection = (label: string) => {
    // map a written section to its first occurrence in the form
    const s = sections.find((x) => x.label === label);
    if (!s) return;
    const from = form.findIndex((b) => b.barIndex === s.from);
    let to = from;
    while (to + 1 < form.length && form[to + 1]!.barIndex > form[to]!.barIndex && form[to + 1]!.barIndex <= s.to) to++;
    setView('form'); setSel([from, to]);
  };
  const onBarClick = (i: number, shift: boolean) => {
    if (view !== 'form') return;
    setSel((cur) => (shift && cur ? [Math.min(cur[0], i), Math.max(cur[1], i)] : [i, i]));
  };
  const remove = async () => { if (base?.source !== 'builtin' && confirm('Delete this tune?')) { await db.songs.delete(base!.id); nav('/tunes'); } };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0">
          <BackLink to="/tunes" label="Tunes" />
          <div className="label mt-1">{song.source}</div>
          <h1 className="text-3xl font-semibold tracking-tight truncate">{song.title}</h1>
          <div className="text-ink-dim">{song.composer}</div>
        </div>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-ink-dim">Key</span>
          <button className="btn btn-ghost !px-2 !py-1" onClick={() => setTranspose((t) => t - 1)}>♭</button>
          <span className="w-10 text-center font-medium">{songKeyName(song)}</span>
          <button className="btn btn-ghost !px-2 !py-1" onClick={() => setTranspose((t) => t + 1)}>♯</button>
          {transpose !== 0 && <button className="text-xs text-ink-faint hover:text-ink" onClick={() => setTranspose(0)}>reset</button>}
          <span className="text-ink-faint ml-2">{song.timeSig.join('/')} · {song.style}{song.tempo ? ` · ${song.tempo}` : ''}</span>
          {base?.source !== 'builtin' && <button className="btn btn-danger !py-1 ml-2" onClick={() => void remove()}>Delete</button>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {([...(song.scan ? ['page'] : []), 'written', 'form', 'guide'] as const).map((v) => (
          <button key={v} className={`rounded-full px-3 py-1 ${view === v ? 'bg-accent text-bg' : 'bg-panel-2 text-ink-dim hover:text-ink'}`} onClick={() => setView(v as typeof view)}>{v === 'page' ? 'Page' : v === 'written' ? 'Chart' : v === 'form' ? `Flat form (${form.length} bars)` : 'Guide tones'}</button>
        ))}
        {sections.length > 0 && <span className="ml-3 text-ink-faint">Loop:</span>}
        {sections.map((s) => <button key={s.label + s.from} className="rounded-full px-3 py-1 bg-panel-2 text-ink-dim hover:text-ink" onClick={() => selectSection(s.label)}>{s.label}</button>)}
        {sel && view === 'form' && <span className="text-accent">bars {sel[0] + 1}–{sel[1] + 1} <button className="text-ink-faint hover:text-ink" onClick={() => setSel(null)}>×</button></span>}
        {view === 'form' && !sel && <span className="text-ink-faint">click a bar, shift-click to extend</span>}
      </div>

      <div className="card overflow-x-auto">
        {view === 'page' && song.scan && (imgUrl ? <PageImage url={imgUrl} boxes={song.scan.boxes} /> : <div className="text-ink-dim text-sm">Loading page…</div>)}
        {view === 'written' && <ChordGrid bars={writtenBars(song.bars)} />}
        {view === 'form' && <ChordGrid bars={formBars(form)} selection={sel} onBarClick={onBarClick} />}
        {view === 'guide' && <GuideTones song={song} />}
      </div>

      <div className="card space-y-4">
        <div className="label">Practice</div>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <div className="text-ink-dim">Voicings</div>
            <div className="flex flex-wrap gap-1.5">
              {PRACTICE_FAMILIES.map((f) => { const on = opts.families.includes(f); return <button key={f} className={`rounded-full px-3 py-1 text-xs border ${on ? 'bg-accent text-bg border-accent' : 'border-line text-ink-dim hover:text-ink'}`} onClick={() => setOpts((o) => ({ ...o, families: on ? o.families.filter((x) => x !== f) : [...o.families, f] }))}>{FAMILY_LABEL[f] ?? FAMILIES.find((x) => x.id === f)?.short ?? f}</button>; })}
            </div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.voiceLeading === 'strict'} onChange={(e) => setOpts((o) => ({ ...o, voiceLeading: e.target.checked ? 'strict' : 'off' }))} /> Enforce voice leading (play the exact voice-led voicing)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={opts.halfTime} onChange={(e) => setOpts((o) => ({ ...o, halfTime: e.target.checked }))} /> Half-time changes (every chord twice as long)</label>
          </div>
          <div className="space-y-2">
            <div className="text-ink-dim">Band</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!opts.band?.bass} onChange={(e) => setOpts((o) => ({ ...o, band: { ...(o.band ?? { style: 'swing', bass: false, drums: false } as BandSpec), bass: e.target.checked } }))} /> Bass</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!opts.band?.drums} onChange={(e) => setOpts((o) => ({ ...o, band: { ...(o.band ?? { style: 'swing', bass: false, drums: false } as BandSpec), drums: e.target.checked } }))} /> Drums</label>
            <div className="flex items-center gap-2">Tempo <input type="number" className="input w-24" value={opts.bpm} min={30} max={300} onChange={(e) => setOpts((o) => ({ ...o, bpm: +e.target.value }))} /> bpm
              <span className="ml-3">Choruses</span> <input type="number" className="input w-16" value={opts.passes} min={1} max={20} onChange={(e) => setOpts((o) => ({ ...o, passes: +e.target.value }))} /></div>
          </div>
        </div>
        <BackingTracks songId={base!.id} title={base!.title} onChoose={(v) => setOpts((o) => ({ ...o, youtube: v?.videoId, anchorSec: v?.verified ? v.anchorSec : undefined, ...(v?.bpm ? { bpm: v.bpm } : {}) }))} />
        <div className="space-y-2 text-sm">
          <div className="text-ink-dim">Your recordings <span className="text-ink-faint">(a mix, or stems from Moises/Demucs — piano muted by default)</span></div>
          <div className="flex flex-wrap items-center gap-2">
            {records.map((r) => <button key={r.id} className={`rounded-full px-3 py-1 text-xs border ${(recordId ?? records[0]?.id) === r.id ? 'bg-accent text-bg border-accent' : 'border-line text-ink-dim'}`} onClick={() => setRecordId(r.id)}>{r.label}{r.anchorSec !== undefined ? ' ✓' : ''}</button>)}
            <label className="btn btn-ghost !py-1 cursor-pointer">Add audio<input type="file" accept="audio/*" multiple className="hidden" onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addRecord(base!.id, base!.title, fs).then((r) => setRecordId(r.id)); }} /></label>
            {records.length > 0 && <button className="btn btn-danger !py-1" onClick={() => { const id = recordId ?? records[0]!.id; void db.records.delete(id); setRecordId(null); }}>Remove</button>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {opts.youtube && <button className="btn btn-primary" onClick={() => void go('track')}>Play with the track</button>}
          {records.length > 0 && <button className="btn btn-primary" onClick={() => void go('record')}>Play with the record</button>}
          <button className={`btn ${opts.youtube || records.length ? 'btn-ghost' : 'btn-primary'}`} onClick={() => void go('changes')}>Play with the band{sel && view === 'form' ? ` (bars ${sel[0] + 1}–${sel[1] + 1})` : ''}</button>
          <button className="btn btn-ghost" onClick={() => void go('iiVs')}>Only the ii-Vs</button>
          <button className="btn btn-ghost" onClick={() => void go('quiz')}>Chord quiz (from memory)</button>
        </div>
        <div className="text-xs text-ink-faint">Display: {settings.displayStyle === 'realbook' ? 'Real Book symbols' : 'plain symbols'} — change in Devices.</div>
      </div>
    </div>
  );
}

/** Guide-tone line: 3rds and 7ths as two lines over the bars, on a mini staff. */
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
