import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { ensureAdmin, seedCatalog } from './seed.js';
import { newToken } from './lib/auth.js';

// Saturday 2026-10-17 12:00 in Riyadh
const NOW = new Date('2026-10-17T09:00:00Z');
const TOMORROW = '2026-10-18'; // Sunday

let server: Server;
let base = '';
const adminEmail = 'admin@test.example';
const adminPass = newToken();

class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.()[0];
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null, headers: res.headers };
  }
}

beforeAll(async () => {
  const db = openDb(':memory:');
  seedCatalog(db);
  ensureAdmin(db, adminEmail, adminPass);
  const app = createApp(db, { now: () => NOW, siteUrl: 'https://salon.test' });
  await new Promise<void>((r) => (server = app.listen(0, '127.0.0.1', r)));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('booking API', () => {
  const alice = new Client();
  const bob = new Client();
  const admin = new Client();
  let serviceId = 0;
  let duration = 0;
  let specialistId = 0;
  let bookingId = 0;

  it('lists services and the specialists that offer them', async () => {
    const s = await alice.call('GET', '/api/services');
    expect(s.status).toBe(200);
    serviceId = s.json.services[0].id;
    duration = s.json.services[0].durationMin;
    expect(s.json.services[0].price).toBeGreaterThan(0);
    const sp = await alice.call('GET', `/api/specialists?serviceId=${serviceId}`);
    expect(sp.json.specialists.length).toBeGreaterThan(0);
    specialistId = sp.json.specialists[0].id;
  });

  it('sets security headers and hides X-Powered-By', async () => {
    const r = await alice.call('GET', '/api/services');
    expect(r.headers.get('x-powered-by')).toBeNull();
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });

  it('rejects booking without a session and invalid input', async () => {
    const r = await alice.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: '10:00' });
    expect(r.status).toBe(401);
    const bad = await alice.call('POST', '/api/auth/register', { name: 'x', phone: '123', password: 'short' });
    expect(bad.status).toBe(400);
  });

  it('registers customers with an httpOnly cookie', async () => {
    const pw = newToken();
    const r = await alice.call('POST', '/api/auth/register', { name: 'عبدالله التجريبي', phone: '0500000001', password: pw });
    expect(r.status).toBe(201);
    expect(r.headers.getSetCookie()[0]).toMatch(/HttpOnly/i);
    expect(r.json.user.role).toBe('customer');
    expect(JSON.stringify(r.json)).not.toContain('password');
    const dup = await bob.call('POST', '/api/auth/register', { name: 'مكرر', phone: '0500000001', password: pw });
    expect(dup.status).toBe(409);
    const ok = await bob.call('POST', '/api/auth/register', { name: 'سعد التجريبي', phone: '0500000002', password: pw });
    expect(ok.status).toBe(201);
    const login = await new Client().call('POST', '/api/auth/login', { identifier: '0500000001', password: pw + 'x' });
    expect(login.status).toBe(401);
  });

  it('offers free slots only inside working hours and not in the past', async () => {
    const r = await alice.call('GET', `/api/availability?serviceId=${serviceId}&specialistId=${specialistId}&date=${TOMORROW}`);
    expect(r.status).toBe(200);
    expect(r.json.slots[0]).toBe('10:00');
    const last = r.json.slots.at(-1) as string;
    const [h, m] = last.split(':').map(Number);
    expect(h * 60 + m + duration).toBeLessThanOrEqual(22 * 60);
    const past = await alice.call('GET', `/api/availability?serviceId=${serviceId}&specialistId=${specialistId}&date=2026-10-16`);
    expect(past.json.slots).toEqual([]);
    const bad = await alice.call('GET', '/api/availability?serviceId=1&specialistId=1&date=nope');
    expect(bad.status).toBe(400);
  });

  it('books a slot, then blocks overlaps and double booking', async () => {
    const r = await alice.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: '10:00' });
    expect(r.status).toBe(201);
    bookingId = r.json.booking.id;
    expect(r.json.booking.start).toBe('10:00');
    expect(r.json.booking.price).toBeGreaterThan(0);

    const same = await bob.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: '10:00' });
    expect(same.status).toBe(409);
    const overlap = await bob.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: '10:30' });
    expect(overlap.status).toBe(409);

    const av = await bob.call('GET', `/api/availability?serviceId=${serviceId}&specialistId=${specialistId}&date=${TOMORROW}`);
    expect(av.json.slots).not.toContain('10:00');
    expect(av.json.slots).not.toContain('10:30');
    const after = `${String(Math.floor((600 + duration) / 60)).padStart(2, '0')}:00`;
    const next = await bob.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: av.json.slots[0] });
    expect(next.status).toBe(201);
    expect(after).toMatch(/^\d\d:00$/);
  });

  it('rejects times outside working hours', async () => {
    const r = await bob.call('POST', '/api/bookings', { serviceId, specialistId, date: TOMORROW, time: '03:00' });
    expect(r.status).toBe(409);
  });

  it('shows only my bookings and lets only the owner cancel', async () => {
    const mine = await alice.call('GET', '/api/bookings/mine');
    expect(mine.json.bookings).toHaveLength(1);
    expect(mine.json.bookings[0].cancellable).toBe(true);
    const steal = await bob.call('POST', `/api/bookings/${bookingId}/cancel`);
    expect(steal.status).toBe(404);
    const ok = await alice.call('POST', `/api/bookings/${bookingId}/cancel`);
    expect(ok.status).toBe(200);
    const again = await alice.call('POST', `/api/bookings/${bookingId}/cancel`);
    expect(again.status).toBe(409);
    const av = await bob.call('GET', `/api/availability?serviceId=${serviceId}&specialistId=${specialistId}&date=${TOMORROW}`);
    expect(av.json.slots).toContain('10:00');
  });

  it('protects admin routes', async () => {
    expect((await new Client().call('GET', '/api/admin/customers')).status).toBe(401);
    expect((await alice.call('GET', '/api/admin/customers')).status).toBe(403);
    expect((await alice.call('POST', '/api/admin/services', { name: 'x', durationMin: 30, price: 1 })).status).toBe(403);
  });

  it('gives the admin timeline, customers and revenue', async () => {
    const login = await admin.call('POST', '/api/auth/login', { identifier: adminEmail, password: adminPass });
    expect(login.status).toBe(200);
    expect(login.json.user.role).toBe('admin');

    const tl = await admin.call('GET', `/api/admin/timeline?date=${TOMORROW}`);
    expect(tl.status).toBe(200);
    expect(tl.json.count).toBe(1); // alice cancelled, bob's booking remains
    const col = tl.json.specialists.find((s: { id: number }) => s.id === specialistId);
    expect(col.bookings).toHaveLength(1);
    expect(col.workStart).toBe(600);

    const cu = await admin.call('GET', '/api/admin/customers');
    expect(cu.json.customers.map((c: { name: string }) => c.name)).toContain('سعد التجريبي');

    const rev = await admin.call('GET', `/api/admin/revenue?from=${TOMORROW}&to=${TOMORROW}`);
    expect(rev.json.days).toHaveLength(1);
    expect(rev.json.total).toBe(tl.json.total);
    expect(rev.json.total).toBeGreaterThan(0);
  });

  it('lets the admin manage services and specialist hours', async () => {
    const created = await admin.call('POST', '/api/admin/services', { name: 'خدمة جديدة', durationMin: 20, price: 25 });
    expect(created.status).toBe(201);
    const bad = await admin.call('POST', '/api/admin/services', { name: 'خدمة', durationMin: 1, price: -5 });
    expect(bad.status).toBe(400);
    const sp = await admin.call('POST', '/api/admin/specialists', {
      name: 'أخصائي جديد',
      serviceIds: [created.json.id],
      hours: [{ weekday: 0, start: '09:00', end: '11:00' }],
    });
    expect(sp.status).toBe(201);
    const av = await alice.call('GET', `/api/availability?serviceId=${created.json.id}&specialistId=${sp.json.id}&date=${TOMORROW}`);
    expect(av.json.slots).toEqual(['09:00', '09:30', '10:00', '10:30']);
    const inverted = await admin.call('PUT', `/api/admin/specialists/${sp.json.id}`, {
      name: 'أخصائي جديد',
      hours: [{ weekday: 0, start: '12:00', end: '11:00' }],
    });
    expect(inverted.status).toBe(400);
  });

  it('serves robots.txt and sitemap.xml', async () => {
    const robots = await fetch(base + '/robots.txt').then((r) => r.text());
    expect(robots).toContain('Sitemap: https://salon.test/sitemap.xml');
    const map = await fetch(base + '/sitemap.xml').then((r) => r.text());
    expect(map).toContain('<loc>https://salon.test/book</loc>');
  });
});
