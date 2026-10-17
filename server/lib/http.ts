import type { ZodTypeAny, z } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    throw new HttpError(400, (issue?.message ?? 'بيانات غير صالحة') + where);
  }
  return r.data;
}

export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    const cur = hits.get(key);
    if (!cur || cur.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return true;
    }
    cur.count += 1;
    return cur.count <= max;
  };
}
