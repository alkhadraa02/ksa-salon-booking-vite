# صالون — نظام حجز مواعيد للصالونات والحلاقة | Salon Booking

تطبيق حجز مواعيد لصالون حلاقة/تجميل بواجهة عربية (RTL) أولاً. الواجهة Vite + React + TypeScript، والخادم Express مع قاعدة SQLite.

A salon / barbershop booking app with an Arabic-first RTL UI. Vite + React + TypeScript SPA, Express API, SQLite (better-sqlite3).

## المزايا | Features

**العميل | Customer**
- تصفّح الخدمات مع المدة والسعر / Browse services with duration and price
- اختيار الأخصائي / Choose a specialist
- اختيار موعد متاح فقط (بلا تداخل، ويحترم ساعات العمل) / Only free slots: no overlaps, working hours respected
- تأكيد الحجز، وصفحة «حجوزاتي» مع الإلغاء / Confirm, then "My bookings" with cancel
- تسجيل حساب بالجوال وكلمة مرور / Sign up with mobile number and password

**الإدارة | Admin**
- إدارة الخدمات / Services CRUD
- إدارة الأخصائيين وساعات عملهم الأسبوعية والخدمات التي يقدّمونها / Specialists, weekly hours and offered services
- جدول يومي (Timeline) لكل أخصائي مع إلغاء الحجز / Day timeline per specialist with cancel
- العملاء وإنفاقهم / Customers and their spend
- الإيراد اليومي لآخر 14 يوماً / Daily revenue for the last 14 days

**جودة وأمان | Quality and security**
- كلمات المرور مُجزّأة بـ scrypt، والجلسة بكوكي httpOnly / scrypt-hashed passwords, httpOnly session cookie
- تحقّق من كل مدخل بـ zod، وحدّ لمحاولات الدخول / zod validation, login rate limit
- رؤوس أمان (CSP، nosniff، frame-ancestors) / Security headers
- منع الحجز المزدوج داخل معاملة قاعدة بيانات / Double booking prevented inside a DB transaction
- حالات فارغة وتحميل وخطأ حقيقية، وقائمة جوال بدرج، ورابط «تخطَّ إلى المحتوى» / Real empty, loading and error states, mobile drawer, skip link
- `sitemap.xml` و`robots.txt` وبيانات JSON-LD / SEO files and structured data

## لقطات الشاشة | Screenshots

> أضف لقطاتك هنا بعد التشغيل المحلي (الرئيسية، الحجز، حجوزاتي، جدول الإدارة).
> Add your screenshots here after running locally (home, booking, my bookings, admin timeline).

| الصفحة / Page | المسار / Path |
| --- | --- |
| الرئيسية / Home | `/` |
| الحجز / Booking | `/book` |
| حجوزاتي / My bookings | `/my` |
| الإدارة / Admin | `/admin` |

## التقنيات | Stack

Vite 8 · React 19 · TypeScript · React Router · Express 5 · better-sqlite3 · zod · Vitest · IBM Plex Sans Arabic (`@fontsource`)

## التشغيل في 5 أوامر | Setup in 5 commands

```bash
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm run db:seed             # optional: demo data (also seeded automatically on first start)
npm test
npm run dev                 # web on http://localhost:3111, API on 3112
```

للإنتاج / Production: `npm run build` ثم `npm start` (يخدم الواجهة والـ API على المنفذ 3111).

## الدخول الافتراضي للمشرف | Default admin login

القيم من `.env` (تُنشأ عند أول تشغيل) / Values come from `.env`:

- البريد / Email: `admin@salon.example`
- كلمة المرور / Password: `ChangeMe-Admin-123`

هذه قيم للتطوير المحلي فقط — غيّرها في `.env` قبل أي استخدام حقيقي. Local development defaults only: change them in `.env` before any real use.

## الأوامر | Scripts

| الأمر | الوصف |
| --- | --- |
| `npm run dev` | الواجهة + الـ API معاً / web + API together |
| `npm run build` | فحص الأنواع وبناء الواجهة / type-check and build |
| `npm start` | تشغيل الإنتاج / production server |
| `npm test` | اختبارات Vitest / Vitest suite |
| `npm run db:seed` | بيانات تجريبية سعودية / realistic Saudi demo data |

## هيكل المشروع | Project structure

```
server/
  index.ts        entry point (dev API / production server)
  app.ts          Express app: auth, catalogue, availability, bookings, admin
  db.ts           SQLite schema
  seed.ts         demo data and admin bootstrap
  lib/            slots algorithm, time helpers, auth helpers, validation helpers
  *.test.ts       Vitest tests (slots logic + API)
src/
  main.tsx, App.tsx, styles.css, lib.ts, auth.tsx, ui.tsx
  pages/          Home, Book, Login, MyBookings, Admin
index.html        SPA shell with SEO metadata
```

## الترخيص | License

MIT © TechnologyKSA
