/*
 * «التوثيق والمراجعة» — the six-state queue.
 *
 * What this screen refuses to do:
 *   • there is no button that claims "manufacturer confirmed" without a document attached
 *     (the server refuses it too — the button is hidden, not just disabled);
 *   • a rejection cannot be saved without a written reason;
 *   • an admin correcting a record backwards must write why, and the reason is kept forever.
 *
 * The three questions a reviewer must be able to answer later — who, when and backed by what —
 * are printed in the same panel for every record.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, Package, Plus,
  RefreshCw, Search, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useToast } from '../../components/ui';
import { VerificationBadge, VerificationPanel, VerDetail } from '../../components/Verification';
import { cx } from '../../lib/utils';

type QueueItem = {
  id: number; trade_name: string; trade_name_ar?: string | null; generic_name?: string | null;
  strength?: string | null; dosage_form?: string | null; country?: string | null; image_url?: string | null;
  verification_state?: string | null; review_status?: string | null; reviewed_at?: string | null;
  missing_fields?: string[];
};
type Summary = {
  products: { total: number; states: Record<string, number>; review: Record<string, number>; incomplete: number };
  drugs: { total: number; states: Record<string, number> };
  sources: number; events: number;
};

const STATES = ['verified', 'manufacturer_confirmed', 'supplier_submitted', 'user_submitted', 'incomplete', 'unverified'] as const;
const KINDS = [
  ['manufacturer_letter', 'خطاب شركة مصنعة', 'Manufacturer letter'],
  ['authorization', 'تفويض/توكيل', 'Authorization'],
  ['regulatory', 'تسجيل تنظيمي', 'Regulatory'],
  ['invoice', 'فاتورة شراء', 'Invoice'],
  ['leaflet', 'نشرة رسمية', 'Leaflet'],
  ['photo', 'صورة العلبة', 'Pack photo'],
  ['other', 'أخرى', 'Other'],
] as const;

export default function Verification() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const [params, setParams] = useSearchParams();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState(params.get('state') || '');
  const [review, setReview] = useState(params.get('review') || '');
  const [q, setQ] = useState(params.get('q') || '');
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const openId = Number(params.get('id') || 0);
  const entity = (params.get('entity') === 'drugs' ? 'drugs' : 'products') as 'products' | 'drugs';
  const [detail, setDetail] = useState<VerDetail | null>(null);
  const [note, setNote] = useState('');
  const [wantedState, setWantedState] = useState('');
  const [saving, setSaving] = useState(false);
  const [src, setSrc] = useState({ kind: 'manufacturer_letter', title: '', issuer: '', url: '' });
  const [addingSource, setAddingSource] = useState(false);

  const loadSummary = useCallback(async () => {
    try { setSummary(await api.get<Summary>('/api/admin/verification/summary')); }
    catch (e: any) { setError(e?.message || 'NETWORK'); }
  }, []);

  const loadQueue = useCallback(async (nextPage = 1) => {
    setBusy(true); setError('');
    try {
      const p = new URLSearchParams({ page: String(nextPage), limit: '25' });
      if (state) p.set('state', state);
      if (review) p.set('review', review);
      if (q.trim()) p.set('q', q.trim());
      const res = await api.get<{ items: QueueItem[]; total: number; pages: number; page: number }>(`/api/admin/verification/queue?${p}`);
      setRows(res.items); setTotal(res.total); setPages(res.pages); setPage(res.page);
    } catch (e: any) {
      setError(e?.message === 'NETWORK'
        ? (ar ? 'تعذّر الوصول إلى الخادم.' : 'Cannot reach the server.')
        : e?.message || 'ERROR');
    } finally { setBusy(false); }
  }, [state, review, q, ar]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);
  useEffect(() => { void loadQueue(1); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state, review]);

  const loadDetail = useCallback(async (ent: 'products' | 'drugs', id: number) => {
    try {
      const d = await api.get<VerDetail>(`/api/admin/verification/${ent}/${id}`);
      setDetail(d);
      setWantedState(d.state);
      setNote(d.review_note || '');
    } catch (e: any) { push(e?.message || 'ERROR', 'error'); }
  }, [push]);

  useEffect(() => {
    if (!openId) { setDetail(null); return; }
    void loadDetail(entity, openId);
  }, [entity, openId, loadDetail]);

  const open = (ent: 'products' | 'drugs', id: number) => {
    const p = new URLSearchParams(params);
    p.set('entity', ent); p.set('id', String(id));
    setParams(p, { replace: true });
  };
  const close = () => {
    const p = new URLSearchParams(params);
    p.delete('id'); p.delete('entity');
    setParams(p, { replace: true });
    setDetail(null);
  };

  const apply = async (payload: { state?: string; review?: string; note?: string }) => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.post(`/api/admin/verification/${entity}/${detail.state ? openId : openId}`, payload);
      push(ar ? 'حُفظ القرار وسُجّل في التدقيق' : 'Decision saved and audited');
      await Promise.all([loadDetail(entity, openId), loadQueue(page), loadSummary()]);
    } catch (e: any) {
      /* The server's refusal is the useful part — print it verbatim. */
      push(e?.message || (ar ? 'تعذّر الحفظ' : 'Could not save'), 'error');
    } finally { setSaving(false); }
  };

  const addSource = async () => {
    if (!openId) return;
    if (!src.title.trim() || (!src.url.trim())) {
      push(ar ? 'المستند يحتاج عنوانًا ورابطًا' : 'A document needs a title and a URL', 'error');
      return;
    }
    setAddingSource(true);
    try {
      await api.post(`/api/admin/verification/${entity}/${openId}/sources`, src);
      push(ar ? 'أُضيف المستند' : 'Document added');
      setSrc({ kind: src.kind, title: '', issuer: '', url: '' });
      await loadDetail(entity, openId);
    } catch (e: any) { push(e?.message || 'ERROR', 'error'); }
    finally { setAddingSource(false); }
  };

  const removeSource = async (id: number) => {
    try {
      await api.del(`/api/admin/verification/sources/${id}`);
      await loadDetail(entity, openId);
    } catch (e: any) { push(e?.message || 'ERROR', 'error'); }
  };

  const stateChips = useMemo(() => (summary ? STATES.map((s) => ({ s, n: summary.products.states[s] || 0 })) : []), [summary]);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-3 text-[11px] leading-6 text-amber-100">
        <b>{ar ? 'قاعدة هذه الشاشة:' : 'The rule of this screen:'}</b>{' '}
        {ar
          ? 'لا تُرفع حالة إلى «مؤكد من الشركة المصنعة» بلا مستند مرفق، ولا يُقبل رفض بلا سبب مكتوب، ولا رجوع بالحالة بلا سبب من مدير. كل قرار يُكتب في سجل لا يُعدَّل.'
          : 'A record cannot be raised to “manufacturer confirmed” without an attached document, a rejection requires a written reason, and going backwards requires an admin and a reason. Every decision is written to an append-only log.'}
      </div>

      {/* counts */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {stateChips.map(({ s, n }) => (
          <button key={s} onClick={() => { setState(state === s ? '' : s); setReview(''); }}
            className={cx('card px-2 py-2 text-center transition', state === s && 'ring-1 ring-brand-400/60')}>
            <div className="text-[15px] font-black text-white">{n}</div>
            <div className="mt-0.5"><VerificationBadge state={s} lang={lang as 'ar' | 'en'} /></div>
          </button>
        ))}
      </div>

      {summary && (
        <div className="grid gap-1.5 sm:grid-cols-3">
          {[
            [ar ? 'بانتظار المراجعة' : 'Pending review', summary.products.review.pending, 'text-amber-300'],
            [ar ? 'مرفوضة' : 'Rejected', summary.products.review.rejected, 'text-rose-300'],
            [ar ? 'مستندات مرفقة' : 'Documents', summary.sources, 'text-brand-300'],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="card px-3 py-2">
              <div className={`text-[16px] font-black ${tone}`}>{value as number}</div>
              <div className="text-[10px] text-ink-500">{label as string}</div>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-xl border border-white/[.08] bg-ink-900 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void loadQueue(1)}
            placeholder={ar ? 'اسم تجاري أو علمي…' : 'Trade or generic name…'}
            className="min-w-0 flex-1 bg-transparent text-[11.5px] outline-none" />
        </div>
        <select value={review} onChange={(e) => setReview(e.target.value)} className="input px-2 py-1.5 text-[11px]">
          <option value="">{ar ? 'كل حالات المراجعة' : 'All reviews'}</option>
          <option value="pending">{ar ? 'بانتظار المراجعة' : 'Pending'}</option>
          <option value="approved">{ar ? 'معتمد' : 'Approved'}</option>
          <option value="rejected">{ar ? 'مرفوض' : 'Rejected'}</option>
          <option value="none">{ar ? 'بلا مراجعة' : 'Not reviewed'}</option>
        </select>
        <button onClick={() => void loadQueue(1)} className="btn-ghost px-2 py-1.5 text-[11px]"><RefreshCw className="h-3.5 w-3.5" /></button>
        {(state || review || q) && (
          <button onClick={() => { setState(''); setReview(''); setQ(''); }} className="btn-ghost px-2 py-1.5 text-[11px]"><X className="h-3.5 w-3.5" />{ar ? 'مسح' : 'Clear'}</button>
        )}
      </div>

      {error && <div className="card border-rose-400/25 bg-rose-500/10 p-3 text-[11px] text-rose-200">{error}</div>}

      <div className="flex items-center justify-between px-1 text-[10.5px] text-ink-500">
        <span>{ar ? `${total} سجلًا` : `${total} records`}</span>
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => (
          <button key={r.id} onClick={() => open('products', r.id)}
            className={cx('card flex w-full items-center gap-2 p-2.5 text-start transition hover:border-brand-400/30',
              openId === r.id && entity === 'products' && 'ring-1 ring-brand-400/50')}>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-extrabold text-white" dir="auto">{ar && r.trade_name_ar ? r.trade_name_ar : r.trade_name}</div>
              <div className="truncate text-[9.5px] text-ink-500" dir="ltr">
                {r.generic_name || '—'} · {r.strength || '—'} · {r.country || '—'}
              </div>
              {!!r.missing_fields?.length && (
                <div className="truncate text-[9px] text-amber-300/90">{ar ? 'ينقص:' : 'Missing:'} {r.missing_fields.join(' · ')}</div>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <VerificationBadge state={r.verification_state} review={r.review_status} lang={lang as 'ar' | 'en'} />
              {r.reviewed_at && <span className="text-[8.5px] text-ink-600" dir="ltr">{r.reviewed_at.slice(0, 10)}</span>}
            </div>
          </button>
        ))}
        {!busy && rows.length === 0 && !error && (
          <div className="card p-6 text-center text-[11px] text-ink-500">{ar ? 'لا سجلات بهذه الفلاتر.' : 'No records with these filters.'}</div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button disabled={page <= 1} onClick={() => void loadQueue(page - 1)} className="btn-ghost px-2 py-1 text-[11px]"><ChevronRight className="h-3.5 w-3.5" /></button>
          <span className="text-[10.5px] text-ink-400">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => void loadQueue(page + 1)} className="btn-ghost px-2 py-1 text-[11px]"><ChevronLeft className="h-3.5 w-3.5" /></button>
        </div>
      )}

      {/* decision panel */}
      {detail && openId > 0 && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 sm:items-center sm:justify-center" onClick={close}>
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-ink-950 p-3 sm:max-w-lg sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <Package className="h-4 w-4 text-brand-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-extrabold text-white">{detail.title || `#${openId}`}</div>
                <div className="text-[9.5px] text-ink-500">{entity === 'drugs' ? (ar ? 'مادة فعالة' : 'Generic record') : (ar ? 'منتج تجاري' : 'Commercial product')}</div>
              </div>
              <button onClick={close} className="icon-btn h-8 w-8"><X className="h-4 w-4" /></button>
            </div>

            <VerificationPanel detail={detail} lang={lang as 'ar' | 'en'} />

            {/* change the state */}
            <div className="mt-2 space-y-2 rounded-2xl border border-white/[.08] bg-white/[.02] p-2.5">
              <div className="text-[11px] font-bold text-ink-200">{ar ? 'قرار جديد' : 'New decision'}</div>
              <select value={wantedState} onChange={(e) => setWantedState(e.target.value)} className="input w-full text-[11.5px]">
                {STATES.map((s) => (
                  <option key={s} value={s}>{s} — {ar ? stateAr(s) : s}</option>
                ))}
              </select>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder={ar ? 'السبب/الملاحظة — إلزامي للرفض وللرجوع بالحالة (10 أحرف على الأقل)' : 'Reason/note — mandatory for rejection and corrections (10+ chars)'}
                className="input w-full text-[11px] leading-5" />
              <div className="flex flex-wrap gap-1.5">
                {wantedState !== detail.state && (
                  <button disabled={saving} onClick={() => void apply({ state: wantedState, note })}
                    className="btn-primary px-3 py-1.5 text-[11px]">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {ar ? 'حفظ الحالة' : 'Save state'}
                  </button>
                )}
                {detail.review !== 'pending' && (
                  <button disabled={saving} onClick={() => void apply({ review: 'pending', note })}
                    className="btn-ghost px-3 py-1.5 text-[11px]">{ar ? 'إرسال للمراجعة' : 'Send to review'}</button>
                )}
                {detail.review !== 'rejected' && (
                  <button disabled={saving} onClick={() => void apply({ review: 'rejected', note })}
                    className="btn-ghost px-3 py-1.5 text-[11px] text-rose-300">
                    <AlertTriangle className="h-3.5 w-3.5" />{ar ? 'رفض' : 'Reject'}
                  </button>
                )}
              </div>
              <p className="text-[9px] leading-4 text-ink-600">
                {ar
                  ? 'الحالة «مؤكد من الشركة المصنعة» يرفضها الخادم بلا مستند مرفق، و«مرفوض» يرفضها بلا سبب مكتوب.'
                  : 'The server refuses “manufacturer confirmed” without an attached document, and “rejected” without a written reason.'}
              </p>
            </div>

            {/* attach evidence */}
            <div className="mt-2 space-y-1.5 rounded-2xl border border-white/[.08] bg-white/[.02] p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-ink-200"><FileText className="h-3.5 w-3.5 text-brand-300" />{ar ? 'إضافة مستند' : 'Add a document'}</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <select value={src.kind} onChange={(e) => setSrc({ ...src, kind: e.target.value })} className="input text-[11px]">
                  {KINDS.map(([k, a, b]) => <option key={k} value={k}>{ar ? a : b}</option>)}
                </select>
                <input value={src.issuer} onChange={(e) => setSrc({ ...src, issuer: e.target.value })}
                  placeholder={ar ? 'الجهة المصدرة' : 'Issuer'} className="input text-[11px]" />
                <input value={src.title} onChange={(e) => setSrc({ ...src, title: e.target.value })}
                  placeholder={ar ? 'عنوان المستند' : 'Document title'} className="input text-[11px] sm:col-span-2" />
                <input value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })}
                  placeholder="https://…" dir="ltr" className="input text-[11px] sm:col-span-2" />
              </div>
              <button onClick={() => void addSource()} disabled={addingSource} className="btn-ghost w-full justify-center py-1.5 text-[11px]">
                {addingSource ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {ar ? 'إرفاق' : 'Attach'}
              </button>
              {!!detail.sources?.length && (
                <div className="space-y-1">
                  {detail.sources.map((s) => (
                    <div key={s.id} className="flex items-center gap-1.5 rounded-lg bg-white/[.04] px-2 py-1 text-[10px]">
                      <FileText className="h-3 w-3 text-ink-500" />
                      <span className="min-w-0 flex-1 truncate">{s.title}</span>
                      <button onClick={() => void removeSource(s.id)} className="text-rose-300" aria-label={ar ? 'حذف' : 'Delete'}><Trash2 className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const stateAr = (s: string) => ({
  verified: 'موثّق',
  manufacturer_confirmed: 'مؤكد من الشركة المصنعة',
  supplier_submitted: 'مُقدَّم من مورّد',
  user_submitted: 'مُقدَّم من مستخدم',
  incomplete: 'بيانات ناقصة',
  unverified: 'غير موثّق',
}[s] || s);
