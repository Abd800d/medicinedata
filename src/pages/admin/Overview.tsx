/*
 * «خلاصة التطبيق» — the first thing an admin sees, and the only screen that answers
 * "how is the app doing right now, and what needs me?" in one glance.
 *
 * Everything on this page comes from a single call (`/api/admin/overview`), so the numbers
 * are from the same instant instead of four endpoints drifting apart, and a phone on a slow
 * network makes one request instead of six.
 *
 * Deliberate choices:
 *   • a health score that only counts *actionable* checks — an optional integration (Google
 *     sign-in) can be off without dragging the score down silently, it is marked optional;
 *   • every alert and every check has a destination, so the dashboard leads somewhere;
 *   • no invented numbers: when a value is unavailable the UI shows «—», not 0.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowLeft, Bot, Boxes, CheckCircle2, CircleDashed, Clock, Database,
  Download, FileSpreadsheet, ImageOff, Inbox, Loader2, Package, RefreshCw, ScanLine, ShieldCheck,
  Sparkles, TriangleAlert, Users, Wifi,
} from 'lucide-react';
import { useApi } from '../../lib/useApi';
import { useI18n } from '../../lib/i18n';
import { downloadWithAuth } from '../../lib/download';
import { useToast } from '../../components/ui';
import { cx, num, timeAgo } from '../../lib/utils';

type Check = { id: string; ok: boolean; label_ar: string; label_en: string; hint_ar: string; hint_en: string; to: string; optional?: boolean };
type Alert = { level: 'danger' | 'warn' | 'info'; id: string; to: string; text_ar: string; text_en: string };

type Overview = {
  generated_at: string;
  health: { ok: boolean; score: number | null; checks_ok: number; checks_total: number };
  content: {
    systems: number; classes: number; drugs: number; products: number; manufacturers: number;
    agents: number; photos: number; unverified: number;
    images: { with_image: number; total: number; percent: number | null; missing: number };
  };
  people: { users: number; admins: number; pharmacists: number; google_users: number; new_7d: number; new_30d: number; new_users_7d: { date: string; n: number }[] };
  work: Record<string, number>;
  ai: {
    enabled: boolean; provider: string; model: string | null; vision_model: string | null; key_source: string;
    runs_7d: number; failed_7d: number; last_run_at: string | null; runs_7d_series: { date: string; n: number }[];
  };
  platform: {
    version: string; node: string; env: string; started_at: string | null; uptime_s: number | null;
    db_file: string; db_mb: number; uploads_mb: number; google_login: boolean;
    registration_open: boolean; maintenance: boolean;
  };
  activity: {
    top_searches: { term: string; hits: number }[];
    recent_audit: { action: string; actor_email: string | null; target_type: string | null; created_at: string }[];
    recent_imports: { id: number; filename: string; kind: string; rows_ok: number; rows_failed: number; status: string; created_at: string }[];
    recent_rx: { id: number; status: string; created_at: string }[];
  };
  checks: Check[];
  alerts: Alert[];
};

const uptime = (s: number | null, ar: boolean) => {
  if (s === null || s === undefined) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return ar ? `${d} يوم ${h} ساعة` : `${d}d ${h}h`;
  if (h) return ar ? `${h} ساعة ${m} دقيقة` : `${h}h ${m}m`;
  return ar ? `${m} دقيقة` : `${m}m`;
};

/** Tiny bar chart: no chart library, no layout shift, readable at 320px. */
function Spark({ data, tone = 'brand' }: { data: { date: string; n: number }[]; tone?: 'brand' | 'violet' }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const barTone = tone === 'violet' ? 'bg-violet-400/70' : 'bg-brand-400/70';
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden>
      {data.map((d) => (
        <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.n}`}>
          <div className={cx('w-full rounded-sm', barTone)} style={{ height: `${Math.max(2, (d.n / max) * 40)}px` }} />
        </div>
      ))}
    </div>
  );
}

function ScoreRing({ score }: { score: number | null }) {
  const value = Math.max(0, Math.min(100, score ?? 0));
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone = value >= 85 ? '#34d399' : value >= 60 ? '#fbbf24' : '#fb7185';
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-black leading-none text-white">{score ?? '—'}</span>
        <span className="text-[8px] text-white/70">/100</span>
      </div>
    </div>
  );
}

export default function Overview() {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { push } = useToast();
  const { data, loading, error, reload } = useApi<Overview>('/api/admin/overview', undefined, { ttl: 0 });
  const [busy, setBusy] = useState('');
  const [auto, setAuto] = useState(false);

  /* Refresh every 60 s while the admin watches the screen. */
  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => { void reload(); }, 60_000);
    return () => clearInterval(id);
  }, [auto, reload]);

  const download = async (kind: 'csv' | 'json') => {
    setBusy(kind);
    try {
      if (kind === 'csv') await downloadWithAuth('/api/admin/overview.csv', `mda-overview-${new Date().toISOString().slice(0, 10)}.csv`);
      else await downloadWithAuth('/api/admin/export', `mda-export-${Date.now()}.json`);
      push(ar ? 'تم تجهيز الملف' : 'File is ready');
    } catch (e: any) {
      push(e?.message || (ar ? 'تعذّر التنزيل' : 'Download failed'), 'error');
    } finally { setBusy(''); }
  };

  if (loading && !data) return <div className="card flex items-center justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-brand-300" /></div>;
  if (error && !data) {
    return (
      <div className="card space-y-2 p-5 text-center">
        <TriangleAlert className="mx-auto h-7 w-7 text-rose-400" />
        <div className="text-[12.5px] font-extrabold text-white">{ar ? 'تعذّر تحميل الخلاصة' : 'Could not load the summary'}</div>
        <div className="text-[11px] text-ink-400">{error}</div>
        <button onClick={() => void reload()} className="btn-primary mx-auto px-3 py-1.5 text-[11px]"><RefreshCw className="h-3.5 w-3.5" />{ar ? 'إعادة المحاولة' : 'Retry'}</button>
      </div>
    );
  }
  if (!data) return null;

  const { content: c, people: p, work: w, ai, platform: pf, activity, health } = data;
  const imagePct = c.images.percent;

  const kpis = [
    { label: ar ? 'الأدوية' : 'Drugs', value: c.drugs, icon: Database, tone: 'from-violet-500 to-purple-600', to: '/admin?tab=catalog' },
    { label: ar ? 'المنتجات' : 'Products', value: c.products, icon: Package, tone: 'from-teal-500 to-emerald-600', to: '/admin?tab=catalog' },
    { label: ar ? 'صور حقيقية' : 'Real photos', value: `${c.images.with_image}/${c.images.total}`, icon: ImageOff,
      tone: (imagePct ?? 0) >= 70 ? 'from-emerald-500 to-teal-600' : 'from-amber-500 to-orange-600',
      to: '/admin?tab=media', sub: imagePct === null ? '—' : `${imagePct}%` },
    { label: ar ? 'المستخدمون' : 'Users', value: p.users, icon: Users, tone: 'from-sky-500 to-blue-600', to: '/admin?tab=people', sub: ar ? `+${p.new_7d} هذا الأسبوع` : `+${p.new_7d} this week` },
    { label: ar ? 'الوكلاء' : 'Agents', value: c.agents, icon: Boxes, tone: 'from-rose-500 to-pink-600', to: '/directories' },
    { label: ar ? 'الصيدليات (مستخدمون)' : 'Pharmacists', value: p.pharmacists, icon: ShieldCheck, tone: 'from-indigo-500 to-violet-600', to: '/admin?tab=people' },
  ];

  const queue = [
    { id: 'rx', icon: ScanLine, label: ar ? 'وصفات تنتظر المراجعة' : 'Prescriptions awaiting review', value: w.rx_pending_review, to: '/review', tone: 'text-emerald-300', show: true },
    { id: 'subs', icon: FileSpreadsheet, label: ar ? 'طلبات إضافة دواء' : 'Drug submissions', value: w.submissions_pending, to: '/admin?tab=submissions', tone: 'text-amber-300', show: true },
    { id: 'threads', icon: Users, label: ar ? 'رسائل بلا رد إداري' : 'Messages with no staff reply', value: w.threads_unanswered, to: '/admin?tab=people', tone: 'text-sky-300', show: true },
    { id: 'expired', icon: AlertTriangle, label: ar ? 'أصناف منتهية في المخزون' : 'Expired stock items', value: w.pharmacy_expired, to: '/pharmacy', tone: 'text-rose-300', show: true },
    { id: 'imports', icon: FileSpreadsheet, label: ar ? 'استيرادات فاشلة' : 'Failed imports', value: w.imports_failed, to: '/admin?tab=media', tone: 'text-rose-300', show: true },
  ].filter((q) => q.show);

  const levelTone: Record<Alert['level'], string> = {
    danger: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
    warn: 'border-amber-400/25 bg-amber-500/10 text-amber-100',
    info: 'border-sky-400/25 bg-sky-500/10 text-sky-100',
  };

  return (
    <div className="space-y-3.5">
      {/* ---------- hero: health score, version, uptime ---------- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-violet-700 p-4 text-white">
        <div className="absolute -end-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-start gap-3">
          <ScoreRing score={health.score} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[13px] font-extrabold">
              <Activity className="h-3.5 w-3.5" />
              {ar ? 'خلاصة التطبيق' : 'App summary'}
            </div>
            <div className="mt-0.5 text-[10.5px] text-white/75">
              {ar ? `الفحوصات المكتملة: ${health.checks_ok} من ${health.checks_total}`
                  : `${health.checks_ok} of ${health.checks_total} checks complete`}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="rounded-lg bg-white/15 px-1.5 py-0.5 text-[9.5px] font-bold" dir="ltr">v{pf.version}</span>
              <span className="rounded-lg bg-white/15 px-1.5 py-0.5 text-[9.5px]" dir="ltr">{pf.node}</span>
              <span className="rounded-lg bg-white/15 px-1.5 py-0.5 text-[9.5px]">{ar ? 'تشغيل ' : 'up '}{uptime(pf.uptime_s, ar)}</span>
              <span className={cx('rounded-lg px-1.5 py-0.5 text-[9.5px] font-bold', ai.enabled ? 'bg-emerald-400/25' : 'bg-black/25')}>
                AI {ai.enabled ? (ar ? 'مفعّل' : 'on') : (ar ? 'معطّل' : 'off')}
              </span>
              <span className={cx('rounded-lg px-1.5 py-0.5 text-[9.5px] font-bold', pf.google_login ? 'bg-emerald-400/25' : 'bg-black/25')}>
                Google {pf.google_login ? (ar ? 'مفعّل' : 'on') : (ar ? 'معطّل' : 'off')}
              </span>
              {pf.maintenance && <span className="rounded-lg bg-amber-400/30 px-1.5 py-0.5 text-[9.5px] font-bold">{ar ? 'صيانة' : 'maintenance'}</span>}
            </div>
          </div>
        </div>
        <div className="relative mt-2.5 flex items-center gap-1.5">
          <button onClick={() => void reload()} className="rounded-lg bg-white/20 px-2 py-1 text-[10px] font-bold">
            <RefreshCw className="me-1 inline h-3 w-3" />{ar ? 'تحديث' : 'Refresh'}
          </button>
          <button onClick={() => setAuto((a) => !a)}
            className={cx('rounded-lg px-2 py-1 text-[10px] font-bold', auto ? 'bg-emerald-400/30' : 'bg-white/10')}>
            <Clock className="me-1 inline h-3 w-3" />{auto ? (ar ? 'تحديث تلقائي كل دقيقة' : 'auto 60s') : (ar ? 'تحديث تلقائي' : 'auto-refresh')}
          </button>
          <span className="ms-auto text-[9px] text-white/60">{timeAgo(data.generated_at, ar ? 'ar' : 'en')}</span>
        </div>
      </div>

      {/* ---------- alerts ---------- */}
      {data.alerts.length > 0 && (
        <div className="space-y-1.5">
          {data.alerts.map((a) => (
            <Link key={a.id} to={a.to} className={cx('flex items-start gap-2 rounded-2xl border p-2.5 text-[11px] leading-5', levelTone[a.level])}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">{ar ? a.text_ar : a.text_en}</span>
              <ArrowLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 rtl:rotate-0 ltr:rotate-180" />
            </Link>
          ))}
        </div>
      )}

      {/* ---------- KPI grid ---------- */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className={`overflow-hidden rounded-2xl bg-gradient-to-br ${k.tone} p-3 text-white`}>
            <k.icon className="mb-1.5 h-4 w-4 opacity-80" />
            <div className="text-[19px] font-black leading-none">{typeof k.value === 'number' || typeof k.value === 'string' ? k.value : '—'}</div>
            <div className="mt-0.5 text-[10.5px] font-semibold opacity-85">{k.label}</div>
            {'sub' in k && k.sub ? <div className="text-[9px] opacity-70">{k.sub}</div> : null}
          </Link>
        ))}
      </div>

      {/* ---------- work waiting for a human ---------- */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-white/[.06] px-3.5 py-2.5 text-[11.5px] font-bold text-ink-300">
          <Inbox className="h-3.5 w-3.5 text-amber-300" /> {ar ? 'ينتظر إجراءً منك' : 'Waiting on you'}
        </div>
        <div className="divide-y divide-white/[.04]">
          {queue.map((q) => {
            const hot = Number(q.value) > 0;
            return (
              <Link key={q.id} to={q.to} className="flex items-center gap-2.5 px-3.5 py-2.5 transition hover:bg-white/[.04]">
                <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', hot ? 'bg-white/[.07]' : 'bg-white/[.03]')}>
                  <q.icon className={cx('h-4 w-4', hot ? q.tone : 'text-ink-500')} />
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink-200">{q.label}</span>
                <span className={cx('text-[13px] font-black', hot ? 'text-white' : 'text-ink-500')}>{num(q.value || 0)}</span>
                <ArrowLeft className="h-3 w-3 text-ink-500 rtl:rotate-0 ltr:rotate-180" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* ---------- checklist ---------- */}
      <div className="card p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11.5px] font-extrabold text-white"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />{ar ? 'قائمة التفعيل' : 'Activation checklist'}</div>
          <span className="text-[10px] text-ink-400">{health.checks_ok}/{health.checks_total}</span>
        </div>
        <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[.07]">
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400" style={{ width: `${health.score ?? 0}%` }} />
        </div>
        <div className="space-y-1.5">
          {data.checks.map((ch) => (
            <Link key={ch.id} to={ch.to} className="flex items-start gap-2 rounded-xl px-1 py-1 transition hover:bg-white/[.03]">
              {ch.ok
                ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                : <CircleDashed className={cx('mt-0.5 h-3.5 w-3.5 shrink-0', ch.optional ? 'text-ink-500' : 'text-amber-400')} />}
              <div className="min-w-0 flex-1">
                <div className={cx('text-[11px] font-semibold', ch.ok ? 'text-ink-300' : 'text-white')}>
                  {ar ? ch.label_ar : ch.label_en}
                  {ch.optional && <span className="ms-1 rounded bg-white/[.06] px-1 text-[9px] text-ink-400">{ar ? 'اختياري' : 'optional'}</span>}
                </div>
                <div className="truncate text-[9.5px] text-ink-500">{ar ? ch.hint_ar : ch.hint_en}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ---------- 7-day activity ---------- */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="card p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-ink-300">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5 text-sky-300" />{ar ? 'مستخدمون جدد · 7 أيام' : 'New users · 7 days'}</span>
            <span className="text-white">{num(p.new_7d)}</span>
          </div>
          <Spark data={p.new_users_7d} />
        </div>
        <div className="card p-3">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-ink-300">
            <span className="inline-flex items-center gap-1"><Bot className="h-3.5 w-3.5 text-violet-300" />{ar ? 'استدعاءات الذكاء · 7 أيام' : 'AI calls · 7 days'}</span>
            <span className="text-white">{num(ai.runs_7d)}{ai.failed_7d ? <span className="ms-1 text-[9.5px] font-normal text-rose-300">({ai.failed_7d} {ar ? 'فشل' : 'failed'})</span> : null}</span>
          </div>
          <Spark data={ai.runs_7d_series} tone="violet" />
          <div className="mt-1 truncate text-[9.5px] text-ink-500" dir="ltr">
            {ai.enabled ? `${ai.provider} · ${ai.model || '—'}` : (ar ? 'غير مفعّل — أضف مفتاحًا مجانيًا' : 'off — add a free key')}
          </div>
        </div>
      </div>

      {/* ---------- content depth + storage ---------- */}
      <div className="card p-3.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11.5px] font-extrabold text-white"><Boxes className="h-3.5 w-3.5 text-brand-300" />{ar ? 'الكتالوج والتخزين' : 'Catalogue & storage'}</div>
        <div className="grid grid-cols-2 gap-1.5 text-[10.5px] sm:grid-cols-4">
          {[
            { k: ar ? 'الأجهزة' : 'Systems', v: c.systems },
            { k: ar ? 'التصنيفات' : 'Classes', v: c.classes },
            { k: ar ? 'الشركات' : 'Manufacturers', v: c.manufacturers },
            { k: ar ? 'الصور' : 'Photos', v: c.photos },
            { k: ar ? 'قاعدة البيانات' : 'Database', v: `${pf.db_mb} MB` },
            { k: ar ? 'الصور المرفوعة' : 'Uploads', v: `${pf.uploads_mb} MB` },
            { k: ar ? 'منتجات غير موثّقة' : 'Unverified', v: c.unverified },
            { k: ar ? 'التسجيل' : 'Registration', v: pf.registration_open ? (ar ? 'مفتوح' : 'open') : (ar ? 'مغلق' : 'closed') },
          ].map((row) => (
            <div key={row.k} className="rounded-xl bg-white/[.04] p-2">
              <div className="text-[9.5px] text-ink-500">{row.k}</div>
              <div className="font-bold text-ink-100">{typeof row.v === 'number' ? num(row.v) : row.v}</div>
            </div>
          ))}
        </div>
        {pf.db_file && <div className="mt-1.5 truncate font-mono text-[9px] text-ink-600" dir="ltr">{pf.db_file}</div>}
      </div>

      {/* ---------- searches + audit ---------- */}
      <div className="grid gap-2.5 lg:grid-cols-2">
        <div className="card p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-ink-300"><Activity className="h-3.5 w-3.5 text-emerald-300" />{ar ? 'أكثر عمليات البحث' : 'Top searches'}</div>
          {activity.top_searches.length === 0
            ? <p className="text-[10.5px] text-ink-500">{ar ? 'لا بحث بعد.' : 'No searches yet.'}</p>
            : (
              <div className="flex flex-wrap gap-1">
                {activity.top_searches.map((s) => (
                  <span key={s.term} className="rounded-lg bg-white/[.05] px-1.5 py-0.5 text-[10px] text-ink-300">
                    {s.term} <span className="text-ink-500">×{s.hits}</span>
                  </span>
                ))}
              </div>
            )}
        </div>
        <div className="card p-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-ink-300"><ShieldCheck className="h-3.5 w-3.5 text-amber-300" />{ar ? 'آخر ما حدث' : 'Latest activity'}</div>
          {activity.recent_audit.length === 0
            ? <p className="text-[10.5px] text-ink-500">{ar ? 'لا شيء بعد.' : 'Nothing yet.'}</p>
            : (
              <div className="space-y-1">
                {activity.recent_audit.slice(0, 6).map((a, i) => (
                  <div key={`${a.action}-${i}`} className="flex items-center gap-1.5 text-[10px]">
                    <span className="shrink-0 rounded bg-white/[.05] px-1 font-mono text-[9px] text-brand-200" dir="ltr">{a.action}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-400">{a.actor_email || '—'}</span>
                    <span className="shrink-0 text-ink-600">{timeAgo(a.created_at, ar ? 'ar' : 'en')}</span>
                  </div>
                ))}
              </div>
            )}
          <Link to="/admin?tab=audit" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold text-brand-300">
            {ar ? 'السجل الكامل' : 'Full log'} <ArrowLeft className="h-3 w-3 ltr:rotate-180" />
          </Link>
        </div>
      </div>

      {/* ---------- quick actions ---------- */}
      <div className="card p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-ink-300"><Sparkles className="h-3.5 w-3.5 text-violet-300" />{ar ? 'إجراءات سريعة' : 'Quick actions'}</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button onClick={() => void download('csv')} disabled={busy === 'csv'} className="btn-ghost text-[10.5px]">
            {busy === 'csv' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{ar ? 'تنزيل الخلاصة CSV' : 'Summary CSV'}
          </button>
          <button onClick={() => void download('json')} disabled={busy === 'json'} className="btn-ghost text-[10.5px]">
            {busy === 'json' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}{ar ? 'نسخة JSON' : 'JSON backup'}
          </button>
          <Link to="/review" className="btn-ghost text-[10.5px]"><ScanLine className="h-3.5 w-3.5" />{ar ? 'طابور المراجعة' : 'Review queue'}</Link>
          <Link to="/admin?tab=ai" className="btn-ghost text-[10.5px]"><Bot className="h-3.5 w-3.5" />{ar ? 'إعداد الذكاء' : 'AI settings'}</Link>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1 pb-2 text-[9px] text-ink-600">
        <Wifi className="h-3 w-3" />{ar ? 'كل الأرقام مقروءة الآن من قاعدة البيانات مباشرة — لا تقديرات.' : 'Every number is read live from the database — no estimates.'}
      </div>
    </div>
  );
}

