/*
 * The lock gate. Rendered above everything (the app stays mounted behind it, so an
 * in-flight sync or a half-filled form is never lost).
 */
import { useEffect, useState } from 'react';
import { Delete, Fingerprint, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { useAppLock } from '../lib/lock';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { cx } from '../lib/utils';

export default function LockScreen() {
  const { locked, unlock, unlockBiometric, biometricReady, lockoutSeconds, failsLeft, forget } = useAppLock();
  const { logout } = useAuth();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lockoutSeconds]);

  useEffect(() => { if (pin.length === 6 || pin.length === 8) void submit(); }, [pin]); // convenience: auto-submit at 6/8

  const lockedOut = lockoutSeconds > 0;

  const submit = async () => {
    if (busy || lockedOut) return;
    if (pin.length < 4) { setError(ar ? 'الرقم قصير' : 'Too short'); return; }
    setBusy(true);
    setError('');
    const ok = await unlock(pin);
    setBusy(false);
    if (!ok) {
      setPin('');
      setError(ar ? 'رقم غير صحيح' : 'Wrong PIN');
      setShake(true);
      setTimeout(() => setShake(false), 420);
    }
  };

  const press = (d: string) => {
    if (busy || lockedOut || pin.length >= 8) return;
    setError('');
    setPin((p) => p + d);
  };

  const dots = Math.max(6, pin.length);

  return (
    <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-5 bg-ink-950 px-6" role="dialog" aria-modal="true" aria-label={ar ? 'قفل التطبيق' : 'App lock'}>
      <div className="app-bg absolute inset-0 -z-10" aria-hidden="true" />

      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-grad shadow-float">
        <Lock className="h-8 w-8 on-color" />
      </div>

      <div className="text-center">
        <h1 className="text-[17px] font-extrabold text-white">{ar ? 'التطبيق مقفل' : 'App locked'}</h1>
        <p className="mt-1 text-[11.5px] text-ink-400">
          {ar ? 'أدخل رقمك السري للمتابعة' : 'Enter your PIN to continue'}
        </p>
      </div>

      <div className={cx('flex items-center gap-2.5 transition', shake && 'animate-[shake_.42s_ease]')} aria-live="polite">
        {Array.from({ length: dots }).map((_, i) => (
          <span key={i} className={cx('h-3 w-3 rounded-full transition', i < pin.length ? 'scale-110 bg-brand-400' : 'bg-white/15')} />
        ))}
      </div>
      <div className="h-4 text-[11px] font-bold text-rose-300" role="alert">
        {lockedOut ? (ar ? `محاولات كثيرة — انتظر ${lockoutSeconds} ثانية` : `Too many tries — wait ${lockoutSeconds}s`) : error}
      </div>

      <div className="grid w-full max-w-[292px] grid-cols-3 gap-2.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => press(d)} disabled={lockedOut || busy}
            className="h-14 rounded-2xl border border-white/[.08] bg-white/[.05] text-[19px] font-bold text-white transition active:scale-95 hover:bg-white/[.09] disabled:opacity-40">
            {d}
          </button>
        ))}
        <button onClick={() => biometricReady && unlockBiometric()} disabled={!biometricReady || lockedOut || busy}
          className={cx('flex h-14 items-center justify-center rounded-2xl border border-white/[.08] transition active:scale-95',
            biometricReady ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25' : 'bg-white/[.03] text-ink-600')}
          aria-label={ar ? 'فتح بالبصمة' : 'Unlock with biometrics'}>
          <Fingerprint className="h-6 w-6" />
        </button>
        <button onClick={() => press('0')} disabled={lockedOut || busy}
          className="h-14 rounded-2xl border border-white/[.08] bg-white/[.05] text-[19px] font-bold text-white transition active:scale-95 hover:bg-white/[.09] disabled:opacity-40">0</button>
        <button onClick={() => setPin((p) => p.slice(0, -1))} disabled={lockedOut || busy}
          className="flex h-14 items-center justify-center rounded-2xl border border-white/[.08] bg-white/[.05] text-ink-300 transition active:scale-95 hover:bg-white/[.09] disabled:opacity-40"
          aria-label={ar ? 'حذف' : 'Delete'}>
          <Delete className="h-5 w-5" />
        </button>
      </div>

      <button onClick={submit} disabled={pin.length < 4 || busy || lockedOut} className="btn-primary h-11 w-full max-w-[292px] text-[12.5px]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {ar ? 'فتح' : 'Unlock'}
      </button>

      {!lockedOut && failsLeft < 4 && (
        <p className="text-[10.5px] text-amber-300">{ar ? `متبقٍ ${failsLeft} محاولات قبل الانتظار` : `${failsLeft} attempts left`}</p>
      )}

      <div className="text-center">
        {!forgot ? (
          <button onClick={() => setForgot(true)} className="text-[10.5px] font-semibold text-ink-500 underline-offset-4 hover:underline">
            {ar ? 'نسيت الرقم السري؟' : 'Forgot the PIN?'}
          </button>
        ) : (
          <div className="max-w-[300px] rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-[10.5px] leading-5 text-rose-200">
            <p>{ar ? 'لا يمكن استرجاع الرقم. الخروج من الحساب يمسح القفل والبيانات المؤقتة على هذا الجهاز (بيانات الخادم لا تتأثر).' : 'The PIN cannot be recovered. Signing out clears the lock and local caches on this device.'}</p>
            <div className="mt-2 flex gap-2">
              <button onClick={() => { forget(); logout(); }} className="btn-danger flex-1 py-1.5 text-[10.5px]">{ar ? 'تأكيد الخروج' : 'Sign out'}</button>
              <button onClick={() => setForgot(false)} className="btn-ghost flex-1 py-1.5 text-[10.5px]">{ar ? 'إلغاء' : 'Cancel'}</button>
            </div>
          </div>
        )}
      </div>

      <p className="max-w-[300px] text-center text-[9.5px] leading-4 text-ink-600">
        {ar ? 'قفل محلي على هذا الجهاز فقط — لا يُرسل رقمك إلى الخادم، ولا يمكن استرجاعه.' : 'A local device lock — the PIN never leaves the phone.'}
      </p>
    </div>
  );
}
