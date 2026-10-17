import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  DAY_NAMES,
  WEEK_ORDER,
  addDays,
  api,
  dateLabel,
  durationLabel,
  hm,
  money,
  todayStr,
  useData,
  useTitle,
  type Booking,
  type Service,
} from '../lib';
import { Empty, ErrorBox, Field, Spinner } from '../ui';

type Tab = 'timeline' | 'services' | 'specialists' | 'customers' | 'revenue';
const TABS: { id: Tab; label: string }[] = [
  { id: 'timeline', label: 'جدول اليوم' },
  { id: 'services', label: 'الخدمات' },
  { id: 'specialists', label: 'الأخصائيون' },
  { id: 'customers', label: 'العملاء' },
  { id: 'revenue', label: 'الإيرادات' },
];

export function Admin() {
  useTitle('لوحة الإدارة');
  const { user, ready } = useAuth();
  const [tab, setTab] = useState<Tab>('timeline');

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/login?next=/admin" replace />;
  if (user.role !== 'admin') {
    return (
      <div className="container page">
        <ErrorBox message="هذه الصفحة للمشرف فقط." />
      </div>
    );
  }

  return (
    <div className="container page">
      <h1>لوحة الإدارة</h1>
      <div className="tabs" role="tablist" aria-label="أقسام الإدارة">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={'tab' + (tab === t.id ? ' selected' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'timeline' && <Timeline />}
        {tab === 'services' && <Services />}
        {tab === 'specialists' && <Specialists />}
        {tab === 'customers' && <Customers />}
        {tab === 'revenue' && <Revenue />}
      </div>
    </div>
  );
}

// ---------------- timeline ----------------
interface TLColumn {
  id: number;
  name: string;
  title: string;
  workStart: number | null;
  workEnd: number | null;
  bookings: Booking[];
}
const PX_PER_MIN = 1.1;

function Timeline() {
  const [date, setDate] = useState(todayStr());
  const { data, error, loading, reload } = useData(
    () => api<{ specialists: TLColumn[]; total: number; count: number }>(`/admin/timeline?date=${date}`),
    [date],
  );
  const [actionError, setActionError] = useState('');

  let from = 9 * 60;
  let to = 21 * 60;
  if (data) {
    const starts = data.specialists.flatMap((s) => [s.workStart, ...s.bookings.map((b) => b.startMin)]).filter((x): x is number => x !== null);
    const ends = data.specialists.flatMap((s) => [s.workEnd, ...s.bookings.map((b) => b.endMin)]).filter((x): x is number => x !== null);
    if (starts.length) from = Math.floor(Math.min(...starts) / 60) * 60;
    if (ends.length) to = Math.ceil(Math.max(...ends) / 60) * 60;
  }
  const hours: number[] = [];
  for (let m = from; m < to; m += 60) hours.push(m);
  const height = (to - from) * PX_PER_MIN;

  async function cancel(b: Booking) {
    if (!window.confirm(`إلغاء حجز ${b.customerName} (${b.start})؟`)) return;
    setActionError('');
    try {
      await api(`/bookings/${b.id}/cancel`, { method: 'POST' });
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  return (
    <section aria-label="جدول الحجوزات اليومي">
      <div className="toolbar">
        <button type="button" className="btn btn-ghost" onClick={() => setDate(addDays(date, -1))} aria-label="اليوم السابق">
          →
        </button>
        <label className="sr-only" htmlFor="tl-date">
          التاريخ
        </label>
        <input id="tl-date" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} dir="ltr" />
        <button type="button" className="btn btn-ghost" onClick={() => setDate(addDays(date, 1))} aria-label="اليوم التالي">
          ←
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setDate(todayStr())}>
          اليوم
        </button>
        <span className="muted grow">{dateLabel(date, true)}</span>
        {data && (
          <strong>
            {data.count} حجز · {money(data.total)}
          </strong>
        )}
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {data && data.specialists.length === 0 && <Empty title="لا يوجد أخصائيون فعّالون" />}
      {data && data.specialists.length > 0 && (
        <div className="timeline-wrap">
          <div className="timeline" style={{ ['--tl-height' as string]: `${height}px` }}>
            <div className="tl-axis" aria-hidden="true">
              <div className="tl-head" />
              <div className="tl-body">
                {hours.map((m) => (
                  <span key={m} style={{ insetBlockStart: (m - from) * PX_PER_MIN }}>
                    {hm(m)}
                  </span>
                ))}
              </div>
            </div>
            {data.specialists.map((s) => (
              <div className="tl-col" key={s.id}>
                <div className="tl-head">
                  <strong>{s.name}</strong>
                  <small className="muted">{s.workStart === null ? 'إجازة' : `${hm(s.workStart)}–${hm(s.workEnd!)}`}</small>
                </div>
                <div className="tl-body">
                  {s.workStart !== null && (
                    <div
                      className="tl-work"
                      style={{ insetBlockStart: (s.workStart - from) * PX_PER_MIN, blockSize: (s.workEnd! - s.workStart) * PX_PER_MIN }}
                    />
                  )}
                  {s.bookings.map((b) => (
                    <div
                      key={b.id}
                      className="tl-booking"
                      style={{ insetBlockStart: (b.startMin - from) * PX_PER_MIN, blockSize: Math.max((b.endMin - b.startMin) * PX_PER_MIN, 28) }}
                    >
                      <strong className="truncate">{b.customerName}</strong>
                      <span className="truncate">{b.serviceName}</span>
                      <bdi>
                        {b.start}–{b.end}
                      </bdi>
                      <button type="button" className="tl-x" aria-label={`إلغاء حجز ${b.customerName}`} onClick={() => cancel(b)}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {data && data.count === 0 && data.specialists.length > 0 && <p className="muted">لا توجد حجوزات في هذا اليوم.</p>}
    </section>
  );
}

// ---------------- services ----------------
function Services() {
  const { data, error, loading, reload } = useData(() => api<{ services: Service[] }>('/admin/services'), []);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get('name')),
      description: String(f.get('description') ?? ''),
      durationMin: Number(f.get('durationMin')),
      price: Number(f.get('price')),
      active: f.get('active') === 'on',
    };
    setBusy(true);
    setFormError('');
    try {
      if (editing === 'new') await api('/admin/services', { method: 'POST', body });
      else if (editing) await api(`/admin/services/${editing.id}`, { method: 'PUT', body });
      setEditing(null);
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="إدارة الخدمات">
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(''); setEditing('new'); }}>
          + خدمة جديدة
        </button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {editing && (
        <form className="card form" onSubmit={save} key={editing === 'new' ? 'new' : editing.id}>
          <h2>{editing === 'new' ? 'خدمة جديدة' : 'تعديل الخدمة'}</h2>
          <Field label="الاسم" id="s-name">
            <input id="s-name" name="name" required minLength={2} defaultValue={editing === 'new' ? '' : editing.name} />
          </Field>
          <Field label="الوصف" id="s-desc">
            <input id="s-desc" name="description" defaultValue={editing === 'new' ? '' : editing.description} />
          </Field>
          <div className="row">
            <Field label="المدة (دقيقة)" id="s-dur">
              <input id="s-dur" name="durationMin" type="number" min={5} max={480} step={5} required dir="ltr" defaultValue={editing === 'new' ? 30 : editing.durationMin} />
            </Field>
            <Field label="السعر (ر.س)" id="s-price">
              <input id="s-price" name="price" type="number" min={0} required dir="ltr" defaultValue={editing === 'new' ? 50 : editing.price} />
            </Field>
          </div>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={editing === 'new' ? true : editing.active} /> مفعّلة (تظهر للعملاء)
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
          </div>
        </form>
      )}
      {data && data.services.length === 0 && <Empty title="لا توجد خدمات بعد" />}
      {data && data.services.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">قائمة الخدمات</caption>
            <thead>
              <tr><th scope="col">الخدمة</th><th scope="col">المدة</th><th scope="col">السعر</th><th scope="col">الحالة</th><th scope="col"><span className="sr-only">إجراءات</span></th></tr>
            </thead>
            <tbody>
              {data.services.map((s) => (
                <tr key={s.id}>
                  <th scope="row">{s.name}</th>
                  <td>{durationLabel(s.durationMin)}</td>
                  <td>{money(s.price)}</td>
                  <td><span className={'badge ' + (s.active ? 'confirmed' : 'cancelled')}>{s.active ? 'مفعّلة' : 'متوقفة'}</span></td>
                  <td><button type="button" className="btn btn-ghost" onClick={() => { setFormError(''); setEditing(s); }}>تعديل</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------- specialists ----------------
interface Sp {
  id: number;
  name: string;
  title: string;
  active: boolean;
  serviceIds: number[];
  hours: { weekday: number; start: string; end: string }[];
}

function Specialists() {
  const sp = useData(() => api<{ specialists: Sp[] }>('/admin/specialists'), []);
  const sv = useData(() => api<{ services: Service[] }>('/admin/services'), []);
  const [editing, setEditing] = useState<Sp | 'new' | null>(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const hours = [0, 1, 2, 3, 4, 5, 6]
      .filter((d) => f.get(`on-${d}`) === 'on')
      .map((d) => ({ weekday: d, start: String(f.get(`start-${d}`)), end: String(f.get(`end-${d}`)) }));
    const body = {
      name: String(f.get('name')),
      title: String(f.get('title') ?? ''),
      active: f.get('active') === 'on',
      serviceIds: f.getAll('service').map(Number),
      hours,
    };
    setBusy(true);
    setFormError('');
    try {
      if (editing === 'new') await api('/admin/specialists', { method: 'POST', body });
      else if (editing) await api(`/admin/specialists/${editing.id}`, { method: 'PUT', body });
      setEditing(null);
      sp.reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const cur = editing && editing !== 'new' ? editing : null;
  const hourOf = (d: number) => cur?.hours.find((h) => h.weekday === d);

  return (
    <section aria-label="إدارة الأخصائيين">
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={() => { setFormError(''); setEditing('new'); }}>
          + أخصائي جديد
        </button>
      </div>
      {sp.loading && !sp.data && <Spinner />}
      {sp.error && <ErrorBox message={sp.error} onRetry={sp.reload} />}
      {editing && (
        <form className="card form" onSubmit={save} key={cur ? cur.id : 'new'}>
          <h2>{cur ? 'تعديل الأخصائي' : 'أخصائي جديد'}</h2>
          <div className="row">
            <Field label="الاسم" id="p-name">
              <input id="p-name" name="name" required minLength={2} defaultValue={cur?.name ?? ''} />
            </Field>
            <Field label="المسمّى" id="p-title">
              <input id="p-title" name="title" defaultValue={cur?.title ?? ''} />
            </Field>
          </div>
          <fieldset>
            <legend>الخدمات التي يقدّمها</legend>
            <div className="checks">
              {sv.data?.services.map((s) => (
                <label className="check" key={s.id}>
                  <input type="checkbox" name="service" value={s.id} defaultChecked={cur?.serviceIds.includes(s.id)} /> {s.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>ساعات العمل الأسبوعية (اتركه بلا تحديد ليوم الإجازة)</legend>
            <div className="hours">
              {WEEK_ORDER.map((d) => {
                const h = hourOf(d);
                return (
                  <div className="hours-row" key={d}>
                    <label className="check">
                      <input type="checkbox" name={`on-${d}`} defaultChecked={!!h} /> {DAY_NAMES[d]}
                    </label>
                    <label className="sr-only" htmlFor={`st-${d}`}>بداية {DAY_NAMES[d]}</label>
                    <input id={`st-${d}`} type="time" name={`start-${d}`} defaultValue={h?.start ?? '10:00'} dir="ltr" />
                    <span aria-hidden="true">–</span>
                    <label className="sr-only" htmlFor={`en-${d}`}>نهاية {DAY_NAMES[d]}</label>
                    <input id={`en-${d}`} type="time" name={`end-${d}`} defaultValue={h?.end ?? '20:00'} dir="ltr" />
                  </div>
                );
              })}
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={cur ? cur.active : true} /> فعّال (يقبل الحجوزات)
          </label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>إلغاء</button>
          </div>
        </form>
      )}
      {sp.data && sp.data.specialists.length === 0 && <Empty title="لا يوجد أخصائيون بعد" />}
      <ul className="grid cards" role="list">
        {sp.data?.specialists.map((s) => (
          <li className="card" key={s.id}>
            <h3>{s.name} {!s.active && <span className="badge cancelled">متوقف</span>}</h3>
            <p className="muted">{s.title}</p>
            <p className="muted">
              {s.hours.length === 0
                ? 'لا ساعات عمل'
                : WEEK_ORDER.filter((d) => s.hours.some((h) => h.weekday === d))
                    .map((d) => {
                      const h = s.hours.find((x) => x.weekday === d)!;
                      return `${DAY_NAMES[d]} ${h.start}–${h.end}`;
                    })
                    .join(' · ')}
            </p>
            <button type="button" className="btn btn-ghost" onClick={() => { setFormError(''); setEditing(s); }}>تعديل</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------- customers ----------------
function Customers() {
  const { data, error, loading, reload } = useData(
    () => api<{ customers: { id: number; name: string; phone: string; bookings: number; spent: number; lastVisit: string | null }[] }>('/admin/customers'),
    [],
  );
  return (
    <section aria-label="العملاء">
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && data.customers.length === 0 && <Empty title="لا يوجد عملاء مسجّلون بعد" />}
      {data && data.customers.length > 0 && (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">قائمة العملاء</caption>
            <thead>
              <tr><th scope="col">الاسم</th><th scope="col">الجوال</th><th scope="col">الحجوزات</th><th scope="col">الإنفاق</th><th scope="col">آخر زيارة</th></tr>
            </thead>
            <tbody>
              {data.customers.map((c) => (
                <tr key={c.id}>
                  <th scope="row">{c.name}</th>
                  <td dir="ltr" className="start">{c.phone}</td>
                  <td>{c.bookings}</td>
                  <td>{money(c.spent)}</td>
                  <td>{c.lastVisit ? dateLabel(c.lastVisit, true) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------- revenue ----------------
function Revenue() {
  const { data, error, loading, reload } = useData(
    () =>
      api<{
        days: { date: string; total: number; count: number }[];
        total: number;
        count: number;
        today: { total: number; count: number };
      }>('/admin/revenue'),
    [],
  );
  const max = data ? Math.max(1, ...data.days.map((d) => d.total)) : 1;
  return (
    <section aria-label="الإيرادات اليومية">
      {loading && !data && <Spinner />}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="grid stats">
            <div className="card stat"><span className="muted">إيراد اليوم</span><strong>{money(data.today.total)}</strong><small>{data.today.count} حجز</small></div>
            <div className="card stat"><span className="muted">آخر 14 يوماً</span><strong>{money(data.total)}</strong><small>{data.count} حجز</small></div>
          </div>
          <div className="table-wrap">
            <table>
              <caption className="sr-only">الإيراد اليومي</caption>
              <thead><tr><th scope="col">اليوم</th><th scope="col">الحجوزات</th><th scope="col">الإيراد</th><th scope="col"><span className="sr-only">الرسم</span></th></tr></thead>
              <tbody>
                {[...data.days].reverse().map((d) => (
                  <tr key={d.date}>
                    <th scope="row">{dateLabel(d.date)}</th>
                    <td>{d.count}</td>
                    <td>{money(d.total)}</td>
                    <td className="bar-cell" aria-hidden="true"><span className="bar" style={{ inlineSize: `${(d.total / max) * 100}%` }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
