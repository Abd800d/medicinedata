import { useEffect, useState } from 'react';
import {
  Briefcase, CheckCircle2, Loader2, Lock, Mail, MapPin, MessageSquare, Phone, Search, ShieldCheck, Send,
  Trash2, UserRound, Users, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Avatar, Badge, Field, Modal, PageLoader, Select, TextArea, useToast } from '../../components/ui';
import { cx, dateFmt, timeAgo, useDebounced } from '../../lib/utils';

export default function People() {
  const [tab, setTab] = useState<'users' | 'threads' | 'jobs'>('users');
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-xl p-1 bg-white/[.05]">
        {([['users', 'المستخدمون', Users], ['threads', 'الرسائل', MessageSquare], ['jobs', 'الوظائف', Briefcase]] as const).map(([k, label, Icon]) => (
          <button key={k} onClick={() => setTab(k)} className={cx('flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-bold', tab === k ? 'bg-brand-grad text-white shadow-glow' : 'text-ink-500')}>
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
      </div>
      {tab === 'users' && <UsersPanel />}
      {tab === 'threads' && <ThreadsPanel />}
      {tab === 'jobs' && <JobsPanel />}
    </div>
  );
}

function UsersPanel() {
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const { data, reload, loading } = useApi<any[]>('/api/admin/users', { q: query || undefined });
  const { push } = useToast();
  const [pwUser, setPwUser] = useState<any>(null);
  const [pw, setPw] = useState('');

  const patch = async (u: any, body: any) => {
    try { await api.patch(`/api/admin/users/${u.id}`, body); reload(); push('تم التحديث'); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  const remove = async (u: any) => {
    if (!confirm(`حذف المستخدم ${u.name} وكل بياناته؟`)) return;
    try { await api.del(`/api/admin/users/${u.id}`); reload(); push('تم الحذف'); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  const savePw = async () => {
    try { await api.post(`/api/admin/users/${pwUser.id}/password`, { password: pw }); push('تم تغيير كلمة المرور'); setPwUser(null); setPw(''); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 border-white/[.08] bg-ink-900">
        <Search className="h-3.5 w-3.5 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو البريد…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
      </div>
      {loading && !data && <PageLoader />}
      <div className="text-[11px] text-ink-400">{data?.length || 0} مستخدم</div>
      <div className="space-y-1.5">
        {(data || []).map((u) => (
          <div key={u.id} className="card p-2.5">
            <div className="flex items-center gap-2">
              <Avatar name={u.name} src={u.avatar} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12px] font-bold">{u.name}</span>
                  {u.role === 'admin' && <Badge tone="amber">admin</Badge>}
                  {u.role === 'pharmacist' && <Badge tone="emerald">صيدلي</Badge>}
                  {!u.active && <Badge tone="rose">موقوف</Badge>}
                </div>
                <div className="truncate text-[10px] text-ink-400" dir="ltr">{u.email}</div>
                <div className="text-[9.5px] text-ink-300">{dateFmt(u.created_at)} · {u.threads} موضوع · {u.prescriptions} وصفة</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <select value={u.role} onChange={(e) => patch(u, { role: e.target.value })} className="rounded-lg border px-1 py-1 text-[10px] font-bold border-white/[.09] bg-white/[.05]">
                  <option value="user">user</option>
                  <option value="pharmacist">pharmacist · صيدلي</option>
                  <option value="admin">admin</option>
                </select>
                <button onClick={() => patch(u, { active: u.active ? 0 : 1 })} className={cx('icon-btn h-7 w-7', u.active ? 'text-emerald-300' : 'text-ink-400')} title={u.active ? 'تعطيل' : 'تفعيل'}>{u.active ? <CheckCircle2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}</button>
                <button onClick={() => { setPwUser(u); setPw(''); }} className="icon-btn h-7 w-7 text-sky-300"><Lock className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(u)} className="icon-btn h-7 w-7 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {pwUser && (
        <Modal open onClose={() => setPwUser(null)} title={`كلمة مرور جديدة: ${pwUser.name}`} footer={<>
          <button onClick={() => setPwUser(null)} className="btn-ghost">إلغاء</button>
          <button onClick={savePw} disabled={pw.length < 6} className="btn-primary">تعيين</button>
        </>}>
          <Field label="كلمة المرور الجديدة" hint="6 أحرف على الأقل"><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} className="input" dir="ltr" /></Field>
        </Modal>
      )}
    </div>
  );
}

function ThreadsPanel() {
  const [status, setStatus] = useState('');
  const { data, reload, loading } = useApi<any[]>('/api/admin/threads', { status: status || undefined });
  const { push } = useToast();
  const [openId, setOpenId] = useState<number | null>(null);
  const [thread, setThread] = useState<any>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const open = async (id: number) => {
    setOpenId(id); setThread(null); setReply('');
    try { setThread(await api.get<any>(`/api/admin/threads/${id}`)); } catch { push('خطأ', 'error'); }
  };
  const send = async (publish: boolean) => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/threads/${openId}/reply`, { body: reply, publish });
      setReply(''); setThread(await api.get<any>(`/api/admin/threads/${openId}`)); reload(); push(publish ? 'تم الرد ونشره للجميع' : 'تم الرد');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };
  const setStatusOf = async (id: number, s: string) => {
    try { await api.patch(`/api/admin/threads/${id}`, { status: s }); reload(); if (openId === id) setThread(await api.get<any>(`/api/admin/threads/${id}`)); }
    catch { push('خطأ', 'error'); }
  };
  const remove = async (id: number) => {
    if (!confirm('حذف الموضوع وكل ردوده؟')) return;
    try { await api.del(`/api/admin/threads/${id}`); setOpenId(null); setThread(null); reload(); push('تم الحذف'); }
    catch { push('خطأ', 'error'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        {[['', 'الكل'], ['open', 'مفتوح'], ['answered', 'تم الرد'], ['closed', 'مغلق']].map(([v, label]) => (
          <button key={v} onClick={() => setStatus(v)} className={cx('chip', status === v && 'chip-active')}>{label}</button>
        ))}
      </div>
      {loading && !data && <PageLoader />}
      <div className="space-y-1.5">
        {(data || []).map((t) => (
          <button key={t.id} onClick={() => open(t.id)} className="card flex w-full items-center gap-2 p-2.5 text-start">
            <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', t.is_public ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[.05] text-ink-400')}><MessageSquare className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-bold">{t.subject}</div>
              <div className="truncate text-[10px] text-ink-400">{t.author_name} · {timeAgo(t.updated_at)} · {t.messages} رد</div>
            </div>
            <Badge tone={t.status === 'open' ? 'amber' : t.status === 'closed' ? 'neutral' : 'emerald'}>{t.status}</Badge>
          </button>
        ))}
        {data?.length === 0 && <p className="card p-4 text-[11px] text-ink-400">لا توجد رسائل في هذا التصنيف.</p>}
      </div>

      {openId && (
        <Modal open onClose={() => { setOpenId(null); setThread(null); }} wide title={thread?.subject || 'الموضوع'}>
          {!thread ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-400" /> : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-ink-400">
                <Badge tone={thread.is_public ? 'emerald' : 'neutral'}>{thread.is_public ? 'مرئي للجميع' : 'خاص'}</Badge>
                <span>{thread.author_name} · {thread.author_email}</span>
                <div className="ms-auto flex gap-1">
                  {['open', 'answered', 'closed'].map((s) => <button key={s} onClick={() => setStatusOf(thread.id, s)} className={cx('rounded-md px-1.5 py-0.5 text-[9.5px] font-bold', thread.status === s ? 'bg-white/20 text-white' : 'bg-white/[.05] text-ink-400')}>{s}</button>)}
                  <button onClick={() => remove(thread.id)} className="rounded-md px-1.5 py-0.5 text-[9.5px] font-bold text-rose-300 bg-rose-500/15"><Trash2 className="h-2.5 w-2.5" /></button>
                </div>
              </div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-xl p-2 bg-white/[.055]">
                {(thread.messages || []).map((m: any) => (
                  <div key={m.id} className={cx('rounded-lg px-2.5 py-1.5', m.is_staff ? 'bg-brand-700 text-white' : 'bg-white/[.04]')}>
                    <div className={cx('mb-0.5 text-[8.5px] font-bold', m.is_staff ? 'text-white/70' : 'text-ink-400')}>{m.author_name} {m.is_staff ? '· الإدارة' : ''} · {timeAgo(m.created_at)}</div>
                    <p className="whitespace-pre-line text-[11px] leading-5">{m.body}</p>
                  </div>
                ))}
              </div>
              <TextArea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="اكتب الرد…" className="min-h-[80px]" />
              <div className="flex justify-end gap-2">
                <button onClick={() => send(false)} disabled={busy || !reply.trim()} className="btn-ghost text-[11px]">رد خاص</button>
                <button onClick={() => send(true)} disabled={busy || !reply.trim()} className="btn-primary text-[11px]"><Send className="h-3.5 w-3.5" />رد ونشر للجميع</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function JobsPanel() {
  const { data, reload, loading } = useApi<any[]>('/api/admin/jobs');
  const { push } = useToast();
  const toggle = async (j: any) => {
    try { await api.patch(`/api/admin/jobs/${j.id}`, { status: j.status === 'published' ? 'hidden' : 'published' }); reload(); push('تم التحديث'); }
    catch { push('خطأ', 'error'); }
  };
  const remove = async (j: any) => {
    if (!confirm('حذف الإعلان؟')) return;
    try { await api.del(`/api/admin/jobs/${j.id}`); reload(); push('تم الحذف'); } catch { push('خطأ', 'error'); }
  };
  return (
    <div className="space-y-2">
      {loading && !data && <PageLoader />}
      {(data || []).map((j) => (
        <div key={j.id} className="card flex items-center gap-2 p-2.5">
          <Briefcase className="h-4 w-4 text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11.5px] font-bold">{j.title}</div>
            <div className="truncate text-[10px] text-ink-400">{j.author_name} · {j.type === 'offer' ? 'عرض وظيفة' : 'باحث عن عمل'} · {j.city || '—'}</div>
          </div>
          <button onClick={() => toggle(j)} className="rounded-lg px-2 py-1 text-[10px] font-bold bg-white/[.05]">{j.status === 'published' ? 'إخفاء' : 'نشر'}</button>
          <button onClick={() => remove(j)} className="icon-btn h-7 w-7 text-rose-500"><Trash2 className="h-3 w-3" /></button>
        </div>
      ))}
      {data?.length === 0 && <p className="card p-4 text-[11px] text-ink-400">لا توجد إعلانات.</p>}
    </div>
  );
}
