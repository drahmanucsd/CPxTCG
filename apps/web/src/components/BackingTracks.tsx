import { useEffect, useState } from 'react';
import { useSettings } from '../store/settings';

export interface YtResult { videoId: string; title: string; channel: string; thumb: string }

/** Finds backing tracks for a tune on YouTube and remembers the one you pick. */
export function BackingTracks({ songId, title, onChoose }: { songId: string; title: string; onChoose: (v: { videoId: string; title: string; bpm?: number } | null) => void }) {
  const settings = useSettings();
  const chosen = settings.backingBySong[songId] ?? null;
  const [results, setResults] = useState<YtResult[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'nokey' | 'error'>('idle');
  const [manual, setManual] = useState('');
  const query = `"${title}" backing track`;

  useEffect(() => { onChoose(chosen); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [chosen?.videoId]);

  const search = async () => {
    setState('loading');
    try {
      const r = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`);
      if (r.status === 501) { setState('nokey'); return; }
      if (!r.ok) { setState('error'); return; }
      const data = (await r.json()) as { items: YtResult[] };
      setResults(data.items); setState('idle');
    } catch { setState('error'); }
  };
  useEffect(() => { if (!chosen) void search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [songId]);

  const pick = (r: { videoId: string; title: string }) => {
    const bpm = /(\d{2,3})\s*bpm/i.exec(r.title)?.[1];
    const v = { videoId: r.videoId, title: r.title, ...(bpm ? { bpm: +bpm } : {}) };
    settings.set({ backingBySong: { ...settings.backingBySong, [songId]: v } });
  };
  const clear = () => { const b = { ...settings.backingBySong }; delete b[songId]; settings.set({ backingBySong: b }); setResults(null); void search(); };
  const idFrom = (s: string) => /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(s)?.[1] ?? (/^[\w-]{11}$/.test(s.trim()) ? s.trim() : null);

  return (
    <div className="space-y-2 text-sm">
      <div className="text-ink-dim">Backing track</div>
      {chosen ? (
        <div className="flex items-center gap-3">
          <img src={`https://i.ytimg.com/vi/${chosen.videoId}/default.jpg`} alt="" className="w-20 rounded" />
          <div className="min-w-0 flex-1"><div className="truncate">{chosen.title}</div><div className="text-xs text-ink-faint">{chosen.bpm ? `${chosen.bpm} bpm from the title · ` : ''}used when you press “Play with the track”</div></div>
          <button className="btn btn-ghost !py-1" onClick={clear}>Change</button>
        </div>
      ) : state === 'loading' ? (
        <div className="text-ink-faint">Searching YouTube for {query}…</div>
      ) : results && results.length ? (
        <div className="grid sm:grid-cols-2 gap-2">
          {results.map((r) => (
            <button key={r.videoId} className="flex items-center gap-2 text-left rounded-lg bg-panel-2 p-2 hover:bg-line" onClick={() => pick(r)}>
              <img src={r.thumb} alt="" className="w-16 rounded" />
              <div className="min-w-0"><div className="truncate text-sm">{r.title}</div><div className="text-xs text-ink-faint truncate">{r.channel}</div></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-ink-faint text-xs">
            {state === 'nokey' ? 'YouTube search needs an API key on the server (YOUTUBE_API_KEY). Until then:' : state === 'error' ? 'Search failed. You can still:' : 'No results.'}{' '}
            <a className="text-accent" target="_blank" rel="noreferrer" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`}>open the search on YouTube</a> and paste the link here.
          </div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="https://www.youtube.com/watch?v=…" value={manual} onChange={(e) => setManual(e.target.value)} />
            <button className="btn btn-ghost !py-1" disabled={!idFrom(manual)} onClick={() => { const id = idFrom(manual)!; pick({ videoId: id, title: manual }); setManual(''); }}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}
