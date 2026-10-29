/*
 * «فاحص التداخلات» — two to twenty-five drugs, checked against what MDA actually stores.
 *
 * The screen is built around one rule from the plan: never present a guess as a finding.
 *
 *   • Severity shows only when the stored sentence carries severity wording; otherwise the row
 *     says «مذكور بلا تصنيف» and asks for pharmacist review.
 *   • "No interaction found" is never printed as "safe": the empty state says the pair is not in
 *     MDA's data and that a curated reference is still required.
 *   • Duplicate active ingredient and same therapeutic class are computed here because they need
 *     no external knowledge — and they are the two most common real-world prescribing errors.
 *
 * The picker searches generic names only (never trade names), so a card cannot silently resolve
 * to a different active ingredient than the one the user meant.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertOctagon, AlertTriangle, ArrowLeft, CheckCircle2, Copy, Info, Loader2, Plus, RefreshCw,
  Search, ShieldAlert, Stethoscope, Trash2, X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useDebounced } from '../lib/utils';
import { useI18n } from '../lib/i18n';
import { useToast } from '../components/ui';
import { copyText } from '../lib/utils';

type Drug = { id: number; generic_name: string; generic_ar: string | null; drug_class: string | null; products_count?: number };
type Pair = {
  kind: 'documented';
  a: { id: number; generic_name: string; generic_ar: string | null };
  b: { id: number; generic_name: string; generic_ar: string | null };
  level: 'contraindicated' | 'major' | 'moderate' | 'minor' | 'review';
  severity_known: boolean;
  text: string;
  text_ar: string | null;
  source_drug_id: number;
  source: string;
  action_ar: string;
  action_en: string;
};
type Dup = {
  kind: 'same_ingredient' | 'same_class';
  drug_ids: number[];
  generic_name: string;
  message_ar: string;
  message_en: string;
  level: string;
};
type Result = {
  checked: number;
  pairs: Pair[];
  duplications: Dup[];
  max_severity: string;
  documented_count: number;
  notes: string[];
  limits: string[];
  disclaimer_ar: string;
  disclaimer_en: string;
  drugs: Drug[];
};

const LEVEL: Record<string, { ar: string; en: string; cls: string; ring: string }> = {
  contraindicated: { ar: 'ممنوع الجمع', en: 'Contraindicated', cls: 'bg-rose-500/20 text-rose-200', ring: 'border-rose-400/40' },
  major: { ar: 'خطورة عالية', en: 'Major', cls: 'bg-rose-500/15 text-rose-200', ring: 'border-rose-400/30' },
  moderate: { ar: 'خطورة متوسطة', en: 'Moderate', cls: 'bg-amber-500/15 text-amber-200', ring: 'border-amber-400/30' },
  minor: { ar: 'خطورة منخفضة', en: 'Minor', cls: 'bg-sky-500/15 text-sky-200', ring: 'border-sky-400/25' },
  review: { ar: 'مذكور بلا تصنيف', en: 'Mentioned, unclassified', cls: 'bg-white/[.08] text-ink-200', ring: 'border-white/[.10]' },
  none: { ar: 'لا شيء في بيانات MDA', en: 'Nothing in MDA data', cls: 'bg-white/[.06] text-ink-300', ring: 'border-white/[.08]' },
};

const STORAGE = 'mda.interaction.drugs';

export default function Interactions() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const [picked, setPicked] = useState<Drug[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      return Array.isArray(raw) ? raw.slice(0, 25) : [];
    } catch { return []; }
  });
  const [q, setQ] = useState('');
  const text = useDebounced(q, 300);
  const [hits, setHits] = useState<Drug[]>([]);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { localStorage.setItem(STORAGE, JSON.stringify(picked)); }, [picked]);

  useEffect(() => {
    let alive = true;
    if (text.trim().length < 2) { setHits([]); return undefined; }
    setSearching(true);
    api.get<{ data: Drug[] }>(`/api/catalog/interactions/search?q=${encodeURIComponent(text.trim())}`)
      .then((r) => { if (alive) setHits(r.data); })
      .catch(() => { if (alive) setHits([]); })
      .finally(() => { if (alive) setSearching(false); });
    return () => { alive = false; };
  }, [text]);

  const add = (d: Drug) => {
    setPicked((p) => (p.length >= 25 ? p : [...p, d]));
    setQ(''); setHits([]); setResult(null);
  };
  const remove = (idx: number) => { setPicked((p) => p.filter((_, i) => i !== idx)); setResult(null); };

  const check = useCallback(async () => {
    if (picked.length < 2) { setError(ar ? 'أضف دواءين على الأقل.' : 'Add at least two drugs.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const r = await api.post<Result>('/api/catalog/interactions/check', { drug_ids: picked.map((d) => d.id) });
      setResult(r);
    } catch (e: any) {
      setError(e?.message === 'NETWORK'
        ? (ar ? 'تعذّر الوصول إلى الخادم. الفحص يحتاج اتصالًا — التطبيق لا يخزّن بيانات التداخلات للعمل دون اتصال.'
              : 'Cannot reach the server. The check needs a connection — interaction data is not stored for offline use.')
        : e?.message || (ar ? 'تعذّر الفحص' : 'Check failed'));
    } finally { setBusy(false); }
  }, [picked, ar]);

  const summary = useMemo(() => {
    if (!result) return null;
    return {
      documented: result.pairs.length,
      dups: result.duplications.length,
      worst: LEVEL[result.max_severity] || LEVEL.none,
    };
  }, [result]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/more" className="icon-btn h-9 w-9"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[16px] font-extrabold">{ar ? 'فاحص التداخلات' : 'Interaction checker'}</h1>
          <p className="text-[10.5px] text-ink-500">
            {ar ? 'من 2 إلى 25 دواءً — نتيجة مبنية على بيانات MDA مع حدودها معلنة'
                : '2 to 25 drugs — based on MDA data, with its limits stated'}
          </p>
        </div>
      </div>

      {/* picker */}
      <div className="card space-y-2 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input w-full ps-9"
            placeholder={ar ? 'ابحث بالاسم العلمي (warfarin، وارفارين)…' : 'Search by generic name (warfarin, وارفارين)…'} />
          {searching && <Loader2 className="absolute end-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-ink-500" />}
        </div>

        {hits.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-black/20 p-1.5">
            {hits.map((h) => {
              const already = picked.some((p) => p.id === h.id);
              return (
                <button key={h.id} onClick={() => add(h)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition hover:bg-white/[.06]">
                  <Plus className="h-3 w-3 shrink-0 text-brand-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-bold text-white" dir="ltr">{h.generic_name}</span>
                    <span className="block truncate text-[9.5px] text-ink-500">{h.generic_ar || '—'}{h.drug_class ? ` · ${h.drug_class}` : ''}</span>
                  </span>
                  {already && <span className="shrink-0 rounded bg-white/[.06] px-1 text-[9px] text-ink-400">{ar ? 'مضاف' : 'added'}</span>}
                </button>
              );
            })}
          </div>
        )}
        {text.trim().length >= 2 && !searching && hits.length === 0 && (
          <p className="text-[10.5px] text-ink-500">
            {ar ? 'لا مادة فعالة بهذا الاسم. جرّب الاسم الإنجليزي العلمي.' : 'No generic matches. Try the English generic name.'}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {picked.map((d, i) => (
            <span key={`${d.id}-${i}`} className="inline-flex items-center gap-1 rounded-lg bg-brand-500/15 px-2 py-1 text-[10.5px] font-bold text-brand-100">
              <span dir="ltr">{d.generic_name}</span>
              <button onClick={() => remove(i)} aria-label={ar ? 'إزالة' : 'Remove'}><X className="h-3 w-3" /></button>
            </span>
          ))}
          {picked.length === 0 && <span className="text-[10.5px] text-ink-500">{ar ? 'لم تُضف أدوية بعد.' : 'No drugs added yet.'}</span>}
        </div>

        <div className="flex gap-1.5">
          <button onClick={() => void check()} disabled={busy || picked.length < 2} className="btn-primary flex-1 text-[11.5px]">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Stethoscope className="h-3.5 w-3.5" />}
            {busy ? (ar ? 'جارٍ الفحص…' : 'Checking…') : (ar ? 'افحص التداخلات' : 'Check interactions')}
          </button>
          {picked.length > 0 && (
            <button onClick={() => { setPicked([]); setResult(null); }} className="btn-ghost text-[11px]">
              <Trash2 className="h-3.5 w-3.5" />{ar ? 'تفريغ' : 'Clear'}
            </button>
          )}
        </div>
        {error && <div className="rounded-xl bg-rose-500/10 p-2 text-[10.5px] text-rose-200">{error}</div>}
      </div>

      {/* result summary */}
      {result && summary && (
        <>
          <div className={`card border p-3 ${summary.worst.ring}`}>
            <div className="flex items-center gap-2">
              {summary.documented + summary.dups === 0
                ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ink-400" />
                : result.max_severity === 'contraindicated' || result.max_severity === 'major'
                  ? <AlertOctagon className="h-5 w-5 shrink-0 text-rose-400" />
                  : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />}
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] font-extrabold text-white">
                  {ar ? `فُحص ${result.checked} دواءً` : `Checked ${result.checked} drugs`}
                </div>
                <div className="text-[10px] text-ink-400">
                  {ar ? `${summary.documented} تداخل مذكور · ${summary.dups} تكرار` : `${summary.documented} documented · ${summary.dups} duplications`}
                </div>
              </div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-[9.5px] font-bold ${summary.worst.cls}`}>
                {ar ? summary.worst.ar : summary.worst.en}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {result.drugs.map((d, i) => (
                <span key={`${d.id}-${i}`} className="rounded bg-white/[.05] px-1.5 py-0.5 text-[9.5px] text-ink-300" dir="ltr">{d.generic_name}</span>
              ))}
            </div>
          </div>

          {/* duplications first: they are actionable without any reference */}
          {result.duplications.map((d, i) => (
            <div key={`dup-${i}`} className="card border border-amber-400/30 bg-amber-500/[.06] p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-extrabold text-amber-100">
                    {d.kind === 'same_ingredient' ? (ar ? 'تكرار المادة الفعالة' : 'Duplicate active ingredient') : (ar ? 'تكرار علاجي (نفس الفئة)' : 'Therapeutic duplication (same class)')}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-5 text-amber-200/90">{ar ? d.message_ar : d.message_en}</p>
                </div>
              </div>
            </div>
          ))}

          {/* documented pairs */}
          {result.pairs.map((p, i) => {
            const lv = LEVEL[p.level] || LEVEL.review;
            return (
              <div key={`pair-${i}`} className={`card border p-3 ${lv.ring}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1 text-[11.5px] font-extrabold text-white">
                      <span dir="ltr">{p.a.generic_name}</span>
                      <span className="text-ink-500">↔</span>
                      <span dir="ltr">{p.b.generic_name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${lv.cls}`}>{ar ? lv.ar : lv.en}</span>
                    </div>
                    {!p.severity_known && (
                      <div className="mt-0.5 text-[9.5px] text-ink-500">
                        {ar ? 'النص المحفوظ لا يصنّف الخطورة — لا نستنتجها.' : 'The stored text carries no severity — none is inferred.'}
                      </div>
                    )}
                  </div>
                  <button onClick={() => void copyText(p.text).then((ok) => push(ok ? (ar ? 'نُسخ' : 'Copied') : '—', ok ? 'success' : 'error'))}
                    className="btn-ghost shrink-0 px-1.5 py-1 text-[9.5px]" aria-label={ar ? 'نسخ' : 'Copy'}>
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <div className="mt-1.5 rounded-xl bg-black/25 p-2 text-[10.5px] leading-5 text-ink-200">{p.text}</div>
                <div className="mt-1.5 text-[10px] leading-5 text-ink-400">{ar ? p.action_ar : p.action_en}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-ink-600">
                  <span className="truncate" dir="auto">{p.source}</span>
                  <Link to={`/drugs/${p.source_drug_id}`} className="shrink-0 font-bold text-brand-300">{ar ? 'سجل الدواء' : 'Drug record'}</Link>
                </div>
              </div>
            );
          })}

          {/* empty state — "not found" is not "safe" */}
          {result.pairs.length === 0 && result.duplications.length === 0 && (
            <div className="card border border-white/[.08] p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-extrabold text-white">
                    {ar ? 'لا يوجد تداخل مذكور في بيانات MDA لهذه المجموعة' : 'No interaction mentioned in MDA data for this set'}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-5 text-ink-400">
                    {ar
                      ? 'هذا لا يعني السلامة: تعني فقط أن النص المحفوظ لا يذكر أحدها في سجل الآخر. المرجع المُدقَّق للتداخلات (Lexicomp/Stockley أو نشرة الشركة) يبقى إلزاميًا قبل الصرف.'
                      : 'This does not mean safe: it only means the stored text does not name one in the other’s record. A curated interaction reference (Lexicomp/Stockley or the manufacturer leaflet) remains mandatory before dispensing.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* limits, always visible */}
          <div className="card p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-ink-300"><ShieldAlert className="h-3.5 w-3.5 text-amber-300" />{ar ? 'حدود هذه الأداة' : 'What this tool does not do'}</div>
            <ul className="space-y-0.5 text-[10px] leading-5 text-ink-400">
              {result.limits.map((l) => <li key={l}>• {l}</li>)}
            </ul>
            <p className="mt-1.5 rounded-xl bg-amber-500/10 p-2 text-[10px] leading-5 text-amber-200">{ar ? result.disclaimer_ar : result.disclaimer_en}</p>
          </div>

          <button onClick={() => void check()} className="btn-ghost w-full text-[11px]"><RefreshCw className="h-3.5 w-3.5" />{ar ? 'إعادة الفحص' : 'Re-run'}</button>
        </>
      )}
    </div>
  );
}
