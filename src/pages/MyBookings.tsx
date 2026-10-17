import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { api, dateLabel, money, useData, useTitle, type Booking } from '../lib';
import { Empty, ErrorBox, Spinner } from '../ui';

const STATUS = { confirmed: 'مؤكَّد', cancelled: 'ملغى' } as const;

export function MyBookings() {
  useTitle('حجوزاتي');
  const { user, ready } = useAuth();
  const { data, error, loading, reload } = useData(
    () => (user ? api<{ bookings: Booking[] }>('/bookings/mine') : Promise.resolve(null)),
    [user?.id],
  );
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  if (ready && !user) return <Navigate to="/login?next=/my" replace />;

  async function cancel(id: number) {
    setBusy(true);
    setActionError('');
    try {
      await api(`/bookings/${id}/cancel`, { method: 'POST' });
      setConfirming(null);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page">
      <h1>حجوزاتي</h1>
      {(loading && !data) || !ready ? <Spinner /> : null}
      {error && <ErrorBox message={error} onRetry={reload} />}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {data && data.bookings.length === 0 && (
        <Empty title="لا توجد حجوزات بعد">
          <Link to="/book" className="btn btn-primary">
            احجز موعدك الأول
          </Link>
        </Empty>
      )}
      <ul className="list" role="list">
        {data?.bookings.map((b) => (
          <li key={b.id} className={'card booking' + (b.status === 'cancelled' ? ' is-cancelled' : '')}>
            <div className="booking-main">
              <h2>{b.serviceName}</h2>
              <p>
                {dateLabel(b.date, true)} — <bdi>{b.start}</bdi>
              </p>
              <p className="muted">مع {b.specialistName}</p>
            </div>
            <div className="booking-side">
              <strong>{money(b.price)}</strong>
              <span className={'badge ' + b.status}>{STATUS[b.status]}</span>
              {b.cancellable &&
                (confirming === b.id ? (
                  <span className="actions">
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => cancel(b.id)}>
                      نعم، ألغِ الحجز
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)}>
                      تراجع
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirming(b.id)}>
                    إلغاء الحجز
                  </button>
                ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
