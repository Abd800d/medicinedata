/*
 * Prescription review queue (v1.9.0).
 *
 * Before this screen the pharmacist/admin could not reach other people's prescriptions:
 * GET /api/rx is scoped to the owner, and the admin endpoint had no UI at all. The queue
 * endpoint (/api/rx/queue, admin|pharmacist) existed but was unreachable from the app, so
 * "اعتماد الوصفة" only ever worked on the patient's own record.
 *
 * The rules stay exactly as designed: the AI never approves anything. A pharmacist opens a
 * line, corrects it if needed, and only then approves — with a confirmation when a line was
 * flagged as uncertain.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Loader2, Pencil, RefreshCw, ShieldCheck, XCircle,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { Badge, Field, PageLoader, useToast } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';

type QueueRow = {
  id: number; status: string; created_at: string; owner_name?: string | null;
  items: number; pending_items: number; unmatched: number; reviews: number;
};
type Item = {
  id: number; line_no: number; raw_text?: string | null; name?: string | null;
  strength?: string | null; form?: string | null; dose?: string | null;
  frequency?: string | null; duration?: string | null; route?: string | null;
  instructions?: string | null; status: string; confidence?: number | null;
  matched?: { drug_id?: number; generic_name?: string; trade_name?: string; score?: number } | null;
  uncertain_fields?: string[] | null;
};
type Detail = {
  id: number; status: string; created_at: string; items: Item[];
  analysis?: { flags?: Array<{ type: string; plain_ar?: string; action_ar?: string }>; summary?: any; disclaimer_ar?: string } | null;
  reviews?: Array<{ action: string; notes?: string | null; reviewer_name?: string | null; created_at: string }>;
};

const STATUS_LABEL: Record<string, { ar: string; tone: 'amber' | 'emerald' | 'rose' }> = {
  pending_review: { ar: 'بانتظار المراجعة', tone: 'amber' },
  reviewed: { ar: 'معتمدة', tone: 'emerald' },
  rejected: { ar: 'مرفوضة', tone: 'rose' },
};

export default function ReviewQueue() {
  const { user, loading: authLoading } = useAuth();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const [status, setStatus] = useState<'pending_review' | 'reviewed' | 'rejected'>('pending_review');
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [notes, setNotes] = useState('');

  const allowed = user?.role === 'admin' || user?.role === 'pharmacist';

  const load = useCallback(async () => {
    if (!allowed) return;
    try {
      const res = await api.get<{ rows: QueueRow[] }>('/api/rx/queue', { status });
      setRows(res.rows || []);
    } catch (e: any) {
      push(e.message === 'NETWORK' ? (ar ? 'تعذر الاتصال بالخادم' : 'No connection') : e.message || 'error', 'error');
      setRows([]);
    }
  }, [allowed, status, ar, push]);

  useEffect(() => { load(); }, [load]);

  const open = async (id: number) => {
    setOpenId(id); setDetail(null); setEditing(null); setNotes('');
    try { setDetail(await api.slow.get<Detail>(`/api/rx/${id}`)); }
    catch (e: any) { push(e.message || 'error', 'error'); }
  };

  const saveItem = async () => {
    if (!editing || !detail) return;
    setBusy(true);
    try {
      await api.slow.patch(`/api/rx/${detail.id}/items/${editing.id}`, {
        name: editing.name, strength: editing.strength, dose: editing.dose,
        frequency: editing.frequency, duration: editing.duration,
        route: editing.route, instructions: editing.instructions,
      });
      push(ar ? 'تم تصحيح البند' : 'Line corrected');
      setEditing(null);
      await open(detail.id);
    } catch (e: any) { push(e.message || 'error', 'error'); }
    finally { setBusy(false); }
  };

  const approve = async (acceptUncertain = false) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.slow.post(`/api/rx/${detail.id}/confirm`, { notes, accept_uncertain: acceptUncertain });
      push(ar ? 'تم اعتماد الوصفة' : 'Prescription approved');
      setOpenId(null); setDetail(null);
      await load();
    } catch (e: any) {
      const message = String(e.message || '');
      if (/PENDING_ITEMS|لم يُراجَع/.test(message)) {
        if (window.confirm(ar ? 'ما زالت هناك بنود غير مراجَعة. أتؤكد قبولها كما هي؟' : 'Some lines are still unreviewed. Accept them as they are?')) {
          return approve(true);
        }
      } else push(message, 'error');
    } finally { setBusy(false); }
  };

  const reject = async () => {
    if (!detail) return;
    if (!window.confirm(ar ? 'رفض الوصفة؟' : 'Reject this prescription?')) return;
    setBusy(true);
    try {
      await api.slow.post(`/api/rx/${detail.id}/reject`, { notes });
      push(ar ? 'تم الرفض' : 'Rejected');
      setOpenId(null); setDetail(null);
      await load();
    } catch (e: any) { push(e.message || 'error', 'error'); }
    finally { setBusy(false); }
  };

  const flagged = useMemo(() => (detail?.analysis?.flags || []), [detail]);
  const pendingCount = (detail?.items || []).filter((i) => i.status === 'pending').length;

  if (authLoading) return <PageLoader />;
  if (!allowed) {
    return (
      <div className="mx-auto max-w-sm space-y-3 p-4">
        <div className="card p-5 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-amber-400" />
          <h1 className="text-[14px] font-extrabold">{ar ? 'مراجعة الوصفات' : 'Prescription review'}</h1>
          <p className="mt-1 text-[11.5px] leading-6 text-ink-400">
            {ar ? 'هذه الصفحة للصيادلة والمدير فقط. اطلب من المدير ترقية حسابك إلى «صيدلي».' : 'Pharmacists and admins only. Ask an admin to grant the pharmacist role.'}
          </p>
          <Link to="/" className="btn-primary mt-3 inline-flex">{ar ? 'العودة' : 'Back'}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 pb-6">
      <div className="page-hero flex items-center gap-2 p-4 text-white">
        <Link to="/more" className="icon-btn h-8 w-8"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></Link>
        <ClipboardList className="h-5 w-5" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[17px] font-extrabold">{ar ? 'مراجعة الوصفات' : 'Prescription review'}</h1>
          <p className="text-[10.5px] text-white/70">{ar ? 'لا شيء يُعتمد تلقائيًا — القرار للصيدلي' : 'Nothing is approved automatically — the pharmacist decides'}</p>
        </div>
        <button onClick={load} className="icon-btn h-8 w-8"><RefreshCw className="h-4 w-4" /></button>
      </div>

      <div className="flex gap-1.5">
        {(['pending_review', 'reviewed', 'rejected'] as const).map((k) => (
          <button key={k} onClick={() => { setStatus(k); setOpenId(null); setDetail(null); }}
            className={cx('flex-1 rounded-xl px-2 py-1.5 text-[11px] font-bold transition',
              status === k ? 'bg-brand-grad text-white shadow-float' : 'bg-white/[.05] text-ink-300 hover:bg-white/[.09]')}>
            {STATUS_LABEL[k].ar}
          </button>
        ))}
      </div>

      {rows === null && <div className="card flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /></div>}

      {rows?.length === 0 && (
        <div className="card p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-400" />
          <p className="text-[12px] font-bold text-ink-200">{ar ? 'لا توجد وصفات في هذه القائمة' : 'Nothing in this list'}</p>
        </div>
      )}

      <div className="space-y-2">
        {(rows || []).map((r) => (
          <button key={r.id} onClick={() => open(r.id)}
            className={cx('card flex w-full items-center gap-2.5 p-3 text-start transition hover:bg-white/[.06]',
              openId === r.id && 'border-brand-400/40 bg-brand-500/10')}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-[11px] font-black text-brand-200">#{r.id}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-extrabold text-ink-100">{r.owner_name || (ar ? 'مستخدم' : 'User')}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
                <span>{r.items} {ar ? 'بند' : 'lines'}</span>
                {r.pending_items > 0 && <span className="text-amber-300">{r.pending_items} {ar ? 'غير مراجَع' : 'pending'}</span>}
                {r.unmatched > 0 && <span className="text-rose-300">{r.unmatched} {ar ? 'بلا مطابقة' : 'unmatched'}</span>}
                <span>· {timeAgo(r.created_at)}</span>
              </div>
            </div>
            <Badge tone={STATUS_LABEL[r.status]?.tone || 'neutral'}>{STATUS_LABEL[r.status]?.ar || r.status}</Badge>
          </button>
        ))}
      </div>

      {openId !== null && (
        <div className="card space-y-3 p-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-extrabold">#{openId} · {ar ? 'تفاصيل الوصفة' : 'Prescription detail'}</h2>
            <button onClick={() => { setOpenId(null); setDetail(null); }} className="text-[10.5px] font-semibold text-ink-400">✕</button>
          </div>

          {!detail && <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /></div>}

          {detail && (
            <>
              <p className="rounded-xl bg-amber-500/10 p-2 text-[10.5px] leading-5 text-amber-200">
                {detail.analysis?.disclaimer_ar || (ar ? 'التحليل مساعد ولا يُغني عن مراجعة الصيدلي.' : 'Assistance only — a pharmacist must review.')}
              </p>

              {flagged.length > 0 && (
                <div className="space-y-1.5">
                  {flagged.map((f, i) => (
                    <div key={i} className="flex items-start gap-1.5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-2 text-[10.5px] leading-5 text-rose-200">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div><b>{f.plain_ar || f.type}</b>{f.action_ar ? ` — ${f.action_ar}` : ''}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                {detail.items.map((it) => (
                  <div key={it.id} className="rounded-xl bg-white/[.055] p-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 text-[10px] font-bold text-ink-500">{it.line_no}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[12px] font-extrabold text-ink-100">{it.name || it.raw_text || '—'}</span>
                          <Badge tone={it.status === 'pending' ? 'amber' : it.status === 'corrected' ? 'sky' : 'emerald'}>
                            {it.status === 'pending' ? (ar ? 'غير مراجَع' : 'pending') : it.status === 'corrected' ? (ar ? 'مُصحّح' : 'corrected') : (ar ? 'مقبول' : 'accepted')}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-ink-400">
                          {it.strength && <span>{it.strength}</span>}
                          {it.dose && <span>· {it.dose}</span>}
                          {it.frequency && <span>· {it.frequency}</span>}
                          {it.duration && <span>· {it.duration}</span>}
                        </div>
                        {it.matched?.generic_name && (
                          <div className="mt-0.5 text-[10px] text-emerald-300">
                            {ar ? 'مطابقة: ' : 'matched: '}{it.matched.generic_name}
                            {typeof it.matched.score === 'number' ? ` (${Math.round(it.matched.score * 100)}%)` : ''}
                          </div>
                        )}
                        {!it.matched?.generic_name && (
                          <div className="mt-0.5 text-[10px] text-rose-300">{ar ? 'لا يوجد دواء مطابق في القاعدة' : 'no catalogue match'}</div>
                        )}
                      </div>
                      <button onClick={() => setEditing({ ...it })} className="icon-btn h-7 w-7 shrink-0"><Pencil className="h-3.5 w-3.5" /></button>
                    </div>

                    {editing?.id === it.id && (
                      <div className="mt-2 space-y-2 rounded-xl border border-brand-400/30 bg-black/20 p-2">
                        <Field label={ar ? 'الاسم' : 'Name'}><input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input" /></Field>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label={ar ? 'التركيز' : 'Strength'}><input value={editing.strength || ''} onChange={(e) => setEditing({ ...editing, strength: e.target.value })} className="input" /></Field>
                          <Field label={ar ? 'الجرعة' : 'Dose'}><input value={editing.dose || ''} onChange={(e) => setEditing({ ...editing, dose: e.target.value })} className="input" /></Field>
                          <Field label={ar ? 'التكرار' : 'Frequency'}><input value={editing.frequency || ''} onChange={(e) => setEditing({ ...editing, frequency: e.target.value })} className="input" /></Field>
                          <Field label={ar ? 'المدة' : 'Duration'}><input value={editing.duration || ''} onChange={(e) => setEditing({ ...editing, duration: e.target.value })} className="input" /></Field>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={saveItem} disabled={busy} className="btn-primary flex-1 text-[11px]">{busy ? '…' : (ar ? 'حفظ التصحيح' : 'Save')}</button>
                          <button onClick={() => setEditing(null)} className="btn-ghost text-[11px]">{ar ? 'إلغاء' : 'Cancel'}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {detail.reviews && detail.reviews.length > 0 && (
                <div className="space-y-1 rounded-xl bg-white/[.04] p-2 text-[10px] text-ink-400">
                  {detail.reviews.map((r, i) => (
                    <div key={i}>• {r.action} — {r.reviewer_name || '—'} · {timeAgo(r.created_at)}{r.notes ? ` · ${r.notes}` : ''}</div>
                  ))}
                </div>
              )}

              {detail.status === 'pending_review' && (
                <>
                  <Field label={ar ? 'ملاحظات الاعتماد (اختياري)' : 'Approval note (optional)'}>
                    <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => approve(false)} disabled={busy} className="btn-primary flex-1 text-[11.5px]">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {ar ? `اعتماد الوصفة${pendingCount ? ` (${pendingCount} غير مراجَع)` : ''}` : 'Approve'}
                    </button>
                    <button onClick={reject} disabled={busy} className="btn-ghost text-[11.5px] text-rose-300">
                      <XCircle className="h-4 w-4" />{ar ? 'رفض' : 'Reject'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
