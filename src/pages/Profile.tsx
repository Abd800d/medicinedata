import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Heart, KeyRound, LayoutDashboard, LogOut, Mail, MapPin, Pencil, Phone, ScrollText,
  ShieldCheck, UserRound, Users, Save, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { Avatar, Badge, EmptyState, Field, PageLoader, useToast } from '../components/ui';
import { ProductCard, ProductRecord } from '../components/catalog';
import { dateFmt } from '../lib/utils';

export default function Profile() {
  const { user, logout, patchUser, refresh } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', city: user?.city || '' });
  const [pw, setPw] = useState({ current: '', next: '' });
  const [busy, setBusy] = useState(false);
  const { data: favs, loading } = useApi<any[]>('/api/community/favorites', undefined, { enabled: !!user });
  const { data: threads } = useApi<any[]>('/api/community/threads', undefined, { enabled: !!user });
  const [products, setProducts] = useState<ProductRecord[]>([]);
  useEffect(() => {
    let alive = true;
    const list = (favs || []).filter((f) => f.target_type === 'product').slice(0, 12);
    if (!list.length) { setProducts([]); return () => { alive = false; }; }
    Promise.all(list.map((f) => api.get<ProductRecord>(`/api/catalog/products/${f.target_id}`).catch(() => null)))
      .then((rows) => { if (alive) setProducts(rows.filter(Boolean) as ProductRecord[]); });
    return () => { alive = false; };
  }, [favs]);

  if (!user) {
    return <div className="card p-6 text-center"><UserRound className="mx-auto mb-2 h-8 w-8 text-ink-300" /><div className="mb-3 text-[13px] font-bold">{t('common.loginRequired')}</div><Link to="/auth" className="btn-primary">{t('common.login')}</Link></div>;
  }

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.patch<any>('/api/auth/me', form);
      patchUser(res); setEditing(false); push(t('profile.saved'));
    } catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  const changePw = async () => {
    setBusy(true);
    try { await api.post('/api/auth/change-password', pw); setPw({ current: '', next: '' }); setPwOpen(false); push(t('profile.pwChanged')); }
    catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card overflow-hidden">
        <div className="relative h-24 overflow-hidden bg-[radial-gradient(120%_120%_at_100%_0%,rgba(34,211,238,.55),transparent_55%),linear-gradient(135deg,#0b2f7a,#1262e0_60%,#0a7ea8)]"><span className="absolute -end-8 -top-10 h-32 w-32 rounded-full border-[18px] border-white/10" /><span className="absolute -start-6 -bottom-12 h-24 w-24 rounded-full bg-white/10 blur-xl" /></div>
        <div className="-mt-9 px-4 pb-4">
          <div className="flex items-end justify-between">
            <div className="rounded-full bg-ink-900 ring-4 ring-ink-900"><Avatar name={user.name} src={user.avatar} size={68} /></div>
            <button onClick={() => setEditing((v) => !v)} className="btn-ghost mt-10 px-3 py-1.5 text-[11px]">{editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}{editing ? t('common.cancel') : t('common.edit')}</button>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-[17px] font-extrabold text-white">{user.name}</h1>
            {user.role === 'admin' && <Badge tone="amber"><ShieldCheck className="h-2.5 w-2.5" />{t('more.admin')}</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-ink-500">
            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{user.email}</span>
            {user.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /><span dir="ltr">{user.phone}</span></span>}
            {user.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{user.city}</span>}
            {user.created_at && <span>{t('profile.memberSince')} {dateFmt(user.created_at)}</span>}
          </div>

          {editing && (
            <div className="mt-3 grid gap-2 rounded-2xl p-3 sm:grid-cols-3 bg-white/[.055]">
              <Field label={t('auth.name')}><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input bg-white/[.04]" /></Field>
              <Field label={t('auth.phone')}><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input bg-white/[.04]" dir="ltr" /></Field>
              <Field label={t('auth.city')}><input value={form.city || ''} onChange={(e) => setForm({ ...form, city: e.target.value })} className="input bg-white/[.04]" /></Field>
              <div className="sm:col-span-3"><button onClick={save} disabled={busy} className="btn-primary w-full"><Save className="h-4 w-4" />{t('common.save')}</button></div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Link to="/prescriptions" className="card flex flex-col items-center gap-1 p-3 text-center"><ScrollText className="h-4 w-4 text-rose-300" /><span className="text-[10px] font-bold">{t('rx.title')}</span></Link>
        <Link to="/community" className="card flex flex-col items-center gap-1 p-3 text-center"><Users className="h-4 w-4 text-emerald-300" /><span className="text-[10px] font-bold">{threads?.length ?? 0} {t('community.threads')}</span></Link>
        <button onClick={() => setPwOpen((v) => !v)} className="card flex flex-col items-center gap-1 p-3 text-center"><KeyRound className="h-4 w-4 text-amber-300" /><span className="text-[10px] font-bold">{t('profile.password')}</span></button>
      </div>

      {pwOpen && (
        <div className="card space-y-2 p-4">
          <h2 className="text-[12.5px] font-extrabold">{t('profile.changePassword')}</h2>
          <Field label={t('profile.currentPassword')}><input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className="input" /></Field>
          <Field label={t('profile.newPassword')}><input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className="input" /></Field>
          <button onClick={changePw} disabled={busy || pw.next.length < 6} className="btn-primary w-full">{t('profile.updatePassword')}</button>
        </div>
      )}

      {user.role === 'admin' && (
        <Link to="/admin" className="flex items-center gap-3 rounded-2xl border p-3.5 border-amber-900 bg-amber-500/10">
          <LayoutDashboard className="h-5 w-5 text-amber-300" /><span className="flex-1 text-[12.5px] font-extrabold text-amber-200">{t('admin.title')}</span>
          <ChevronLeft className="h-4 w-4 text-amber-300 rtl:block ltr:hidden" /><ChevronRight className="hidden h-4 w-4 text-amber-300 ltr:block" />
        </Link>
      )}

      <div>
        <h2 className="section-title mb-2 flex items-center gap-1.5"><Heart className="h-4 w-4 text-rose-500" />{t('profile.favorites')}</h2>
        {loading && <PageLoader />}
        {favs?.length === 0 && <EmptyState icon={<Heart className="h-6 w-6" />} title={t('profile.noFavorites')} />}
        {products.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{products.map((p) => <ProductCard key={p.id} product={p} horizontal />)}</div>}
      </div>

      <div className="space-y-2">
        <h2 className="section-title flex items-center gap-1.5"><Users className="h-4 w-4 text-emerald-300" />{t('profile.myThreads')}</h2>
        {(threads || []).slice(0, 6).map((th) => (
          <Link key={th.id} to={`/community/${th.id}`} className="flex items-center gap-2 rounded-xl border p-3 border-white/[.08] bg-ink-900">
            <div className="min-w-0 flex-1"><div className="line-clamp-1 text-[12px] font-bold">{th.subject}</div><div className="text-[9.5px] text-ink-400">{th.messages_count} {t('community.replies')}</div></div>
            <Badge tone={th.status === 'open' ? 'amber' : 'emerald'}>{th.status}</Badge>
          </Link>
        ))}
        {threads?.length === 0 && <p className="text-[11px] text-ink-400">{t('community.noThreads')}</p>}
      </div>

      <button onClick={() => { logout(); refresh(); navigate('/'); }} className="btn-ghost w-full text-rose-300"><LogOut className="h-4 w-4" />{t('common.logout')}</button>
    </div>
  );
}
