/*
 * Google sign-in credentials, entered from the panel (v1.9.0).
 *
 * Google blocks OAuth inside an embedded WebView, so the app signs in through the system
 * browser. That needs a Web OAuth client: a Client ID and a Client Secret. Both are stored
 * on the server — the secret is encrypted with AES-256-GCM and is never sent back to any
 * client. Nothing here requires editing Render or restarting anything.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Globe2, KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { openExternal } from '../../lib/external';
import { Badge, Field, useToast } from '../../components/ui';

type State = {
  configured: boolean;
  client_id: string;
  has_secret: boolean;
  secret_hint: string | null;
  redirect_uri: string;
  app_scheme: string;
  steps_ar: string[];
};

export default function GoogleOAuthCard() {
  const { push } = useToast();
  const [state, setState] = useState<State | null>(null);
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const s = await api.get<State>('/api/admin/google-oauth');
      setState(s);
      setClientId(s.client_id || '');
    } catch (e: any) { push(e.message || 'خطأ في القراءة', 'error'); }
  };
  useEffect(() => { load(); }, []);

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); push(`تم نسخ ${label}`); }
    catch { push('تعذّر النسخ — انسخه يدويًا', 'error'); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const out = await api.put<any>('/api/admin/google-oauth', {
        client_id: clientId.trim(),
        ...(secret.trim() ? { client_secret: secret.trim() } : {}),
      });
      setSecret('');
      push(out.configured
        ? 'تم التفعيل — زر «الدخول بحساب Google» يعمل الآن'
        : 'تم الحفظ، ما زال ينقص Client Secret');
      await load();
    } catch (e: any) {
      push(e.message || e.error || 'تعذّر الحفظ', 'error');
    } finally { setBusy(false); }
  };

  const clearSecret = async () => {
    if (!window.confirm('حذف الـ Client Secret؟ سيتوقف الدخول بحساب Google حتى تعيد إدخاله.')) return;
    setBusy(true);
    try { await api.put('/api/admin/google-oauth', { clear_secret: true }); push('تم حذف السر'); await load(); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-sky-500 to-blue-600 p-3.5 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><Globe2 className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-extrabold">الدخول بحساب Google (من الجوال)</div>
          <div className="truncate text-[10.5px] text-white/75">يفتح متصفح الجهاز بحساب Google المسجّل عليه — بلا كلمة مرور</div>
        </div>
        <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${state?.configured ? 'bg-white/20' : 'bg-black/25'}`}>
          {state?.configured ? <CheckCircle2 className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />}
          {state?.configured ? 'مُفعّل' : 'غير مُفعّل'}
        </span>
      </div>

      <div className="space-y-3 p-3.5">
        <p className="text-[11px] leading-5 text-ink-400">
          الخطوات مرة واحدة فقط. المفتاح يُخزَّن <b>مشفّرًا على الخادم</b> ولا يصل إلى التطبيق أبدًا.
        </p>

        <div className="rounded-xl bg-white/[.05] p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-ink-300">Authorized redirect URI</span>
            <button onClick={() => copy(state?.redirect_uri || '', 'الرابط')} className="text-ink-400 hover:text-white"><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <code className="mt-1 block break-all text-[10.5px] text-brand-200" dir="ltr">{state?.redirect_uri || '…'}</code>
          <div className="mt-1 text-[9.5px] text-ink-500" dir="ltr">scheme: {state?.app_scheme || 'com.mda.medicinedata://auth'}</div>
        </div>

        <Field label="Client ID">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} dir="ltr" spellCheck={false}
            placeholder="1234567890-abc.apps.googleusercontent.com" className="input font-mono text-[11px]" />
        </Field>

        <Field label={state?.has_secret ? `Client Secret (محفوظ: ${state.secret_hint}) — اتركه فارغًا للإبقاء` : 'Client Secret'}>
          <input value={secret} onChange={(e) => setSecret(e.target.value)} dir="ltr" type="password" spellCheck={false}
            placeholder="GOCSPX-…" className="input font-mono text-[11px]" autoComplete="new-password" />
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={save} disabled={busy} className="btn-primary text-[11.5px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}حفظ وتفعيل
          </button>
          <button onClick={() => openExternal('https://console.cloud.google.com/apis/credentials')} className="btn-ghost text-[11.5px]">
            <ExternalLink className="h-4 w-4" />فتح Google Cloud
          </button>
        </div>

        {state?.has_secret && (
          <button onClick={clearSecret} disabled={busy} className="flex items-center gap-1 text-[10.5px] font-semibold text-rose-300 hover:underline">
            <Trash2 className="h-3 w-3" />حذف الـ Client Secret
          </button>
        )}

        <ol className="space-y-1 text-[11px] leading-5 text-ink-300">
          {(state?.steps_ar || []).map((step, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold bg-ink-700 text-ink-200">{i + 1}</span>
              <span className="break-words">{step}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-1.5">
          <Badge tone={state?.configured ? 'emerald' : 'neutral'}>{state?.configured ? 'Google جاهز' : 'بانتظار الإعداد'}</Badge>
          <Badge tone={state?.has_secret ? 'emerald' : 'neutral'}>سر محفوظ: {state?.has_secret ? 'نعم' : 'لا'}</Badge>
        </div>
      </div>
    </section>
  );
}
