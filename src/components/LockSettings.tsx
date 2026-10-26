/*
 * "قفل التطبيق" card: enable / change / disable the PIN, choose when it re-locks,
 * and register the phone's fingerprint/face when the WebView supports it.
 */
import { useState } from 'react';
import { Fingerprint, KeyRound, Loader2, Lock, LockOpen, ShieldCheck, TimerReset } from 'lucide-react';
import { AUTO_OPTIONS, useAppLock } from '../lib/lock';
import { useI18n } from '../lib/i18n';
import { Badge, useToast } from './ui';
import { cx } from '../lib/utils';

const AUTO_LABEL = (m: number, ar: boolean) =>
  m === 0 ? (ar ? 'فورًا عند الخروج' : 'Immediately') :
  m === 1 ? (ar ? 'بعد دقيقة' : 'After 1 min') :
  m === 5 ? (ar ? 'بعد 5 دقائق' : 'After 5 min') :
  m === 15 ? (ar ? 'بعد 15 دقيقة' : 'After 15 min') : (ar ? 'بعد ساعة' : 'After 1 hour');

type Mode = null | 'enable' | 'change' | 'disable';

export default function LockSettings() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const lock = useAppLock();
  const [mode, setMode] = useState<Mode>(null);
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setMode(null); setPin(''); setConfirm(''); setOldPin(''); };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'enable') {
        if (pin !== confirm) { push(ar ? 'الرقمان غير متطابقين' : 'PINs do not match', 'error'); return; }
        await lock.enable(pin);
        push(ar ? 'تم تفعيل القفل — ستحتاج الرقم عند فتح التطبيق' : 'App lock enabled');
      } else if (mode === 'change') {
        if (pin !== confirm) { push(ar ? 'الرقمان غير متطابقين' : 'PINs do not match', 'error'); return; }
        const ok = await lock.changePin(oldPin, pin);
        push(ok ? (ar ? 'تم تغيير الرقم' : 'PIN changed') : (ar ? 'الرقم الحالي غير صحيح' : 'Current PIN is wrong'), ok ? 'success' : 'error');
        if (!ok) return;
      } else if (mode === 'disable') {
        const ok = await lock.disable(pin);
        push(ok ? (ar ? 'تم إيقاف القفل' : 'App lock disabled') : (ar ? 'رقم غير صحيح' : 'Wrong PIN'), ok ? 'success' : 'error');
        if (!ok) return;
      }
      reset();
    } catch (e: any) {
      push(e?.message === 'pin-invalid' ? (ar ? 'الرقم يجب أن يكون 4–8 أرقام' : 'PIN must be 4–8 digits') : (ar ? 'تعذر تنفيذ العملية' : 'Failed'), 'error');
    } finally { setBusy(false); }
  };

  if (!lock.supported) {
    return (
      <div className="card p-4 text-[11px] leading-5 text-ink-400">
        {ar ? 'المتصفح لا يدعم التشفير المطلوب لقفل التطبيق (WebCrypto). استخدم Chrome حديثًا أو نسخة أندرويد.' : 'WebCrypto is unavailable in this browser, so the app lock is disabled.'}
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl', lock.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[.05] text-ink-400')}>
          {lock.enabled ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold text-white">{ar ? 'قفل التطبيق' : 'App lock'}</div>
          <div className="text-[10px] text-ink-400">
            {lock.enabled
              ? (ar ? `مفعّل · ${AUTO_LABEL(lock.autoLockMinutes, ar)}` : `On · ${AUTO_LABEL(lock.autoLockMinutes, ar)}`)
              : (ar ? 'رقم سري محلي عند فتح التطبيق' : 'Local PIN on open')}
          </div>
        </div>
        <Badge tone={lock.enabled ? 'emerald' : 'neutral'}>{lock.enabled ? (ar ? 'مفعّل' : 'on') : (ar ? 'مغلق' : 'off')}</Badge>
      </div>

      {!lock.enabled ? (
        <button onClick={() => setMode('enable')} className="btn-primary mt-3 w-full text-[11.5px]">
          <KeyRound className="h-4 w-4" />{ar ? 'تعيين رقم سري' : 'Set a PIN'}
        </button>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <button onClick={() => lock.lockNow()} className="btn-ghost text-[10.5px]"><Lock className="h-3.5 w-3.5" />{ar ? 'اقفل الآن' : 'Lock'}</button>
            <button onClick={() => setMode('change')} className="btn-ghost text-[10.5px]"><KeyRound className="h-3.5 w-3.5" />{ar ? 'تغيير' : 'Change'}</button>
            <button onClick={() => setMode('disable')} className="btn-ghost text-[10.5px]"><LockOpen className="h-3.5 w-3.5" />{ar ? 'إيقاف' : 'Turn off'}</button>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold text-ink-400"><TimerReset className="h-3.5 w-3.5" />{ar ? 'متى يُقفل بعد مغادرة التطبيق؟' : 'Re-lock after'}</div>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
              {AUTO_OPTIONS.map((m) => (
                <button key={m} onClick={() => lock.setAutoLock(m)}
                  className={cx('rounded-lg py-1.5 text-[10px] font-bold transition', lock.autoLockMinutes === m ? 'bg-brand-grad on-color' : 'bg-white/[.06] text-ink-400')}>
                  {AUTO_LABEL(m, ar)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-white/[.08] p-2.5">
            <div className="flex items-center gap-2">
              <Fingerprint className={cx('h-4 w-4', lock.biometricReady ? 'text-emerald-300' : 'text-ink-500')} />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-white">{ar ? 'فتح بالبصمة أو الوجه' : 'Fingerprint / face unlock'}</div>
                <div className="text-[9.5px] leading-4 text-ink-500">
                  {lock.biometricReady
                    ? (ar ? 'مسجّل على هذا الجهاز — يبقى الرقم بديلًا دائمًا' : 'Registered on this device; the PIN always works')
                    : (ar ? 'يُسجَّل من إعدادات النظام على هذا الجهاز إن كان مدعومًا' : 'Uses the phone’s own biometrics when available')}
                </div>
              </div>
              <button onClick={async () => {
                const ok = await lock.registerBiometric();
                push(ok ? (ar ? 'تم تسجيل البصمة' : 'Biometric registered') : (ar ? 'الجهاز لا يدعم البصمة داخل التطبيق' : 'Biometrics unavailable here'), ok ? 'success' : 'error');
              }} className="btn-ghost shrink-0 px-2.5 py-1.5 text-[10px]">
                {lock.biometricReady ? (ar ? 'إعادة' : 'Re-register') : (ar ? 'تسجيل' : 'Register')}
              </button>
            </div>
          </div>
        </>
      )}

      {mode && (
        <div className="fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="card w-full max-w-sm p-4">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-300" />
              <h3 className="flex-1 text-[12.5px] font-extrabold">
                {mode === 'enable' ? (ar ? 'تعيين رقم سري' : 'Set a PIN') : mode === 'change' ? (ar ? 'تغيير الرقم' : 'Change PIN') : (ar ? 'إيقاف القفل' : 'Turn off')}
              </h3>
            </div>

            {mode === 'change' && (
              <input value={oldPin} onChange={(e) => setOldPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password"
                placeholder={ar ? 'الرقم الحالي' : 'Current PIN'} className="input mb-2 text-center tracking-[.4em]" />
            )}
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password"
              placeholder={mode === 'disable' ? (ar ? 'الرقم السري' : 'PIN') : (ar ? 'الرقم الجديد (4–8 أرقام)' : 'New PIN (4–8 digits)')}
              className="input text-center tracking-[.4em]" autoFocus />
            {mode !== 'disable' && (
              <input value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password"
                placeholder={ar ? 'تأكيد الرقم' : 'Confirm PIN'} className="input mt-2 text-center tracking-[.4em]" />
            )}

            <div className="mt-3 flex gap-2">
              <button onClick={submit} disabled={busy || pin.length < 4 || (mode === 'change' && oldPin.length < 4)} className="btn-primary flex-1 text-[11.5px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{ar ? 'تأكيد' : 'Confirm'}
              </button>
              <button onClick={reset} className="btn-ghost text-[11.5px]">{ar ? 'إلغاء' : 'Cancel'}</button>
            </div>
            <p className="mt-2 text-[9.5px] leading-4 text-ink-500">
              {ar ? 'يُحفظ الرقم مشفّرًا (PBKDF2) على هذا الجهاز فقط. لا يمكن استرجاعه إن نسيته — الحل الخروج من الحساب ومسح بيانات التطبيق.' : 'Stored as a PBKDF2 digest on this device only. It cannot be recovered.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
