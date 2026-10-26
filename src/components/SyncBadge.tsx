import { Link } from 'react-router-dom';
import { CloudOff, Loader2, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSync } from '../lib/sync';
import { cx } from '../lib/utils';

/**
 * Always-visible connection + queue state.
 * Green = online & synced · amber = waiting offline work · red = needs action.
 */
export default function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { online, serverUp, syncing, counts } = useSync();

  const state = !online
    ? { tone: 'slate', icon: CloudOff, label: 'بدون إنترنت', hint: 'التصفح يعمل من الحزمة المحلية — التعديلات تُحفظ وتُزامن لاحقًا' }
    : !serverUp
      ? { tone: 'amber', icon: AlertTriangle, label: 'الخادم لا يستجيب', hint: 'قد تكون بياناتك محفوظة محليًا بانتظار المزامنة' }
      : syncing
        ? { tone: 'sky', icon: Loader2, label: 'تزامن…', hint: 'جارٍ إرسال التعديلات المحفوظة' }
        : counts.conflicts > 0
          ? { tone: 'rose', icon: AlertTriangle, label: `${counts.conflicts} تعارض`, hint: 'تحتاج قرارًا منك' }
          : counts.failed > 0
            ? { tone: 'rose', icon: AlertTriangle, label: `${counts.failed} فشل`, hint: 'عملية لم تُقبل من الخادم' }
            : counts.pending > 0
              ? { tone: 'amber', icon: RefreshCw, label: `${counts.pending} بانتظار`, hint: 'ستُرسل عند عودة الاتصال' }
              : { tone: 'emerald', icon: CheckCircle2, label: 'متزامن', hint: 'كل شيء محفوظ على الخادم' };

  const colors: Record<string, string> = {
    slate: 'border-white/10 bg-white/[.05] text-ink-300',
    amber: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
    rose: 'border-rose-400/30 bg-rose-500/10 text-rose-200',
    sky: 'border-sky-400/30 bg-sky-500/10 text-sky-200',
    emerald: 'border-emerald-400/25 bg-emerald-500/[.08] text-emerald-200',
  };
  const Icon = state.icon;

  return (
    <Link
      to="/sync"
      title={state.hint}
      className={cx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold transition hover:brightness-110', colors[state.tone])}
      aria-label={`حالة الاتصال: ${state.label}`}
    >
      <Icon className={cx('h-3 w-3', syncing && 'animate-spin')} />
      {!compact && <span className="hidden sm:inline">{state.label}</span>}
      {(counts.pending > 0 || counts.failed > 0 || counts.conflicts > 0) && (
        <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px]">{counts.pending + counts.failed + counts.conflicts}</span>
      )}
    </Link>
  );
}
