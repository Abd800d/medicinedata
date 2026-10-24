import { useState } from 'react';
import { CheckCircle2, Clock, FilePlus2, Loader2, Trash2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Badge, PageLoader, useToast } from '../../components/ui';
import { cx, timeAgo } from '../../lib/utils';

export default function Submissions() {
  const [status, setStatus] = useState('pending');
  const { data, loading, reload } = useApi<any[]>('/api/submissions', { status: status || undefined });
  const { push } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const review = async (row: any, next: string) => {
    setBusy(row.id);
    try {
      const res = await api.patch<any>(`/api/submissions/${row.id}`, { status: next });
      push(next === 'approved' ? 'تم النشر في قاعدة البيانات' : 'تم تحديث الطلب');
      reload();
      if (res?.drug_id) window.open(`/drugs/${res.drug_id}`, '_blank');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(null); }
  };
  const remove = async (row: any) => {
    if (!confirm('حذف الطلب؟')) return;
    try { await api.del(`/api/submissions/${row.id}`); reload(); push('تم الحذف'); } catch { push('خطأ', 'error'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap gap-1.5">
        {[['pending', 'قيد المراجعة'], ['approved', 'منشور'], ['rejected', 'مرفوض'], ['', 'الكل']].map(([v, label]) => (
          <button key={v} onClick={() => setStatus(v)} className={cx('chip', status === v && 'chip-active')}>{label}</button>
        ))}
      </div>
      {loading && !data && <PageLoader />}
      {data?.length === 0 && <p className="card p-4 text-[11px] text-ink-400">لا توجد طلبات في هذا التصنيف.</p>}
      <div className="space-y-2">
        {(data || []).map((s) => (
          <div key={s.id} className="card p-3">
            <div className="flex items-start gap-2">
              <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                s.status === 'approved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : s.status === 'rejected' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40')}>
                {s.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.status === 'rejected' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-extrabold">{s.name_en} {s.strength || ''} {s.name_ar ? <span className="font-medium text-ink-400">· {s.name_ar}</span> : null}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9.5px] text-ink-400">
                  {s.company && <span>{s.company}</span>}
                  {s.form && <span>{s.form}</span>}
                  {s.country && <span>{s.country}</span>}
                  {(s.system_ar || s.system_en) && <span>{s.system_ar || s.system_en}</span>}
                  <span>{s.author_name || '—'}</span>
                  <span>{timeAgo(s.created_at)}</span>
                </div>
                {s.notes && <p className="mt-1 line-clamp-2 text-[10.5px] leading-5 text-ink-500">{s.notes}</p>}
              </div>
              <Badge tone={s.status === 'approved' ? 'emerald' : s.status === 'rejected' ? 'rose' : 'amber'}>{s.status}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.status !== 'approved' && (
                <button onClick={() => review(s, 'approved')} disabled={busy === s.id} className="btn-primary px-2.5 py-1 text-[10.5px]">
                  {busy === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}اعتماد ونشر
                </button>
              )}
              {s.status !== 'rejected' && (
                <button onClick={() => review(s, 'rejected')} disabled={busy === s.id} className="btn-ghost px-2.5 py-1 text-[10.5px]"><XCircle className="h-3 w-3" />رفض</button>
              )}
              {s.created_drug_id && <a href={`/drugs/${s.created_drug_id}`} target="_blank" rel="noreferrer" className="btn-soft px-2.5 py-1 text-[10.5px]"><FilePlus2 className="h-3 w-3" />الدواء المنشور</a>}
              <button onClick={() => remove(s)} className="btn-ghost ms-auto px-2 py-1 text-[10.5px] text-rose-600"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
