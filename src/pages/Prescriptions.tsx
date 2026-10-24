import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Bot, Camera, CheckCircle2, ChevronLeft, ChevronRight, Clock, Image as ImageIcon,
  Loader2, Lock, Pill, ScanText, Sparkles, Trash2, UploadCloud, X,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { api, assetUrl } from '../lib/api';
import { useApi } from '../lib/useApi';
import { Badge, EmptyState, ErrorState, PageLoader, TextArea, useToast } from '../components/ui';
import { SmartImage } from '../components/ui';
import { cx, dateFmt } from '../lib/utils';

type Prescription = {
  id: number; image_url?: string; extracted_text?: string; status: string; created_at: string;
  analysis?: any; ai?: boolean; mode?: string;
};

export default function Prescriptions() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [current, setCurrent] = useState<Prescription | null>(null);
  const [manualText, setManualText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const { data: history, loading, reload } = useApi<Prescription[]>('/api/prescriptions', undefined, { enabled: !!user });

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { push('يرجى اختيار صورة', 'error'); return; }
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setCurrent(null);
    setManualText('');
  };

  const upload = async () => {
    if (!user) { navigate('/auth'); return; }
    if (!file) { push('اختر صورة الوصفة أولًا', 'error'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('lang', lang);
      const res = await api.post<Prescription>('/api/prescriptions', fd);
      setCurrent(res);
      setManualText(res.extracted_text || '');
      reload();
      if (res.analysis?.items?.length) push('تم تحليل الوصفة بنجاح');
      else if (!res.ai) push(t('rx.noAi'), 'info');
      else push('تم رفع الوصفة — يمكنك إدخال النص للتحليل', 'info');
    } catch (e: any) {
      push(e.message === 'NETWORK' ? t('errors.network') : e.message || t('common.error'), 'error');
    } finally { setUploading(false); }
  };

  const analyzeText = async () => {
    if (!manualText.trim()) return;
    if (!current) {
      // guest quick analysis
      setAnalyzing(true);
      try {
        const res = await api.post<any>('/api/ai/extract-text', { text: manualText });
        const items = (res.items || []).map((i: any) => ({
          name: i.trade_name || i.generic_name,
          strength: i.strength || '',
          matched: {
            score: i.score || 0.7,
            drug_id: i.drug_id || i.drug?.id || (i.matched_as === 'generic' ? i.id : null),
            generic_name: i.generic_name, generic_ar: i.generic_ar,
            warnings: i.warnings || i.drug?.warnings || null,
            products: i.products || [],
          },
        }));
        setCurrent({ id: 0, status: 'analyzed', created_at: new Date().toISOString(), ai: true, mode: 'manual', analysis: { readable: true, items } });
      } catch { push(t('common.error'), 'error'); }
      finally { setAnalyzing(false); }
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api.post<Prescription>(`/api/prescriptions/${current.id}/analyze`, { text: manualText });
      setCurrent({ ...current, ...res });
      push('تم التحليل');
      reload();
    } catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setAnalyzing(false); }
  };

  const remove = async (id: number) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api.del(`/api/prescriptions/${id}`); push('تم الحذف'); if (current?.id === id) setCurrent(null); reload(); }
    catch { push(t('common.error'), 'error'); }
  };

  const result = current?.analysis;
  const items = result?.items || [];
  const showManual = !user || (current && (!current.ai || current.mode === 'manual' || !items.length));

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero page-hero-rose p-5 text-white">
        <div className="flex items-center gap-2"><ScanText className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('rx.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">{t('rx.subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
          <span className="rounded-full bg-white/15 px-2 py-1"><Camera className="me-1 inline h-3 w-3" /> صوّر الوصفة</span>
          <span className="rounded-full bg-white/15 px-2 py-1"><Bot className="me-1 inline h-3 w-3" /> استخراج ذكي</span>
          <span className="rounded-full bg-white/15 px-2 py-1"><Pill className="me-1 inline h-3 w-3" /> مطابقة مع {lang === 'ar' ? 'المنتجات' : 'products'}</span>
        </div>
      </div>

      {!user && (
        <div className="card flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-500 bg-white/[.05]"><Lock className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-bold">{t('common.loginRequired')}</div>
            <div className="text-[11px] text-ink-500">حفظ الوصفات وتاريخها متاح بعد تسجيل الدخول — يمكنك تحليل النص كزائر.</div>
          </div>
          <Link to="/auth" className="btn-primary shrink-0 px-3 py-2 text-[11.5px]">{t('common.login')}</Link>
        </div>
      )}

      <div className="card p-4">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        {!preview ? (
          <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-rose-400/30 bg-rose-500/[.05] px-4 py-8 text-center">
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-tile"><UploadCloud className="h-6 w-6" /></span>
            <div className="text-[13px] font-bold text-ink-100">{t('rx.upload')}</div>
            <p className="mt-1 max-w-xs text-[11px] leading-5 text-ink-500">صورة واضحة، إضاءة جيدة، وبدون انعكاس — يمكنك التصوير مباشرة أو اختيار صورة من المعرض.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => cameraRef.current?.click()} className="btn-primary"><Camera className="h-4 w-4" />{t('rx.camera')}</button>
              <button onClick={() => fileRef.current?.click()} className="btn-ghost"><ImageIcon className="h-4 w-4" />{t('rx.choose')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl bg-white/[.06]">
              <img src={preview} alt="prescription" className="max-h-[360px] w-full object-contain" />
              <button onClick={() => { setPreview(null); setFile(null); }} className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-ink-950/60 text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2">
              <button onClick={upload} disabled={uploading} className="btn-primary flex-1">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {uploading ? t('rx.analyzing') : t('rx.analyze')}
              </button>
              <button onClick={() => fileRef.current?.click()} className="btn-ghost"><ImageIcon className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {showManual && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-violet-300"><Bot className="h-4 w-4" /><h2 className="text-[12.5px] font-extrabold">{t('rx.manualTitle')}</h2></div>
          <p className="mb-2 text-[11px] leading-5 text-ink-500">{t('rx.manualHint')}</p>
          {!current?.ai && <div className="mb-2 rounded-xl p-2.5 text-[11px] leading-5 bg-amber-500/10 text-amber-200">{t('rx.noAi')}</div>}
          <TextArea value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder={lang === 'ar' ? 'مثال: Augmentin 1g tablet – 1 tablet twice daily for 7 days…' : 'e.g. Augmentin 1g tablet — one tablet twice daily for 7 days…'} />
          <button onClick={analyzeText} disabled={analyzing || !manualText.trim()} className="btn-primary mt-2 w-full">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}{t('rx.analyzeText')}
          </button>
        </div>
      )}

      {!!items.length && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="section-title">{t('rx.results')}</h2>
            {result?.readable === false && <Badge tone="amber">{lang === 'ar' ? 'صورة غير واضحة' : 'Low quality'}</Badge>}
          </div>
          {current?.image_url && <div className="overflow-hidden rounded-2xl border border-white/[.08]"><img src={assetUrl(current.image_url)} alt="" className="max-h-40 w-full object-cover" /></div>}
          {items.map((item: any, idx: number) => (
            <div key={idx} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13.5px] font-extrabold text-white">{item.name || item.matched?.generic_name || '—'}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1.5 text-[10.5px] text-ink-500">
                    {item.strength && <span className="rounded px-1.5 py-0.5 bg-white/[.05]">{item.strength}</span>}
                    {item.form && <span>{item.form}</span>}
                    {item.dose && <span>• {item.dose}</span>}
                    {item.frequency && <span>• {item.frequency}</span>}
                    {item.duration && <span>• {item.duration}</span>}
                  </div>
                </div>
                <Badge tone="emerald"><CheckCircle2 className="h-2.5 w-2.5" />{item.matched ? `${Math.round((item.matched.score || 0) * 100)}%` : '—'}</Badge>
              </div>
              {item.matched?.warnings && (
                <div className="mt-2 flex items-start gap-1.5 rounded-xl p-2.5 text-[10.5px] leading-5 bg-amber-500/10 text-amber-200">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{item.matched.warnings}
                </div>
              )}
              {item.matched?.products?.length > 0 && (
                <div className="mt-2">
                  <div className="mb-1 text-[10.5px] font-bold text-ink-500">{t('rx.matchedProducts')}</div>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {item.matched.products.slice(0, 4).map((mp: any) => (
                      <Link key={mp.id} to={`/products/${mp.id}`} className="flex w-[132px] shrink-0 items-center gap-2 rounded-xl border p-1.5 border-white/[.08]">
                        <SmartImage src={mp.image_url} productId={mp.id} alt={mp.trade_name} className="h-10 w-10 bg-white/[.05]" rounded="rounded-lg" />
                        <div className="min-w-0">
                          <div className="line-clamp-1 text-[11px] font-bold">{mp.trade_name}</div>
                          <div className="line-clamp-1 text-[9.5px] text-ink-400">{mp.strength} · {mp.country}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {item.matched?.drug_id && (
                <Link to={`/drugs/${item.matched.drug_id}`} className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-brand-300">
                  {t('rx.viewDrug')} <ChevronLeft className="h-3 w-3 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3 w-3 ltr:block" />
                </Link>
              )}
            </div>
          ))}
          <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-[10.5px] leading-5 text-amber-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('rx.disclaimer')}
          </div>
        </div>
      )}

      {user && (
        <section>
          <h2 className="section-title mb-2">{t('rx.history')}</h2>
          {loading && <PageLoader />}
          {history?.length === 0 && <EmptyState icon={<ScanText className="h-6 w-6" />} title={t('rx.empty')} />}
          <div className="space-y-2">
            {(history || []).map((h) => (
              <button key={h.id} onClick={() => { setCurrent(h); setManualText(h.extracted_text || ''); setPreview(null); window.scrollTo({ top: 280, behavior: 'smooth' }); }} className="flex w-full items-center gap-3 rounded-2xl border p-2.5 text-start border-white/[.08] bg-ink-900">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[.06]">
                  {h.image_url ? <img src={assetUrl(h.image_url)} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><ScanText className="h-5 w-5 text-ink-400" /></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-bold">وصفة #{h.id}</span>
                    <Badge tone={h.status === 'analyzed' ? 'emerald' : 'amber'}>{h.status === 'analyzed' ? t('rx.status.analyzed') : t('rx.status.pending')}</Badge>
                  </div>
                  <div className="line-clamp-1 text-[11px] text-ink-500">{h.analysis?.items?.map((i: any) => i.name).join('، ') || h.extracted_text || '—'}</div>
                  <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-ink-400"><Clock className="h-2.5 w-2.5" />{dateFmt(h.created_at)}</div>
                </div>
                <span onClick={(e) => { e.stopPropagation(); remove(h.id); }} className="icon-btn h-8 w-8 text-rose-500"><Trash2 className="h-4 w-4" /></span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
