import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Boxes, Briefcase, CheckCircle2, ChevronLeft, ChevronRight, Database, Download,
  FileSpreadsheet, Inbox, LayoutDashboard, Loader2, MessageSquare, Package, RefreshCw, Save, Search,
  Settings, ShieldAlert, Sparkles, TrendingUp, Upload, Users, Wrench, AlertTriangle, ExternalLink, Plug,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { downloadWithAuth } from '../../lib/download';
import { useApi } from '../../lib/useApi';
import { Badge, Field, PageLoader, Spinner, TextArea, useToast } from '../../components/ui';
import { cx, num } from '../../lib/utils';
import Catalog from './Catalog';
import Media from './Media';
import People from './People';
import SettingsPanel from './SettingsPanel';
import Integrations from './Integrations';
import Submissions from './Submissions';

type Tab = 'dashboard' | 'catalog' | 'media' | 'people' | 'submissions' | 'integrations' | 'settings';

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { id: 'catalog', label: 'قاعدة الأدوية', icon: Boxes },
  { id: 'media', label: 'الاستيراد والصور', icon: Upload },
  { id: 'people', label: 'المستخدمون والرسائل', icon: Users },
  { id: 'submissions', label: 'طلبات الإضافة', icon: FileSpreadsheet },
  { id: 'integrations', label: 'التكاملات', icon: Plug },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const { lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'dashboard';
  const [navOpen, setNavOpen] = useState(false);

  if (loading) return <PageLoader />;
  if (!user || user.role !== 'admin') {
    return (
      <div className="mesh grid min-h-screen place-items-center p-6">
        <div className="card max-w-sm p-6 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <h1 className="text-[15px] font-extrabold">لوحة التحكم · Admin</h1>
          <p className="mt-1 text-[11.5px] leading-6 text-ink-500">هذه الصفحة مخصّصة لمدير النظام فقط.</p>
          <Link to="/auth" className="btn-primary mt-4 inline-flex">تسجيل الدخول</Link>
          <Link to="/" className="mt-2 block text-[11px] font-semibold text-ink-400">العودة للتطبيق</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mesh min-h-screen bg-ink-50/60 dark:bg-ink-950">
      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/90 backdrop-blur dark:border-ink-800 dark:bg-ink-900/90">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5">
          <Link to="/" className="icon-btn h-9 w-9 border border-ink-200 dark:border-ink-700"><ArrowLeft className="h-4 w-4 rtl:-scale-x-100" /></Link>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white"><LayoutDashboard className="h-4.5 w-4.5" /></span>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-extrabold text-ink-900 dark:text-white">لوحة تحكم MDA</div>
              <div className="truncate text-[9.5px] text-ink-400">{user.email}</div>
            </div>
          </div>
          <Badge tone="amber">admin</Badge>
        </div>
        <div className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setParams({ tab: t.id })}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11.5px] font-bold transition',
                tab === t.id ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-900' : 'text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800')}
            >
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-3 py-4">
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'catalog' && <Catalog />}
        {tab === 'media' && <Media />}
        {tab === 'people' && <People />}
        {tab === 'submissions' && <Submissions />}
        {tab === 'integrations' && <Integrations />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
      <div className="h-10" />
    </div>
  );
}

/* ---------------------------------- Dashboard ---------------------------------- */
function Dashboard() {
  const { data, loading, reload } = useApi<any>('/api/admin/stats');
  const { data: diag } = useApi<any>('/api/admin/diagnostics');
  const { push } = useToast();
  const [busy, setBusy] = useState(false);

  const rebuild = async () => {
    setBusy(true);
    try { await api.post('/api/admin/rebuild-search'); push('تمت إعادة بناء فهرس البحث'); reload(); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  if (loading && !data) return <PageLoader />;
  const c = data?.counts || {};
  const cards = [
    { label: 'الأدوية', value: c.drugs, icon: Database, tone: 'from-violet-500 to-purple-600' },
    { label: 'المنتجات', value: c.products, icon: Package, tone: 'from-teal-500 to-emerald-600' },
    { label: 'المستخدمون', value: c.users, icon: Users, tone: 'from-sky-500 to-blue-600' },
    { label: 'بدون صورة حقيقية', value: c.products_no_image, icon: AlertTriangle, tone: 'from-amber-500 to-orange-600' },
    { label: 'الوكلاء', value: c.agents, icon: Briefcase, tone: 'from-rose-500 to-pink-600' },
    { label: 'الرسائل', value: c.threads, icon: MessageSquare, tone: 'from-ink-600 to-ink-800' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {cards.map((k) => (
          <div key={k.label} className={`overflow-hidden rounded-2xl bg-gradient-to-br ${k.tone} p-3.5 text-white`}>
            <k.icon className="mb-2 h-4 w-4 opacity-80" />
            <div className="text-[22px] font-black leading-none">{num(k.value || 0)}</div>
            <div className="mt-0.5 text-[10px] font-semibold opacity-80">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><Database className="h-4 w-4 text-brand-600" />التوزيع حسب الأجهزة</div>
          <div className="space-y-1.5">
            {(data?.by_system || []).map((s: any) => (
              <div key={s.name_en} className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color || '#0f766e' }} />
                <span className="min-w-0 flex-1 truncate text-[11px] text-ink-600 dark:text-ink-300">{s.name_ar || s.name_en}</span>
                <span className="text-[10px] font-bold text-ink-500">{s.drugs} دواء</span>
                <span className="w-14 text-end text-[10px] text-ink-400">{s.products} منتج</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><TrendingUp className="h-4 w-4 text-emerald-600" />أكثر عمليات البحث</div>
            {(data?.top_searches || []).length === 0 && <p className="text-[11px] text-ink-400">لا توجد بيانات بحث بعد.</p>}
            <div className="flex flex-wrap gap-1.5">
              {(data?.top_searches || []).map((s: any) => (
                <span key={s.term} className="rounded-lg bg-ink-100 px-2 py-1 text-[10.5px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300">{s.term} <span className="text-ink-400">×{s.hits}</span></span>
              ))}
            </div>
          </div>
          <div className="card p-4">
            <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><Wrench className="h-4 w-4 text-sky-600" />أدوات الصيانة</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={rebuild} disabled={busy} className="btn-ghost text-[11px]">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}إعادة بناء البحث</button>
              <button onClick={async () => { try { await downloadWithAuth('/api/admin/export', `mda-export-${Date.now()}.json`); push('تم تجهيز الملف'); } catch (e: any) { push(e.message || 'خطأ', 'error'); } }} className="btn-ghost text-[11px]"><Download className="h-3.5 w-3.5" />تصدير قاعدة البيانات</button>
            </div>
            <div className="mt-2 space-y-1 text-[10px] text-ink-400">
              <div>Node {diag?.node} · {diag?.db_file}</div>
              <div>الصور المرفوعة: {diag?.uploads_mb ?? 0} MB</div>
              <div>منتجات بصور: {diag?.images?.products_with_image ?? 0} / {diag?.images?.products_total ?? 0}</div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge tone={diag?.env?.ai ? 'emerald' : 'neutral'}>AI {diag?.env?.ai ? 'ON' : 'OFF'}</Badge>
                <Badge tone={diag?.env?.google_login ? 'emerald' : 'neutral'}>Google {diag?.env?.google_login ? 'ON' : 'OFF'}</Badge>
                <Badge tone={diag?.env?.google_cse ? 'emerald' : 'neutral'}>Image search {diag?.env?.google_cse ? 'ON' : 'OFF'}</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 text-[12px] font-extrabold"><FileSpreadsheet className="h-4 w-4 text-violet-600" />آخر عمليات الاستيراد</div>
        {(data?.recent_imports || []).length === 0 && <p className="text-[11px] text-ink-400">لم يتم استيراد ملفات بعد — استخدم تبويب «الاستيراد والصور».</p>}
        <div className="space-y-1.5">
          {(data?.recent_imports || []).map((im: any) => (
            <div key={im.id} className="flex items-center gap-2 rounded-xl bg-ink-50 px-2.5 py-2 text-[10.5px] dark:bg-ink-800/60">
              <Badge tone={im.status === 'completed' ? 'emerald' : im.status === 'failed' ? 'rose' : 'amber'}>{im.status}</Badge>
              <span className="min-w-0 flex-1 truncate font-semibold">{im.filename}</span>
              <span className="text-ink-400">{im.rows_ok}/{im.rows_ok + im.rows_failed}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[10.5px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
        <span>كل التعديلات تُحفظ فورًا في قاعدة البيانات (SQLite) وتظهر للمستخدمين مباشرة. الصور المرفوعة تُخزّن في مجلد <code>/uploads</code>.</span>
      </div>
    </div>
  );
}

export { Dashboard };
