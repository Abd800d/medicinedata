import { useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, Fingerprint, Loader2, RefreshCw,
  Search, ShieldCheck, ShieldX, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Badge, Field, PageLoader, useToast } from '../../components/ui';
import { cx, num } from '../../lib/utils';

/*
 * Audit trail viewer.
 *
 * The log is append-only and hash-chained (server/lib/audit.js): every row carries the hash of
 * its predecessor, so an edited or deleted history is detectable. This screen shows the rows,
 * lets the admin narrow them down, and runs the chain verification on demand — the point is
 * that the answer comes from the data, not from a green badge we painted.
 */
type AuditRow = {
  id: number; actor_id: number | null; actor_email: string | null; actor_name?: string | null;
  action: string; target_type: string | null; target_id: string | null;
  meta: any; prev_hash: string; hash: string; ip: string | null; created_at: string;
};

const ACTION_TONE = (action: string) => {
  if (/delete|purge|reject|revoke/.test(action)) return 'rose';
  if (/restore|backup/.test(action)) return 'amber';
  if (/login|register|account/.test(action)) return 'sky';
  if (/import|export/.test(action)) return 'violet';
  return 'emerald';
};

export default function AuditLog() {
  const { push } = useToast();
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 100;
  const [open, setOpen] = useState<number | null>(null);
  const [verify, setVerify] = useState<{ ok: boolean; entries?: number; broken_at?: number; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => ({
    limit, offset,
    ...(action ? { action } : {}),
    ...(target ? { target } : {}),
    ...(q ? { q } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [action, target, q, from, to, offset]);

  const { data, loading, reload } = useApi<{ data: AuditRow[]; total: number }>('/api/admin/audit', params);
  const { data: facets } = useApi<{ actions: { action: string; n: number }[]; targets: { target_type: string; n: number }[] }>('/api/admin/audit/actions');
  const rows = data?.data || [];
  const total = data?.total ?? 0;

  const runVerify = async () => {
    setBusy(true);
    try {
      const res = await api.get<any>('/api/admin/audit/verify');
      setVerify(res);
      push(res.ok ? `السلسلة سليمة — ${res.entries} قيدًا` : `خلل عند القيد ${res.broken_at}`, res.ok ? 'success' : 'error');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  const reset = () => { setAction(''); setTarget(''); setQ(''); setFrom(''); setTo(''); setOffset(0); };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mda-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="me-auto flex items-center gap-2 text-[12.5px] font-extrabold"><Fingerprint className="h-4 w-4 text-sky-300" />سجل التدقيق</div>
          <button onClick={runVerify} disabled={busy} className="btn-ghost px-2.5 py-1.5 text-[11px]">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}تحقّق من سلامة السلسلة
          </button>
          <button onClick={() => reload()} className="btn-ghost px-2.5 py-1.5 text-[11px]"><RefreshCw className="h-3.5 w-3.5" />تحديث</button>
          <button onClick={exportJson} disabled={!rows.length} className="btn-ghost px-2.5 py-1.5 text-[11px]"><Download className="h-3.5 w-3.5" />تصدير الصفحة</button>
        </div>

        {verify && (
          <div className={cx('mt-3 flex items-start gap-2 rounded-xl border p-2.5 text-[11px] leading-5',
            verify.ok ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200' : 'border-rose-400/30 bg-rose-500/10 text-rose-200')}>
            {verify.ok ? <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ShieldX className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
            <span>
              {verify.ok
                ? <>السلسلة سليمة: {num(verify.entries)} قيدًا متصلًا بلا أي كسر — لم يُحذف أو يُعدّل شيء من تاريخ النظام.</>
                : <>انكسرت السلسلة عند القيد #{verify.broken_at} ({verify.reason}). أحدهم عدّل أو حذف سجلًا من قاعدة البيانات مباشرة.</>}
            </span>
            <button onClick={() => setVerify(null)} className="ms-auto text-ink-400"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="نوع العملية">
            <select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} className="input">
              <option value="">الكل ({num(total)})</option>
              {(facets?.actions || []).map((a) => <option key={a.action} value={a.action}>{a.action} ({a.n})</option>)}
            </select>
          </Field>
          <Field label="نوع الهدف">
            <select value={target} onChange={(e) => { setTarget(e.target.value); setOffset(0); }} className="input">
              <option value="">الكل</option>
              {(facets?.targets || []).map((t2) => <option key={t2.target_type} value={t2.target_type}>{t2.target_type} ({t2.n})</option>)}
            </select>
          </Field>
          <Field label="من تاريخ">
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} className="input" />
          </Field>
          <Field label="إلى تاريخ">
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} className="input" />
          </Field>
        </div>
        <div className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute inset-y-0 start-2.5 my-auto h-3.5 w-3.5 text-ink-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} className="input ps-8" placeholder="بحث: البريد، الاسم، العملية، المعرّف، محتوى التفاصيل…" />
          </div>
          <button onClick={reset} className="btn-ghost px-3 text-[11px]">مسح</button>
        </div>
      </div>

      {loading && !rows.length ? <PageLoader /> : (
        <div className="space-y-1.5">
          {rows.length === 0 && (
            <div className="card flex items-center gap-2 p-4 text-[11.5px] text-ink-400">
              <AlertTriangle className="h-4 w-4" />لا توجد قيود مطابقة لهذا الفلتر.
            </div>
          )}
          {rows.map((r) => (
            <div key={r.id} className="card overflow-hidden">
              <button onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-2 p-2.5 text-start">
                <span className="w-10 shrink-0 text-[10px] font-black text-ink-500">#{r.id}</span>
                <Badge tone={ACTION_TONE(r.action) as any}>{r.action}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-bold text-ink-200">
                    {r.actor_name || r.actor_email || 'النظام'}
                    {r.target_type && <span className="font-normal text-ink-400"> · {r.target_type}{r.target_id ? ` #${r.target_id}` : ''}</span>}
                  </span>
                  <span className="block truncate text-[10px] text-ink-500" dir="ltr">{r.created_at}{r.ip ? ` · ${r.ip}` : ''}</span>
                </span>
                <ChevronDown className={cx('h-3.5 w-3.5 shrink-0 text-ink-400 transition', open === r.id && 'rotate-180')} />
              </button>
              {open === r.id && (
                <div className="space-y-1.5 border-t border-white/[.06] p-2.5 text-[10.5px]">
                  <div className="grid gap-1 text-ink-400 sm:grid-cols-2">
                    <div>الحساب: <span className="text-ink-200" dir="ltr">{r.actor_email || '—'}</span></div>
                    <div>العنوان: <span className="text-ink-200" dir="ltr">{r.ip || '—'}</span></div>
                    <div>الهدف: <span className="text-ink-200" dir="ltr">{r.target_type || '—'} / {r.target_id ?? '—'}</span></div>
                    <div>التوقيت: <span className="text-ink-200" dir="ltr">{r.created_at}</span></div>
                  </div>
                  {r.meta && (
                    <pre className="max-h-40 overflow-auto rounded-lg bg-black/30 p-2 text-[10px] leading-5 text-ink-300" dir="ltr">
{JSON.stringify(r.meta, null, 2)}
                    </pre>
                  )}
                  <div className="break-all font-mono text-[9.5px] leading-5 text-ink-500" dir="ltr">
                    <div>prev {r.prev_hash}</div>
                    <div>this {r.hash}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-center gap-2 text-[11px]">
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0} className="btn-ghost px-2 py-1 disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" />السابق</button>
          <span className="text-ink-400">{num(offset + 1)}–{num(Math.min(offset + limit, total))} من {num(total)}</span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total} className="btn-ghost px-2 py-1 disabled:opacity-40">التالي<ChevronLeft className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}
