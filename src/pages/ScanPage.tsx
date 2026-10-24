import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Camera, ExternalLink, Image as ImageIcon, Loader2, ScanLine, Search, Sparkles, X } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { useConfig } from '../lib/config';
import { ProductGrid, ProductRecord } from '../components/catalog';
import { Badge, EmptyState, useToast } from '../components/ui';
import BarcodeScanner from '../components/barcodescanner';

export default function ScanPage() {
  const { t, lang } = useI18n();
  const { config } = useConfig();
  const { push } = useToast();
  const navigate = useNavigate();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [manual, setManual] = useState('');
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMiss, setCodeMiss] = useState<string | null>(null);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    setFile(f); setPreview(URL.createObjectURL(f)); setResult(null);
  };

  const identify = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('lang', lang);
      const res = await api.post<any>('/api/ai/identify-image', fd);
      setResult(res);
      if (!res.configured) push(lang === 'ar' ? 'تحليل الصور بالذكاء الاصطناعي غير مفعّل — استخدم Google Lens أدناه.' : 'AI image recognition is not configured — use Google Lens below.', 'info');
      else if (!res.matches?.length) push(lang === 'ar' ? 'لم يتم التعرف على منتج مطابق. جرّب صورة أوضح.' : 'No matching product found. Try a clearer photo.', 'info');
    } catch (e: any) {
      push(e.message === 'NETWORK' ? t('errors.network') : e.message || t('common.error'), 'error');
    } finally { setBusy(false); }
  };

  const lookupBarcode = async (code: string) => {
    setCodeBusy(true);
    setCodeMiss(null);
    try {
      const rows = await api.get<ProductRecord[]>(`/api/catalog/barcode/${encodeURIComponent(code)}`);
      if (rows?.length) {
        if (rows.length === 1) navigate(`/products/${rows[0].id}`);
        else setResult({ matches: rows, visible_text: code, confidence: 1 });
      } else {
        setCodeMiss(code);
        push(lang === 'ar' ? `لا يوجد منتج بالباركود ${code}` : `No product with barcode ${code}`, 'error');
      }
    } catch (e: any) {
      if (e?.message === 'NETWORK') {
        const mod = await import('../lib/offline');
        const pack = await mod.getPack();
        const offline = pack ? mod.searchPack(pack, code).products : [];
        if (offline.length) navigate(`/products/${offline[0].id}`);
        else setCodeMiss(code);
      } else push(e.message || t('common.error'), 'error');
    } finally { setCodeBusy(false); }
  };

  const lensUrl = 'https://lens.google.com/';
  const googleSearch = (q: string) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q + ' medicine')}`;
  const detectedName = result?.visible_text || result?.query || '';

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-700 via-sky-700 to-blue-900 p-5 text-white">
        <div className="absolute -end-8 top-4 h-36 w-36 rounded-full border-[18px] border-white/10" />
        <div className="flex items-center gap-2"><ScanLine className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{lang === 'ar' ? 'صوّر الدواء واعرفه' : 'Identify a medicine by photo'}</h1></div>
        <p className="mt-1 max-w-md text-[11.5px] leading-6 text-white/80">
          {lang === 'ar' ? 'ارفع صورة علبة الدواء أو الشريط، وسيتعرف الذكاء الاصطناعي على الاسم ويطابقه مع قاعدة البيانات، مع بحث Google للصور.' : 'Upload a pack or blister photo; AI reads the name and matches the database, with Google image search.'}
        </p>
      </div>

      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-emerald-700" /><h2 className="text-[12.5px] font-extrabold">{lang === 'ar' ? 'البحث بالباركود' : 'Search by barcode'}</h2></div>
        <BarcodeScanner onDetect={lookupBarcode} busy={codeBusy} />
        {codeMiss && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-[10.5px] text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
            <span>{lang === 'ar' ? 'غير موجود في القاعدة:' : 'Not in the catalogue:'} <b dir="ltr">{codeMiss}</b></span>
            <Link to={`/search?q=${encodeURIComponent(codeMiss)}`} className="font-bold text-brand-700 underline dark:text-brand-400">{lang === 'ar' ? 'ابحث بالرقم' : 'Search this code'}</Link>
          </div>
        )}
      </div>

      <div className="card relative overflow-hidden p-4">
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

        {!preview ? (
          <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/40 px-4 py-9 text-center dark:border-sky-900 dark:bg-sky-950/20">
            <div className="relative mb-3 flex h-20 w-20 items-center justify-center">
              <span className="absolute inset-0 animate-pulse-soft rounded-full bg-sky-200/60 dark:bg-sky-900/60" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white"><Camera className="h-7 w-7" /></span>
            </div>
            <div className="text-[13px] font-bold text-ink-800 dark:text-ink-100">{lang === 'ar' ? 'صوّر علبة الدواء' : 'Photograph the medicine pack'}</div>
            <p className="mt-1 max-w-xs text-[10.5px] leading-5 text-ink-500">{lang === 'ar' ? 'ضع الاسم التجاري في منتصف الإطار مع إضاءة جيدة.' : 'Centre the brand name with good lighting.'}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => cameraRef.current?.click()} className="btn-primary"><Camera className="h-4 w-4" />{t('rx.camera')}</button>
              <button onClick={() => galleryRef.current?.click()} className="btn-ghost"><ImageIcon className="h-4 w-4" />{t('rx.choose')}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-2xl bg-ink-900">
              <img src={preview} alt="medicine" className="max-h-[340px] w-full object-contain" />
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-sky-400/70" />
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 animate-pulse bg-sky-400/70" />
              <button onClick={() => { setPreview(null); setFile(null); setResult(null); }} className="absolute end-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2">
              <button onClick={identify} disabled={busy} className="btn-primary flex-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {busy ? (lang === 'ar' ? 'جارٍ التعرف…' : 'Identifying…') : (lang === 'ar' ? 'تعرّف على الدواء' : 'Identify medicine')}
              </button>
              <button onClick={() => lensUrl && window.open(lensUrl, '_blank')} className="btn-ghost" title="Google Lens"><ExternalLink className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {result && !result.configured && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-[11px] leading-6 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {lang === 'ar' ? 'للتعرف التلقائي على الصور أضف مفتاح AI على الخادم (AI_API_KEY). يمكنك دائمًا البحث عبر Google Lens أو البحث بالاسم.' : 'Add AI_API_KEY on the server for automatic recognition. You can still use Google Lens or search by name.'}
          </div>
        </div>
      )}

      {result?.matches?.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="section-title">{lang === 'ar' ? 'منتجات مطابقة' : 'Matching products'}</h2>
            {result.confidence != null && <Badge tone="sky">{Math.round(result.confidence * 100)}%</Badge>}
          </div>
          {detectedName && <p className="mb-2 text-[11px] text-ink-500">{lang === 'ar' ? 'تم التعرف على' : 'Detected'}: <b className="text-ink-800 dark:text-ink-200">{detectedName}</b></p>}
          <ProductGrid products={result.matches as ProductRecord[]} />
        </section>
      )}

      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2"><Search className="h-4 w-4 text-brand-700" /><h2 className="text-[12.5px] font-extrabold">{lang === 'ar' ? 'لم تظهر النتيجة؟ ابحث بالاسم أو Google' : 'No match? Search by name or Google'}</h2></div>
        <div className="flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={lang === 'ar' ? 'اكتب الاسم الظاهر على العلبة…' : 'Type the name on the pack…'} className="input flex-1" />
          <button onClick={() => navigate(`/search?q=${encodeURIComponent(manual)}`)} disabled={!manual.trim()} className="btn-primary shrink-0">{t('common.search')}</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => window.open(googleSearch(manual || 'medicine box'), '_blank')} className="btn-ghost text-[11px]"><Search className="h-3.5 w-3.5" />Google Images</button>
          <button onClick={() => window.open(lensUrl, '_blank')} className="btn-ghost text-[11px]"><ExternalLink className="h-3.5 w-3.5" />Google Lens</button>
        </div>
        <p className="text-[10px] leading-5 text-ink-400">{lang === 'ar' ? 'يُفتح Google Lens لرفع الصورة والبحث عنها بصريًا، ثم يمكنك نسخ الاسم هنا.' : 'Google Lens opens for visual search, then paste the name here.'}</p>
      </div>

      {!result && <EmptyState icon={<ScanLine className="h-6 w-6" />} title={lang === 'ar' ? 'التعرف البصري على الأدوية' : 'Visual medicine recognition'} text={lang === 'ar' ? 'ارفع صورة واضحة لعلبة الدواء للحصول على أفضل نتيجة.' : 'Upload a clear pack photo for best results.'} />}
    </div>
  );
}
