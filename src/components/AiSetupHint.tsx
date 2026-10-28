/*
 * «الذكاء الاصطناعي غير مفعّل» — بطاقة واحدة تشرح السبب وتقود إلى الحل.
 *
 * قبلها كان المستخدم يرى رسالة قصيرة فقط ولا يعرف أن التفعيل ممكن من داخل التطبيق،
 * فيظن أن الميزة معطوبة. الآن: المدير يرى زرًا مباشرًا إلى لوحة التفعيل، وغير المدير
 * يقرأ سببًا واضحًا، وإذا لم يكن هناك خادم متصل يُقاد إلى ربط الخادم أولًا.
 */
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BookOpen, Bot, KeyRound, Server, WifiOff } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { getServerReachable } from '../lib/localcatalog';

type AiStatus = {
  enabled?: boolean;
  configured?: boolean;
  provider?: string;
  model?: string | null;
  key_source?: string;
  hint_ar?: string | null;
  hint_en?: string | null;
};

export default function AiSetupHint({ className = '' }: { className?: string }) {
  const { data } = useApi<AiStatus>('/api/ai/status', undefined, { ttl: 60_000 });
  const { user } = useAuth();
  const { lang } = useI18n();
  const ar = lang === 'ar';
  const isAdmin = user?.role === 'admin';
  const enabled = Boolean(data?.enabled ?? data?.configured);
  const serverDown = getServerReachable() === false;

  /* No server at all → the status call never resolved; that is the most common cause and
     must still be explained (otherwise the card silently disappears exactly when needed). */
  if (enabled) return null;
  if (!data && !serverDown) return null;

  return (
    <div className={`card space-y-2 border-amber-400/25 bg-amber-500/[.07] p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
          {serverDown ? <WifiOff className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-extrabold text-amber-100">
            {serverDown
              ? (ar ? 'لا يوجد خادم متصل — الذكاء الاصطناعي يحتاج الخادم' : 'No server connected — AI needs the server')
              : (ar ? 'الذكاء الاصطناعي غير مفعّل على الخادم' : 'AI is not enabled on the server')}
          </div>
          <p className="mt-0.5 text-[10.5px] leading-5 text-amber-200/85">
            {serverDown
              ? (ar ? 'التطبيق يعمل الآن بالكتالوج المدمج (قراءة وبحث فقط). اربط الخادم أولًا ثم فعّل المفتاح.'
                    : 'The app is running on the built-in catalogue (read/search only). Link the server first, then enable a key.')
              : (ar ? (data.hint_ar || 'المدير يفعّله من: الإدارة ← الذكاء الاصطناعي — مفتاح Groq مجاني.')
                    : (data.hint_en || 'An admin enables it in Admin → AI settings (a free Groq key works).'))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {serverDown ? (
          <Link to="/server" className="btn-primary px-3 py-1.5 text-[11px]">
            <Server className="h-3.5 w-3.5" />{ar ? 'ربط الخادم' : 'Link server'}
          </Link>
        ) : isAdmin ? (
          <Link to="/admin?tab=ai" className="btn-primary px-3 py-1.5 text-[11px]">
            <KeyRound className="h-3.5 w-3.5" />{ar ? 'تفعيل الآن (مفتاح مجاني)' : 'Enable now (free key)'}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-xl bg-white/[.05] px-2.5 py-1.5 text-[10.5px] text-ink-300">
            <AlertTriangle className="h-3 w-3" />{ar ? 'اطلب من مدير النظام تفعيله — دقيقة واحدة' : 'Ask an admin to enable it — takes a minute'}
          </span>
        )}
        <Link to="/ai-guide" className="btn-soft px-3 py-1.5 text-[11px]">
          <BookOpen className="h-3.5 w-3.5" />{ar ? 'دليل الربط بالخطوات والروابط' : 'Setup guide with links'}
        </Link>
        <Link to="/about" className="btn-ghost px-3 py-1.5 text-[11px]">
          {ar ? 'ما الذي يعمل بدونه؟' : 'What works without it?'} <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
