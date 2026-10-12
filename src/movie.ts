/**
 * The movie: one rAF clock on a compressed time axis; paint(t) derives the
 * text for any moment. Shared by every reading surface (moved from the app's
 * client/player.ts, which keeps the transport chrome).
 */

/** A timeline op — structurally the same as @wedops/kairos-core's. */
export type Op =
  | { k: 'ins'; p: number; v: string; t: number }
  | { k: 'del'; p: number; n: number; t: number }
  | { k: 'rep'; p: number; n: number; v: string; t: number };
export interface Timeline { v: 1; ops: Op[] }

export const GAP = 2500; // a think longer than this plays (and scrubs) as this
export const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
};

const applyOp = (text: string, op: Op): string => {
  if (op.k === 'ins') return text.slice(0, op.p) + op.v + text.slice(op.p);
  if (op.k === 'del') return text.slice(0, op.p) + text.slice(op.p + op.n);
  return text.slice(0, op.p) + op.v + text.slice(op.p + op.n);
};

export interface MovieState { t: number; pct: number; finished: boolean; playing: boolean }

export interface Movie {
  readonly D: number;
  readonly adj: number[];
  readonly t: number;
  readonly playing: boolean;
  readonly finished: boolean;
  paint(t: number): void;
  playFrom(t: number): void;
  pause(): void;
  toggle(): void;
  subscribe(fn: (s: MovieState) => void): void;
}

export function createMovie(
  timeline: Timeline,
  render: (text: string, index: number, finished: boolean) => void
): Movie {
  // compressed axis: long pauses capped so the film is watchable and linear
  const adj: number[] = [];
  {
    let acc = 0, prev = 0;
    for (const op of timeline.ops) {
      acc += Math.min(GAP, Math.max(0, op.t - prev));
      prev = op.t;
      adj.push(acc);
    }
  }
  const D = adj[adj.length - 1] ?? 0;

  let clockMs = 0, idx = 0, text = '', raf = 0, lastTick = 0;
  let playing = false, finished = false;
  const subs: ((s: MovieState) => void)[] = [];
  const notify = () => {
    const s = { t: clockMs, pct: D ? (clockMs / D) * 100 : 100, finished, playing };
    for (const fn of subs) fn(s);
  };

  const paint = (t: number) => {
    clockMs = Math.max(0, Math.min(D, t));
    if (idx > 0 && adj[idx - 1] > clockMs) { idx = 0; text = ''; } // rewind: rebuild
    while (idx < timeline.ops.length && adj[idx] <= clockMs) text = applyOp(text, timeline.ops[idx++]);
    finished = idx >= timeline.ops.length && clockMs >= D;
    render(text, finished ? timeline.ops.length : idx, finished);
    if (finished) pause();
    notify();
  };
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = now - lastTick;
    lastTick = now;
    paint(clockMs + dt);
  };
  const playFrom = (t: number) => {
    playing = true;
    lastTick = performance.now();
    paint(t);
    cancelAnimationFrame(raf);
    if (playing) raf = requestAnimationFrame(tick);
    notify();
  };
  const pause = () => {
    playing = false;
    cancelAnimationFrame(raf);
    notify();
  };

  return {
    get D() { return D; },
    get adj() { return adj; },
    get t() { return clockMs; },
    get playing() { return playing; },
    get finished() { return finished; },
    paint, playFrom, pause,
    toggle() { if (playing) pause(); else playFrom(clockMs >= D ? 0 : clockMs); },
    subscribe(fn) { subs.push(fn); },
  };
}
