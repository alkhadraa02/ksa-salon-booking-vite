import './env.js';
import { fileURLToPath } from 'node:url';
import { openDb, type Db } from './db.js';
import { hashPassword } from './lib/auth.js';
import { computeSlots, type Interval } from './lib/slots.js';
import { addDays, nowInSalon, toMin, weekdayOf } from './lib/time.js';

/** Creates the admin account from the given credentials when it does not exist yet. */
export function ensureAdmin(db: Db, email: string, password: string, name = 'مدير الصالون'): boolean {
  const e = email.trim().toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE lower(email) = ?').get(e)) return false;
  db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?, 'admin')").run(name, e, hashPassword(password));
  return true;
}

const SERVICES: [string, string, number, number][] = [
  ['قص شعر رجالي', 'قصّة عصرية مع غسيل وتصفيف', 45, 60],
  ['حلاقة لحية', 'تحديد وتشذيب اللحية بالموس والمنشفة الساخنة', 30, 40],
  ['قص وحلاقة', 'باقة القص مع تشذيب اللحية', 75, 90],
  ['صبغة شعر', 'صبغة كاملة بألوان طبيعية', 90, 180],
  ['عناية بالبشرة', 'تنظيف عميق وقناع مرطّب', 60, 150],
  ['مانيكير وباديكير', 'عناية كاملة بالأظافر', 60, 120],
  ['سشوار وتسريحة', 'تصفيف للمناسبات', 45, 100],
  ['حمّام مغربي', 'تقشير وتدليك استرخائي', 60, 200],
];

const SPECIALISTS: { name: string; title: string; services: number[]; hours: Record<number, [string, string]> }[] = [
  {
    name: 'فهد العتيبي',
    title: 'حلاق أول',
    services: [1, 2, 3],
    hours: { 0: ['10:00', '22:00'], 1: ['10:00', '22:00'], 2: ['10:00', '22:00'], 3: ['10:00', '22:00'], 4: ['10:00', '22:00'], 5: ['16:00', '23:00'] },
  },
  {
    name: 'سلطان القحطاني',
    title: 'حلاق وخبير لحى',
    services: [1, 2, 3, 8],
    hours: { 0: ['12:00', '23:00'], 1: ['12:00', '23:00'], 2: ['12:00', '23:00'], 3: ['12:00', '23:00'], 6: ['12:00', '22:00'] },
  },
  {
    name: 'نورة الشمري',
    title: 'خبيرة تجميل',
    services: [4, 5, 6, 7],
    hours: { 0: ['10:00', '20:00'], 1: ['10:00', '20:00'], 2: ['10:00', '20:00'], 4: ['10:00', '20:00'], 6: ['11:00', '19:00'] },
  },
  {
    name: 'ريم الدوسري',
    title: 'مصففة شعر',
    services: [4, 6, 7],
    hours: { 1: ['14:00', '22:00'], 2: ['14:00', '22:00'], 3: ['14:00', '22:00'], 4: ['14:00', '22:00'], 5: ['16:00', '23:00'] },
  },
];

/** Services, specialists and working hours. Only runs on an empty catalogue. */
export function seedCatalog(db: Db): boolean {
  if ((db.prepare('SELECT COUNT(*) AS n FROM services').get() as { n: number }).n > 0) return false;
  db.transaction(() => {
    for (const [n, d, dur, price] of SERVICES) {
      db.prepare('INSERT INTO services (name, description, duration_min, price) VALUES (?,?,?,?)').run(n, d, dur, price);
    }
    for (const sp of SPECIALISTS) {
      const id = Number(db.prepare('INSERT INTO specialists (name, title) VALUES (?,?)').run(sp.name, sp.title).lastInsertRowid);
      for (const s of sp.services) db.prepare('INSERT INTO specialist_services VALUES (?,?)').run(id, s);
      for (const [wd, [a, b]] of Object.entries(sp.hours)) {
        db.prepare('INSERT INTO working_hours VALUES (?,?,?,?)').run(id, Number(wd), toMin(a), toMin(b));
      }
    }
  })();
  return true;
}

const CUSTOMERS: [string, string][] = [
  ['عبدالله الحربي', '0551230001'],
  ['محمد الغامدي', '0551230002'],
  ['خالد الزهراني', '0551230003'],
  ['ماجد السبيعي', '0551230004'],
  ['سارة المطيري', '0551230005'],
  ['لينا العنزي', '0551230006'],
  ['يوسف البقمي', '0551230007'],
  ['هند الشهري', '0551230008'],
];

/** Demo customers (no password, they cannot log in) and bookings around today. Idempotent. */
export function seedDemo(db: Db, today = nowInSalon().date): number {
  if ((db.prepare('SELECT COUNT(*) AS n FROM bookings').get() as { n: number }).n > 0) return 0;
  const ids = CUSTOMERS.map(([n, p]) => {
    const row = db.prepare('SELECT id FROM users WHERE phone = ?').get(p) as { id: number } | undefined;
    if (row) return row.id;
    return Number(db.prepare("INSERT INTO users (name, phone, role) VALUES (?,?, 'customer')").run(n, p).lastInsertRowid);
  });
  const sps = db.prepare('SELECT id FROM specialists').all() as { id: number }[];
  let made = 0;
  let k = 0;
  db.transaction(() => {
    for (let off = -9; off <= 3; off++) {
      const date = addDays(today, off);
      for (const sp of sps) {
        const wh = db.prepare('SELECT start_min, end_min FROM working_hours WHERE specialist_id=? AND weekday=?').get(sp.id, weekdayOf(date)) as
          | { start_min: number; end_min: number }
          | undefined;
        if (!wh) continue;
        const svcs = db
          .prepare('SELECT s.id, s.duration_min, s.price FROM specialist_services ss JOIN services s ON s.id = ss.service_id WHERE ss.specialist_id = ?')
          .all(sp.id) as { id: number; duration_min: number; price: number }[];
        const busy: Interval[] = [];
        const count = off > 0 ? 2 : 3 + ((k + off + 9) % 3);
        for (let i = 0; i < count; i++) {
          const svc = svcs[(k + i) % svcs.length];
          const free = computeSlots({ workStart: wh.start_min, workEnd: wh.end_min, duration: svc.duration_min, busy });
          if (!free.length) break;
          const start = free[(k * 3 + i * 5) % free.length];
          busy.push({ start, end: start + svc.duration_min });
          db.prepare('INSERT INTO bookings (customer_id, specialist_id, service_id, date, start_min, end_min, price, status) VALUES (?,?,?,?,?,?,?,?)').run(
            ids[(k + i) % ids.length], sp.id, svc.id, date, start, start + svc.duration_min, svc.price, (k + i) % 9 === 8 ? 'cancelled' : 'confirmed',
          );
          made++;
        }
        k++;
      }
    }
  })();
  return made;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const db = openDb(process.env.DB_PATH || 'data/salon.db');
  const cat = seedCatalog(db);
  const demo = seedDemo(db);
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  let admin = 'skipped (set ADMIN_EMAIL and ADMIN_PASSWORD in .env)';
  if (email && pass) admin = ensureAdmin(db, email, pass) ? `created (${email})` : 'already exists';
  console.log(`catalogue: ${cat ? 'seeded' : 'kept'}; demo bookings: ${demo}; admin: ${admin}`);
  db.close();
}
