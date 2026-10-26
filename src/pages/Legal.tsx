/*
 * In-app reader for the server-rendered legal pages.
 *
 * The same HTML that Google Play reviewers open at /privacy and /terms is loaded here,
 * so the policy shown inside the app can never drift from the published one.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ExternalLink, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { useConfig } from '../lib/config';

export default function Legal() {
  const { doc } = useParams<{ doc: string }>();
  const { lang } = useI18n();
  const { config } = useConfig();
  const ar = lang === 'ar';
  const which = doc === 'terms' ? 'terms' : 'privacy';
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  /* In the Android shell a relative /privacy does not exist (the pages live on the server),
     so prefer the absolute URLs advertised by GET /api/config. */
  const target = (which === 'terms' ? config.terms_url : config.privacy_url) || `/${which}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetch(target, { headers: { Accept: 'text/html' } })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!alive) return;
        /* keep only the document body — the app supplies its own header/footer */
        const inner = text.split(/<body[^>]*>/i)[1]?.split(/<\/body>/i)[0] || text;
        setHtml(inner);
      })
      .catch((e) => { if (alive) setError(e.message === 'NETWORK' ? (ar ? 'لا يوجد اتصال' : 'No connection') : e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [which, ar, target]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link to="/more" className="icon-btn h-9 w-9"><ArrowRight className="h-4 w-4 rtl:-scale-x-100" /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-extrabold text-white">{which === 'terms' ? (ar ? 'شروط الاستخدام' : 'Terms of service') : (ar ? 'سياسة الخصوصية' : 'Privacy policy')}</h1>
          <p className="text-[10.5px] text-ink-400">{ar ? 'الصفحة المنشورة نفسها التي يفتحها متجر Google Play' : 'The very page Google Play links to'}</p>
        </div>
        <a href={target} target="_blank" rel="noreferrer" className="icon-btn h-9 w-9" title={ar ? 'فتح في المتصفح' : 'Open in browser'}><ExternalLink className="h-4 w-4" /></a>
      </div>

      <div className="card p-4">
        {loading && <div className="flex items-center gap-2 text-[11.5px] text-ink-400"><Loader2 className="h-4 w-4 animate-spin" />{ar ? 'جارٍ التحميل…' : 'Loading…'}</div>}
        {error && (
          <div className="space-y-2">
            <p className="text-[11.5px] text-rose-300">{error}</p>
            <p className="text-[11px] text-ink-400">
              {ar ? 'يمكنك فتح النسخة المنشورة مباشرة:' : 'Open the published copy directly:'}{' '}
              <a className="link" href={`${config.privacy_url || ''}`} target="_blank" rel="noreferrer">{ar ? 'الخصوصية' : 'Privacy'}</a>
              {' · '}
              <a className="link" href={`${config.terms_url || ''}`} target="_blank" rel="noreferrer">{ar ? 'الشروط' : 'Terms'}</a>
            </p>
          </div>
        )}
        {!loading && !error && (
          <>
            <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-2 text-[10.5px] text-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              {ar ? 'نص قابل للتحقق من المستودع — لا وعود تسويقية.' : 'Verifiable text from the repository — no marketing promises.'}
            </div>
            {/* The server sends sanitised, static HTML authored in this repo (no user input). */}
            <div className="legal-body" dangerouslySetInnerHTML={{ __html: html }} />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/legal/privacy" className={which === 'privacy' ? 'btn-primary text-[11px]' : 'btn-ghost text-[11px]'}>
          <FileText className="h-3.5 w-3.5" />{ar ? 'الخصوصية' : 'Privacy'}
        </Link>
        <Link to="/legal/terms" className={which === 'terms' ? 'btn-primary text-[11px]' : 'btn-ghost text-[11px]'}>
          <FileText className="h-3.5 w-3.5" />{ar ? 'الشروط' : 'Terms'}
        </Link>
      </div>
    </div>
  );
}
