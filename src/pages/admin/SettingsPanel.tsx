import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, Save, Server, ShieldCheck, Smartphone, Wrench, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { downloadWithAuth } from '../../lib/download';
import { useApi } from '../../lib/useApi';
import { useConfig } from '../../lib/config';
import { Badge, Field, PageLoader, TextArea, useToast } from '../../components/ui';

const FIELDS: { key: string; label: string; type?: 'text' | 'textarea' | 'bool' | 'select'; options?: string[]; hint?: string }[] = [
  { key: 'site_name_ar', label: 'اسم التطبيق (عربي)' },
  { key: 'site_name_en', label: 'App name (English)' },
  { key: 'owner_name', label: 'اسم المالك' },
  { key: 'owner_title', label: 'صفة المالك' },
  { key: 'owner_email', label: 'بريد المالك' },
  { key: 'support_email', label: 'بريد الدعم' },
  { key: 'whatsapp', label: 'واتساب الدعم', hint: 'مثال: +967781733795' },
  { key: 'about_ar', label: 'نبذة (عربي)', type: 'textarea' },
  { key: 'about_en', label: 'About (English)', type: 'textarea' },
  { key: 'disclaimer_ar', label: 'إخلاء المسؤولية (عربي)', type: 'textarea' },
  { key: 'disclaimer_en', label: 'Disclaimer (English)', type: 'textarea' },
  { key: 'default_lang', label: 'اللغة الافتراضية', type: 'select', options: ['ar', 'en'] },
  { key: 'maintenance', label: 'وضع الصيانة', type: 'bool' },
  { key: 'allow_registration', label: 'السماح بالتسجيل', type: 'bool' },
  { key: 'google_client_id', label: 'Google Client ID (تسجيل الدخول بجوجل)', hint: 'الصقه من Google Cloud → Credentials → OAuth client ID. بعد الحفظ يعمل زر «الدخول بحساب Google» فورًا بلا إعادة نشر. اتركه فارغًا لتعطيله.' },
  { key: 'welcome_enabled', label: 'شاشة الترحيب عند أول تشغيل', type: 'bool' },
  { key: 'welcome_title_ar', label: 'عنوان الترحيب (عربي)', hint: 'مثال: مرحبًا بكم في تطبيق د. الصيدلاني عبدالمجيد الماخذي' },
  { key: 'welcome_title_en', label: 'Welcome title (English)' },
  { key: 'welcome_text_ar', label: 'نص الترحيب (عربي)', type: 'textarea' },
  { key: 'welcome_text_en', label: 'Welcome text (English)', type: 'textarea' },
];

export default function SettingsPanel() {
  const { data, loading, reload } = useApi<any>('/api/admin/settings');
  const { refresh } = useConfig();
  const { push } = useToast();
  const [form, setForm] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { if (data?.settings) setForm(data.settings); }, [data]);

  const set = (k: string, v: any) => { setForm((p) => ({ ...p, [k]: v })); setDirty(true); };

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/api/admin/settings', form);
      await refresh(); push('تم حفظ الإعدادات'); setDirty(false); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };
  const rebuild = async () => {
    setBusy(true);
    try { await api.post('/api/admin/rebuild-search'); push('تمت إعادة بناء فهرس البحث'); }
    catch { push('خطأ', 'error'); }
    finally { setBusy(false); }
  };

  if (loading && !data) return <PageLoader />;

  return (
    <div className="space-y-3">
      <div className="card relative overflow-hidden p-4">
        <span className="pointer-events-none absolute -end-8 -top-10 h-28 w-28 rounded-full bg-brand-500/15 blur-2xl" />
        <div className="relative flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-grad on-color shadow-glow"><Smartphone className="h-4 w-4" /></span>
          <div>
            <h2 className="text-[12.5px] font-extrabold text-white">تطبيق الأندرويد (APK)</h2>
            <p className="text-[10px] text-ink-400">آخر نسخة تُبنى تلقائيًا من المستودع وتُنشر في Releases.</p>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2">
          <a href="https://github.com/Abd800d/medicinedata/releases/latest" target="_blank" rel="noreferrer" className="btn-primary text-[11.5px]">
            <Download className="h-4 w-4" />تحميل آخر APK
          </a>
          <a href="https://github.com/Abd800d/medicinedata/releases" target="_blank" rel="noreferrer" className="btn-ghost text-[11.5px]">
            <ExternalLink className="h-4 w-4" />كل الإصدارات
          </a>
          <Link to="/server" className="btn-ghost text-[11.5px]">
            <Server className="h-4 w-4" />عنوان الخادم داخل التطبيق
          </Link>
        </div>
        <p className="relative mt-2 text-[10px] leading-5 text-ink-400">
          بعد تثبيت الـAPK: افتح <b className="text-ink-200">المزيد ← الخادم والاتصال</b> وضع رابط هذا الموقع، ثم «اختبار الاتصال» و«حفظ».
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand-300" /><h2 className="text-[12.5px] font-extrabold">إعدادات الموقع</h2></div>
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={data?.env?.ai ? 'emerald' : 'neutral'}>AI {data?.env?.ai ? 'ON' : 'OFF'}</Badge>
            <Badge tone={data?.env?.google_login ? 'emerald' : 'neutral'}>Google login {data?.env?.google_login ? 'ON' : 'OFF'}</Badge>
            <Badge tone={data?.env?.google_cse ? 'emerald' : 'neutral'}>Google images {data?.env?.google_cse ? 'ON' : 'OFF'}</Badge>
          </div>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
              <Field label={f.label} hint={f.hint}>
                {f.type === 'textarea' ? <TextArea value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
                  : f.type === 'bool' ? (
                    <label className="flex h-10 items-center gap-2 rounded-xl border px-3 text-[11.5px] font-semibold border-white/[.09]">
                      <input type="checkbox" checked={!!form[f.key] && form[f.key] !== '0' && form[f.key] !== 'false'} onChange={(e) => set(f.key, e.target.checked ? 1 : 0)} className="h-4 w-4 accent-brand-700" />
                      {form[f.key] ? 'مفعّل' : 'معطّل'}
                    </label>
                  ) : f.type === 'select' ? (
                    <select value={form[f.key] ?? 'ar'} onChange={(e) => set(f.key, e.target.value)} className="input">
                      {(f.options || []).map((o) => <option key={o} value={o}>{o === 'ar' ? 'العربية' : 'English'}</option>)}
                    </select>
                  ) : <input value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className="input" dir={f.key.includes('email') ? 'ltr' : 'auto'} />}
              </Field>
            </div>
          ))}
        </div>
        <button onClick={save} disabled={busy || !dirty} className="btn-primary mt-3 w-full text-[12px]">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}حفظ الإعدادات
        </button>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><Wrench className="h-4 w-4 text-sky-300" /><h2 className="text-[12.5px] font-extrabold">أدوات النظام</h2></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={rebuild} disabled={busy} className="btn-ghost text-[11px]"><RefreshCw className="h-3.5 w-3.5" />إعادة بناء فهرس البحث</button>
          <button onClick={async () => { try { await downloadWithAuth('/api/admin/export', `mda-export-${Date.now()}.json`); push('تم تجهيز الملف'); } catch (e: any) { push(e.message || 'خطأ', 'error'); } }} className="btn-ghost text-[11px]"><Download className="h-3.5 w-3.5" />تصدير قاعدة البيانات (JSON)</button>
        </div>
        <div className="mt-2 rounded-xl p-2.5 text-[10.5px] leading-5 text-ink-500 bg-white/[.055]">
          <div>Node: {data?.env?.node} · DB: {data?.env?.db_file}</div>
          <div>مفاتيح البيئة تُدار من ملف <code>.env</code> على الخادم (AI_API_KEY، GOOGLE_CLIENT_ID، GOOGLE_CSE_KEY، GOOGLE_CSE_CX…).</div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border p-3 text-[11px] leading-5 border-amber-400/25 bg-amber-500/10 text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>تغيير اسم التطبيق أو معلومات التواصل ينعكس فورًا على الواجهة والتذييل بعد الحفظ. إيقاف التسجيل يمنع إنشاء حسابات جديدة فقط.</span>
      </div>
    </div>
  );
}
