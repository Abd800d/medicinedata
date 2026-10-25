import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronDown, Eye, EyeOff, Info, Lock, Mail, Server, ShieldCheck, Sparkles } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useConfig } from '../lib/config';
import { BrandHero, Field, useToast } from '../components/ui';
import { cx } from '../lib/utils';

declare global { interface Window { google?: any } }

function GoogleButton({ onCredential }: { onCredential: (c: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { config } = useConfig();
  const { t } = useI18n();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!config.google_client_id) return;
    const existing = document.getElementById('gsi-script');
    const init = () => {
      if (!window.google?.accounts?.id || !ref.current) return;
      window.google.accounts.id.initialize({
        client_id: config.google_client_id,
        callback: (res: any) => res?.credential && onCredential(res.credential),
      });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', width: 320, text: 'continue_with', shape: 'pill' });
      setReady(true);
    };
    if (existing) { init(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true; script.defer = true; script.id = 'gsi-script';
    script.onload = init;
    document.head.appendChild(script);
  }, [config.google_client_id]);

  if (!config.google_client_id) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-white/[.02] p-3 text-center text-[10.5px] leading-5 text-ink-400">
        <div className="mb-0.5 font-bold text-ink-300">
          {t('auth.googleUnavailable')}
        </div>
        {t('auth.googleHowTo')}
      </div>
    );
  }
  return <div ref={ref} className={cx('flex justify-center', !ready && 'hidden')} />;
}

export default function Auth() {
  const { t, lang } = useI18n();
  const { user, login, register, loginWithGoogle } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', city: '' });
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const from = (location.state as any)?.from || '/';

  useEffect(() => { if (user) navigate(from, { replace: true }); }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      push(lang === 'ar' ? 'مرحبًا بك في MDA' : 'Welcome to MDA');
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.message === 'NETWORK' ? t('errors.network') : err.message || t('common.error'));
    } finally { setBusy(false); }
  };

  const google = async (credential: string) => {
    setError(''); setBusy(true);
    try { await loginWithGoogle(credential); navigate(from, { replace: true }); }
    catch (err: any) { setError(err.message || t('common.error')); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-4 pt-2">
      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(120%_100%_at_90%_0%,rgba(34,211,238,.28),transparent_55%),radial-gradient(90%_90%_at_0%_100%,rgba(27,109,255,.45),transparent_60%),linear-gradient(160deg,#08152c,#050c1a)] px-5 pb-6 pt-7">
        <div className="pointer-events-none absolute -end-10 -top-12 h-40 w-40 rounded-full bg-aqua-400/20 blur-2xl" />
        <BrandHero className="relative" />
        <h1 className="relative mt-5 text-center text-[19px] font-black text-white">
          {mode === 'login' ? t('auth.welcomeBack') : t('auth.createAccount')}
        </h1>
        <p className="relative mx-auto mt-1 max-w-[280px] text-center text-[11px] leading-5 text-ink-400">
          {lang === 'ar' ? 'احفظ وصفاتك، تابع الأدوية، وتواصل مع الإدارة والمجتمع.' : 'Save prescriptions, follow medicines and connect with the community.'}
        </p>
      </div>

      <div className="card -mt-8 p-4 pt-5">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-white/[.06] bg-ink-950/60 p-1">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(''); }} className={cx('rounded-xl py-2 text-[12px] font-bold transition', mode === m ? 'bg-brand-grad text-white shadow-float' : 'text-ink-400 hover:text-white')}>
              {m === 'login' ? t('common.login') : t('common.register')}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <Field label={t('auth.name')} required>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required placeholder={lang === 'ar' ? 'د. عبدالمجيد…' : 'Dr. Abdulmajeed…'} />
            </Field>
          )}
          <Field label={t('auth.email')} required>
            <div className="relative">
              <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input ps-9" required dir="ltr" placeholder="you@example.com" autoComplete="email" />
            </div>
          </Field>
          <Field label={t('auth.password')} hint={mode === 'register' ? t('auth.passwordHint') : undefined} required>
            <div className="relative">
              <Lock className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input type={showPw ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input px-9" required minLength={6} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-ink-400">{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </Field>
          {mode === 'register' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('auth.phone')}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" dir="ltr" placeholder="+967…" /></Field>
              <Field label={t('auth.city')}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" placeholder={lang === 'ar' ? 'صنعاء' : 'Sanaa'} /></Field>
            </div>
          )}
          {error && <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] font-semibold text-rose-300">{error}</div>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '…' : mode === 'login' ? t('common.login') : t('common.register')}
            {lang === 'ar' ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3"><span className="hairline flex-1" /><span className="text-[10.5px] font-semibold text-ink-500">{t('auth.or')}</span><span className="hairline flex-1" /></div>
        <GoogleButton onCredential={google} />
        <div className="mt-4 text-center text-[11px] text-ink-500">
          {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
          <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')} className="font-bold text-brand-300">
            {mode === 'login' ? t('common.register') : t('common.login')}
          </button>
        </div>
      </div>

      <details className="card group p-3.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-[11.5px] font-bold text-ink-200">
          <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/15 text-brand-200">
            <Info className="h-3.5 w-3.5" />
          </span>
          {lang === 'ar' ? 'كيف أُنشئ حسابًا؟' : 'How do I create an account?'}
          <ChevronDown className="ms-auto h-3.5 w-3.5 text-ink-500 transition group-open:rotate-180" />
        </summary>
        <ol className="mt-2.5 space-y-2 text-[11px] leading-6 text-ink-300">
          {(lang === 'ar' ? [
            'الحساب يُحفظ على خادم MDA، لذلك احرص أن يكون التطبيق مرتبطًا بالخادم أولًا.',
            'اضغط تبويب «إنشاء حساب» واملأ الاسم والبريد وكلمة المرور (٦ أحرف على الأقل).',
            'أو استخدم «الدخول بحساب Google» — يظهر بعد أن يفعّله مالك التطبيق من لوحة التحكم.',
            'بعد التسجيل يصلح الحساب للمجتمع والصيدلية والوصفات على كل أجهزتك.',
          ] : [
            'Accounts live on the MDA server, so connect the app to your server first.',
            'Open the "Create account" tab and fill in name, email and a password (6+ characters).',
            'Or use "Continue with Google" — shown once the owner enables it from the dashboard.',
            'The same account then works for community, pharmacy and prescriptions on all devices.',
          ]).map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white/[.08] text-[9px] font-bold text-ink-200">{i + 1}</span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <Link to="/server" className="btn-ghost mt-2.5 w-full justify-center text-[11px]">
          <Server className="h-3.5 w-3.5" />
          {lang === 'ar' ? 'الخادم والاتصال' : 'Server & connection'}
        </Link>
      </details>

      <div className="flex items-center justify-center gap-2 rounded-2xl border border-brand-400/20 bg-brand-500/10 p-3 text-[10.5px] font-medium text-brand-200">
        <ShieldCheck className="h-3.5 w-3.5" />
        {lang === 'ar' ? 'بياناتك محمية ولا تُشارك مع أي طرف ثالث.' : 'Your data is private and never shared.'}
      </div>
      <div className="text-center">
        <Link to="/" className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-400"><Sparkles className="h-3 w-3" />{lang === 'ar' ? 'المتابعة كزائر' : 'Continue as guest'}</Link>
      </div>
    </div>
  );
}
