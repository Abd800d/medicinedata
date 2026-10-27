import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, BadgeCheck, KeyRound, MessageCircle, ShieldAlert, Trash2, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { api } from '../lib/api';
import { Field, useToast } from '../components/ui';

/*
 * Password recovery without a mail server.
 *
 * There is deliberately no "we e-mailed you a link" here: the deployment has no SMTP, and
 * pretending otherwise would be a lie the user only discovers while locked out. The recovery
 * path that actually works from a phone: send a request on WhatsApp, the owner verifies the
 * account and issues a temporary password from the admin panel (POST /api/admin/users/:id/password).
 * The screen also states the alternative for the signed-in user (change it in the profile).
 */
export default function ForgotPassword() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');

  const supportEmail = '7a8b1d@gmail.com';
  const whatsapp = '967781733795';
  const text = encodeURIComponent(
    `${lang === 'ar' ? 'مرحبًا، أحتاج استعادة كلمة المرور في تطبيق MDA.' : 'Hello, I need to recover my MDA password.'}\n` +
    `${lang === 'ar' ? 'البريد المسجّل:' : 'Registered e-mail:'} ${email || '—'}\n` +
    (note ? `${lang === 'ar' ? 'ملاحظة:' : 'Note:'} ${note}\n` : ''),
  );

  return (
    <div className="mx-auto max-w-lg space-y-3 py-2">
      <div className="flex items-center gap-2">
        <Link to="/auth" className="btn-ghost px-2 py-1.5"><ArrowLeft className="h-4 w-4" /></Link>
        <h1 className="text-[15px] font-extrabold">{t('auth.forgot')}</h1>
      </div>

      <div className="card space-y-3 p-4">
        <p className="text-[12px] leading-6 text-ink-300">
          {lang === 'ar'
            ? 'لا يوجد بريد آلي في هذا الخادم، لذلك لا نعرض لك «أرسلنا رابطًا» لا يصلك. الطريقة التي تعمل فعلًا:'
            : 'This deployment has no outgoing mail, so there is no fake “we sent you a link”. The path that actually works:'}
        </p>

        <ol className="space-y-2 text-[12px] leading-6 text-ink-300">
          <li className="flex gap-2"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-[10px] font-black text-brand-300">1</span>
            {lang === 'ar' ? 'أرسل طلبك على واتساب (الزر أدناه) مع البريد المسجّل.' : 'Send the request on WhatsApp with your registered e-mail.'}
          </li>
          <li className="flex gap-2"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-[10px] font-black text-brand-300">2</span>
            {lang === 'ar' ? 'يتحقق المدير من ملكية الحساب ثم يصدر لك كلمة مرور مؤقتة من لوحة التحكم.' : 'The admin verifies ownership and issues a temporary password from the dashboard.'}
          </li>
          <li className="flex gap-2"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-500/15 text-[10px] font-black text-brand-300">3</span>
            {lang === 'ar' ? 'ادخل بها ثم غيّرها فورًا من «حسابي ← كلمة المرور».' : 'Sign in with it, then change it immediately in My account → Password.'}
          </li>
        </ol>

        <Field label={lang === 'ar' ? 'البريد المسجّل (يُرفق بالرسالة)' : 'Registered e-mail (attached to the message)'}>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="input" dir="ltr" placeholder="name@example.com" inputMode="email" />
        </Field>
        <Field label={lang === 'ar' ? 'ملاحظة (اختياري)' : 'Note (optional)'}>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder={lang === 'ar' ? 'مثال: حسابي باسم…' : 'e.g. my account is under…'} />
        </Field>

        <a href={`https://wa.me/${whatsapp}?text=${text}`} target="_blank" rel="noreferrer" className="btn-primary w-full">
          <MessageCircle className="h-4 w-4" />
          {lang === 'ar' ? 'إرسال الطلب على واتساب' : 'Send the request on WhatsApp'}
        </a>
        <a href={`mailto:${supportEmail}?subject=${encodeURIComponent('MDA password recovery')}&body=${text}`} className="btn-ghost w-full">
          <KeyRound className="h-4 w-4" />
          {lang === 'ar' ? `أو راسلنا بالبريد: ${supportEmail}` : `Or e-mail: ${supportEmail}`}
        </a>

        {user && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-2.5 text-[11px] leading-5 text-emerald-200">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{lang === 'ar' ? 'أنت مسجّل الدخول الآن — يمكنك تغيير كلمة المرور مباشرة من «حسابي».' : 'You are signed in — change the password directly from My account.'}</span>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[11px] leading-5 text-amber-200">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{lang === 'ar'
            ? 'لا ترسل كلمة مرورك الحالية لأي أحد — المدير لا يحتاجها ولا يطلبها أبدًا، بل يصدر كلمة مؤقتة جديدة.'
            : 'Never send your current password to anyone — the admin never needs it; a new temporary one is issued instead.'}</span>
        </div>

        <Link to="/auth" className="block text-center text-[11px] font-bold text-brand-300">{lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to sign in'}</Link>
      </div>
    </div>
  );
}

/* ------------------------------ Delete-account sheet ------------------------------ */
export function DeleteAccountCard() {
  const { user, logout, refresh } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!user) return null;
  const needsPassword = user.provider !== 'google';
  const ready = word.trim().toUpperCase() === 'DELETE' && (!needsPassword || password.length >= 1);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      try {
        await api.del('/api/auth/me', { confirm: 'DELETE', password });
      } catch (e: any) {
        /* Some proxies drop a DELETE body; the POST twin exists for exactly that. */
        if (e?.status === 400) await api.post('/api/auth/delete-account', { confirm: 'DELETE', password });
        else throw e;
      }
      logout();
      refresh();
      push(t('profile.deleted'));
      navigate('/');
    } catch (e: any) {
      setErr(e?.message || (lang === 'ar' ? 'تعذّر حذف الحساب' : 'Could not delete the account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card border-rose-500/25 p-4">
      <div className="flex items-center gap-2 text-[12.5px] font-extrabold text-rose-200">
        <AlertTriangle className="h-4 w-4" />{t('profile.deleteAccount')}
      </div>
      <p className="mt-1 text-[11px] leading-5 text-ink-400">{t('profile.deleteWarn')}</p>
      {!open ? (
        <button onClick={() => setOpen(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-1.5 text-[11.5px] font-bold text-rose-200 hover:bg-rose-500/10">
          <Trash2 className="h-3.5 w-3.5" />{lang === 'ar' ? 'أريد حذف حسابي' : 'I want to delete my account'}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <Field label={t('profile.deleteType')}>
            <input value={word} onChange={(e) => setWord(e.target.value)} className="input" dir="ltr" placeholder="DELETE" autoCapitalize="characters" />
          </Field>
          {needsPassword && (
            <Field label={t('profile.currentPassword')}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="••••••••" />
            </Field>
          )}
          {err && <p className="rounded-lg bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">{err}</p>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={!ready || busy} className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-40">
              {busy ? t('profile.deleting') : t('profile.deleteConfirmBtn')}
            </button>
            <button onClick={() => { setOpen(false); setWord(''); setPassword(''); setErr(null); }} className="btn-ghost px-3 py-2 text-[11.5px]"><X className="h-3.5 w-3.5" />{t('common.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
