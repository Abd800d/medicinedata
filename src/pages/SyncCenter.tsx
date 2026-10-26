import { Link } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Server, Trash2, Wifi, WifiOff, ArrowLeftRight,
} from 'lucide-react';
import { useSync } from '../lib/sync';
import { Badge, EmptyState, useToast } from '../components/ui';
import { cx, dateFmt } from '../lib/utils';

const METHOD_LABEL: Record<string, string> = { POST: 'إضافة', PUT: 'تعديل', PATCH: 'تحديث', DELETE: 'حذف' };

const STATUS: Record<string, { label: string; tone: 'amber' | 'emerald' | 'rose' | 'sky' | 'neutral' }> = {
  pending: { label: 'بانتظار الاتصال', tone: 'amber' },
  syncing: { label: 'جارٍ الإرسال', tone: 'sky' },
  failed: { label: 'فشل', tone: 'rose' },
  conflict: { label: 'تعارض', tone: 'rose' },
  done: { label: 'تم', tone: 'emerald' },
};

export default function SyncCenter() {
  const { online, serverUp, syncing, ops, counts, flush, retry, discard, resolveConflict, lastFlush } = useSync();
  const { push } = useToast();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="page-hero page-hero-emerald p-5 text-white">
        <div className="flex items-center gap-2">
          {online && serverUp ? <Wifi className="h-5 w-5" /> : <WifiOff className="h-5 w-5" />}
          <h1 className="text-[20px] font-extrabold">المزامنة والاتصال</h1>
        </div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">
          كل تعديل تجريه بلا إنترنت يُحفظ في طابور على جهازك، ثم يُرسل تلقائيًا عند عودة الاتصال — دون تكرار ودون فقدان.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
          <span className={cx('rounded-full px-2 py-1', online ? 'bg-emerald-400/25' : 'bg-rose-400/25')}>
            {online ? 'الإنترنت متاح' : 'بدون إنترنت'}
          </span>
          <span className={cx('rounded-full px-2 py-1', serverUp ? 'bg-emerald-400/25' : 'bg-amber-400/25')}>
            {serverUp ? 'الخادم يستجيب' : 'الخادم لا يستجيب'}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-1">{counts.pending} بانتظار · {counts.failed} فشل · {counts.conflicts} تعارض</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => flush()} disabled={syncing || !online} className="btn-primary flex-1">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? 'جارٍ المزامنة…' : 'مزامنة الآن'}
        </button>
        <Link to="/server" className="btn-ghost"><Server className="h-4 w-4" />إعداد الخادم</Link>
      </div>

      {lastFlush && (
        <div className="text-[10px] text-ink-500">
          آخر محاولة: {dateFmt(new Date(lastFlush.at).toISOString())} — أُرسل {lastFlush.sent}
          {lastFlush.failed ? ` · فشل ${lastFlush.failed}` : ''}
          {lastFlush.conflicts ? ` · تعارض ${lastFlush.conflicts}` : ''}
          {lastFlush.stillOffline ? ' · توقفت بسبب انقطاع الاتصال' : ''}
        </div>
      )}

      {ops.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-6 w-6" />}
          title="لا توجد عمليات معلّقة"
          text="كل ما حفظته وصل إلى الخادم. لو انقطع الاتصال لاحقًا ستظهر هنا العمليات المنتظرة."
        />
      ) : (
        <div className="space-y-2">
          {ops.map((op) => {
            const st = STATUS[op.status] || STATUS.pending;
            return (
              <div key={op.id} className={cx('card p-3', op.status === 'conflict' && 'border-rose-400/30', op.status === 'failed' && 'border-amber-400/25')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <span className="text-[11.5px] font-bold text-ink-100">{op.label}</span>
                      {op.attempts > 0 && <span className="text-[9.5px] text-ink-500">محاولات {op.attempts}</span>}
                    </div>
                    <div className="mt-0.5 text-[9.5px] text-ink-500" dir="ltr">
                      {METHOD_LABEL[op.method] || op.method} {op.path} · {dateFmt(new Date(op.createdAt).toISOString())}
                    </div>
                    {op.error && <div className="mt-1 text-[10px] text-rose-300">{op.error}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {op.status !== 'syncing' && (
                      <button onClick={() => retry(op.id)} className="icon-btn h-7 w-7 text-sky-300" title="أعد المحاولة"><RefreshCw className="h-3.5 w-3.5" /></button>
                    )}
                    <button onClick={() => discard(op.id)} className="icon-btn h-7 w-7 text-rose-400" title="تجاهل"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {op.status === 'conflict' && (
                  <div className="mt-2 rounded-xl border border-rose-400/25 bg-rose-500/[.07] p-2.5">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-rose-200">
                      <ArrowLeftRight className="h-3.5 w-3.5" />النسخة على الخادم تغيّرت — اختر ماذا يحدث
                    </div>
                    <p className="mt-1 text-[10px] leading-5 text-rose-100/80">
                      صنف في نسختك المحلية مختلف عن نسخة الخادم. «احتفظ بنسختي» يستبدل نسخة الخادم، و«استخدم نسخة الخادم» يلغي تعديلك.
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        onClick={async () => { await resolveConflict(op.id, 'mine'); push('سيُرسل تعديلك فوق نسخة الخادم', 'info'); }}
                        className="btn-primary flex-1 py-1.5 text-[10.5px]"
                      >احتفظ بنسختي</button>
                      <button
                        onClick={async () => { await resolveConflict(op.id, 'server'); push('اعتُمدت نسخة الخادم'); }}
                        className="btn-ghost py-1.5 text-[10.5px]"
                      >استخدم نسخة الخادم</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="card p-3 text-[10px] leading-5 text-ink-400">
        <div className="mb-1 flex items-center gap-1.5 font-bold text-ink-200"><CloudOff className="h-3.5 w-3.5" />ما يعمل بدون إنترنت؟</div>
        <ul className="space-y-0.5">
          <li>• البحث وقاعدة الأدوية والصور المضمّنة (حزمة كاملة داخل التطبيق).</li>
          <li>• إضافة/تعديل أصناف صيدليتك وإرسال طلبات الإضافة — تُحفظ هنا وتُرسل تلقائيًا.</li>
          <li>• قراءة وصفاتك السابقة وبياناتها المحفوظة.</li>
        </ul>
        <div className="mt-1.5 font-bold text-ink-200">ما يحتاج إنترنت؟</div>
        <ul className="space-y-0.5">
          <li>• تحليل وصفة جديدة (الذكاء الاصطناعي يعمل على الخادم فقط).</li>
          <li>• رفع صور الأدوية أو الوصفات، والاعتماد النهائي من الصيدلي.</li>
          <li>• المجتمع، الوظائف، والدليل عند تحديث بياناته.</li>
        </ul>
        <p className="mt-1.5 text-[9.5px] text-ink-500">
          سبب عدم طابور الصور: الصورة تُحفظ في ذاكرة الجهاز مؤقتًا ولا يمكن ضمان بقائها بعد إغلاق التطبيق، لذلك نطلب الاتصال بدل أن نُوهمك بالحفظ.
        </p>
      </div>
    </div>
  );
}
