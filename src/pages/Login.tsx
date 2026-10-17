import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTitle } from '../lib';
import { Field } from '../ui';

export function Login() {
  const { user, login, register, ready } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'login' | 'register'>(params.get('mode') === 'register' ? 'register' : 'login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useTitle(mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب');

  const rawNext = params.get('next') ?? '';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '';

  if (ready && user) return <Navigate to={next || (user.role === 'admin' ? '/admin' : '/my')} replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      const u =
        mode === 'login'
          ? await login(String(f.get('identifier')), String(f.get('password')))
          : await register(String(f.get('name')), String(f.get('phone')), String(f.get('password')));
      nav(next || (u.role === 'admin' ? '/admin' : '/my'), { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container page narrow">
      <h1>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب جديد'}</h1>
      <form className="card form" onSubmit={submit} noValidate>
        {mode === 'register' && (
          <>
            <Field label="الاسم" id="name">
              <input id="name" name="name" autoComplete="name" required minLength={2} />
            </Field>
            <Field label="رقم الجوال" id="phone" hint="مثال: 0501234567">
              <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" required />
            </Field>
          </>
        )}
        {mode === 'login' && (
          <Field label="رقم الجوال أو البريد الإلكتروني" id="identifier">
            <input id="identifier" name="identifier" autoComplete="username" dir="ltr" required />
          </Field>
        )}
        <Field label="كلمة المرور" id="password" hint={mode === 'register' ? '8 أحرف على الأقل' : undefined}>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'register' ? 8 : 1}
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'جارٍ المعالجة…' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
        </button>
      </form>
      <p className="muted center">
        {mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}{' '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setError('');
            setMode(mode === 'login' ? 'register' : 'login');
          }}
        >
          {mode === 'login' ? 'أنشئ حساباً' : 'سجّل الدخول'}
        </button>
      </p>
    </div>
  );
}
