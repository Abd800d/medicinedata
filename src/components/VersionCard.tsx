/*
 * "Any version" card — three numbers that must agree after an update:
 *   التطبيق (the APK on the phone) · الحزمة (the web bundle inside it) · الخادم (the API).
 *
 * When the phone is newer than the server every new button fails with a 404 that looks like
 * "nothing changed". This card says it in words, with the exact remedy.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw, Smartphone, Sparkles, Cloud, Package } from 'lucide-react';
import { useConfig } from '../lib/config';
import { useI18n } from '../lib/i18n';
import { bundleStamp, bundleVersion, judgeVersions, serverInfo, shellInfo, type ShellInfo, type ServerInfo } from '../lib/appInfo';
import { Badge } from './ui';
import { cx } from '../lib/utils';

export default function VersionCard({ compact = false }: { compact?: boolean }) {
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const { config } = useConfig();
  const [shell, setShell] = useState<ShellInfo | null>(null);
  const [bundle, setBundle] = useState<{ version: string; built_at?: string; build?: string } | null>(null);
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [s, b, sv] = await Promise.all([shellInfo(), bundleStamp(), serverInfo()]);
      setShell(s);
      setBundle(b);
      setServer(sv);
    } finally { setBusy(false); }
  };

  useEffect(() => { void load(); }, []);

  const phone = shell?.version || bundleVersion();
  const serverVersion = server?.ok ? (server.version || String((config as any)?.version || '')) : '';
  const verdict = judgeVersions(phone, serverVersion, !!server?.ok);
  const serverFromConfig = String((config as any)?.version || '');

  const row = (icon: any, label: string, value: string, tone: 'ok' | 'warn' | 'muted') => {
    const Icon = icon;
    return (
      <div className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[10.5px] bg-white/[.04]">
        <Icon className={cx('h-3.5 w-3.5', tone === 'warn' ? 'text-amber-300' : tone === 'ok' ? 'text-emerald-300' : 'text-ink-400')} />
        <span className="min-w-0 flex-1 text-ink-400">{label}</span>
        <span className="font-bold text-ink-100" dir="ltr">{value || '—'}</span>
      </div>
    );
  };

  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-2">
        <Package className="h-4 w-4 text-brand-300" />
        <span className="flex-1 text-[12px] font-extrabold">{ar ? 'الإصدارات' : 'Versions'}</span>
        <button onClick={load} className="icon-btn h-7 w-7" aria-label={ar ? 'تحديث' : 'Refresh'}>
          <RefreshCw className={cx('h-3.5 w-3.5', busy && 'animate-spin')} />
        </button>
      </div>

      <div className="mt-2 space-y-1">
        {row(Smartphone, ar ? 'التطبيق المثبّت' : 'Installed app', shell ? `v${shell.version}${shell.build ? ` (${shell.build})` : ''}` : '…', 'ok')}
        {row(Package, ar ? 'الحزمة داخل التطبيق' : 'Bundle in the app', bundle ? `v${bundle.version}${bundle.build && bundle.build !== 'local' ? ` (${bundle.build})` : ''}` : '…', bundle ? 'ok' : 'muted')}
        {row(Cloud, ar ? 'الخادم' : 'Server', server?.ok ? `v${serverVersion || serverFromConfig || '?'}` : (ar ? 'غير متاح' : 'offline'), verdict.state === 'match' ? 'ok' : 'warn')}
      </div>

      {verdict.state === 'match' && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-2 text-[10.5px] font-semibold text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {ar ? 'التطبيق والخادم على نفس الإصدار — كل الميزات متاحة.' : 'App and server match — everything is available.'}
        </div>
      )}
      {verdict.hint && (
        <div className={cx('mt-2 flex items-start gap-2 rounded-xl border p-2 text-[10.5px] leading-5',
          verdict.state === 'server-older' ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
            : verdict.state === 'server-newer' ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
              : 'border-white/10 bg-white/[.05] text-ink-300')}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{ar ? verdict.hint.ar : verdict.hint.en}</span>
        </div>
      )}

      {!compact && (
        <Link to="/whats-new" className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-brand-500/15 px-2 py-1.5 text-[10.5px] font-bold text-brand-200">
          <Sparkles className="h-3.5 w-3.5" />{ar ? 'ما الجديد في هذا الإصدار' : "What's new"}
        </Link>
      )}
    </div>
  );
}
