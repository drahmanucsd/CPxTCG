import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { builtinSongs, importIReal, parseChartText, songKeyName, type Song } from '@shed/theory';
import { db } from '../db';
import { saveSong } from '../lib/songs';
import { STATUS_LABEL, STATUS_TONE, tuneProgress, type TuneStatus } from '../lib/repertoire';

export default function Tunes() {
  const mine = useLiveQuery(() => db.songs.orderBy('title').toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().limit(400).toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<TuneStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const all = useMemo(() => {
    const list: Array<{ song: Song; mine: boolean }> = [...mine.map((r) => ({ song: r.song, mine: true })), ...builtinSongs().map((song) => ({ song, mine: false }))];
    const needle = q.trim().toLowerCase();
    const withStatus = list.map((x) => ({ ...x, t: tuneProgress(sessions, x.song.id) }));
    const matched = needle ? withStatus.filter((x) => x.song.title.toLowerCase().includes(needle) || (x.song.composer ?? '').toLowerCase().includes(needle)) : withStatus;
    const filtered = only ? matched.filter((x) => x.t.status === only) : matched;
    return filtered.sort((a, b) => a.song.title.localeCompare(b.song.title));
  }, [mine, q, sessions, only]);
  const counts = useMemo(() => {
    const c: Record<TuneStatus, number> = { new: 0, learning: 0, known: 0, rusty: 0 };
    for (const r of [...mine.map((m) => m.song), ...builtinSongs()]) c[tuneProgress(sessions, r.id).status]++;
    return c;
  }, [mine, sessions]);

  const doImport = async (src: string) => {
    let songs: Song[] = [];
    let errors: string[] = [];
    if (/ireal(book|b):\/\//.test(src)) ({ songs, errors } = importIReal(src));
    else if (/^title:/im.test(src)) { try { songs = [parseChartText(src)]; } catch (e) { errors = [(e as Error).message]; } }
    else errors = ['Paste an iReal Pro link (irealbook:// or irealb://), an exported playlist .html, or chart text starting with "title:"'];
    for (const s of songs) await saveSong(s);
    setReport(`${songs.length} tune${songs.length === 1 ? '' : 's'} imported${errors.length ? ` · ${errors.length} skipped: ${errors.slice(0, 3).join('; ')}` : ''}`);
    if (songs.length) { setText(''); setImporting(false); }
  };
  const onFile = async (f: File) => { doImport(await f.text()); };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tunes</h1>
        <input className="input ml-auto w-56" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <Link to="/scan" className="btn btn-ghost">Scan a page</Link>
        <button className="btn btn-primary" onClick={() => setImporting((v) => !v)}>Import</button>
      </div>
      {importing && (
        <div className="card space-y-3">
          <div className="text-sm text-ink-dim">
            Paste an <b>iReal Pro</b> link (share a song or a whole playlist → copy link), drop an exported playlist <b>.html</b>, or write a chart:
            <code className="ml-1 text-xs">title: … / key: F / [A] Gm7 C7 | F6 |</code>
          </div>
          <textarea className="input w-full font-mono text-xs" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="irealb://… or chart text" />
          <div className="flex items-center gap-2">
            <button className="btn btn-primary" onClick={() => void doImport(text)} disabled={!text.trim()}>Import</button>
            <label className="btn btn-ghost cursor-pointer">Choose .html file<input type="file" accept=".html,.htm,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} /></label>
            {report && <span className="text-sm text-ink-dim">{report}</span>}
          </div>
          <div className="text-xs text-ink-faint">Built-in tunes are public-domain standards with common changes. We never ship copyrighted lead sheets — bring your own charts, they stay on this device.</div>
        </div>
      )}
      {!importing && report && <div className="text-sm text-ink-dim">{report}</div>}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {(['known', 'rusty', 'learning', 'new'] as const).map((st) => (
          <button
            key={st}
            className={`rounded-full px-3 py-1 ${only === st ? 'ring-1 ring-accent ' : ''}${STATUS_TONE[st]}`}
            onClick={() => setOnly(only === st ? null : st)}
          >{STATUS_LABEL[st]} {counts[st]}</button>
        ))}
        {only && <button className="text-ink-faint hover:text-ink px-2" onClick={() => setOnly(null)}>show all</button>}
      </div>
      <div className="divide-y divide-line/60">
        {all.map(({ song, mine: isMine, t }) => (
          <Link key={song.id} to={`/tunes/${encodeURIComponent(song.id)}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
            <span className={`text-[10px] rounded px-1.5 py-0.5 shrink-0 w-20 text-center ${STATUS_TONE[t.status]}`} title={t.lastPlayedAt ? `last played ${t.daysSince} day${t.daysSince === 1 ? '' : 's'} ago` : 'never played'}>{STATUS_LABEL[t.status]}</span>
            <span className="flex-1 min-w-0 truncate font-medium">{song.title}</span>
            <span className="text-sm text-ink-dim truncate w-40 hidden sm:block">{song.composer}</span>
            <span className="text-xs text-ink-faint w-10 text-right">{songKeyName(song)}</span>
            <span className="text-xs text-ink-faint w-16 text-right">{song.tempo ? `${song.tempo} bpm` : ''}</span>
            <span className="text-xs text-ink-faint w-14 text-right">{song.style}</span>
            <span className={`text-[10px] w-12 text-right ${isMine ? 'text-accent' : 'text-ink-faint'}`}>{isMine ? song.source : 'built-in'}</span>
          </Link>
        ))}
        {!all.length && <div className="text-ink-dim py-4">Nothing matches.</div>}
      </div>
    </div>
  );
}
