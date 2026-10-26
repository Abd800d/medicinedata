import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Image as ImageIcon, Loader2, RefreshCw,
  Search, UploadCloud, X, ExternalLink, Database, ListChecks,
} from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Badge, Field, PageLoader, Select, useToast } from '../../components/ui';
import { cx, dateFmt, num } from '../../lib/utils';
import ProductGallery from './ProductGallery';

const TEMPLATE = 'generic_name,generic_ar,trade_name,trade_name_ar,strength,dosage_form,pack_size,manufacturer,manufacturer_country,agent,country,barcode,price,currency,image_url,system,category,drug_class,atc_code,indications_ar,dosage_adult,dosage_child,warnings,side_effects,contraindications,verified';

export default function Media() {
  const [tab, setTab] = useState<'import' | 'images' | 'gallery' | 'history'>('import');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-1 rounded-xl p-1 bg-white/[.05]">
        {([['import', 'استيراد البيانات'], ['images', 'دفعة صور'], ['gallery', 'معرض المنتج'], ['history', 'السجل']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg py-1.5 text-[11px] font-bold', tab === k ? 'bg-brand-grad text-white shadow-glow' : 'text-ink-500')}>{label}</button>
        ))}
      </div>
      {tab === 'import' && <ImportPanel />}
      {tab === 'images' && <ImagesPanel />}
      {tab === 'gallery' && <ProductGallery />}
      {tab === 'history' && <HistoryPanel />}
    </div>
  );
}

/* ------------------------------- import ------------------------------- */
function ImportPanel() {
  const { data: systems } = useApi<any[]>('/api/admin/systems');
  const { push } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [systemId, setSystemId] = useState('');
  const [verify, setVerify] = useState(false);
  const [mode, setMode] = useState<'upsert' | 'insert' | 'update'>('upsert');
  const [table, setTable] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = (dryRun: boolean, tableOverride?: string) => new Promise<any>((resolve, reject) => {
    if (!file) return reject(new Error('اختر ملفًا أولًا'));
    const fd = new FormData();
    fd.append('file', file);
    if (systemId) fd.append('system_id', systemId);
    if (verify) fd.append('verify', '1');
    fd.append('mode', mode);
    const chosenTable = tableOverride ?? table;
    if (chosenTable) fd.append('table', chosenTable);
    if (dryRun) fd.append('dryRun', '1');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/import');
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300) resolve(json);
        else reject(new Error(json.error || `فشل (${xhr.status})`));
      } catch { reject(new Error('رد غير صالح من الخادم')); }
    };
    xhr.onerror = () => reject(new Error('NETWORK'));
    xhr.send(fd);
  });

  const start = async (dryRun: boolean, tableOverride?: string) => {
    setBusy(true); setProgress(0); setPreview(null);
    try {
      const res = await send(dryRun, tableOverride);
      if (dryRun) { setPreview(res); push('تمت معاينة الملف'); }
      else { setJob(res); push('بدأ الاستيراد في الخلفية'); }
    } catch (e: any) { push(e.message === 'NETWORK' ? 'تعذر الاتصال بالخادم' : e.message, 'error'); }
    finally { setBusy(false); }
  };

  const template = () => {
    const blob = new Blob(['\uFEFF' + TEMPLATE + '\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'mda-import-template.csv'; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-violet-300" /><h2 className="text-[12.5px] font-extrabold">استيراد قاعدة البيانات</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">
          CSV / TSV (حتى ملايين الصفوف، معالجة متدفقة) · Excel (XLSX/XLS) · JSON · <b>XML</b> (سجلات &lt;drug&gt;/&lt;product&gt; مع وراثة الحقول) · <b>SQLite</b> (ملف .db يُفتح للقراءة فقط، ويُكتشف الجدول تلقائيًا).
          تُطابَق الأعمدة تلقائيًا بالعربية أو الإنجليزية، ويُنشأ الدواء والشركة والوكيل والتصنيف تلقائيًا عند الحاجة.
        </p>

        <label className={cx('mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition',
          file ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/[.08] hover:border-brand-400/50')}>
          {busy ? <Loader2 className="mb-2 h-7 w-7 animate-spin text-brand-300" /> : file ? <CheckCircle2 className="mb-2 h-7 w-7 text-brand-300" /> : <UploadCloud className="mb-2 h-7 w-7 text-ink-400" />}
          <span className="text-[12px] font-bold text-ink-200">{file ? file.name : 'اختر ملف CSV / XLSX / JSON / XML / SQLite'}</span>
          <span className="mt-0.5 text-[10.5px] text-ink-400">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'اضغط للاختيار من جهازك'}</span>
          <input ref={inputRef} type="file" accept=".csv,.tsv,.xlsx,.xls,.json,.xml,.db,.sqlite,.sqlite3" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] || null); setJob(null); setPreview(null); }} />
        </label>
        {progress > 0 && progress < 100 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[.06]"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} /></div>}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="طريقة الإدخال">
            <Select value={mode} onChange={(e) => setMode(e.target.value as any)}>
              <option value="upsert">إدراج وتحديث — الأفضل عمومًا</option>
              <option value="insert">إدراج الجديد فقط — تجاهل الموجود</option>
              <option value="update">تحديث الموجود فقط — تجاهل الجديد</option>
            </Select>
          </Field>
          <Field label="الجهاز الافتراضي (اختياري)"><Select value={systemId} onChange={(e) => setSystemId(e.target.value)}>
            <option value="">— بدون —</option>{(systems || []).map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
          </Select></Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 pb-2 text-[11px] font-semibold text-ink-300"><input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} className="h-4 w-4 accent-brand-700" />تعيين كل الصفوف «موثّقة»</label>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => start(true)} disabled={!file || busy} className="btn-ghost text-[11.5px]"><ListChecks className="h-4 w-4" />معاينة تجريبية</button>
          <button onClick={() => start(false)} disabled={!file || busy} className="btn-primary text-[11.5px]"><UploadCloud className="h-4 w-4" />بدء الاستيراد</button>
          <button onClick={template} className="btn-ghost ms-auto text-[11px]"><Download className="h-3.5 w-3.5" />قالب CSV</button>
        </div>
      </div>

      {preview && (
        <div className="card p-4">
          <div className="mb-1.5 flex items-center justify-between"><h3 className="text-[12px] font-extrabold">نتيجة المعاينة</h3><Badge tone="sky">{preview.kind}</Badge></div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <span className="text-emerald-300">صالح: {preview.ok}</span>
            <span className="text-amber-300">تم تجاهله: {preview.skipped ?? 0}</span>
            <span className="text-rose-300">فاشل: {preview.failed}</span>
            <span className="text-ink-400">صفوف: {preview.rows}</span>
            <Badge tone="neutral">{preview.mode || 'upsert'}</Badge>
          </div>
          {preview.detected?.tables?.length > 0 && (
            <div className="mt-2 rounded-lg p-2 text-[10px] text-ink-400 bg-white/[.05]">
              <div className="mb-1 font-bold text-ink-300">جداول ملف SQLite (أعلى = الأنسب):</div>
              <div className="space-y-1">
                {preview.detected.tables.map((t: any) => (
                  <button key={t.name} onClick={() => { setTable(t.name); start(true, t.name); }}
                    className={cx('flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start', table === t.name ? 'bg-brand-500/20 text-brand-200' : 'hover:bg-white/[.06]')}>
                    <span className="font-mono">{t.name}</span>
                    <span className="text-ink-500">{t.rows} صف</span>
                    <span className="ms-auto text-ink-500">{t.mappedFields ?? t.score} حقول مطابقة</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {preview.errors?.length > 0 && <ul className="mt-2 space-y-1 text-[10.5px] text-rose-300">{preview.errors.map((e: string, i: number) => <li key={i}>• {e}</li>)}</ul>}
          {preview.sample?.length > 0 && <div className="mt-2 rounded-lg p-2 text-[10px] text-ink-500 bg-white/[.05]"><b>الأعمدة المكتشفة:</b> {preview.sample[0].join(', ')}</div>}
        </div>
      )}

      {job && <ImportJob id={job.id} />}

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><FileText className="h-4 w-4 text-sky-300" />أعمدة مدعومة</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-ink-500 sm:grid-cols-3">
          {['generic_name / الاسم العلمي', 'trade_name / الاسم التجاري', 'strength / القوة', 'dosage_form / الشكل', 'manufacturer / الشركة', 'agent / الوكيل', 'country / الدولة', 'barcode / الباركود', 'price / السعر', 'image_url / الصورة', 'system / الجهاز', 'category / التصنيف', 'indications_ar / الاستخدامات', 'dosage_adult / الجرعة', 'verified / موثق'].map((c) => <span key={c}>• {c}</span>)}
        </div>
        <p className="mt-2 rounded-lg p-2 text-[10px] leading-5 bg-amber-500/10 text-amber-200">
          الاستيراد لا يحذف البيانات الحالية: يحدّث السجلات المتطابقة (نفس الاسم العلمي/التجاري/التركيز) ويضيف الجديد — أو يتجاهلها حسب «طريقة الإدخال».
          الملفات المرفوعة تُحذف من الخادم بعد انتهاء الاستيراد، وتقرير كل عملية (نجح/فشل/تم تجاهله/أول 10 أخطاء) محفوظ في تبويب «السجل».
        </p>
      </div>
    </div>
  );
}

function ImportJob({ id }: { id: number }) {
  const [row, setRow] = useState<any>(null);
  useEffect(() => {
    let alive = true;
    let timer: any;
    const tick = async () => {
      try {
        const res = await api.get<any>(`/api/admin/imports/${id}`);
        if (!alive) return;
        setRow(res);
        if (res.status === 'processing') timer = setTimeout(tick, 1500);
      } catch { timer = setTimeout(tick, 3000); }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);
  if (!row) return <div className="card flex items-center gap-2 p-4 text-[11px] text-ink-500"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تجهيز الاستيراد…</div>;
  const total = row.rows_ok + row.rows_failed;
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-[12px] font-extrabold">{row.filename}</h3>
        <Badge tone={row.status === 'completed' ? 'emerald' : row.status === 'failed' ? 'rose' : 'amber'}>{row.status === 'completed' ? 'مكتمل' : row.status === 'failed' ? 'فشل' : 'قيد المعالجة'}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[['ناجح', row.rows_ok, 'text-emerald-300'], ['فاشل', row.rows_failed, 'text-rose-300'], ['الإجمالي', total, 'text-ink-300']].map(([label, v, tone]) => (
          <div key={String(label)} className="rounded-xl py-2 bg-white/[.055]"><div className={`text-[16px] font-black ${tone}`}>{num(Number(v))}</div><div className="text-[10px] text-ink-400">{label}</div></div>
        ))}
      </div>
      {row.log?.errors?.length > 0 && <ul className="mt-2 space-y-1 rounded-lg p-2 text-[10px] bg-rose-500/10 text-rose-200">{row.log.errors.slice(0, 5).map((e: any, i: number) => <li key={i}>• صف {e.row}: {e.error}</li>)}</ul>}
      {row.status === 'processing' && <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-ink-400"><Loader2 className="h-3 w-3 animate-spin" />تتم المعالجة في الخلفية — يمكنك متابعة العمل.</div>}
    </div>
  );
}

/* ------------------------------- images ------------------------------- */
function ImagesPanel() {
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<any>(null);
  const [auto, setAuto] = useState<any>(null);
  const [autoBusy, setAutoBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('images', f));
    setBusy(true); setResult(null);
    try { const res = await api.post<any>('/api/admin/import-images', fd); setResult(res); push(`تمت مطابقة ${res.matched} صورة`); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  const lookup = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try { const res = await api.get<any>('/api/admin/image-search', { q }); setSearch(res); if (!res.configured) window.open(res.searchUrl, '_blank'); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-rose-500" /><h2 className="text-[12.5px] font-extrabold">استيراد صور دفعة واحدة</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">سمِّ كل صورة بالباركود أو الاسم التجاري للمنتج (مثال: <code>Amoxil 500</code> أو <code>6281000000000</code>) وحدّد كل الصور مرة واحدة.</p>
        <button onClick={() => inputRef.current?.click()} disabled={busy} className="btn-primary mt-2 w-full text-[11.5px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}اختيار صور متعددة
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
        {result && (
          <div className="mt-2 space-y-1.5 text-[11px]">
            <div className="flex gap-2"><span className="text-emerald-300">تمت المطابقة: {result.matched}</span><span className="text-brand-300">عُيّنت كصورة رئيسية: {result.assigned}</span><span className="text-rose-500">بدون مطابقة: {result.unmatched?.length}</span></div>
            {result.unmatched?.length > 0 && <div className="rounded-lg p-2 text-[10px] bg-rose-500/10 text-rose-200">لم يُعثر على: {result.unmatched.slice(0, 12).join('، ')}</div>}
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><Search className="h-4 w-4 text-sky-300" /><h2 className="text-[12.5px] font-extrabold">جلب صورة من الإنترنت</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">ابحث عن صورة المنتج. عند وجود مفاتيح Google CSE تظهر النتائج هنا؛ وإلا يُفتح Google Images لنسخ رابط الصورة ثم لصقها في نموذج المنتج.</p>
        <div className="mt-2 flex gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم المنتج…" className="input h-9 flex-1 text-[11px]" />
          <button onClick={lookup} disabled={busy || !q.trim()} className="btn-primary px-3 text-[11px]">بحث</button>
        </div>
        {search && (
          <div className="mt-2">
            {search.items?.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {search.items.map((it: any, i: number) => (
                  <a key={i} href={it.link} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-white/[.09]">
                    <img src={it.thumb || it.link} alt="" className="h-16 w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <a href={search.searchUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300"><ExternalLink className="h-3 w-3" />فتح Google Images</a>
            )}
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-300" /><h2 className="text-[12.5px] font-extrabold">جلب صور تلقائي للمنتجات بدون صورة</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">
          ينزّل أفضل نتيجة من Google Custom Search لكل منتج ويضيفها إلى معرضه. يحتاج <code>GOOGLE_CSE_KEY</code> و<code>GOOGLE_CSE_CX</code>.
          راجع كل صورة بعد الجلب — البحث الآلي قد يعيد حجم علبة مختلفًا.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[5, 15, 30].map((n) => (
            <button key={n} disabled={autoBusy} onClick={async () => {
              setAutoBusy(true); setAuto(null);
              try {
                const res = await api.post<any>('/api/admin/images/auto-fill', { limit: n });
                setAuto(res); push(`تمت إضافة ${res.applied} صورة`);
              } catch (e: any) {
                push(e.message || 'يلزم ضبط مفاتيح Google CSE أولًا', 'error');
              } finally { setAutoBusy(false); }
            }} className="btn-ghost px-3 py-1.5 text-[11px]">
              {autoBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} جلب {n} صورة
            </button>
          ))}
        </div>
        {auto && (
          <ul className="mt-2 space-y-0.5 rounded-lg p-2 text-[10.5px] bg-white/[.055] text-ink-300">
            {auto.results?.slice(0, 10).map((r: any, i: number) => (
              <li key={i} className={r.ok ? 'text-emerald-300' : 'text-rose-300'}>
                {r.ok ? '✓' : '✗'} {r.name} {r.error ? `— ${r.error}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-2 text-[12px] font-extrabold"><Database className="h-4 w-4 text-emerald-300" />منتجات بدون صورة</div>
        <p className="mt-1 text-[11px] leading-5 text-ink-500">استخدم فلتر «بدون صورة فقط» في تبويب المنتجات لمراجعة المنتجات التي تعرض الصورة المولّدة تلقائيًا ورفع صور حقيقية لها.</p>
      </div>
    </div>
  );
}

/* ------------------------------- history ------------------------------- */
function HistoryPanel() {
  const { data, loading, reload } = useApi<any[]>('/api/admin/imports');
  const { push } = useToast();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const open = async (id: number) => {
    if (expanded === id) { setExpanded(null); setDetail(null); return; }
    setExpanded(id);
    try { setDetail(await api.get<any>(`/api/admin/imports/${id}`)); } catch { push('خطأ', 'error'); }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-[12.5px] font-extrabold">سجل الاستيراد</h2>
        <button onClick={reload} className="btn-ghost px-2 py-1 text-[11px]"><RefreshCw className="h-3 w-3" />تحديث</button>
      </div>
      {loading && !data && <PageLoader />}
      {data?.length === 0 && <p className="card p-4 text-[11px] text-ink-400">لا يوجد سجل بعد.</p>}
      <div className="space-y-1.5">
        {(data || []).map((im) => (
          <div key={im.id} className="card overflow-hidden">
            <button onClick={() => open(im.id)} className="flex w-full items-center gap-2 p-2.5 text-start">
              <Badge tone={im.status === 'completed' ? 'emerald' : im.status === 'failed' ? 'rose' : 'amber'}>{im.status}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-bold">{im.filename}</div>
                <div className="text-[10px] text-ink-400">{dateFmt(im.created_at)} · {im.kind}</div>
              </div>
              <span className="text-[10.5px] font-bold text-emerald-300">{num(im.rows_ok)}</span>
              <span className="text-[10.5px] font-bold text-rose-500">{num(im.rows_failed)}</span>
            </button>
            {expanded === im.id && detail && (
              <div className="border-t p-2.5 text-[10.5px] border-white/[.08] bg-white/[.055]">
                {detail.log?.errors?.length ? <ul className="space-y-0.5 text-rose-300">{detail.log.errors.map((e: any, i: number) => <li key={i}>• {e.row ? `صف ${e.row}: ` : ''}{e.error}</li>)}</ul> : <div className="text-emerald-300">لا أخطاء</div>}
                {detail.log?.elapsed_ms && <div className="mt-1 text-ink-400">المدة: {(detail.log.elapsed_ms / 1000).toFixed(1)} ثانية</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
