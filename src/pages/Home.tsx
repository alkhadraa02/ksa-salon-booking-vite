import { Link } from 'react-router-dom';
import { api, durationLabel, money, useData, useTitle, type Service } from '../lib';
import { Empty, ErrorBox, Spinner } from '../ui';

export function Home() {
  useTitle('احجز موعدك أونلاين');
  const { data, error, loading, reload } = useData(() => api<{ services: Service[] }>('/services'), []);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>أناقتك تبدأ بموعد</h1>
          <p className="lead">اختر الخدمة والأخصائي والوقت المناسب، وأكّد حجزك في أقل من دقيقة.</p>
          <Link to="/book" className="btn btn-primary btn-lg">
            احجز موعدك الآن
          </Link>
        </div>
      </section>

      <section className="container page" aria-labelledby="services-h">
        <h2 id="services-h">خدماتنا</h2>
        {loading && !data && <Spinner />}
        {error && <ErrorBox message={error} onRetry={reload} />}
        {data && data.services.length === 0 && <Empty title="لا توجد خدمات متاحة حالياً" />}
        {data && data.services.length > 0 && (
          <ul className="grid cards" role="list">
            {data.services.map((s) => (
              <li key={s.id} className="card">
                <h3>{s.name}</h3>
                <p className="muted">{s.description}</p>
                <div className="meta">
                  <span>{durationLabel(s.durationMin)}</span>
                  <strong>{money(s.price)}</strong>
                </div>
                <Link to={`/book?service=${s.id}`} className="btn btn-ghost">
                  احجز هذه الخدمة
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
