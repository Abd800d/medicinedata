import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Database, Download, FileJson, FileSpreadsheet, FileText, HardDriveDownload,
  Loader2, Lock, RotateCcw, ShieldCheck, UploadCloud, X,
} from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Badge, Field, Select, useToast } from '../../components/ui';
import { cx, num } from '../../lib/utils';

type Dataset = { key: string; label_ar: string; label_en: string; rows: number; columns: number; view?: boolean };

export default function DataTools() {
  const [tab, setTab] = useState<'export' | 'backup'>('export');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl p-1 bg-white/[.05]">
        {([['export', 'التصدير'], ['backup', 'النسخ الاحتياطي']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg py-1.5 text-[11px] font-bold', tab === k ? 'bg-brand-grad text-white shadow-glow' : 'text-ink-500')}>{label}</button>
        ))}
      </div>
      {tab === 'export' ? <ExportPanel /> : <BackupPanel />}
    </div>
  );
}

/* ------------------------------- export ------------------------------- */
function ExportPanel() {
  const { data } = useApi<{ datasets: Dataset[] }>('/api/admin/datasets');
  const { push } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [format, setFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');
  const datasets = data?.datasets || [];

  const download = async (key: string | 'all') => {
    setBusy(key);
    try {
      const ext = key === 'all' ? (format === 'json' ? 'json' : 'xlsx') : format;
      const url = key === 'all' ? `/api/admin/export-all?format=${ext}` : `/api/admin/export/${key}?format=${format}`;
      await downloadWithToken(url, `mda-${key}-${new Date().toISOString().slice(0, 10)}.${ext}`);
      push('تم تجهيز الملف — تحقق من مجلد التنزيلات');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-emerald-300" /><h2 className="text-[12.5px] font-extrabold">تصدير البيانات</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">
          ملفات جاهزة لـ Excel أو Google Sheets أو أنظمة أخرى. CSV بترميز UTF-8 مع BOM كي تظهر العربية سليمة في Excel على ويندوز وأندرويد.
          كلمات المرور ورموز الدخول ونصوص الوصفات <b>لا</b> تُصدَّر أبدًا.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="الصيغة">
            <Select value={format} onChange={(e) => setFormat(e.target.value as any)}>
              <option value="csv">CSV — لـ Excel والأنظمة الأخرى (صفحة واحدة)</option>
              <option value="json">JSON — للنسخ الاحتياطي والبرمجة</option>
              <option value="xlsx">XLSX — ملف Excel حقيقي</option>
            </Select>
          </Field>
          <div className="flex items-end">
            <button onClick={() => download('all')} disabled={!!busy} className="btn-primary w-full text-[11.5px]">
              {busy === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDriveDownload className="h-4 w-4" />}
              تصدير كل البيانات ({format === 'csv' ? 'XLSX' : format.toUpperCase()})
            </button>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><Database className="h-4 w-4 text-sky-300" />الجداول المتاحة</div>
        <div className="space-y-1.5">
          {datasets.map((d) => (
            <div key={d.key} className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11px] bg-white/[.055]">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-ink-100">{d.label_ar}</span>
                <span className="block truncate text-[10px] text-ink-500">{d.key} · {num(d.rows)} صف · {d.columns} عمود{d.view ? ' · عرض مجمّع' : ''}</span>
              </span>
              <div className="flex gap-1">
                {(['csv', 'json', 'xlsx'] as const).map((f) => (
                  <button key={f} onClick={() => { setFormat(f); download(d.key); }} disabled={!!busy} className="rounded-lg px-2 py-1 text-[9.5px] font-bold uppercase bg-white/[.06] text-ink-300 transition hover:bg-white/[.12] disabled:opacity-40">
                    {busy === d.key ? <Loader2 className="h-3 w-3 animate-spin" /> : f}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!datasets.length && <p className="text-[11px] text-ink-500">جارٍ التحميل…</p>}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border p-3 text-[11px] leading-5 border-sky-400/25 bg-sky-500/10 text-sky-200">
        <FileJson className="mt-0.5 h-4 w-4 shrink-0" />
        <span>ملف JSON الكامل يعمل مع زر «استيراد JSON» أعلاه لإعادة تحميل الكتالوج على خادم آخر. للنسخة القابلة للاستعادة كما هي، استخدم «النسخ الاحتياطي» المشفّر.</span>
      </div>
    </div>
  );
}

/* ------------------------------- backup ------------------------------- */
function BackupPanel() {
  const { data: summary, reload } = useApi<{ counts: Record<string, number>; bytes: number; tables: number }>('/api/admin/backup/summary');
  const { push } = useToast();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<any>(null);
  const [restorePass, setRestorePass] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const strong = pass.length >= 8 && pass === pass2;

  const create = async () => {
    if (!strong) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
        body: JSON.stringify({ passphrase: pass }),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { msg = (await res.json())?.error || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const name = `mda-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.mdaenc`;
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      push('تم إنشاء النسخة المشفّرة — احفظ كلمة المرور، بدونها لا يمكن الاستعادة');
      setPass(''); setPass2('');
      reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  const pick = async (f: File | null) => {
    setFile(f); setInfo(null); setConfirmText(''); setRestorePass('');
    if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await fetch('/api/admin/backup/inspect', {
        method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: fd,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'ملف غير صالح');
      setInfo(json);
    } catch (e: any) { push(e.message || 'ملف غير صالح', 'error'); }
  };

  const restore = async () => {
    if (!file || !restorePass || confirmText !== 'استعادة') return;
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('passphrase', restorePass);
      const r = await fetch('/api/admin/backup/restore', {
        method: 'POST', headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {}, body: fd,
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json?.error || 'تعذرت الاستعادة');
      push('تمت الاستعادة بنجاح — أعد تحميل الصفحة');
      setFile(null); setInfo(null); setRestorePass(''); setConfirmText('');
      reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setRestoring(false); }
  };

  const mb = ((summary?.bytes || 0) / 1024 / 1024).toFixed(2);

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><Lock className="h-4 w-4 text-emerald-300" /><h2 className="text-[12.5px] font-extrabold">نسخة احتياطية مشفّرة</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">
          لقطة كاملة لقاعدة البيانات (كل الجداول) مشفّرة بـ AES‑256‑GCM ومفتاح مشتق من كلمتك بـ scrypt.
          الملف لا يُقرأ بدون كلمة المرور — حتى لو انتقل إلى WhatsApp أو Google Drive. حجم القاعدة الآن: <b>{mb} MB</b> · <b>{summary?.tables ?? '—'}</b> جدول.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="كلمة مرور النسخة (8 أحرف على الأقل)">
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="مثال: كلمة طويلة تخصك" className="input" autoComplete="new-password" />
          </Field>
          <Field label="تأكيد كلمة المرور">
            <input type="password" value={pass2} onChange={(e) => setPass2(e.target.value)} className="input" autoComplete="new-password" />
          </Field>
        </div>
        {pass && !strong && <p className="mt-1 text-[10.5px] text-amber-300">{pass.length < 8 ? 'كلمة المرور قصيرة' : 'الكلمتان غير متطابقتين'}</p>}
        <button onClick={create} disabled={!strong || busy} className="btn-primary mt-3 w-full text-[11.5px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}إنشاء وتنزيل النسخة
        </button>
        <div className="mt-2 flex items-start gap-2 rounded-xl p-2 text-[10.5px] leading-5 bg-amber-500/10 text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>لا يمكن استعادة الملف بدون كلمة المرور — لا نحتفظ بها ولا يمكن استرجاعها. اكتبها في مكان آمن قبل التنزيل.</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><RotateCcw className="h-4 w-4 text-rose-300" /><h2 className="text-[12.5px] font-extrabold">استعادة نسخة</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">
          الاستعادة تستبدل البيانات الحالية ببيانات النسخة، وتأخذ أولًا نسخة أمان تلقائية من الوضع الحالي في <code>data/backups</code> — فيمكن التراجع.
        </p>
        <label className={cx('mt-2 flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed px-3 py-3 transition', file ? 'border-brand-400/60 bg-brand-500/10' : 'border-white/[.08] hover:border-brand-400/50')}>
          <UploadCloud className="h-5 w-5 shrink-0 text-ink-400" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] font-bold text-ink-200">{file ? file.name : 'اختر ملف .mdaenc'}</span>
            <span className="block text-[10px] text-ink-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'ملف نسخة احتياطية من MDA'}</span>
          </span>
          {file && <button onClick={(e) => { e.preventDefault(); pick(null); }} className="icon-btn h-7 w-7"><X className="h-3.5 w-3.5" /></button>}
          <input ref={inputRef} type="file" accept=".mdaenc,application/octet-stream" className="hidden" onChange={(e) => pick(e.target.files?.[0] || null)} />
        </label>

        {info && (
          <div className="mt-2 rounded-xl p-2.5 text-[10.5px] leading-5 bg-white/[.05]">
            <div className="flex items-center gap-1.5 font-bold text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" />ملف صالح ومشفّر</div>
            <div className="text-ink-400">تاريخ الإنشاء: {info.created_at?.replace('T', ' ').slice(0, 19)} UTC</div>
            <div className="text-ink-400">الحجم قبل التشفير: {(info.plain_bytes / 1024 / 1024).toFixed(2)} MB</div>
            {info.counts && <div className="mt-1 text-ink-400">منتجات في النسخة: <b>{num(info.counts.products || 0)}</b> · أدوية: <b>{num(info.counts.drugs || 0)}</b> · مستخدمون: <b>{num(info.counts.users || 0)}</b></div>}
          </div>
        )}

        {file && (
          <>
            <Field label="كلمة مرور النسخة"><input type="password" value={restorePass} onChange={(e) => setRestorePass(e.target.value)} className="input" autoComplete="current-password" /></Field>
            <Field label="للتأكيد اكتب: استعادة"><input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="input" placeholder="استعادة" /></Field>
            <button onClick={restore} disabled={!info || !restorePass || confirmText !== 'استعادة' || restoring} className="btn-danger mt-2 w-full text-[11.5px]">
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}استعادة البيانات الآن
            </button>
          </>
        )}
      </div>

      {summary?.counts && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><FileText className="h-4 w-4 text-violet-300" />المحتوى الحالي</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(summary.counts).filter(([k]) => ['users', 'drugs', 'products', 'product_images', 'pharmacy_items', 'prescriptions', 'audit_log'].includes(k)).map(([k, v]) => (
              <Badge key={k} tone="neutral">{k}: {num(Number(v))}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Download a file from an authenticated endpoint (kept local to avoid import cycles). */
async function downloadWithToken(url: string, filename: string) {
  const res = await fetch(url, { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json())?.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}
