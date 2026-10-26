/*
 * Admin → Play upload key.
 *
 * Google Play rejects unsigned bundles, and `keytool` needs a JDK — which is exactly what
 * a phone does not have. This panel asks the server to build a PKCS#12 upload keystore in
 * memory (RSA-2048, 30 years, 3DES bags) and hands it back once, so the owner can add the
 * four GitHub secrets from a phone. Nothing is stored: the key exists only in the response.
 */
import { useState } from 'react';
import {
  AlertTriangle, Check, Copy, Download, KeyRound, Loader2, Lock, ShieldCheck, Smartphone, XCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useToast } from '../../components/ui';
import { cx } from '../../lib/utils';

type Result = {
  filename: string; base64: string; bytes: number; alias: string;
  sha256: string; sha1: string; subject: string; not_after: string; password: string;
  warning_ar: string;
};

const randomPassword = () => {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '').slice(0, 24);
};

export default function PlayKeystore() {
  const { push } = useToast();
  const [password, setPassword] = useState('');
  const [alias, setAlias] = useState('mda-upload');
  const [cn, setCn] = useState('MDA Medicine Data');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      push(`نُسخ ${label}`, 'success');
    } catch {
      push('تعذر النسخ — انسخها يدويًا', 'error');
    }
  };

  const generate = async () => {
    if (password.length < 12) { setError('كلمة المرور يجب أن تكون 12 حرفًا على الأقل'); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post<Result>('/api/admin/keystore', { password, alias, common_name: cn });
      setCreated(r);
      push('أُنشئ المفتاح — نزّله الآن', 'success');
    } catch (e: any) {
      setError(e?.message || 'تعذر إنشاء المفتاح');
    } finally { setBusy(false); }
  };

  const download = () => {
    if (!created) return;
    const binary = atob(created.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/x-pkcs12' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = created.filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const secrets = created ? [
    { name: 'ANDROID_KEYSTORE_BASE64', value: created.base64, note: 'محتوى الملف بعد base64' },
    { name: 'ANDROID_KEYSTORE_PASSWORD', value: created.password, note: 'كلمة مرور المخزن' },
    { name: 'ANDROID_KEY_ALIAS', value: created.alias, note: 'اسم المفتاح داخل المخزن' },
    { name: 'ANDROID_KEY_PASSWORD', value: created.password, note: 'كلمة مرور المفتاح' },
  ] : [];

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 p-3.5 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20"><KeyRound className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-extrabold">مفتاح رفع Google Play (upload key)</div>
          <div className="truncate text-[10.5px] text-white/75">يُنشئ ملف PKCS#12 جاهزًا لبناء AAB موقّع — من الهاتف، دون Java</div>
        </div>
      </div>

      <div className="space-y-3 p-3.5">
        <p className="text-[11px] leading-6 text-ink-300">
          Google Play يرفض الحِزم غير الموقّعة. أنشئ مفتاحك هنا مرة واحدة، ثم أضف القيم الأربع كأسرار
          (secrets) في مستودع GitHub؛ بعدها كل وسم <code className="rounded bg-white/[.06] px-1">v*</code> يُنتج
          <code className="mx-1 rounded bg-white/[.06] px-1">.aab</code> موقّعًا في صفحة الإصدارات.
        </p>

        <div className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-2.5 text-[10.5px] leading-5 text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            المفتاح لا يُحفظ على الخادم: يُعاد مرة واحدة فقط. نزّل الملف واحفظ كلمة المرور في مكانين.
            إن فقدتهما اطلب «إعادة تعيين مفتاح الرفع» من Play Console (ممكن، لكنه تأخير).
          </span>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">كلمة مرور المخزن (12+ حرفًا)</span>
            <div className="flex gap-1.5">
              <input
                type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                dir="ltr" autoComplete="off"
                className="input flex-1 font-mono text-[11px]"
                placeholder="StrongPass-2026!"
              />
              <button type="button" onClick={() => setPassword(randomPassword())} className="btn-ghost shrink-0 px-2 py-1 text-[10.5px]">
                <Lock className="h-3.5 w-3.5" /> عشوائي
              </button>
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">اسم المفتاح (alias)</span>
            <input value={alias} onChange={(e) => setAlias(e.target.value)} dir="ltr"
              className="input w-full font-mono text-[11px]" placeholder="mda-upload" />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[10.5px] font-bold text-ink-400">الاسم في الشهادة (CN)</span>
            <input value={cn} onChange={(e) => setCn(e.target.value)}
              className="input w-full text-[11px]" placeholder="MDA Medicine Data" />
          </label>
        </div>

        <button onClick={generate} disabled={busy || password.length < 12}
          className={cx('btn-primary w-full py-2.5 text-[12px]', (busy || password.length < 12) && 'opacity-60')}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {busy ? 'جارٍ توليد مفتاح RSA-2048…' : 'إنشاء مفتاح الرفع'}
        </button>

        {error && (
          <div className="flex items-start gap-2 rounded-xl bg-rose-500/10 p-2.5 text-[11px] text-rose-200">
            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {created && (
          <div className="space-y-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/[.07] p-3">
            <div className="flex items-center gap-1.5 text-[12px] font-extrabold text-emerald-200">
              <Check className="h-4 w-4" /> أُنشئ المفتاح — نزّله الآن قبل مغادرة الصفحة
            </div>

            <div className="grid gap-1.5 text-[10px] sm:grid-cols-2">
              <div className="rounded-lg bg-black/25 p-2 font-mono text-ink-300" dir="ltr">file: {created.filename} · {created.bytes} B</div>
              <div className="rounded-lg bg-black/25 p-2 font-mono text-ink-300" dir="ltr">alias: {created.alias}</div>
              <div className="rounded-lg bg-black/25 p-2 font-mono text-ink-300 sm:col-span-2 break-all" dir="ltr">SHA-256: {created.sha256}</div>
              <div className="rounded-lg bg-black/25 p-2 font-mono text-ink-300 sm:col-span-2 break-all" dir="ltr">SHA-1: {created.sha1}</div>
              <div className="rounded-lg bg-black/25 p-2 font-mono text-ink-300 sm:col-span-2" dir="ltr">valid until {created.not_after} · {created.subject}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={download} className="btn-primary px-3 py-1.5 text-[11px]"><Download className="h-3.5 w-3.5" /> تنزيل {created.filename}</button>
              <button onClick={() => copy(created.base64, 'base64')} className="btn-ghost px-3 py-1.5 text-[11px]"><Copy className="h-3.5 w-3.5" /> نسخ base64</button>
              <button onClick={() => copy(created.password, 'كلمة المرور')} className="btn-ghost px-3 py-1.5 text-[11px]"><Lock className="h-3.5 w-3.5" /> نسخ كلمة المرور</button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10.5px] font-bold text-ink-300">أضف هذه الأسرار في GitHub (Settings → Secrets → Actions):</div>
              {secrets.map((s) => (
                <div key={s.name} className="flex items-center gap-2 rounded-lg bg-black/25 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] text-emerald-200" dir="ltr">{s.name}</div>
                    <div className="text-[9.5px] text-ink-500">{s.note}</div>
                  </div>
                  <button onClick={() => copy(s.value, s.name)} className="btn-ghost shrink-0 px-2 py-1 text-[10px]"><Copy className="h-3 w-3" /> نسخ</button>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-1.5 text-[10px] leading-5 text-ink-400">
              <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                ثم من التطبيق أو من GitHub: أنشئ وسم <code className="rounded bg-white/[.06] px-1">v1.8.0</code> →
                سير عمل Android يبني <code className="rounded bg-white/[.06] px-1">app-release.apk</code> و
                <code className="mx-1 rounded bg-white/[.06] px-1">app-release.aab</code> ويوقّعهما بمفتاحك.
              </span>
            </div>
          </div>
        )}

        <div className="flex items-start gap-1.5 text-[10px] leading-5 text-ink-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            يُولَّد المفتاح داخل عملية الخادم بمكتبة <code className="rounded bg-white/[.06] px-1">node-forge</code> (RSA-2048، شهادة توقيع كود 30 سنة)،
            ولا يُسجَّل في قاعدة البيانات ولا في سجلات التدقيق سوى بصمته. الطلب مسجّل في سجل التدقيق باسمك.
          </span>
        </div>
      </div>
    </section>
  );
}
