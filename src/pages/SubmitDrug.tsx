import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Clock, FilePlus2, Loader2, Lock, Search, Send, ShieldCheck, XCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { Badge, Field, PageLoader, Select, TextArea, useToast } from '../components/ui';
import { timeAgo } from '../lib/utils';

export default function SubmitDrug() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const { data: systems } = useApi<any[]>('/api/catalog/systems');
  const { data: mine, loading, reload } = useApi<any[]>('/api/submissions/mine', undefined, { enabled: !!user });
  const [form, setForm] = useState({ name_en: '', name_ar: '', system_id: '', company: '', strength: '', form: '', country: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <div className="rounded-3xl bg-gradient-to-br from-brand-700 via-teal-700 to-emerald-800 p-6 text-center text-white">
          <FilePlus2 className="mx-auto mb-2 h-8 w-8" />
          <h1 className="text-[19px] font-extrabold">{t('submit.title')}</h1>
          <p className="mt-1 text-[11px] leading-6 text-white/75">{t('submit.subtitle')}</p>
        </div>
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <Lock className="h-7 w-7 text-ink-300" />
          <p className="text-[12px] text-ink-500">{t('common.loginRequired')}</p>
          <Link to="/auth" className="btn-primary">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name_en.trim()) { push(t('common.requiredField'), 'error'); return; }
    setBusy(true);
    try {
      await api.post('/api/submissions', form);
      setForm({ name_en: '', name_ar: '', system_id: '', company: '', strength: '', form: '', country: '', notes: '' });
      setDone(true); reload(); push(t('submit.sent'));
    } catch (err: any) { push(err.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-3xl bg-gradient-to-br from-brand-700 via-teal-700 to-emerald-800 p-5 text-white">
        <div className="flex items-center gap-2"><FilePlus2 className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('submit.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">{t('submit.subtitle')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9.5px]">
          <span className="rounded-full bg-white/15 px-2 py-0.5">{t('submit.b1')}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">{t('submit.b2')}</span>
          <span className="rounded-full bg-white/15 px-2 py-0.5">{t('submit.b3')}</span>
        </div>
      </div>

      {done && (
        <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-[11px] leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('submit.done')}</span>
        </div>
      )}

      <form onSubmit={submit} className="card space-y-3 p-4">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Field label={t('submit.nameEn')} required><input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} className="input" dir="ltr" placeholder="e.g. remdesivir" /></Field>
          <Field label={t('submit.nameAr')}><input value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} className="input" dir="auto" /></Field>
          <Field label={t('submit.system')}>
            <Select value={form.system_id} onChange={(e) => set('system_id', e.target.value)}>
              <option value="">—</option>{(systems || []).map((s) => <option key={s.id} value={s.id}>{lang === 'ar' ? s.name_ar : s.name_en}</option>)}
            </Select>
          </Field>
          <Field label={t('submit.company')}><input value={form.company} onChange={(e) => set('company', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('submit.strength')}><input value={form.strength} onChange={(e) => set('strength', e.target.value)} className="input" dir="ltr" placeholder="500 mg" /></Field>
          <Field label={t('submit.form')}><input value={form.form} onChange={(e) => set('form', e.target.value)} className="input" placeholder="Tablet / Syrup" /></Field>
          <Field label={t('submit.country')}><input value={form.country} onChange={(e) => set('country', e.target.value)} className="input" /></Field>
          <Field label={t('submit.notes')}><input value={form.notes} onChange={(e) => set('notes', e.target.value)} className="input" /></Field>
        </div>
        <Field label={t('submit.details')} hint={t('submit.detailsHint')}>
          <TextArea value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder={lang === 'ar' ? 'الاستخدامات، المصادر، ملاحظات…' : 'Uses, sources, notes…'} />
        </Field>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 rtl:-scale-x-100" />}{t('submit.send')}
        </button>
        <p className="flex items-start gap-1.5 text-[9.5px] leading-5 text-ink-400"><ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />{t('submit.review')}</p>
      </form>

      <section>
        <h2 className="section-title mb-2 flex items-center gap-1.5"><Clock className="h-4 w-4 text-ink-400" />{t('submit.mine')}</h2>
        {loading && !mine && <PageLoader />}
        {mine?.length === 0 && <p className="card p-4 text-[11px] text-ink-400">{t('submit.none')}</p>}
        <div className="space-y-1.5">
          {(mine || []).map((s) => (
            <div key={s.id} className="card flex items-center gap-2 p-2.5">
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.status === 'approved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40' : s.status === 'rejected' ? 'bg-rose-50 text-rose-500 dark:bg-rose-950/40' : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40'}`}>
                {s.status === 'approved' ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.status === 'rejected' ? <XCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11.5px] font-bold">{s.name_en} {s.strength || ''}</div>
                <div className="truncate text-[9.5px] text-ink-400">{[s.name_ar, s.company, s.system_ar || s.system_en].filter(Boolean).join(' · ') || '—'}</div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <Badge tone={s.status === 'approved' ? 'emerald' : s.status === 'rejected' ? 'rose' : 'amber'}>{t(`submit.status.${s.status}`)}</Badge>
                <span className="text-[8.5px] text-ink-400">{timeAgo(s.created_at, lang)}</span>
              </div>
              {s.status === 'approved' && s.created_drug_id && <Link to={`/drugs/${s.created_drug_id}`} className="text-[9px] font-bold text-brand-700 dark:text-brand-300"><Search className="h-3 w-3" /></Link>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
