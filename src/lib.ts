import { useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch('/api' + path, {
      method: opts.method ?? 'GET',
      headers: opts.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم، تحقّق من الشبكة وأعد المحاولة', 0);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  if (!res.ok) {
    const msg = (json as { error?: string } | null)?.error ?? 'حدث خطأ غير متوقع';
    throw new ApiError(msg, res.status);
  }
  return json as T;
}

export function useData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, loading: true }));
    load().then(
      (data) => live && setState({ data, loading: false }),
      (e: Error) => live && setState({ error: e.message, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | صالون`;
  }, [title]);
}

export const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function money(n: number): string {
  return `${n.toLocaleString('ar-SA-u-nu-latn')} ر.س`;
}

export function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(date + 'T00:00:00Z').getUTCDay();
}

export function dateLabel(date: string, withYear = false): string {
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(new Date(date + 'T00:00:00Z'));
}

export function durationLabel(min: number): string {
  if (min < 60) return `${min} دقيقة`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : `${h} ساعات`;
  return m ? `${hs} و${m} دقيقة` : hs;
}

export function hm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

export interface User {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'customer';
}
export interface Service {
  id: number;
  name: string;
  description: string;
  durationMin: number;
  price: number;
  active?: boolean;
}
export interface Specialist {
  id: number;
  name: string;
  title: string;
}
export interface Booking {
  id: number;
  date: string;
  start: string;
  end: string;
  startMin: number;
  endMin: number;
  price: number;
  status: 'confirmed' | 'cancelled';
  serviceName: string;
  specialistName: string;
  customerName: string;
  customerPhone: string | null;
  cancellable?: boolean;
}
