import { useState } from 'react';
import { Briefcase, Building2, MapPin, Phone, Plus, Search, Trash2, UserRound, Mail, Clock } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Badge, EmptyState, Field, Modal, PageLoader, Select, TextArea, useToast } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';

type Job = {
  id: number; type: 'seeker' | 'offer'; title: string; description?: string; specialty?: string; city?: string;
  phone?: string; email?: string; author_name?: string; user_id?: number; created_at: string; status: string;
};

export default function Jobs() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const [filter, setFilter] = useState<'all' | 'seeker' | 'offer'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'seeker', title: '', description: '', specialty: '', city: '', phone: '', email: '' });
  const { data, loading, reload } = useApi<Job[]>('/api/community/jobs', { type: filter === 'all' ? undefined : filter, q: q || undefined });
  const [busy, setBusy] = useState(false);

  const post = async () => {
    if (!user) { push(t('common.loginRequired'), 'info'); return; }
    if (!form.title.trim()) { push(t('common.requiredField'), 'error'); return; }
    setBusy(true);
    try {
      await api.post('/api/community/jobs', form);
      setOpen(false); setForm({ type: 'seeker', title: '', description: '', specialty: '', city: '', phone: '', email: '' }); reload(); push('تم نشر الإعلان');
    } catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api.del(`/api/community/jobs/${id}`); reload(); push('تم الحذف'); }
    catch { push(t('common.error'), 'error'); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero page-hero-amber p-5 text-white">
        <div className="flex items-center gap-2"><Briefcase className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('jobs.title')}</h1></div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/80">{t('jobs.subtitle')}</p>
      </div>

      <button onClick={() => user ? setOpen(true) : push(t('common.loginRequired'), 'info')} className="btn-primary w-full"><Plus className="h-4 w-4" />{t('jobs.post')}</button>

      <div className="flex items-center gap-2 rounded-2xl border p-1.5 border-white/[.08] bg-ink-900">
        <Search className="ms-1.5 h-4 w-4 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={lang === 'ar' ? 'ابحث في الوظائف…' : 'Search jobs…'} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12.5px] outline-none" />
      </div>
      <div className="flex gap-1.5">
        {[{ id: 'all', label: t('jobs.all') }, { id: 'seeker', label: t('jobs.seekers') }, { id: 'offer', label: t('jobs.offers') }].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id as any)} className={cx('chip', filter === f.id && 'chip-active')}>{f.label}</button>
        ))}
      </div>

      {loading && <PageLoader />}
      {data?.length === 0 && <EmptyState icon={<Briefcase className="h-6 w-6" />} title={t('jobs.empty')} />}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {(data || []).map((j) => (
          <div key={j.id} className="card relative overflow-hidden p-4 transition hover:border-brand-400/40">
            <div className="mb-1.5 flex items-center justify-between">
              <Badge tone={j.type === 'seeker' ? 'sky' : 'emerald'}>
                {j.type === 'seeker' ? <UserRound className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                {j.type === 'seeker' ? t('jobs.seekers') : t('jobs.offers')}
              </Badge>
              <span className="inline-flex items-center gap-1 text-[9.5px] text-ink-400"><Clock className="h-2.5 w-2.5" />{timeAgo(j.created_at, lang)}</span>
            </div>
            <h3 className="text-[13.5px] font-extrabold text-white">{j.title}</h3>
            {j.description && <p className="mt-1 line-clamp-3 whitespace-pre-line text-[11px] leading-5 text-ink-500">{j.description}</p>}
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] text-ink-500">
              {j.specialty && <span className="chip">{j.specialty}</span>}
              {j.city && <span className="chip"><MapPin className="h-2.5 w-2.5" />{j.city}</span>}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2 text-[11px]">
                {j.phone && <a href={`tel:${j.phone}`} className="inline-flex items-center gap-1 font-semibold text-brand-300"><Phone className="h-3 w-3" />{j.phone}</a>}
                {j.email && <a href={`mailto:${j.email}`} className="inline-flex items-center gap-1 font-semibold text-brand-300"><Mail className="h-3 w-3" />{j.email}</a>}
              </div>
              {(j.user_id === user?.id || user?.role === 'admin') && (
                <button onClick={() => remove(j.id)} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
            <div className="mt-1.5 text-[10px] text-ink-400">{lang === 'ar' ? 'نُشر بواسطة' : 'Posted by'} {j.author_name || '—'}</div>
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t('jobs.post')} footer={
        <>
          <button onClick={() => setOpen(false)} className="btn-ghost">{t('common.cancel')}</button>
          <button onClick={post} disabled={busy} className="btn-primary">{busy ? '…' : t('community.post')}</button>
        </>
      }>
        <div className="space-y-3">
          <Field label={lang === 'ar' ? 'نوع الإعلان' : 'Listing type'}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="seeker">{t('jobs.seekers')}</option>
              <option value="offer">{t('jobs.offers')}</option>
            </Select>
          </Field>
          <Field label={t('community.jobTitle')} required><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder={lang === 'ar' ? 'صيدلي / مساعد صيدلي / مندوب علمي' : 'Pharmacist / assistant / medical rep'} /></Field>
          <Field label={t('community.jobDesc')}><TextArea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('community.specialty')}><input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} className="input" /></Field>
            <Field label={t('community.city')}><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input" /></Field>
            <Field label={t('auth.phone')}><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" dir="ltr" /></Field>
            <Field label={t('auth.email')}><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" dir="ltr" /></Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
