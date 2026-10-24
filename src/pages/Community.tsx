import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Briefcase, ChevronLeft, ChevronRight, Globe2, Lock, MessageCircle, Plus, Send, ShieldQuestion, Sparkles, Users } from 'lucide-react';
import { useApi, invalidate } from '../lib/useApi';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, EmptyState, Field, Modal, PageLoader, TextArea, useToast } from '../components/ui';
import { timeAgo, cx } from '../lib/utils';

type Thread = {
  id: number; subject: string; category: string; status: string; is_public: number; messages_count: number;
  last_message?: string; author_name?: string; author_avatar?: string; updated_at: string; user_id?: number;
};

export default function Community() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data: threads, loading, reload } = useApi<Thread[]>('/api/community/threads', undefined, { enabled: !!user });
  const { data: stats } = useApi<{ threads: number; jobs: number; users: number }>('/api/community/stats');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: '', body: '', is_public: true });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user) { push(t('common.loginRequired'), 'info'); return; }
    if (!form.subject.trim() || !form.body.trim()) { push(t('common.requiredField'), 'error'); return; }
    setBusy(true);
    try {
      const res = await api.post<{ id: number }>('/api/community/threads', { ...form, is_public: form.is_public ? 1 : 0 });
      invalidate('/api/community/threads');
      setOpen(false); setForm({ subject: '', body: '', is_public: true }); reload();
      push('تم نشر الموضوع');
      if (res?.id) navigate(`/community/${res.id}`);
    } catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero page-hero-emerald p-5 text-white">
        <div className="flex items-center gap-2"><Users className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('community.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">{lang === 'ar' ? 'اسأل عن دواء أو مشكلة في التطبيق، وشارك الخبرات مع الصيادلة والمستخدمين. ردود الإدارة تظهر للجميع.' : 'Ask about a medicine or app issue and share experience with pharmacists. Admin replies are public.'}</p>
        <div className="mt-3 flex gap-2 text-[10.5px] font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{stats?.threads ?? 0} {lang === 'ar' ? 'موضوع' : 'threads'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{stats?.users ?? 0} {lang === 'ar' ? 'عضو' : 'members'}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1">{stats?.jobs ?? 0} {lang === 'ar' ? 'وظيفة' : 'jobs'}</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => user ? setOpen(true) : push(t('common.loginRequired'), 'info')} className="group flex items-center gap-3 rounded-2xl border border-brand-400/30 bg-brand-500/10 p-3.5 text-start transition hover:border-brand-400/60 hover:bg-brand-500/15">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-grad text-white shadow-glow"><Plus className="h-5 w-5" /></span>
          <div><div className="text-[12.5px] font-bold text-white">{t('community.newThread')}</div><div className="text-[10.5px] text-brand-200/70">{t('community.board')}</div></div>
        </button>
        <Link to="/jobs" className="group flex items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-start transition hover:border-amber-400/60 hover:bg-amber-500/15">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-ink-950 shadow-tile"><Briefcase className="h-5 w-5" /></span>
          <div><div className="text-[12.5px] font-bold text-white">{t('jobs.title')}</div><div className="text-[10.5px] text-amber-200/70">{t('jobs.subtitle')}</div></div>
        </Link>
      </div>

      {!user && (
        <div className="card flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-ink-300"><Lock className="h-4 w-4" />{t('common.loginRequired')}</div>
          <Link to="/auth" className="btn-primary px-3 py-2 text-[11.5px]">{t('common.login')}</Link>
        </div>
      )}

      {loading && <PageLoader />}
      {user && threads?.length === 0 && <EmptyState icon={<MessageCircle className="h-6 w-6" />} title={t('community.noThreads')} action={<button onClick={() => setOpen(true)} className="btn-primary"><Plus className="h-4 w-4" />{t('community.newThread')}</button>} />}

      <div className="space-y-2">
        {(threads || []).map((th) => (
          <Link key={th.id} to={`/community/${th.id}`} className="card block p-3.5 transition hover:border-brand-400/40 hover:shadow-glow">
            <div className="flex items-start gap-3">
              <Avatar name={th.author_name} src={th.author_avatar} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h3 className="line-clamp-1 text-[13px] font-bold text-white">{th.subject}</h3>
                  {th.is_public ? <Globe2 className="h-3 w-3 shrink-0 text-emerald-300" /> : <Lock className="h-3 w-3 shrink-0 text-ink-400" />}
                </div>
                <p className="line-clamp-1 text-[11px] text-ink-500">{th.last_message || '—'}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-400">
                  <span className="font-semibold text-ink-500">{th.author_name || '—'}</span>
                  <span>·</span><span>{timeAgo(th.updated_at, lang)}</span>
                  <span>·</span><span>{th.messages_count} {t('community.replies')}</span>
                  <Badge tone={th.status === 'open' ? 'amber' : 'emerald'}>{th.status === 'open' ? 'open' : th.status}</Badge>
                </div>
              </div>
              <ChevronLeft className="mt-2 h-4 w-4 text-ink-300 rtl:block ltr:hidden" />
              <ChevronRight className="mt-2 hidden h-4 w-4 text-ink-300 ltr:block" />
            </div>
          </Link>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('community.newThread')} footer={
        <>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={submit} disabled={busy} className="btn-primary">{busy ? '…' : <><Send className="h-4 w-4" />{t('community.post')}</>}</button>
        </>
      }>
        <div className="space-y-3">
          <Field label={t('community.subject')} required><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="input" placeholder={lang === 'ar' ? 'مثال: بديل دواء غير متوفر' : 'e.g. Alternative for an unavailable medicine'} /></Field>
          <Field label={t('community.message')} required><TextArea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <label className="flex items-center justify-between rounded-xl border border-white/[.08] bg-white/[.05] px-3 py-2.5">
            <span className="flex items-center gap-2 text-[11.5px] font-semibold text-ink-300">{form.is_public ? <Globe2 className="h-4 w-4 text-emerald-300" /> : <Lock className="h-4 w-4" />}{t('community.public')}</span>
            <input type="checkbox" checked={form.is_public} onChange={(e) => setForm({ ...form, is_public: e.target.checked })} className="h-4 w-4 accent-brand-700" />
          </label>
          <div className="flex items-start gap-2 rounded-xl border border-sky-400/25 bg-sky-500/10 p-2.5 text-[10.5px] leading-5 text-sky-200"><ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0" />{lang === 'ar' ? 'لا تشارك بيانات شخصية حساسة. الاستفسارات الطبية الطارئة يجب أن تُوجه للطبيب.' : 'Avoid sensitive personal data. Urgent medical issues need a clinician.'}</div>
        </div>
      </Modal>
    </div>
  );
}
