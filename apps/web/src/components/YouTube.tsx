import { useEffect, useRef } from 'react';

declare global {
  interface Window { YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: Record<string, number> }; onYouTubeIframeAPIReady?: () => void }
}
export interface YTPlayer { playVideo(): void; pauseVideo(): void; seekTo(s: number, allow?: boolean): void; getCurrentTime(): number; getPlayerState(): number; setPlaybackRate(r: number): void; destroy(): void }

let apiPromise: Promise<void> | null = null;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      window.onYouTubeIframeAPIReady = () => resolve();
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return apiPromise;
}

/** Embedded YouTube player (IFrame API). We only control playback — no audio access, no downloads. */
export function YouTube({ videoId, onReady, className }: { videoId: string; onReady?: (p: YTPlayer) => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadApi().then(() => {
      if (cancelled || !ref.current || !window.YT) return;
      const host = document.createElement('div');
      ref.current.replaceChildren(host);
      playerRef.current = new window.YT.Player(host, {
        videoId, width: '100%', height: '100%',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: { onReady: (e: { target: YTPlayer }) => onReady?.(e.target) },
      });
    });
    return () => { cancelled = true; try { playerRef.current?.destroy(); } catch { /* ignore */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);
  return <div ref={ref} className={className ?? 'w-full aspect-video rounded-xl overflow-hidden bg-black'} />;
}
