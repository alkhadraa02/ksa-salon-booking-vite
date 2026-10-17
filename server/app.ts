import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Db } from './db.js';
import { hashPassword, newToken, normalizePhone, parseCookies, sha256, verifyPassword } from './lib/auth.js';
import { HttpError, makeLimiter, parse } from './lib/http.js';
import { computeSlots } from './lib/slots.js';
import { addDays, fmt, isValidDate, nowInSalon, toMin, weekdayOf } from './lib/time.js';

export interface AppOptions {
  siteUrl?: string;
  cookieSecure?: boolean;
  distDir?: string | null;
  now?: () => Date;
}

interface SessionUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: 'admin' | 'customer';
}
type Req = Request & { user?: SessionUser };

const SESSION_DAYS = 14;
const MAX_ADVANCE_DAYS = 60;

// Random per-process hash, used only to keep login timing similar when the account does not exist.
const TIMING_DECOY_HASH = hashPassword(newToken());

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'وقت غير صالح');
const dateStr = z.string().refine(isValidDate, 'تاريخ غير صالح');
const name = z.string().trim().min(2, 'الاسم قصير جداً').max(80);
const password = z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(100);
const phoneField = z.string().transform((v, ctx) => {
  const p = normalizePhone(v);
  if (!p) ctx.addIssue({ code: 'custom', message: 'رقم الجوال غير صالح (مثال: 0501234567)' });
  return p ?? '';
});

const serviceBody = z.object({
  name,
  description: z.string().trim().max(300).default(''),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0).max(100000),
  active: z.boolean().default(true),
});

const specialistBody = z.object({
  name,
  title: z.string().trim().max(80).default(''),
  active: z.boolean().default(true),
  serviceIds: z.array(z.number().int()).default([]),
  hours: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm }))
    .default([])
    .refine((hs) => hs.every((h) => toMin(h.end) > toMin(h.start)), 'وقت النهاية يجب أن يكون بعد البداية')
    .refine((hs) => new Set(hs.map((h) => h.weekday)).size === hs.length, 'يوم مكرر في ساعات العمل'),
});

export function createApp(db: Db, opts: AppOptions = {}) {
  const app = express();
  const now = opts.now ?? (() => new Date());
  const siteUrl = (opts.siteUrl ?? 'http://localhost:3111').replace(/\/$/, '');
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use(express.json({ limit: '50kb' }));

  const authLimiter = makeLimiter(20, 15 * 60 * 1000);

  const q = {
    userById: db.prepare('SELECT id, name, email, phone, role FROM users WHERE id = ?'),
    session: db.prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    ),
  };

  function startSession(res: Response, userId: number) {
    const token = newToken();
    const expires = Date.now() + SESSION_DAYS * 86400_000;
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha256(token), userId, expires);
    res.cookie('sid', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: !!opts.cookieSecure,
      path: '/',
      maxAge: SESSION_DAYS * 86400_000,
    });
  }

  app.use((req: Req, _res, next) => {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) {
      const u = q.session.get(sha256(sid), Date.now()) as SessionUser | undefined;
      if (u) req.user = u;
    }
    next();
  });

  const requireAuth = (req: Req, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'يجب تسجيل الدخول أولاً');
    next();
  };
  const requireAdmin = (req: Req, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'يجب تسجيل الدخول أولاً');
    if (req.user.role !== 'admin') throw new HttpError(403, 'هذه الصفحة للمشرف فقط');
    next();
  };

  const idParam = (req: Request) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'معرّف غير صالح');
    return id;
  };

  // ---------- availability ----------
  function slotsFor(specialistId: number, serviceId: number, date: string): number[] {
    const svc = db.prepare('SELECT duration_min FROM services WHERE id = ? AND active = 1').get(serviceId) as
      | { duration_min: number }
      | undefined;
    if (!svc) throw new HttpError(404, 'الخدمة غير متاحة');
    const sp = db.prepare('SELECT id FROM specialists WHERE id = ? AND active = 1').get(specialistId);
    if (!sp) throw new HttpError(404, 'الأخصائي غير متاح');
    const offers = db
      .prepare('SELECT 1 FROM specialist_services WHERE specialist_id = ? AND service_id = ?')
      .get(specialistId, serviceId);
    if (!offers) throw new HttpError(400, 'هذا الأخصائي لا يقدّم هذه الخدمة');
    const today = nowInSalon(now());
    if (date < today.date) return [];
    if (date > addDays(today.date, MAX_ADVANCE_DAYS)) return [];
    const wh = db
      .prepare('SELECT start_min, end_min FROM working_hours WHERE specialist_id = ? AND weekday = ?')
      .get(specialistId, weekdayOf(date)) as { start_min: number; end_min: number } | undefined;
    if (!wh) return [];
    const busy = (
      db
        .prepare("SELECT start_min, end_min FROM bookings WHERE specialist_id = ? AND date = ? AND status = 'confirmed'")
        .all(specialistId, date) as { start_min: number; end_min: number }[]
    ).map((b) => ({ start: b.start_min, end: b.end_min }));
    return computeSlots({
      workStart: wh.start_min,
      workEnd: wh.end_min,
      duration: svc.duration_min,
      busy,
      notBefore: date === today.date ? today.minutes + 1 : undefined,
    });
  }

  const api = express.Router();

  // ---------- auth ----------
  api.post('/auth/register', (req: Req, res) => {
    if (!authLimiter(req.ip ?? 'x')) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقاً');
    const b = parse(z.object({ name, phone: phoneField, password }), req.body);
    if (db.prepare('SELECT 1 FROM users WHERE phone = ?').get(b.phone)) {
      throw new HttpError(409, 'رقم الجوال مسجّل مسبقاً، سجّل الدخول');
    }
    const r = db
      .prepare("INSERT INTO users (name, phone, password_hash, role) VALUES (?,?,?, 'customer')")
      .run(b.name, b.phone, hashPassword(b.password));
    startSession(res, Number(r.lastInsertRowid));
    res.status(201).json({ user: q.userById.get(r.lastInsertRowid) });
  });

  api.post('/auth/login', (req: Req, res) => {
    if (!authLimiter(req.ip ?? 'x')) throw new HttpError(429, 'محاولات كثيرة، حاول لاحقاً');
    const b = parse(z.object({ identifier: z.string().trim().min(3).max(120), password: z.string().min(1).max(100) }), req.body);
    const phone = normalizePhone(b.identifier);
    const row = (
      phone
        ? db.prepare('SELECT id, password_hash FROM users WHERE phone = ?').get(phone)
        : db.prepare('SELECT id, password_hash FROM users WHERE lower(email) = lower(?)').get(b.identifier)
    ) as { id: number; password_hash: string | null } | undefined;
    const ok = verifyPassword(b.password, row?.password_hash ?? TIMING_DECOY_HASH);
    if (!row || !row.password_hash || !ok) throw new HttpError(401, 'بيانات الدخول غير صحيحة');
    startSession(res, row.id);
    res.json({ user: q.userById.get(row.id) });
  });

  api.post('/auth/logout', (req: Req, res) => {
    const sid = parseCookies(req.headers.cookie).sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(sid));
    res.clearCookie('sid', { path: '/' });
    res.json({ ok: true });
  });

  api.get('/auth/me', (req: Req, res) => {
    res.json({ user: req.user ?? null });
  });

  // ---------- public catalogue ----------
  api.get('/services', (_req, res) => {
    const rows = db
      .prepare('SELECT id, name, description, duration_min AS durationMin, price FROM services WHERE active = 1 ORDER BY id')
      .all();
    res.json({ services: rows });
  });

  api.get('/specialists', (req, res) => {
    const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;
    if (serviceId !== null && !Number.isInteger(serviceId)) throw new HttpError(400, 'خدمة غير صالحة');
    const rows = serviceId
      ? db
          .prepare(
            `SELECT sp.id, sp.name, sp.title FROM specialists sp
             JOIN specialist_services ss ON ss.specialist_id = sp.id AND ss.service_id = ?
             WHERE sp.active = 1 ORDER BY sp.id`,
          )
          .all(serviceId)
      : db.prepare('SELECT id, name, title FROM specialists WHERE active = 1 ORDER BY id').all();
    res.json({ specialists: rows });
  });

  api.get('/availability', (req, res) => {
    const b = parse(
      z.object({
        serviceId: z.coerce.number().int(),
        specialistId: z.coerce.number().int(),
        date: dateStr,
      }),
      req.query,
    );
    res.json({ date: b.date, slots: slotsFor(b.specialistId, b.serviceId, b.date).map(fmt) });
  });

  // ---------- bookings (customer) ----------
  const bookingSelect = `
    SELECT b.id, b.date, b.start_min AS startMin, b.end_min AS endMin, b.price, b.status,
           b.specialist_id AS specialistId,
           s.name AS serviceName, sp.name AS specialistName, u.name AS customerName, u.phone AS customerPhone
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    JOIN specialists sp ON sp.id = b.specialist_id
    JOIN users u ON u.id = b.customer_id`;
  const withTimes = <T extends { startMin: number; endMin: number }>(r: T) => ({
    ...r,
    start: fmt(r.startMin),
    end: fmt(r.endMin),
  });

  api.post('/bookings', requireAuth, (req: Req, res) => {
    const b = parse(
      z.object({ serviceId: z.number().int(), specialistId: z.number().int(), date: dateStr, time: hhmm }),
      req.body,
    );
    const start = toMin(b.time);
    const create = db.transaction(() => {
      const free = slotsFor(b.specialistId, b.serviceId, b.date);
      if (!free.includes(start)) throw new HttpError(409, 'هذا الموعد لم يعد متاحاً، اختر وقتاً آخر');
      const svc = db.prepare('SELECT duration_min, price FROM services WHERE id = ?').get(b.serviceId) as {
        duration_min: number;
        price: number;
      };
      return db
        .prepare(
          `INSERT INTO bookings (customer_id, specialist_id, service_id, date, start_min, end_min, price)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(req.user!.id, b.specialistId, b.serviceId, b.date, start, start + svc.duration_min, svc.price);
    });
    // BEGIN IMMEDIATE: the free-slot check and the insert happen under one write lock (no double booking)
    const r = create.immediate();
    const row = db.prepare(bookingSelect + ' WHERE b.id = ?').get(r.lastInsertRowid) as {
      startMin: number;
      endMin: number;
    };
    res.status(201).json({ booking: withTimes(row) });
  });

  api.get('/bookings/mine', requireAuth, (req: Req, res) => {
    const rows = db
      .prepare(bookingSelect + ' WHERE b.customer_id = ? ORDER BY b.date DESC, b.start_min DESC')
      .all(req.user!.id) as { startMin: number; endMin: number; date: string; status: string }[];
    const today = nowInSalon(now());
    res.json({
      bookings: rows.map((r) => ({
        ...withTimes(r),
        cancellable:
          r.status === 'confirmed' && (r.date > today.date || (r.date === today.date && r.startMin > today.minutes)),
      })),
    });
  });

  api.post('/bookings/:id/cancel', requireAuth, (req: Req, res) => {
    const id = idParam(req);
    const row = db.prepare('SELECT customer_id, date, start_min, status FROM bookings WHERE id = ?').get(id) as
      | { customer_id: number; date: string; start_min: number; status: string }
      | undefined;
    if (!row || (row.customer_id !== req.user!.id && req.user!.role !== 'admin')) throw new HttpError(404, 'الحجز غير موجود');
    if (row.status === 'cancelled') throw new HttpError(409, 'الحجز ملغى مسبقاً');
    const today = nowInSalon(now());
    if (req.user!.role !== 'admin' && (row.date < today.date || (row.date === today.date && row.start_min <= today.minutes))) {
      throw new HttpError(409, 'لا يمكن إلغاء حجز بدأ موعده');
    }
    db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // ---------- admin ----------
  const admin = express.Router();
  admin.use(requireAdmin);

  admin.get('/services', (_req, res) => {
    const rows = db
      .prepare('SELECT id, name, description, duration_min AS durationMin, price, active FROM services ORDER BY id')
      .all() as { active: number }[];
    res.json({ services: rows.map((s) => ({ ...s, active: !!s.active })) });
  });
  admin.post('/services', (req, res) => {
    const b = parse(serviceBody, req.body);
    const r = db
      .prepare('INSERT INTO services (name, description, duration_min, price, active) VALUES (?,?,?,?,?)')
      .run(b.name, b.description, b.durationMin, b.price, b.active ? 1 : 0);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  admin.put('/services/:id', (req, res) => {
    const id = idParam(req);
    const b = parse(serviceBody, req.body);
    const r = db
      .prepare('UPDATE services SET name=?, description=?, duration_min=?, price=?, active=? WHERE id=?')
      .run(b.name, b.description, b.durationMin, b.price, b.active ? 1 : 0, id);
    if (!r.changes) throw new HttpError(404, 'الخدمة غير موجودة');
    res.json({ ok: true });
  });
  admin.delete('/services/:id', (req, res) => {
    // soft delete keeps booking history intact
    const r = db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(idParam(req));
    if (!r.changes) throw new HttpError(404, 'الخدمة غير موجودة');
    res.json({ ok: true });
  });

  const loadSpecialists = () => {
    const sps = db.prepare('SELECT id, name, title, active FROM specialists ORDER BY id').all() as {
      id: number;
      name: string;
      title: string;
      active: number;
    }[];
    return sps.map((s) => ({
      ...s,
      active: !!s.active,
      serviceIds: (
        db.prepare('SELECT service_id AS id FROM specialist_services WHERE specialist_id = ?').all(s.id) as { id: number }[]
      ).map((r) => r.id),
      hours: (
        db
          .prepare('SELECT weekday, start_min, end_min FROM working_hours WHERE specialist_id = ? ORDER BY weekday')
          .all(s.id) as { weekday: number; start_min: number; end_min: number }[]
      ).map((h) => ({ weekday: h.weekday, start: fmt(h.start_min), end: fmt(h.end_min) })),
    }));
  };

  const saveSpecialist = db.transaction((id: number | null, b: z.infer<typeof specialistBody>) => {
    let sid = id;
    if (sid === null) {
      sid = Number(
        db.prepare('INSERT INTO specialists (name, title, active) VALUES (?,?,?)').run(b.name, b.title, b.active ? 1 : 0)
          .lastInsertRowid,
      );
    } else {
      const r = db.prepare('UPDATE specialists SET name=?, title=?, active=? WHERE id=?').run(b.name, b.title, b.active ? 1 : 0, sid);
      if (!r.changes) throw new HttpError(404, 'الأخصائي غير موجود');
    }
    db.prepare('DELETE FROM specialist_services WHERE specialist_id = ?').run(sid);
    for (const svcId of new Set(b.serviceIds)) {
      if (!db.prepare('SELECT 1 FROM services WHERE id = ?').get(svcId)) throw new HttpError(400, 'خدمة غير موجودة');
      db.prepare('INSERT INTO specialist_services (specialist_id, service_id) VALUES (?,?)').run(sid, svcId);
    }
    db.prepare('DELETE FROM working_hours WHERE specialist_id = ?').run(sid);
    for (const h of b.hours) {
      db.prepare('INSERT INTO working_hours (specialist_id, weekday, start_min, end_min) VALUES (?,?,?,?)').run(
        sid,
        h.weekday,
        toMin(h.start),
        toMin(h.end),
      );
    }
    return sid;
  });

  admin.get('/specialists', (_req, res) => res.json({ specialists: loadSpecialists() }));
  admin.post('/specialists', (req, res) => {
    res.status(201).json({ id: saveSpecialist(null, parse(specialistBody, req.body)) });
  });
  admin.put('/specialists/:id', (req, res) => {
    saveSpecialist(idParam(req), parse(specialistBody, req.body));
    res.json({ ok: true });
  });

  admin.get('/timeline', (req, res) => {
    const { date } = parse(z.object({ date: dateStr }), req.query);
    const rows = db
      .prepare(bookingSelect + " WHERE b.date = ? AND b.status = 'confirmed' ORDER BY b.start_min")
      .all(date) as { startMin: number; endMin: number; price: number; specialistId: number }[];
    const wd = weekdayOf(date);
    const sps = db.prepare('SELECT id, name, title FROM specialists WHERE active = 1 ORDER BY id').all() as {
      id: number;
      name: string;
      title: string;
    }[];
    const columns = sps.map((s) => {
      const wh = db
        .prepare('SELECT start_min, end_min FROM working_hours WHERE specialist_id = ? AND weekday = ?')
        .get(s.id, wd) as { start_min: number; end_min: number } | undefined;
      return {
        ...s,
        workStart: wh ? wh.start_min : null,
        workEnd: wh ? wh.end_min : null,
        bookings: rows.filter((r) => r.specialistId === s.id).map(withTimes),
      };
    });
    res.json({
      date,
      specialists: columns,
      total: rows.reduce((a, r) => a + r.price, 0),
      count: rows.length,
    });
  });

  admin.get('/customers', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.phone, u.created_at AS createdAt,
                COUNT(CASE WHEN b.status='confirmed' THEN 1 END) AS bookings,
                COALESCE(SUM(CASE WHEN b.status='confirmed' THEN b.price END), 0) AS spent,
                MAX(CASE WHEN b.status='confirmed' THEN b.date END) AS lastVisit
         FROM users u LEFT JOIN bookings b ON b.customer_id = u.id
         WHERE u.role = 'customer' GROUP BY u.id ORDER BY spent DESC, u.id DESC`,
      )
      .all();
    res.json({ customers: rows });
  });

  admin.get('/revenue', (req, res) => {
    const today = nowInSalon(now()).date;
    const b = parse(z.object({ from: dateStr.optional(), to: dateStr.optional() }), req.query);
    const to = b.to ?? today;
    const from = b.from ?? addDays(to, -13);
    if (from > to) throw new HttpError(400, 'نطاق التاريخ غير صالح');
    if (addDays(from, 92) < to) throw new HttpError(400, 'النطاق أطول من 93 يوماً');
    const rows = db
      .prepare(
        `SELECT date, SUM(price) AS total, COUNT(*) AS count FROM bookings
         WHERE status='confirmed' AND date BETWEEN ? AND ? GROUP BY date`,
      )
      .all(from, to) as { date: string; total: number; count: number }[];
    const by = new Map(rows.map((r) => [r.date, r]));
    const days: { date: string; total: number; count: number }[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(by.get(d) ?? { date: d, total: 0, count: 0 });
    res.json({
      from,
      to,
      days,
      total: days.reduce((a, d) => a + d.total, 0),
      count: days.reduce((a, d) => a + d.count, 0),
      today: by.get(today) ?? { date: today, total: 0, count: 0 },
    });
  });

  api.use('/admin', admin);
  api.use((_req, _res, next) => next(new HttpError(404, 'المسار غير موجود')));
  app.use('/api', api);

  // ---------- SEO ----------
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (_req, res) => {
    const urls = ['/', '/book', '/login'];
    res
      .type('application/xml')
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${siteUrl}${u === '/' ? '' : u}</loc></url>`)
          .join('\n')}\n</urlset>\n`,
      );
  });

  // ---------- static SPA (production) ----------
  const dist = opts.distDir;
  if (dist && existsSync(join(dist, 'index.html'))) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
  }

  // ---------- errors ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'JSON غير صالح' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'خطأ غير متوقع في الخادم' });
  });

  return app;
}
