import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Globe2, Lock, Send, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { Avatar, Badge, ErrorState, PageLoader, useToast } from '../components/ui';
import { cx, timeAgo } from '../lib/utils';

export default function ThreadDetail() {
  const { id } = useParams();
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<any>(`/api/community/threads/${id}`, undefined, { enabled: !!user });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return <div className="card p-5 text-center"><div className="mb-2 text-sm font-bold">{t('common.loginRequired')}</div><Link to="/auth" className="btn-primary">{t('common.login')}</Link></div>;
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try { await api.post(`/api/community/threads/${id}/messages`, { body }); setBody(''); reload(); }
    catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  const setStatus = async (status: string) => {
    try { await api.patch(`/api/community/threads/${id}`, { status }); reload(); push('تم التحديث'); }
    catch { push(t('common.error'), 'error'); }
  };

  const remove = async () => {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api.del(`/api/community/threads/${id}`); push('تم الحذف'); navigate('/community'); }
    catch { push(t('common.error'), 'error'); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-ink-400">
              {data.is_public ? <Globe2 className="h-3 w-3 text-emerald-600" /> : <Lock className="h-3 w-3" />}
              <span>{data.is_public ? t('community.public') : t('community.private')}</span>
              <span>·</span><span>{timeAgo(data.created_at, lang)}</span>
            </div>
            <h1 className="text-[17px] font-extrabold leading-snug text-ink-900 dark:text-white">{data.subject}</h1>
            <div className="mt-1 flex items-center gap-2 text-[10.5px] text-ink-500"><Avatar name={data.author_name} src={data.author_avatar} size={20} />{data.author_name}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge tone={data.status === 'open' ? 'amber' : 'emerald'}>{data.status}</Badge>
            {user?.role === 'admin' && <button onClick={remove} className="icon-btn h-8 w-8 text-rose-500"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
        {user?.role === 'admin' && (
          <div className="mt-3 flex gap-1.5">
            {['open', 'answered', 'closed'].map((s) => <button key={s} onClick={() => setStatus(s)} className={cx('chip', data.status === s && 'chip-active')}>{s}</button>)}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {data.messages?.map((m: any) => {
          const mine = m.user_id === user.id;
          return (
            <div key={m.id} className={cx('flex gap-2', mine ? 'flex-row-reverse' : '')}>
              <Avatar name={m.author_name} src={m.author_avatar} size={30} />
              <div className={cx('max-w-[84%] rounded-2xl px-3.5 py-2.5', mine ? 'bg-brand-700 text-white' : 'border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900')}>
                <div className={cx('mb-1 flex items-center gap-1.5 text-[9.5px] font-bold', mine ? 'text-white/70' : 'text-ink-400')}>
                  {m.is_staff ? <span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1 py-0.5"><ShieldCheck className="h-2.5 w-2.5" />{lang === 'ar' ? 'الإدارة' : 'Admin'}</span> : <UserRound className="h-2.5 w-2.5" />}
                  <span>{m.author_name}</span><span>·</span><span>{timeAgo(m.created_at, lang)}</span>
                </div>
                <p className="whitespace-pre-line text-[12px] leading-6">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-[76px] z-20 pt-2">
        <div className="flex items-end gap-2 rounded-2xl border border-ink-200 bg-white p-1.5 shadow-card dark:border-ink-800 dark:bg-ink-900">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder={t('community.reply')} className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[12.5px] outline-none" />
          <button onClick={send} disabled={busy || !body.trim()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white disabled:opacity-40"><Send className="h-4 w-4 rtl:-scale-x-100" /></button>
        </div>
      </div>
    </div>
  );
}
