import { Link, useNavigate } from 'react-router';

/**
 * Consistent "get out of here" affordance for screens that are not top-level nav destinations.
 * `to` is where it goes when there is no history to pop (a deep link, a fresh tab).
 */
export function BackLink({ to, label }: { to: string; label: string }) {
  const nav = useNavigate();
  const hasHistory = typeof window !== 'undefined' && window.history.length > 1;
  const className = 'inline-flex items-center gap-1 text-sm text-ink-dim hover:text-ink';
  const body = <>&larr; {label}</>;
  return hasHistory
    ? <button className={className} onClick={() => nav(-1)}>{body}</button>
    : <Link className={className} to={to}>{body}</Link>;
}
