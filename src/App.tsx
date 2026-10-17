import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useTitle } from './lib';
import { Home } from './pages/Home';
import { Book } from './pages/Book';
import { Login } from './pages/Login';
import { MyBookings } from './pages/MyBookings';
import { Admin } from './pages/Admin';

function Header() {
  const { user, logout, ready } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  const links = (
    <>
      <NavLink to="/" end>
        الرئيسية
      </NavLink>
      <NavLink to="/book">احجز موعداً</NavLink>
      {user && <NavLink to="/my">حجوزاتي</NavLink>}
      {user?.role === 'admin' && <NavLink to="/admin">لوحة الإدارة</NavLink>}
    </>
  );

  return (
    <header className="site-header">
      <div className="container bar">
        <Link to="/" className="brand" aria-label="صالون — الصفحة الرئيسية">
          <span className="brand-mark" aria-hidden="true">
            ✂
          </span>
          <span>صالون</span>
        </Link>
        <nav className="nav-desktop" aria-label="التنقّل الرئيسي">
          {links}
        </nav>
        <div className="bar-end">
          {ready &&
            (user ? (
              <>
                <span className="muted user-name">{user.name}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={async () => {
                    await logout();
                    nav('/');
                  }}
                >
                  خروج
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-ghost">
                دخول
              </Link>
            ))}
          <button
            type="button"
            className="menu-btn"
            aria-label={open ? 'إغلاق القائمة' : 'فتح القائمة'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">{open ? '✕' : '☰'}</span>
          </button>
        </div>
      </div>
      {open && (
        <>
          <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />
          <nav id="mobile-menu" className="drawer" aria-label="القائمة">
            {links}
          </nav>
        </>
      )}
    </header>
  );
}

function NotFound() {
  useTitle('الصفحة غير موجودة');
  return (
    <div className="container page">
      <h1>الصفحة غير موجودة</h1>
      <p className="muted">الرابط الذي طلبته غير متاح.</p>
      <Link to="/" className="btn btn-primary">
        العودة للرئيسية
      </Link>
    </div>
  );
}

export function App() {
  const loc = useLocation();
  useEffect(() => {
    // keep canonical in sync for the SPA
    const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (link) link.href = window.location.origin + (loc.pathname === '/' ? '/' : loc.pathname);
  }, [loc.pathname]);

  return (
    <>
      <a href="#main" className="skip">
        تخطَّ إلى المحتوى
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/book" element={<Book />} />
          <Route path="/login" element={<Login />} />
          <Route path="/my" element={<MyBookings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-footer">
        <div className="container">© {new Date().getFullYear()} صالون — جميع الحقوق محفوظة</div>
      </footer>
    </>
  );
}
