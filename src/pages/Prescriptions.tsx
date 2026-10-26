import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Ban, Camera, CheckCircle2, ChevronDown, Clock, Database, Edit3, History as HistoryIcon,
  Image as ImageIcon, Info, Loader2, Lock, Pill, RefreshCw, Save, ScanText, ShieldAlert, ShieldCheck,
  Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api, assetUrl } from '../lib/api';
import RxSecureToggle from '../components/RxSecureToggle';
import { useApi } from '../lib/useApi';
import { Badge, EmptyState, PageLoader, TextArea, useToast } from '../components/ui';
import { cx, dateFmt } from '../lib/utils';

/* ------------------------------------------------------------------ types */

type Candidate = {
  drug_id: number; product_id?: number | null; matched_on?: string; score: number;
  generic_name?: string; generic_ar?: string | null; trade_name?: string | null; trade_name_ar?: string | null;
  strength?: string | null; form?: string | null; manufacturer_name?: string | null; country?: string | null; image_url?: string | null;
};

type Dossier = {
  drug?: {
    id: number; generic_name: string; generic_ar?: string | null; drug_class?: string | null; atc_code?: string | null;
    indications_ar?: string | null; dosage_adult?: string | null; contraindications?: string | null;
    warnings?: string | null; interactions?: string | null; pregnancy?: string | null; updated_at?: string | null; source?: string | null;
    allergen_families?: Array<{ code: string; label_ar: string; label_en?: string; note_ar?: string }>;
  } | null;
  brands?: Array<{ id: number; trade_name: string; trade_name_ar?: string | null; strength?: string | null; dosage_form?: string | null; manufacturer_name?: string | null; country?: string | null; agent_name?: string | null; image_url?: string | null }>;
  selected_brand?: any;
  updated_at?: string | null;
  source?: string;
};

type Flag = {
  severity: 'high' | 'medium' | 'info'; type: string; title_ar: string; title_en?: string;
  detail_ar: string; detail_en?: string; action_ar?: string; action_en?: string; drug_id?: number; drug_ids?: number[];
  plain_ar?: string; plain_en?: string; why_ar?: string; why_en?: string;
  source?: { label?: string; updated_at?: string | null; declared_at?: string | null };
};

type Allergy = { id: number; code: string; label: string; note?: string | null; created_at?: string };
type Family = { code: string; label_ar: string; label_en: string; note_ar?: string };

type Item = {
  id?: number; line_no: number; raw_text?: string | null; name?: string | null; strength?: string | null;
  form?: string | null; dose?: string | null; frequency?: string | null; duration?: string | null;
  route?: string | null; instructions?: string | null;
  confidence?: number; field_confidence?: Record<string, number>; uncertain_fields?: string[];
  matched?: Candidate | null; alternatives?: Candidate[]; dossier?: Dossier | null;
  dose_calc?: { daily_mg?: number; formula?: string } | null; documented_max_daily_mg?: number | null;
  needs_review?: boolean; review_reason?: string | null; status?: string;
};

type Analysis = {
  readable?: boolean; language?: string; patient?: any; doctor?: any; clinic?: any; notes?: string | null;
  items: Item[]; flags?: Flag[]; summary?: any;
  disclaimer_ar?: string; disclaimer_en?: string;
  source?: { catalogue?: string; prompt_version?: string; model?: string; analysed_at?: string; engine?: string; catalogue_generated_at?: string | null };
};

type RxRow = {
  id: number; image_url?: string | null; extracted_text?: string | null; status: string; created_at: string;
  analysis?: Analysis | null; analysis_json?: string | null; items?: Item[]; reviews?: any[]; runs?: any[];
};

const confidenceTone = (c?: number) => (c === undefined || c === null ? 'muted' : c >= 0.7 ? 'ok' : c >= 0.4 ? 'warn' : 'bad');
const pct = (c?: number) => (c === undefined || c === null ? '—' : `${Math.round(c * 100)}%`);

const FIELD_LABELS: Record<string, string> = {
  name: 'الاسم', strength: 'التركيز', form: 'الشكل', dose: 'الجرعة', frequency: 'التكرار',
  duration: 'المدة', route: 'الطريق', instructions: 'التعليمات',
};

/* ------------------------------------------------------------------ page */

export default function Prescriptions() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const isStaff = user?.role === 'admin' || user?.role === 'pharmacist';
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'analyze' | 'reanalyze' | 'confirm' | 'save' | null>(null);
  const [current, setCurrent] = useState<RxRow | null>(null);
  const [manualText, setManualText] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [keepImage, setKeepImage] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Record<number, Partial<Item>>>({});

  const { data: consent, reload: reloadConsent } = useApi<{ granted: boolean; version: string; text_ar: string; text_en: string }>(
    '/api/rx/consent', undefined, { enabled: !!user },
  );
  const { data: aiStatus } = useApi<{ configured: boolean; provider?: string; models?: any; hint_ar?: string; prompt_version?: string }>(
    '/api/rx/status', undefined, { enabled: !!user, ttl: 300_000 },
  );
  const { data: history, loading: historyLoading, reload: reloadHistory } = useApi<RxRow[]>(
    '/api/prescriptions', undefined, { enabled: !!user },
  );
  const { data: queue, reload: reloadQueue } = useApi<{ status: string; count: number; rows: any[] }>(
    '/api/rx/queue', { status: 'pending_review' }, { enabled: isStaff },
  );

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const analysis: Analysis | null = useMemo(() => {
    if (!current) return null;
    if (current.analysis) return current.analysis;
    if (current.analysis_json) { try { return JSON.parse(current.analysis_json); } catch { return null; } }
    return null;
  }, [current]);

  const items: Item[] = analysis?.items || current?.items || [];
  const flagged = analysis?.flags || [];
  const summary = analysis?.summary;

  /* --------------------------------------------------------- actions */

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { push('يرجى اختيار صورة (JPG/PNG/HEIC)', 'error'); return; }
    if (f.size > 12 * 1024 * 1024) { push('حجم الصورة أكبر من 12 ميجابايت', 'error'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setCurrent(null); setEditMode(false); setDraft({});
  };

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null); setFile(null); setManualText(''); setCurrent(null); setEditMode(false); setDraft({});
  };

  const grantConsent = async (granted: boolean) => {
    try {
      await api.post('/api/rx/consent', { granted });
      await reloadConsent();
      push(granted ? 'تم تسجيل الموافقة' : 'تم سحب الموافقة — لن يُسمح برفع الصور');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  const runAnalysis = async (mode: 'image' | 'text') => {
    if (!user) { push('سجّل الدخول أولًا', 'error'); return; }
    if (!consent?.granted) { push('الموافقة مطلوبة قبل التحليل', 'error'); return; }
    if (mode === 'image' && !file) { push('اختر صورة الوصفة أولًا', 'error'); return; }
    if (mode === 'text' && !manualText.trim()) { push('اكتب نص الوصفة أولًا', 'error'); return; }
    setBusy('analyze');
    try {
      let res: any;
      if (mode === 'image') {
        const fd = new FormData();
        fd.append('image', file as File);
        fd.append('lang', lang === 'en' ? 'en' : 'ar');
        fd.append('keep_image', keepImage ? '1' : '0');
        res = await api.slow.post<any>('/api/rx/analyze', fd);
      } else {
        res = await api.slow.post<any>('/api/rx/analyze', { text: manualText, lang: lang === 'en' ? 'en' : 'ar' });
      }
      /* Re-read from the server: the stored lines carry real item ids (needed for
         corrections) and a fresh dossier built from the current database. */
      let full: RxRow = { id: res.id, status: 'pending_review', created_at: new Date().toISOString(), analysis: res.analysis };
      try { full = await api.slow.get<RxRow>(`/api/rx/${res.id}`); } catch { /* keep the response payload */ }
      setCurrent(full);
      setManualText(res.analysis?.items?.map((i: Item) => i.raw_text || i.name).filter(Boolean).join('\n') || manualText);
      setShowManual(false);
      reloadHistory(); reloadQueue();
      push(`تم التحليل الآلي — ${res.analysis?.summary?.items || 0} بندًا بانتظار مراجعة الصيدلي`, 'info');
    } catch (e: any) {
      const msg = e?.message === 'NETWORK' ? t('errors.network') : e?.message || t('common.error');
      push(msg, 'error');
    } finally { setBusy(null); }
  };

  const reanalyze = async () => {
    if (!current?.id) return;
    setBusy('reanalyze');
    try {
      const res = await api.slow.post<any>(`/api/rx/${current.id}/reanalyze`, { lang: lang === 'en' ? 'en' : 'ar' });
      setCurrent({ ...current, analysis: res.analysis, status: 'pending_review' });
      setDraft({}); setEditMode(false);
      push('تمت إعادة التحليل — النتيجة السابقة استُبدلت وتُسجَّل في السجل');
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
    finally { setBusy(null); }
  };

  const openRow = async (row: RxRow) => {
    try {
      const full = await api.slow.get<RxRow>(`/api/rx/${row.id}`);
      setCurrent(full);
      setPreview(null);
      setFile(null);
      setEditMode(false);
      setDraft({});
      setManualText(full.items?.map((i) => i.raw_text || i.name || '').filter(Boolean).join('\n') || '');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
  };

  const patchItem = async (item: Item) => {
    if (!current?.id || !item.id) return false;
    const changes = draft[item.id];
    if (!changes) return true;
    setBusy('save');
    try {
      await api.slow.patch(`/api/rx/${current.id}/items/${item.id}`, changes);
      const next = { ...current, items: (current.items || []).map((i) => (i.id === item.id ? { ...i, ...changes, status: 'corrected' } : i)) };
      setCurrent(next);
      setDraft((d) => { const c = { ...d }; delete c[item.id as number]; return c; });
      push('تم حفظ التصحيح وتسجيله باسمك ووقته');
      return true;
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); return false; }
    finally { setBusy(null); }
  };

  const chooseAlternative = async (item: Item, cand: Candidate) => {
    if (!current?.id || !item.id) return;
    try {
      await api.slow.patch(`/api/rx/${current.id}/items/${item.id}`, {
        name: cand.trade_name || cand.generic_name, matched_drug_id: cand.drug_id, matched_product_id: cand.product_id ?? null,
      });
      const refreshed = await api.slow.get<RxRow>(`/api/rx/${current.id}`);
      setCurrent(refreshed);
      push('تم ربط البند بالدواء المختار — راجع النتيجة');
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
  };

  const confirm = async (acceptUncertain: boolean) => {
    if (!current?.id) return;
    setBusy('confirm');
    try {
      await api.slow.post(`/api/rx/${current.id}/confirm`, { accept_uncertain: acceptUncertain });
      setCurrent({ ...current, status: 'reviewed' });
      reloadHistory(); reloadQueue();
      push('تم تأكيد المراجعة وتسجيلها في السجل غير القابل للتعديل');
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
    finally { setBusy(null); }
  };

  const reject = async () => {
    if (!current?.id) return;
    const notes = window.prompt('سبب الرفض (يُسجَّل):') || '';
    if (!notes.trim()) return;
    setBusy('confirm');
    try {
      await api.slow.post(`/api/rx/${current.id}/reject`, { notes });
      setCurrent({ ...current, status: 'rejected' });
      reloadHistory(); reloadQueue();
      push('تم رفض الوصفة وتسجيل السبب');
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
    finally { setBusy(null); }
  };

  const purge = async (id?: number) => {
    const target = id ?? current?.id;
    if (!target) return;
    if (!window.confirm('حذف صورة الوصفة وبيانات المريض نهائيًا؟ سيبقى أثر التدقيق فقط.')) return;
    try {
      await api.del(`/api/rx/${target}`);
      if (current?.id === target) reset();
      reloadHistory();
      push('تم الحذف النهائي لبيانات المريض');
    } catch (e: any) { push(e?.message || t('common.error'), 'error'); }
  };

  /* --------------------------------------------------------- render */

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero page-hero-rose p-5 text-white">
        <div className="flex items-center gap-2"><ScanText className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('rx.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">
          صوّر الوصفة أو اخترها من المعرض — يُستخرج النص آليًا، ويُطابق مع قاعدة الأدوية، ولا تُعتمد النتيجة إلا بعد مراجعة الصيدلي.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
          <span className="rounded-full bg-white/15 px-2 py-1"><Camera className="me-1 inline h-3 w-3" /> كاميرا أو معرض</span>
          <span className="rounded-full bg-white/15 px-2 py-1"><ShieldAlert className="me-1 inline h-3 w-3" /> لا اعتماد تلقائي</span>
          <span className="rounded-full bg-white/15 px-2 py-1"><Database className="me-1 inline h-3 w-3" /> مطابقة مع {summary?.matched ?? 0} من قاعدة MDA</span>
        </div>
      </div>

      {/* Screenshot protection for the prescription in front of the pharmacist (v1.8.0) */}
      {user && <RxSecureToggle rxId={current?.id ?? null} />}

      {!user && (
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[.05] text-ink-500"><Lock className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold">تسجيل الدخول مطلوب</div>
            <div className="text-[11px] text-ink-500">تحليل الوصفات يتطلب حسابًا (لتسجيل من حلّل ومتى، وحفظ سجل المراجعة).</div>
          </div>
          <Link to="/auth" className="btn-primary shrink-0 px-3 py-2 text-[11.5px]">دخول</Link>
        </div>
      )}

      {/* AI service state */}
      {user && aiStatus && !aiStatus.configured && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-3 text-[11px] leading-5 text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <b>التحليل الذكي غير مفعّل على الخادم.</b> {aiStatus.hint_ar || 'أضف AI_API_KEY في متغيرات بيئة الخادم.'}
            <div className="mt-1 text-[10.5px] text-amber-200/80">يعمل التطبيق كالمعتاد للبحث وقاعدة الأدوية، ويمكنك حفظ الوصفة كصورة ومراجعتها يدويًا.</div>
          </div>
        </div>
      )}

      {/* consent */}
      {user && consent && !consent.granted && (
        <div className="card border-brand-500/25 p-4">
          <div className="mb-2 flex items-center gap-2 text-brand-300"><ShieldCheck className="h-4 w-4" /><h2 className="text-[12.5px] font-extrabold">موافقة صريحة قبل رفع أي صورة</h2></div>
          <p className="text-[11px] leading-6 text-ink-300">{lang === 'en' ? consent.text_ar && consent.text_en : consent.text_ar}</p>
          <ul className="mt-2 space-y-1 text-[10.5px] leading-5 text-ink-400">
            <li>• الصورة تُرسل إلى خادم التطبيق فقط، ولا تُحفظ افتراضيًا (يمكنك إبقاءها للمراجعة باختيارك).</li>
            <li>• لا تُرسل أي صورة إلى طرف ثالث دون هذه الموافقة، ويمكنك سحبها في أي وقت.</li>
            <li>• النتيجة آلية وقد تخطئ؛ القرار النهائي للصيدلي.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button onClick={() => grantConsent(true)} className="btn-primary flex-1"><CheckCircle2 className="h-4 w-4" />أوافق</button>
            <button onClick={() => grantConsent(false)} className="btn-ghost">لا أوافق</button>
          </div>
        </div>
      )}
      {user && consent?.granted && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/[.08] px-3 py-2 text-[10.5px] text-emerald-200">
          <ShieldCheck className="h-3.5 w-3.5" /> الموافقة مسجّلة ({consent.version}) — يمكنك سحبها من زر «سحب الموافقة».
          <button onClick={() => grantConsent(false)} className="ms-auto rounded-lg px-2 py-0.5 text-[10px] font-bold text-emerald-100/80 underline">سحب الموافقة</button>
        </div>
      )}

      {/* declared allergies */}
      {user && <AllergiesCard onSaved={() => { /* new allergies affect the next analysis */ }} />}

      {/* capture */}
      <div className={cx('card p-4', (!user || !consent?.granted) && 'pointer-events-none opacity-50')}>
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        {!preview ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-rose-400/30 bg-rose-500/[.05] px-4 py-8 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 on-color shadow-tile"><UploadCloud className="h-6 w-6" /></span>
            <div className="text-[13px] font-bold text-ink-100">صوّر الوصفة أو اختر صورة</div>
            <p className="mt-1 max-w-xs text-[11px] leading-5 text-ink-500">إضاءة جيدة، الوصفة كاملة داخل الإطار، بدون انعكاس أو ميل. الصور المقروءة تُحلَّل بدقة أعلى.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => cameraRef.current?.click()} className="btn-primary"><Camera className="h-4 w-4" />الكاميرا</button>
              <button onClick={() => galleryRef.current?.click()} className="btn-ghost"><ImageIcon className="h-4 w-4" />المعرض</button>
            </div>
            {!user && <div className="mt-2 text-[10px] text-amber-300">سجّل الدخول لتفعيل التحليل — البحث وقاعدة الأدوية متاحان بدون حساب.</div>}
            <button onClick={() => setShowManual((v) => !v)} className="mt-3 text-[10.5px] font-bold text-brand-300 underline">
              أو اكتب نص الوصفة يدويًا
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl bg-white/[.06]">
              <img src={preview} alt="prescription" className="max-h-[380px] w-full object-contain" />
              <button onClick={reset} className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950/60 text-white"><X className="h-4 w-4" /></button>
            </div>
            <label className="flex items-center gap-2 text-[10.5px] text-ink-400">
              <input type="checkbox" checked={keepImage} onChange={(e) => setKeepImage(e.target.checked)} className="h-3.5 w-3.5 accent-rose-500" />
              احتفظ بالصورة على الخادم للمراجعة (بدون اختيار: تُحذف فور التحليل)
            </label>
            <div className="flex gap-2">
              <button onClick={() => runAnalysis('image')} disabled={busy === 'analyze'} className="btn-primary flex-1">
                {busy === 'analyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy === 'analyze' ? 'جارٍ التحليل… قد يستغرق حتى دقيقة' : 'تحليل الوصفة'}
              </button>
              <button onClick={() => galleryRef.current?.click()} className="btn-ghost"><ImageIcon className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {showManual && (
          <div className="mt-3 rounded-2xl border border-violet-400/20 bg-violet-500/[.06] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-violet-300"><Edit3 className="h-3.5 w-3.5" /><span className="text-[11.5px] font-bold">نص الوصفة (بديل عن الصورة)</span></div>
            <TextArea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="مثال: Augmentin 1g tab — 1 tab twice daily × 7 days&#10;Panadol 500mg — 1–2 tabs every 6h if needed" />
            <button onClick={() => runAnalysis('text')} disabled={busy === 'analyze' || !manualText.trim()} className="btn-primary mt-2 w-full">
              {busy === 'analyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}تحليل النص
            </button>
          </div>
        )}
      </div>

      {/* results */}
      {analysis && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">{t('rx.results')}</h2>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={current?.status || 'pending_review'} />
              {analysis.readable === false && <Badge tone="amber">صورة غير واضحة</Badge>}
            </div>
          </div>

          {/* summary strip: green confirmed / yellow review / red important */}
          {summary && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Mini label="بنود مقروءة" value={String(summary.items ?? items.length)} />
              <Mini label="طابقت القاعدة" value={`${summary.matched ?? 0}`} tone="ok" />
              <Mini label="تحتاج مراجعة" value={`${summary.needs_review ?? 0}`} tone={(summary.needs_review ?? 0) > 0 ? 'warn' : 'ok'} />
              <Mini label="اعتماد تلقائي" value="0" tone="ok" hint="بالتصميم" />
              <Mini label="حساسيات مفحوصة" value={String(summary.allergies_checked ?? 0)} tone={(summary.allergies_checked ?? 0) > 0 ? 'ok' : 'neutral'} />
            </div>
          )}

          <div className="flex items-start gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-3 text-[10.5px] leading-5 text-rose-200">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <b>لم تُعتمد هذه الوصفة بعد.</b> النتائج قراءة آلية تحتاج إلى مراجعة الصيدلي، ولا تُغيّر الوصفة الأصلية.
              {(analysis.disclaimer_ar) && <span className="mt-1 block text-rose-200/80">{analysis.disclaimer_ar}</span>}
            </div>
          </div>

          {/* patient / doctor — uncertain highlighted */}
          {(analysis.patient?.name || analysis.doctor?.name || analysis.clinic?.name) && (
            <div className="card p-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <InfoField label="المريض" value={analysis.patient?.name} confidence={analysis.patient?.confidence} />
                <InfoField label="الطبيب" value={analysis.doctor?.name} confidence={analysis.doctor?.confidence} />
                <InfoField label="العيادة/المستشفى" value={analysis.clinic?.name} confidence={analysis.clinic?.confidence} />
              </div>
            </div>
          )}

          {/* extracted text before approval */}
          <div className="card p-3">
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11.5px] font-bold text-ink-200"><ScanText className="h-3.5 w-3.5 text-brand-300" />النص المستخرج (قبل الاعتماد)</div>
              <button onClick={() => setShowManual((v) => !v)} className="text-[10px] font-bold text-brand-300 underline">تعديل التحليل بنص مصحّح</button>
            </div>
            {items.length === 0 && <div className="text-[11px] text-ink-500">لم يُقرأ أي بند.</div>}
            <ul className="space-y-1">
              {items.map((it) => {
                const raw = it.raw_text || it.name || '—';
                const low = (it.confidence ?? 0) < 0.7 || !it.matched;
                return (
                  <li key={it.line_no} className={cx('rounded-lg px-2 py-1.5 text-[11.5px] leading-6', low ? 'bg-amber-500/10 text-amber-100' : 'bg-white/[.04] text-ink-200')}>
                    <span className="me-1 text-ink-500">{it.line_no}.</span>
                    <span className={cx(low && 'underline decoration-amber-400/70 decoration-wavy underline-offset-4')} dir="auto">{raw}</span>
                    {low && <span className="ms-2 text-[9.5px] font-bold text-amber-300">كلمة غير مؤكدة</span>}
                  </li>
                );
              })}
            </ul>
            {showManual && (
              <div className="mt-2">
                <TextArea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="صحّح النص ثم أعد التحليل" />
                <button onClick={reanalyze} disabled={busy === 'reanalyze'} className="btn-ghost mt-2 w-full">
                  {busy === 'reanalyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}إعادة التحليل بالنص المصحّح
                </button>
              </div>
            )}
          </div>

          {/* flags from trusted data only */}
          {flagged.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-[12px] font-extrabold text-ink-200">تنبيهات للمراجعة ({flagged.length})</h3>
              {flagged.map((f, i) => <FlagCard key={`${f.type}-${i}`} flag={f} lang={lang} />)}
            </div>
          )}

          {/* items */}
          <div className="space-y-2.5">
            {items.map((item) => (
              <ItemCard
                key={item.id ?? item.line_no}
                item={item}
                lang={lang}
                isStaff={isStaff}
                editing={editMode && isStaff}
                draft={item.id ? draft[item.id] : undefined}
                onDraft={(patch) => item.id && setDraft((d) => ({ ...d, [item.id as number]: { ...(d[item.id as number] || {}), ...patch } }))}
                onSave={() => patchItem(item)}
                onAlternative={(c) => chooseAlternative(item, c)}
                saving={busy === 'save'}
              />
            ))}
          </div>

          {/* source + timestamps */}
          <div className="card p-3 text-[10px] leading-5 text-ink-400">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span><Database className="me-1 inline h-3 w-3" />المصدر: {analysis.source?.catalogue || 'قاعدة MDA'}</span>
              <span>النموذج: <span dir="ltr">{analysis.source?.model || '—'}</span></span>
              <span>إصدار التعليمات: <span dir="ltr">{analysis.source?.prompt_version || '—'}</span></span>
              <span>وقت التحليل: {analysis.source?.analysed_at ? dateFmt(analysis.source.analysed_at) : '—'}</span>
              {current?.created_at && <span>تاريخ الحفظ: {dateFmt(current.created_at)}</span>}
            </div>
            {analysis.source?.catalogue_generated_at && <div className="mt-0.5">آخر تحديث لقاعدة الأدوية: {dateFmt(analysis.source.catalogue_generated_at)}</div>}
            {current?.runs?.length ? (
              <div className="mt-1 text-[9.5px] text-ink-500">
                آخر محاولات: {current.runs.map((r, i) => `${r.provider}/${r.model} ${r.ok ? '✓' : '✗'} ${r.latency_ms || '?'}ms`).join(' · ')}
              </div>
            ) : null}
          </div>

          {/* actions */}
          <div className="flex flex-wrap gap-2">
            {isStaff && current?.status !== 'reviewed' && (
              <>
                <button onClick={() => setEditMode((v) => !v)} className="btn-ghost">
                  <Edit3 className="h-4 w-4" />{editMode ? 'إنهاء التصحيح' : 'تصحيح يدوي'}
                </button>
                <button onClick={() => confirm(false)} disabled={busy === 'confirm'} className="btn-primary flex-1">
                  {busy === 'confirm' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  تأكيد المراجعة
                </button>
                <button onClick={reject} disabled={busy === 'confirm'} className="btn-ghost !text-rose-300"><Ban className="h-4 w-4" />رفض</button>
              </>
            )}
            {isStaff && current?.status === 'reviewed' && (
              <div className="flex w-full items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200">
                <CheckCircle2 className="h-4 w-4" />تمت المراجعة والاعتماد بواسطة الصيدلي — مسجّل بالاسم والوقت.
              </div>
            )}
            {!isStaff && (
              <div className="flex w-full items-center gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-200">
                <Info className="h-4 w-4" />الوصفة بانتظار صيدلي لمراجعتها. يمكنك حذف صورتها وبيانات المريض في أي وقت.
              </div>
            )}
            <button onClick={() => current && purge(current.id)} className="btn-ghost !text-rose-300"><Trash2 className="h-4 w-4" />حذف بيانات المريض</button>
            <button onClick={reset} className="btn-ghost"><X className="h-4 w-4" />إغلاق</button>
          </div>
        </div>
      )}

      {/* pharmacist queue */}
      {isStaff && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title inline-flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 text-amber-300" />طابور مراجعة الصيدلي
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">{queue?.count ?? 0}</span>
            </h2>
            <button onClick={reloadQueue} className="icon-btn h-7 w-7 text-ink-400"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          {!queue && <div className="text-[11px] text-ink-500">جارٍ التحميل…</div>}
          {queue?.count === 0 && <div className="card p-3 text-[11px] text-ink-400">لا توجد وصفات بانتظار المراجعة الآن.</div>}
          <div className="space-y-2">
            {(queue?.rows || []).map((q) => (
              <button key={q.id} onClick={() => openRow({ id: q.id } as RxRow)} className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[.05] p-2.5 text-start">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-[11px] font-extrabold text-amber-300">#{q.id}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-bold text-ink-100">
                    {q.items} بندًا · {q.pending_items} بانتظار التأكيد
                    {q.unmatched > 0 && <span className="ms-1.5 text-rose-300">· {q.unmatched} غير مطابق</span>}
                  </div>
                  <div className="text-[10px] text-ink-400">من {q.owner_name || 'مستخدم'} · {dateFmt(q.created_at)}</div>
                </div>
                <span className="shrink-0 rounded-lg bg-amber-500/20 px-2 py-1 text-[10px] font-bold text-amber-200">مراجعة</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[9.5px] leading-4 text-ink-500">
            فتح أي وصفة باسم صيدلي يُسجَّل في سجل التدقيق (من اطّلع ومتى). لا تُعرض بيانات المريض في القائمة.
          </p>
        </section>
      )}

      {/* history */}
      {user && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title inline-flex items-center gap-1.5"><HistoryIcon className="h-4 w-4 text-ink-400" />{t('rx.history')}</h2>
            <button onClick={reloadHistory} className="icon-btn h-7 w-7 text-ink-400"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          {historyLoading && <PageLoader />}
          {history?.length === 0 && <EmptyState icon={<ScanText className="h-6 w-6" />} title={t('rx.empty')} />}
          <div className="space-y-2">
            {(history || []).map((h) => {
              const a: Analysis | null = h.analysis || (h.analysis_json ? safeJson(h.analysis_json) : null);
              const names = (a?.items || []).map((i) => i.name || i.raw_text).filter(Boolean).join('، ');
              return (
                <div key={h.id} className="flex w-full items-center gap-3 rounded-2xl border border-white/[.08] bg-ink-900 p-2.5">
                  <button onClick={() => openRow(h)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[.06]">
                      {h.image_url ? <img src={assetUrl(h.image_url)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ScanText className="h-5 w-5 text-ink-400" /></div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold">وصفة #{h.id}</span>
                        <StatusBadge status={h.status} />
                      </div>
                      <div className="line-clamp-1 text-[11px] text-ink-500">{names || h.extracted_text || '—'}</div>
                      <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-ink-400"><Clock className="h-2.5 w-2.5" />{dateFmt(h.created_at)}</div>
                    </div>
                  </button>
                  <button onClick={() => purge(h.id)} className="icon-btn h-8 w-8 text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!user && (
        <div className="card p-4 text-[11px] leading-6 text-ink-400">
          قاعدة الأدوية والبحث متاحان بدون تسجيل. أما تحليل الوصفات فيحتاج حسابًا ليسجّل من حلّل ومتى، ويحتاج اتصالًا بالخادم — لا يوجد تحليل على الجهاز بدون إنترنت.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ bits */

const safeJson = (s: string) => { try { return JSON.parse(s); } catch { return null; } };

function AllergiesCard({ onSaved }: { onSaved?: () => void }) {
  const { push } = useToast();
  const { data, reload } = useApi<{ items: Allergy[]; families: Family[]; note_ar: string }>('/api/rx/allergies');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [drugQ, setDrugQ] = useState('');
  const [busy, setBusy] = useState(false);
  const items = data?.items || [];
  const families = (data?.families || []).filter((f) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return f.label_ar.includes(t) || f.label_en.toLowerCase().includes(t) || f.code.includes(t);
  });
  const { data: drugHits } = useApi<{ data: any[] }>('/api/catalog/drugs', { q: drugQ, limit: 6 }, { enabled: drugQ.trim().length >= 2, ttl: 120_000 });

  const add = async (code: string, label?: string) => {
    setBusy(true);
    try {
      const res = await api.slow.post<{ items: Allergy[] }>('/api/rx/allergies', { code, label });
      push('تمت إضافة الحساسية');
      setQ(''); setDrugQ('');
      await reload();
      onSaved?.();
      return res;
    } catch (e: any) { push(e?.message || 'تعذّرت الإضافة', 'error'); }
    finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    try { await api.del(`/api/rx/allergies/${id}`); await reload(); push('تم الحذف'); onSaved?.(); }
    catch (e: any) { push(e?.message || 'تعذّر الحذف', 'error'); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-violet-300" />
          <h2 className="text-[12.5px] font-extrabold">حساسياتي المسجّلة</h2>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[9.5px] font-bold text-violet-200">{items.length}</span>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-[10.5px] font-bold text-brand-300 underline">
          {open ? 'إغلاق' : items.length ? 'تعديل' : 'أضف حساسية'}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="mt-1.5 text-[10.5px] leading-5 text-ink-500">
          لم تُسجّل أي حساسية. التسجيل اختياري، ويُستخدم فقط لتنبيهك وتنبيه الصيدلي عند وجود دواء من نفس العائلة.
          <b className="text-ink-300"> لا نستنتج الحساسية تلقائيًا من أي مصدر.</b>
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2 py-1 text-[10.5px] font-bold text-violet-100">
              {a.label}
              {String(a.code).startsWith('mol:') ? <span className="text-[8.5px] font-normal opacity-70">مادة محددة</span> : <span className="text-[8.5px] font-normal opacity-70">عائلة</span>}
              <button onClick={() => remove(a.id)} className="rounded-full p-0.5 text-violet-200/70 hover:text-white"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-white/[.08] bg-white/[.02] p-2.5">
          <div>
            <div className="mb-1 text-[10px] font-bold text-ink-300">عائلة دوائية موثّقة (تصنيف ATC)</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: بنسلين، NSAID، سلفا…" className="mini-input" />
            <div className="mt-1.5 flex max-h-40 flex-wrap gap-1 overflow-y-auto">
              {families.slice(0, 80).map((f) => (
                <button key={f.code} disabled={busy} onClick={() => add(f.code, f.label_ar)} title={f.note_ar || ''}
                  className="rounded-lg border border-white/[.09] bg-ink-900 px-2 py-1 text-[10px] font-bold text-ink-200 hover:border-violet-400/50">
                  {f.label_ar}
                </button>
              ))}
              {families.length === 0 && <div className="text-[10px] text-ink-500">لا نتائج</div>}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold text-ink-300">أو مادة فعالة محددة</div>
            <input value={drugQ} onChange={(e) => setDrugQ(e.target.value)} placeholder="اسم الدواء العلمي…" className="mini-input" />
            <div className="mt-1 flex flex-wrap gap-1">
              {(drugHits?.data || []).slice(0, 6).map((d) => (
                <button key={d.id} disabled={busy} onClick={() => add(`mol:${d.generic_name}`, `${d.generic_ar || d.generic_name} (${d.generic_name})`)}
                  className="rounded-lg border border-white/[.09] bg-ink-900 px-2 py-1 text-[10px] font-bold text-ink-200 hover:border-violet-400/50">
                  {d.generic_ar || d.generic_name}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[9px] leading-4 text-ink-500">{data?.note_ar}</p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: any; label: string }> = {
    pending_review: { tone: 'amber', label: 'بانتظار الصيدلي' },
    pending: { tone: 'amber', label: 'بانتظار الصيدلي' },
    reviewed: { tone: 'emerald', label: 'معتمدة من صيدلي' },
    rejected: { tone: 'rose', label: 'مرفوضة' },
    analyzed: { tone: 'sky', label: 'محلّلة' },
  };
  const m = map[status] || { tone: 'neutral', label: status };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function Mini({ label, value, tone = 'neutral', hint }: { label: string; value: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad'; hint?: string }) {
  const cls = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : tone === 'bad' ? 'text-rose-300' : 'text-ink-100';
  return (
    <div className="rounded-xl border border-white/[.07] bg-ink-900/60 p-2.5">
      <div className="text-[9.5px] font-bold text-ink-500">{label}</div>
      <div className={cx('text-[16px] font-extrabold', cls)}>{value}{hint && <span className="ms-1 text-[9px] font-normal text-ink-500">{hint}</span>}</div>
    </div>
  );
}

function InfoField({ label, value, confidence }: { label: string; value?: string | null; confidence?: number }) {
  const tone = confidenceTone(confidence);
  return (
    <div className={cx('rounded-xl border p-2',
      tone === 'ok' ? 'border-emerald-400/20 bg-emerald-500/[.06]' : tone === 'warn' ? 'border-amber-400/25 bg-amber-500/[.08]' : 'border-white/[.07] bg-white/[.03]')}>
      <div className="text-[9.5px] font-bold text-ink-500">{label}</div>
      <div className="text-[12px] font-bold text-ink-100">{value || <span className="text-ink-500">غير مقروء — راجع الصورة</span>}</div>
      <div className="text-[9px] text-ink-400">ثقة القراءة {pct(confidence)}</div>
    </div>
  );
}

function FlagCard({ flag, lang }: { flag: Flag; lang: string }) {
  const [open, setOpen] = useState(false);
  const sev = flag.severity === 'high' ? 'rose' : flag.severity === 'medium' ? 'amber' : 'sky';
  const border = sev === 'rose' ? 'border-rose-400/30 bg-rose-500/10 text-rose-100' : sev === 'amber' ? 'border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border-sky-400/25 bg-sky-500/10 text-sky-100';
  const Icon = sev === 'rose' ? ShieldAlert : sev === 'amber' ? AlertTriangle : Info;
  const plain = lang === 'en' ? flag.plain_en || flag.plain_ar : flag.plain_ar;
  const why = lang === 'en' ? flag.why_en || flag.why_ar : flag.why_ar;
  const detail = lang === 'en' ? flag.detail_en || flag.detail_ar : flag.detail_ar;
  return (
    <div className={cx('rounded-2xl border p-3 text-[11px] leading-5', border)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-extrabold">{lang === 'en' ? flag.title_en || flag.title_ar : flag.title_ar}</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold opacity-80">
              {flag.severity === 'high' ? 'مهم' : flag.severity === 'medium' ? 'يحتاج مراجعة' : 'معلومة'}
            </span>
          </div>
          {plain && <p className="mt-1 text-[11.5px] font-semibold opacity-95">{plain}</p>}
          {detail && <p className="mt-0.5 text-[10px] opacity-70">{detail}</p>}
          {flag.action_ar && (
            <div className="mt-1 inline-flex rounded-lg bg-black/20 px-2 py-0.5 text-[10px] font-bold">
              → {lang === 'en' ? flag.action_en || flag.action_ar : flag.action_ar}
            </div>
          )}
          <button onClick={() => setOpen((v) => !v)} className="mt-1.5 flex items-center gap-1 text-[9.5px] font-bold opacity-70 underline">
            <Info className="h-2.5 w-2.5" />{open ? 'إخفاء سبب التنبيه' : 'لماذا ظهر هذا التنبيه؟'}
          </button>
          {open && (
            <div className="mt-1 space-y-1 rounded-lg bg-black/20 p-2 text-[9.5px] leading-4">
              {why && <div><b>السبب:</b> {why}</div>}
              <div>
                <b>المصدر:</b> {flag.source?.label || 'قاعدة MDA'}
                {flag.source?.updated_at ? ` — آخر تحديث: ${dateFmt(flag.source.updated_at)}` : ' — تاريخ التحديث غير مسجّل'}
              </div>
              <div className="opacity-70">هذا التنبيه لا يشخّص ولا يغيّر الوصفة؛ القرار للصيدلي/الطبيب.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({
  item, lang, isStaff, editing, draft, onDraft, onSave, onAlternative, saving,
}: {
  item: Item; lang: string; isStaff: boolean; editing: boolean;
  draft?: Partial<Item>; onDraft: (p: Partial<Item>) => void; onSave: () => void;
  onAlternative: (c: Candidate) => void; saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const val = { ...item, ...(draft || {}) } as Item;
  const conf = item.confidence ?? 0;
  const tone = confidenceTone(conf);
  const ring = tone === 'ok' ? 'border-emerald-400/25' : tone === 'warn' ? 'border-amber-400/30' : 'border-rose-400/30';
  const initials = (item.name || '?').slice(0, 1).toUpperCase();

  return (
    <div className={cx('card overflow-hidden border p-3.5', ring)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-grad text-[12px] font-extrabold on-color">{item.line_no}</span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-extrabold text-white">{val.name || '—'}</span>
              <Badge tone={tone === 'ok' ? 'emerald' : tone === 'warn' ? 'amber' : 'rose'}>ثقة {pct(conf)}</Badge>
              {item.status === 'corrected' && <Badge tone="sky">مُصحَّح يدويًا</Badge>}
              {!val.matched && <Badge tone="rose">غير موجود في القاعدة</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-[10.5px] text-ink-400">
              {val.strength && <Chip>{val.strength}</Chip>}
              {val.form && <Chip>{val.form}</Chip>}
              {val.dose && <span>• {val.dose}</span>}
              {val.frequency && <span>• {val.frequency}</span>}
              {val.duration && <span>• {val.duration}</span>}
              {val.route && <span>• {val.route}</span>}
            </div>
          </div>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="icon-btn h-8 w-8 text-ink-400"><ChevronDown className={cx('h-4 w-4 transition', open && 'rotate-180')} /></button>
      </div>

      {/* unmatched / low-conf explanation */}
      {item.uncertain_fields && item.uncertain_fields.length > 0 && (
        <div className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
          حقول تحتاج تأكيد: {item.uncertain_fields.map((f) => FIELD_LABELS[f] || f).join('، ')} — تحتاج إلى مراجعة الصيدلي
        </div>
      )}
      {!val.matched && (
        <div className="mt-2 rounded-lg bg-rose-500/10 px-2 py-1.5 text-[10px] text-rose-200">
          الاسم لم يُطابق أي دواء في قاعدة MDA. راجع الصورة أو اكتب الاسم الصحيح — لا تخمّن الدواء.
        </div>
      )}

      {/* matched catalogue entry */}
      {val.matched && (
        <div className="mt-2 rounded-xl border border-white/[.07] bg-white/[.03] p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300"><Pill className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-bold text-ink-100">
                {val.matched.trade_name || val.matched.generic_name}
                {val.matched.trade_name && val.matched.generic_name && <span className="ms-1 text-[10px] font-normal text-ink-500">({val.matched.generic_name})</span>}
              </div>
              <div className="truncate text-[10px] text-ink-400">
                {[val.matched.strength, val.matched.form, val.matched.manufacturer_name, val.matched.country].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <div className="text-end">
              <div className="text-[9px] text-ink-500">درجة المطابقة</div>
              <div className="text-[12px] font-extrabold text-emerald-300">{pct(val.matched.score)}</div>
            </div>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-[10px]">
            {val.matched.drug_id && <Link to={`/drugs/${val.matched.drug_id}`} className="font-bold text-brand-300 underline">بطاقة الدواء والمادة الفعالة</Link>}
            {val.matched.product_id && <Link to={`/products/${val.matched.product_id}`} className="font-bold text-brand-300 underline">صفحة المنتج</Link>}
          </div>
        </div>
      )}

      {/* alternatives — multiple candidates for unclear names */}
      {val.alternatives && val.alternatives.length > 1 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-bold text-ink-400">مرشّحون بدلاء — اختر الصحيح (لا اعتماد آلي):</div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {val.alternatives.slice(0, 6).map((c) => (
              <button
                key={`${c.drug_id}-${c.product_id || 0}`}
                onClick={() => isStaff && onAlternative(c)}
                disabled={!isStaff}
                className={cx('w-[150px] shrink-0 rounded-xl border p-2 text-start',
                  isStaff ? 'border-white/[.09] bg-ink-900 hover:border-brand-400/40' : 'border-white/[.06] bg-ink-900/60 opacity-80')}
              >
                <div className="line-clamp-1 text-[10.5px] font-bold text-ink-100">{c.trade_name || c.generic_name}</div>
                <div className="line-clamp-1 text-[9.5px] text-ink-400">{c.generic_name}</div>
                <div className="line-clamp-1 text-[9px] text-ink-500">{[c.strength, c.form].filter(Boolean).join(' · ')}</div>
                <div className="mt-0.5 text-[9px] font-bold text-amber-300">{pct(c.score)}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* pharmacist manual correction */}
      {editing && (
        <div className="mt-2.5 space-y-2 rounded-xl border border-brand-400/25 bg-brand-500/[.06] p-2.5">
          <div className="text-[10.5px] font-bold text-brand-200">تصحيح يدوي — يُسجَّل باسمك ووقته</div>
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="الاسم"><input value={val.name || ''} onChange={(e) => onDraft({ name: e.target.value })} className="mini-input" /></Labeled>
            <Labeled label="التركيز"><input value={val.strength || ''} onChange={(e) => onDraft({ strength: e.target.value })} className="mini-input" /></Labeled>
            <Labeled label="الجرعة"><input value={val.dose || ''} onChange={(e) => onDraft({ dose: e.target.value })} className="mini-input" /></Labeled>
            <Labeled label="التكرار"><input value={val.frequency || ''} onChange={(e) => onDraft({ frequency: e.target.value })} className="mini-input" /></Labeled>
            <Labeled label="المدة"><input value={val.duration || ''} onChange={(e) => onDraft({ duration: e.target.value })} className="mini-input" /></Labeled>
            <Labeled label="الشكل"><input value={val.form || ''} onChange={(e) => onDraft({ form: e.target.value })} className="mini-input" /></Labeled>
          </div>
          <button onClick={onSave} disabled={saving} className="btn-primary w-full py-1.5 text-[11px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}حفظ التصحيح وإعادة المطابقة
          </button>
        </div>
      )}

      {/* dossier */}
      {open && val.dossier?.drug && (
        <div className="mt-2.5 space-y-1.5 rounded-xl border border-white/[.07] bg-white/[.02] p-2.5 text-[10.5px] leading-5">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-ink-400">
            <Database className="h-3 w-3" />المصدر: {val.dossier.drug.source || val.dossier.source || 'قاعدة MDA'} — آخر تحديث: {val.dossier.drug.updated_at ? dateFmt(val.dossier.drug.updated_at) : (val.dossier.updated_at ? dateFmt(val.dossier.updated_at) : 'غير مسجّل')}
          </div>
          <Row label="المادة الفعالة" value={val.dossier.drug.generic_ar || val.dossier.drug.generic_name} dir="auto" />
          <Row label="الفئة" value={val.dossier.drug.drug_class} />
          <Row label="دواعي الاستعمال" value={val.dossier.drug.indications_ar} />
          <Row label="الجرعة المرجعية (بالغ)" value={val.dossier.drug.dosage_adult} />
          <Row label="موانع الاستعمال" value={val.dossier.drug.contraindications} tone="rose" />
          <Row label="تحذيرات" value={val.dossier.drug.warnings} tone="amber" />
          <Row label="تداخلات مسجّلة" value={val.dossier.drug.interactions} tone="amber" />
          <Row label="الحمل" value={val.dossier.drug.pregnancy} />
          {val.dossier.drug.allergen_families && val.dossier.drug.allergen_families.length > 0 && (
            <div className="rounded-lg bg-white/[.03] px-2 py-1">
              <span className="me-1 font-bold opacity-70">العائلات التحسّسية:</span>
              {val.dossier.drug.allergen_families.map((f) => (
                <span key={f.code} className="me-1 inline-block rounded bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-violet-200" title={f.note_ar || ''}>
                  {f.label_ar}
                </span>
              ))}
            </div>
          )}
          {val.dose_calc?.daily_mg !== undefined && (
            <div className="mt-1 rounded-lg bg-white/[.04] px-2 py-1 text-[10px] text-ink-300">
              الجرعة اليومية المحسوبة: <b>{val.dose_calc.daily_mg} مغم</b>
              {val.documented_max_daily_mg ? ` — الحد المرجعي ${val.documented_max_daily_mg} مغم/يوم` : ' — لا يوجد حد مرجعي محفوظ'}
            </div>
          )}
          {val.dossier.brands && val.dossier.brands.length > 0 && (
            <div className="mt-1">
              <div className="mb-1 text-[10px] font-bold text-ink-400">منتجات تجارية من نفس المادة ({val.dossier.brands.length}):</div>
              <div className="flex flex-wrap gap-1">
                {val.dossier.brands.slice(0, 8).map((p) => (
                  <Link key={p.id} to={`/products/${p.id}`} className="rounded-lg border border-white/[.08] bg-ink-900 px-2 py-1 text-[9.5px] font-bold text-ink-200">
                    {p.trade_name} {p.strength && <span className="text-ink-500">· {p.strength}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="pt-1 text-[9px] text-ink-500">معلومات مرجعية لا تُغيّر الوصفة، وأي شك يحتاج إلى مراجعة الصيدلي/الطبيب.</div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, tone, dir }: { label: string; value?: string | null; tone?: 'rose' | 'amber'; dir?: 'auto' | 'rtl' | 'ltr' }) {
  if (!value) return null;
  return (
    <div className={cx('rounded-lg px-2 py-1', tone === 'rose' ? 'bg-rose-500/10 text-rose-100' : tone === 'amber' ? 'bg-amber-500/10 text-amber-100' : 'bg-white/[.03] text-ink-300')}>
      <span className="me-1 font-bold opacity-70">{label}:</span>
      <span dir={dir}>{String(value).slice(0, 400)}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white/[.06] px-1.5 py-0.5 text-[10px] text-ink-200">{children}</span>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[9px] font-bold text-ink-500">{label}</span>
      {children}
    </label>
  );
}
