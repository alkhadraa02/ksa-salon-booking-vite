import './env.js';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { ensureAdmin, seedCatalog } from './seed.js';

const prod = process.argv.includes('--prod');
const db = openDb(process.env.DB_PATH || 'data/salon.db');

if (seedCatalog(db)) console.log('[salon] empty database: seeded services and specialists');

const email = process.env.ADMIN_EMAIL;
const pass = process.env.ADMIN_PASSWORD;
if (email && pass) {
  if (ensureAdmin(db, email, pass)) console.log(`[salon] admin account created for ${email}`);
} else {
  console.warn('[salon] ADMIN_EMAIL / ADMIN_PASSWORD not set: copy .env.example to .env to create the admin account');
}

const app = createApp(db, {
  siteUrl: process.env.SITE_URL,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  distDir: prod ? resolve('dist') : null,
});

const port = prod ? Number(process.env.PORT || 3111) : Number(process.env.API_PORT || 3112);
const server = app.listen(port, '127.0.0.1', () => {
  console.log(`[salon] ${prod ? 'app' : 'api'} listening on http://127.0.0.1:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
