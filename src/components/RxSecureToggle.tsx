/*
 * "منع لقطات الشاشة" toggle that lives inside the prescription screen itself.
 *
 * Before v1.8.0 the only switch was in Settings (المزيد → قفل التطبيق), which meant a
 * pharmacist had to leave the prescription, change a global setting, and come back.
 * This card flags the prescription you are looking at (stored per id) and applies the
 * Android FLAG_SECURE immediately through the native bridge; unsaved analyses fall back
 * to the device-wide switch.
 */
import { useEffect, useState } from 'react';
import { EyeOff, Info, MonitorOff, Smartphone } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useToast } from './ui';
import {
  applyNativeSecure, effectiveSecure, globalSecure, isRxSecure, nativeSecureAvailable,
  setGlobalSecure, setRxSecure,
} from '../lib/secure';
import { cx } from '../lib/utils';

export default function RxSecureToggle({ rxId }: { rxId?: number | null }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const hasRecord = typeof rxId === 'number' && Number.isFinite(rxId);
  const [on, setOn] = useState(() => (hasRecord ? effectiveSecure(rxId) : globalSecure()));
  const native = nativeSecureAvailable();

  /* Keep the native flag in sync with the screen, and hand the global value back on exit
     (the catalogue and the rest of the app follow the device-wide setting). */
  useEffect(() => {
    const next = hasRecord ? effectiveSecure(rxId) : globalSecure();
    setOn(next);
    applyNativeSecure(next);
    return () => { applyNativeSecure(globalSecure()); };
  }, [rxId, hasRecord]);

  const toggle = () => {
    const next = !on;
    if (hasRecord) setRxSecure(Number(rxId), next);
    else setGlobalSecure(next);
    setOn(next);
    push(
      next
        ? (ar ? 'سُجّل منع لقطات الشاشة' : 'Screenshot protection enabled')
        : (ar ? 'أُلغي منع لقطات الشاشة' : 'Screenshot protection disabled'),
      'success',
    );
  };

  const scope = hasRecord
    ? (ar ? `لهذه الوصفة (#${rxId})` : `This prescription (#${rxId})`)
    : (ar ? 'افتراضي على هذا الجهاز' : 'Device default');

  return (
    <div className={cx(
      'card flex items-start gap-3 p-3',
      on && 'border-brand-500/30 bg-brand-500/[.06]',
    )}>
      <span className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
        on ? 'bg-brand-500/15 text-brand-300' : 'bg-white/[.05] text-ink-500',
      )}>
        {on ? <MonitorOff className="h-4.5 w-4.5" /> : <EyeOff className="h-4.5 w-4.5" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[12px] font-extrabold">{ar ? 'منع لقطات الشاشة' : 'Block screenshots'}</h3>
          <span className="rounded-full bg-white/[.06] px-1.5 py-0.5 text-[9px] font-bold text-ink-300">{scope}</span>
        </div>
        <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">
          {on
            ? (ar ? 'الصورة والتحليل محميّان الآن: لا لقطة شاشة ولا تسجيل، والصور تظهر سوداء في التطبيقات الأخرى.' : 'The photo and analysis are protected now: screenshots, screen recording and thumbnails show black.')
            : (ar ? 'التصوير مسموح لبقية التطبيق. فعّل المفتاح لحماية صورة الوصفة وبيانات المريض.' : 'Captures are allowed for the rest of the app. Turn this on to protect the prescription photo and patient data.')}
        </p>

        {!native && (
          <p className="mt-1 flex items-start gap-1 text-[10px] leading-4 text-amber-200/90">
            <Info className="mt-px h-3 w-3 shrink-0" />
            {ar
              ? 'يُطبَّق فعليًا في تطبيق أندرويد فقط؛ المتصفح لا يستطيع منع لقطات الشاشة (يُحفظ الاختيار للنسخة المثبّتة).'
              : 'Only the Android app can enforce it; a browser cannot block captures (the choice is saved for the installed app).'}
          </p>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={ar ? 'منع لقطات الشاشة' : 'Block screenshots'}
        onClick={toggle}
        className={cx(
          'relative mt-0.5 h-7 w-12 shrink-0 rounded-full border transition',
          on ? 'border-brand-400/50 bg-brand-500/70' : 'border-white/10 bg-white/[.08]',
        )}
      >
        <span className={cx(
          'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all',
          on ? 'start-6' : 'start-1',
        )} />
        <Smartphone className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-white/40" />
      </button>

      {hasRecord && isRxSecure(rxId) && !globalSecure() && (
        <span className="sr-only">{ar ? 'محميّة على مستوى الوصفة' : 'protected per prescription'}</span>
      )}
    </div>
  );
}
