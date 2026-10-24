import { useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Copy, Globe2, ImageIcon, KeyRound, Loader2, Plug, ScanBarcode, Sparkles, XCircle,
} from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { api } from '../../lib/api';
import { useToast, Badge, Spinner } from '../../components/ui';
import { cx } from '../../lib/utils';

type Integration = {
  configured: boolean;
  key?: string | null;
  cx?: string | null;
  base_url?: string;
  model?: string;
  vision_model?: string;
  env: string[];
  purpose_ar: string;
  steps_ar: string[];
  test?: string;
  mode?: string;
};

const META: Record<string, { title: string; icon: any; tone: string }> = {
  google_signin: { title: 'تسجيل الدخول بحساب Google', icon: Globe2, tone: 'from-sky-500 to-blue-600' },
  ai: { title: 'الذكاء الاصطناعي (صور الوصفات والأدوية)', icon: Sparkles, tone: 'from-violet-500 to-fuchsia-600' },
  google_cse: { title: 'جلب صور المنتجات (Google CSE)', icon: ImageIcon, tone: 'from-emerald-500 to-teal-600' },
  barcode: { title: 'الباركود (EAN-13)', icon: ScanBarcode, tone: 'from-amber-500 to-orange-600' },
};

export default function Integrations() {
  const { data, reload } = useApi<{ integrations: Record<string, Integration>; bundled_images: number }>('/api/admin/integrations');
  const { push } = useToast();
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const test = async (name: string, target?: string) => {
    if (!target) return;
    setTesting(name);
    try {
      const r = await api.post<{ ok: boolean; detail: string }>('/api/admin/integrations/test', { target });
      setResults((s) => ({ ...s, [name]: r }));
      push(r.ok ? 'الاختبار نجح' : 'الاختبار فشل', r.ok ? 'success' : 'error');
    } catch (e: any) {
      const detail = e.message || 'تعذر الاختبار';
      setResults((s) => ({ ...s, [name]: { ok: false, detail } }));
      push(detail, 'error');
    } finally { setTesting(null); }
  };

  if (!data) return <div className="card flex items-center justify-center p-8"><Spinner /></div>;
  const list = Object.entries(data.integrations);

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="flex items-center gap-2"><Plug className="h-4 w-4 text-sky-300" /><h2 className="text-[13px] font-extrabold">التكاملات والمفاتيح الاختيارية</h2></div>
        <p className="mt-1 text-[10.5px] leading-5 text-ink-500">
          كل تكامل يعمل فقط عند وجود مفتاحه في ملف <code className="rounded px-1 bg-white/[.05]">.env</code> على الخادم. بدونه يعمل التطبيق كاملًا بمساره البديل (تسجيل بالبريد، إدخال الوصفة نصيًا، رفع الصور يدويًا) دون أي رسائل خطأ.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-400">
          <Badge tone="emerald">{data.bundled_images} صورة حقيقية مرفقة</Badge>
          <button onClick={reload} className="btn-ghost px-2 py-1 text-[10px]">{'إعادة قراءة الحالة'}</button>
        </div>
      </div>

      {list.map(([name, it]) => {
        const meta = META[name] || { title: name, icon: KeyRound, tone: 'from-ink-500 to-ink-700' };
        const Icon = meta.icon;
        const res = results[name];
        return (
          <section key={name} className="card overflow-hidden">
            <div className={cx('flex items-center gap-2.5 bg-gradient-to-r p-3.5 text-white', meta.tone)}>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><Icon className="h-4.5 w-4.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-extrabold">{meta.title}</div>
                <div className="truncate text-[10px] text-white/75">{it.purpose_ar}</div>
              </div>
              <span className={cx('flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[9.5px] font-bold',
                it.configured ? 'bg-white/20' : 'bg-black/25')}>
                {it.configured ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {it.configured ? 'مُفعّل' : name === 'barcode' ? 'جاهز' : 'غير مُفعّل'}
              </span>
            </div>

            <div className="space-y-3 p-3.5">
              <div className="flex flex-wrap gap-1.5">
                {it.env.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-mono text-[9.5px] bg-white/[.05] text-ink-300">
                    {k}
                  </span>
                ))}
              </div>

              {(it.key || it.cx) && (
                <div className="space-y-0.5 rounded-xl p-2 font-mono text-[10px] text-ink-500 bg-white/[.055]">
                  {it.key && <div>key = {it.key}</div>}
                  {it.cx && <div>cx = {it.cx}</div>}
                  {it.base_url && <div>base = {it.base_url}</div>}
                  {it.model && <div>model = {it.model}{it.vision_model && it.vision_model !== it.model ? ` · vision = ${it.vision_model}` : ''}</div>}
                </div>
              )}

              <ol className="space-y-1 text-[10.5px] leading-5 text-ink-300">
                {it.steps_ar.map((step, i) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold bg-ink-700 text-ink-200">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="flex flex-wrap gap-2">
                {it.test && (
                  <button onClick={() => test(name, it.test)} disabled={testing === name}
                    className="btn-primary px-3 py-1.5 text-[11px]">
                    {testing === name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />} اختبار الاتصال
                  </button>
                )}
                <button onClick={async () => {
                  const text = it.env.map((k) => `${k}=`).join('\n');
                  try { await navigator.clipboard.writeText(text); push('تم نسخ أسماء المتغيرات'); } catch { push('تعذر النسخ', 'error'); }
                }} className="btn-ghost px-3 py-1.5 text-[11px]"><Copy className="h-3.5 w-3.5" /> نسخ المتغيرات</button>
              </div>

              {res && (
                <div className={cx('flex items-start gap-2 rounded-xl p-2.5 text-[10.5px] leading-5',
                  res.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200')}>
                  {res.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                  <span>{res.detail}</span>
                </div>
              )}
            </div>
          </section>
        );
      })}

      <div className="flex items-start gap-2 rounded-2xl border p-3 text-[10.5px] leading-5 border-amber-400/25 bg-amber-500/10 text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>بعد أي تعديل على <code>.env</code> أعد تشغيل الخادم ثم اضغط «اختبار الاتصال». المفاتيح لا تُخزَّن في قاعدة البيانات ولا تُرسل لأي طرف ثالث غير مزوّد الخدمة نفسه.</span>
      </div>
    </div>
  );
}
