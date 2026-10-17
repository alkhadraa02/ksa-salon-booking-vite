import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import {
  addDays,
  api,
  dateLabel,
  durationLabel,
  money,
  todayStr,
  useData,
  useTitle,
  weekday,
  type Booking,
  type Service,
  type Specialist,
} from '../lib';
import { Empty, ErrorBox, Spinner } from '../ui';

const DAYS_AHEAD = 14;

export function Book() {
  useTitle('احجز موعداً');
  const { user } = useAuth();
  const [params] = useSearchParams();
  const initial = Number(params.get('service')) || null;

  const [serviceId, setServiceId] = useState<number | null>(initial);
  const [specialistId, setSpecialistId] = useState<number | null>(null);
  const [date, setDate] = useState<string>(todayStr());
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState<Booking | null>(null);

  const services = useData(() => api<{ services: Service[] }>('/services'), []);
  const specialists = useData(
    () => (serviceId ? api<{ specialists: Specialist[] }>(`/specialists?serviceId=${serviceId}`) : Promise.resolve(null)),
    [serviceId],
  );
  const slots = useData(
    () =>
      serviceId && specialistId
        ? api<{ slots: string[] }>(`/availability?serviceId=${serviceId}&specialistId=${specialistId}&date=${date}`)
        : Promise.resolve(null),
    [serviceId, specialistId, date],
  );

  const service = services.data?.services.find((s) => s.id === serviceId);
  const specialist = specialists.data?.specialists.find((s) => s.id === specialistId);
  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(todayStr(), i)), []);

  useEffect(() => {
    setTime(null);
  }, [serviceId, specialistId, date]);
  useEffect(() => {
    setSpecialistId(null);
  }, [serviceId]);

  async function confirm() {
    if (!serviceId || !specialistId || !time) return;
    setBusy(true);
    setSubmitError('');
    try {
      const r = await api<{ booking: Booking }>('/bookings', {
        method: 'POST',
        body: { serviceId, specialistId, date, time },
      });
      setDone(r.booking);
    } catch (e) {
      setSubmitError((e as Error).message);
      slots.reload();
      setTime(null);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="container page narrow">
        <div className="card success" role="status">
          <h1>تم تأكيد حجزك ✓</h1>
          <dl className="summary">
            <dt>الخدمة</dt>
            <dd>{done.serviceName}</dd>
            <dt>الأخصائي</dt>
            <dd>{done.specialistName}</dd>
            <dt>الموعد</dt>
            <dd>
              {dateLabel(done.date, true)} — {done.start}
            </dd>
            <dt>السعر</dt>
            <dd>{money(done.price)}</dd>
          </dl>
          <div className="actions">
            <Link to="/my" className="btn btn-primary">
              حجوزاتي
            </Link>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setDone(null);
                setTime(null);
                slots.reload();
              }}
            >
              حجز آخر
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container page">
      <h1>احجز موعداً</h1>

      <section aria-labelledby="step1" className="step">
        <h2 id="step1">
          <span className="num">1</span> اختر الخدمة
        </h2>
        {services.loading && !services.data && <Spinner />}
        {services.error && <ErrorBox message={services.error} onRetry={services.reload} />}
        {services.data && services.data.services.length === 0 && <Empty title="لا توجد خدمات متاحة حالياً" />}
        <div className="grid choices" role="radiogroup" aria-labelledby="step1">
          {services.data?.services.map((s) => (
            <button
              type="button"
              key={s.id}
              role="radio"
              aria-checked={serviceId === s.id}
              className={'choice' + (serviceId === s.id ? ' selected' : '')}
              onClick={() => setServiceId(s.id)}
            >
              <strong>{s.name}</strong>
              <span className="muted">{durationLabel(s.durationMin)}</span>
              <span>{money(s.price)}</span>
            </button>
          ))}
        </div>
      </section>

      {serviceId && (
        <section aria-labelledby="step2" className="step">
          <h2 id="step2">
            <span className="num">2</span> اختر الأخصائي
          </h2>
          {specialists.loading && !specialists.data && <Spinner />}
          {specialists.error && <ErrorBox message={specialists.error} onRetry={specialists.reload} />}
          {specialists.data && specialists.data.specialists.length === 0 && (
            <Empty title="لا يوجد أخصائي متاح لهذه الخدمة حالياً" />
          )}
          <div className="grid choices" role="radiogroup" aria-labelledby="step2">
            {specialists.data?.specialists.map((s) => (
              <button
                type="button"
                key={s.id}
                role="radio"
                aria-checked={specialistId === s.id}
                className={'choice' + (specialistId === s.id ? ' selected' : '')}
                onClick={() => setSpecialistId(s.id)}
              >
                <strong>{s.name}</strong>
                <span className="muted">{s.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {serviceId && specialistId && (
        <section aria-labelledby="step3" className="step">
          <h2 id="step3">
            <span className="num">3</span> اختر اليوم والوقت
          </h2>
          <div className="days" role="radiogroup" aria-label="اليوم">
            {days.map((d) => (
              <button
                type="button"
                key={d}
                role="radio"
                aria-checked={date === d}
                className={'day' + (date === d ? ' selected' : '')}
                onClick={() => setDate(d)}
              >
                <span>{d === todayStr() ? 'اليوم' : dateLabel(d).split(' ')[0]}</span>
                <strong>{Number(d.slice(8))}</strong>
                <small className="hide-sm">{weekday(d) === 5 ? 'الجمعة' : ''}</small>
              </button>
            ))}
          </div>
          <p className="muted">{dateLabel(date, true)}</p>
          {slots.loading && !slots.data && <Spinner label="جارٍ تحميل الأوقات…" />}
          {slots.error && <ErrorBox message={slots.error} onRetry={slots.reload} />}
          {slots.data && slots.data.slots.length === 0 && (
            <Empty title="لا توجد أوقات متاحة في هذا اليوم">
              <p className="muted">جرّب يوماً آخر أو أخصائياً آخر.</p>
            </Empty>
          )}
          <div className="slots" role="radiogroup" aria-label="الوقت">
            {slots.data?.slots.map((t) => (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={time === t}
                className={'slot' + (time === t ? ' selected' : '')}
                onClick={() => setTime(t)}
              >
                <bdi>{t}</bdi>
              </button>
            ))}
          </div>
        </section>
      )}

      {service && specialist && time && (
        <section aria-labelledby="step4" className="step">
          <h2 id="step4">
            <span className="num">4</span> تأكيد الحجز
          </h2>
          <div className="card">
            <dl className="summary">
              <dt>الخدمة</dt>
              <dd>
                {service.name} ({durationLabel(service.durationMin)})
              </dd>
              <dt>الأخصائي</dt>
              <dd>{specialist.name}</dd>
              <dt>الموعد</dt>
              <dd>
                {dateLabel(date, true)} — <bdi>{time}</bdi>
              </dd>
              <dt>السعر</dt>
              <dd>{money(service.price)} (الدفع في الصالون)</dd>
            </dl>
            {submitError && (
              <p className="form-error" role="alert">
                {submitError}
              </p>
            )}
            {user ? (
              <button type="button" className="btn btn-primary btn-lg" onClick={confirm} disabled={busy}>
                {busy ? 'جارٍ التأكيد…' : 'تأكيد الحجز'}
              </button>
            ) : (
              <p>
                <Link
                  className="btn btn-primary"
                  to={`/login?next=${encodeURIComponent(`/book?service=${serviceId}`)}`}
                >
                  سجّل الدخول لتأكيد الحجز
                </Link>
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
