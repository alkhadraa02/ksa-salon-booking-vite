export interface Interval {
  start: number;
  end: number;
}

export const SLOT_STEP = 30;

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * Free start times (minutes since midnight) for a service of `duration` minutes
 * inside the working window, never overlapping `busy` intervals.
 * `notBefore` (inclusive) removes slots that already started.
 */
export function computeSlots(opts: {
  workStart: number;
  workEnd: number;
  duration: number;
  busy: Interval[];
  step?: number;
  notBefore?: number;
}): number[] {
  const step = opts.step ?? SLOT_STEP;
  const out: number[] = [];
  for (let start = opts.workStart; start + opts.duration <= opts.workEnd; start += step) {
    if (opts.notBefore !== undefined && start < opts.notBefore) continue;
    const candidate = { start, end: start + opts.duration };
    if (opts.busy.some((b) => overlaps(candidate, b))) continue;
    out.push(start);
  }
  return out;
}
