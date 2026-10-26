import { useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Bot, CheckCircle2, Clock, Database, RefreshCw, ShieldAlert } from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { Badge, PageLoader } from '../../components/ui';
import { cx, dateFmt } from '../../lib/utils';
import AiSettings from './AiSettings';

/**
 * AI quality panel — answers three questions with numbers, not impressions:
 *   1. Is the model alive? (calls, failures, latency)
 *   2. How often did a human have to correct it? (correction rate)
 *   3. Which alerts actually fire? (so we can spot noise)
 * No patient text ever reaches this view.
 */
const FLAG_LABELS: Record<string, string> = {
  duplicate_ingredient: 'تكرار المادة الفعالة',
  dose_above_max: 'جرعة أعلى من المرجع',
  possible_interaction: 'احتمال تداخل دوائي',
  duplicate_therapy_class: 'دواءان من نفس المجموعة',
  allergy_conflict: 'تعارض مع حساسية مسجّلة',
  unmatched_items: 'أسماء غير مؤكدة',
  data_missing: 'بيانات غير مكتملة',
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'بانتظار الصيدلي',
  reviewed: 'معتمدة',
  rejected: 'مرفوضة',
  pending: 'قديمة/معلّقة',
  corrected: 'بنود مصحّحة',
};

export default function AIQuality() {
  const [days, setDays] = useState(30);
  const { data, loading, reload } = useApi<any>('/api/admin/ai-stats', { days }, { ttl: 0 });

  if (loading && !data) return <PageLoader label="جارٍ حساب إحصاءات التحليل…" />;

  const runs = data?.runs || { total: 0, failed: 0, models: [] };
  const rx = data?.prescriptions || { total: 0, by_status: {}, with_flags: 0 };
  const items = data?.items || { total: 0, by_status: {}, correction_rate: 0 };
  const flags: { type: string; count: number }[] = data?.flags || [];
  const successRate = runs.total ? Number((((runs.total - runs.failed) / runs.total) * 100).toFixed(1)) : 0;
  const flagTotal = flags.reduce((s, f) => s + f.count, 0);
  const maxFlag = Math.max(1, ...flags.map((f) => f.count));

  return (
    <div className="space-y-4">
      <AiSettings />
      <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="section-title inline-flex items-center gap-1.5"><Bot className="h-4 w-4 text-brand-300" />جودة التحليل الذكي</h2>
          <p className="mt-0.5 text-[10.5px] text-ink-500">أرقام حقيقية من السجل — لا نصوص مرضى ولا محتوى وصفات.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cx('rounded-lg px-2.5 py-1 text-[10.5px] font-bold', days === d ? 'bg-brand-grad text-white' : 'bg-white/[.05] text-ink-400')}>
              {d} يوم
            </button>
          ))}
          <button onClick={reload} className="icon-btn h-7 w-7 text-ink-400"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={<Activity className="h-4 w-4" />} label="نداءات النموذج" value={String(runs.total)} hint={runs.failed ? `${runs.failed} فشل` : 'بلا فشل'} tone={runs.failed ? 'amber' : 'emerald'} />
        <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="نسبة نجاح النداءات" value={`${successRate}%`} tone={successRate >= 95 ? 'emerald' : 'amber'} />
        <Stat icon={<BarChart3 className="h-4 w-4" />} label="وصفات محلّلة" value={String(rx.total)} hint={`${rx.with_flags} فيها تنبيهات`} tone="brand" />
        <Stat icon={<ShieldAlert className="h-4 w-4" />} label="معدل التصحيح اليدوي" value={`${items.correction_rate}%`} hint={`${items.by_status?.corrected || 0} من ${items.total}`} tone={items.correction_rate > 40 ? 'rose' : items.correction_rate > 20 ? 'amber' : 'emerald'} />
      </div>

      <div className="card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold"><Bot className="h-3.5 w-3.5 text-ink-400" />النماذج المستخدمة</div>
        {runs.models.length === 0 ? (
          <div className="text-[11px] text-ink-500">لا نداءات بعد. أضف `AI_API_KEY` على الخادم ثم جرّب تحليل وصفة.</div>
        ) : (
          <div className="space-y-1.5">
            {runs.models.map((m: any) => (
              <div key={`${m.provider}/${m.model}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/[.07] bg-white/[.02] px-2 py-1.5 text-[10.5px]">
                <Badge tone={m.success_rate >= 95 ? 'emerald' : 'amber'}>{m.success_rate}%</Badge>
                <span className="font-bold text-ink-100" dir="ltr">{m.provider}/{m.model}</span>
                <span className="text-ink-500">{m.calls} نداء</span>
                <span className="inline-flex items-center gap-1 text-ink-500"><Clock className="h-2.5 w-2.5" />{m.avg_latency_ms} ms متوسط</span>
                {m.failed > 0 && <span className="text-rose-300">{m.failed} فشل</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold"><AlertTriangle className="h-3.5 w-3.5 text-amber-300" />التنبيهات الأكثر تكرارًا</div>
          {flags.length === 0 ? (
            <div className="text-[11px] text-ink-500">لا تنبيهات في هذه الفترة.</div>
          ) : (
            <div className="space-y-1">
              {flags.map((f) => (
                <div key={f.type}>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-ink-200">{FLAG_LABELS[f.type] || f.type}</span>
                    <span className="font-bold text-ink-400">{f.count} · {flagTotal ? Math.round((f.count / flagTotal) * 100) : 0}%</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/[.06]">
                    <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${(f.count / maxFlag) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold"><Database className="h-3.5 w-3.5 text-ink-400" />حالة الوصفات والبنود</div>
          <div className="space-y-1 text-[10.5px]">
            {Object.entries(rx.by_status || {}).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg bg-white/[.02] px-2 py-1">
                <span className="text-ink-300">{STATUS_LABELS[k] || k}</span>
                <span className="font-bold text-ink-100">{String(v)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between rounded-lg bg-white/[.02] px-2 py-1">
              <span className="text-ink-300">بنود مصحّحة يدويًا</span>
              <span className="font-bold text-sky-300">{items.by_status?.corrected || 0}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/[.02] px-2 py-1">
              <span className="text-ink-300">بنود لم تُراجَع</span>
              <span className="font-bold text-amber-300">{items.by_status?.pending || 0}</span>
            </div>
          </div>
          {data?.generated_at && <div className="mt-2 text-[9px] text-ink-500">حُسبت: {dateFmt(data.generated_at)}</div>}
        </div>
      </div>

      <div className="rounded-xl border border-sky-400/20 bg-sky-500/[.06] p-2.5 text-[10px] leading-5 text-sky-200">
        معدل التصحيح اليدوي المرتفع ليس عيبًا في التطبيق بحد ذاته — هو مقياس لجودة قراءة النموذج. الهدف: انخفاضه مع بقاء الاعتماد النهائي بشريًا دائمًا.
      </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, hint, tone = 'brand' }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone?: 'brand' | 'emerald' | 'amber' | 'rose' }) {
  const color = tone === 'emerald' ? 'text-emerald-300' : tone === 'amber' ? 'text-amber-300' : tone === 'rose' ? 'text-rose-300' : 'text-brand-300';
  return (
    <div className="card p-2.5">
      <div className={cx('flex items-center gap-1 text-[9.5px] font-bold', color)}>{icon}{label}</div>
      <div className="mt-0.5 text-[17px] font-extrabold text-ink-100">{value}</div>
      {hint && <div className="text-[9px] text-ink-500">{hint}</div>}
    </div>
  );
}
