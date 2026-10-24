import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Boxes, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, Download, Edit3, Loader2,
  Lock, Minus, Package, Plus, Search, ShoppingCart, Trash2, Wallet,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { api } from '../lib/api';
import { Badge, EmptyState, Field, Modal, PageLoader, Select, SmartImage, TextArea, useToast } from '../components/ui';
import { cx, dateFmt, fmt, num, useDebounced } from '../lib/utils';

type Item = {
  id: number; product_id?: number | null; name: string; strength?: string; form?: string; quantity: number; unit?: string;
  buy_price?: number; sell_price?: number; expiry_date?: string; batch?: string; supplier?: string; notes?: string;
  trade_name?: string; generic_name?: string; image_url?: string; manufacturer_name?: string;
};
type Summary = { items: number; units: number; stock_value: number; potential_value: number; low_stock: number; expiring_soon: number; expired: number };

const emptyForm = {
  id: 0, product_id: '', name: '', strength: '', form: '', quantity: '1', unit: 'box',
  buy_price: '', sell_price: '', expiry_date: '', batch: '', supplier: '', notes: '',
};

export default function Pharmacy() {
  const { user } = useAuth();
  const { t, lang } = useI18n();
  const { push } = useToast();
  const { data, loading, reload } = useApi<{ items: Item[]; summary: Summary }>('/api/pharmacy', undefined, { enabled: !!user });
  const { data: systems } = useApi<any[]>('/api/catalog/systems');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<Item | null>(null);
  const [tab, setTab] = useState<'all' | 'low' | 'expiring'>('all');

  const items = data?.items || [];
  const summary = data?.summary;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    return items.filter((i) => {
      if (tab === 'low' && (Number(i.quantity) || 0) > 5) return false;
      if (tab === 'expiring' && !(i.expiry_date && i.expiry_date <= soon)) return false;
      if (!needle) return true;
      return `${i.name} ${i.strength || ''} ${i.generic_name || ''} ${i.supplier || ''}`.toLowerCase().includes(needle);
    }).map((i) => {
      const status = i.expiry_date ? (i.expiry_date < today ? 'expired' : i.expiry_date <= soon ? 'soon' : 'ok') : 'ok';
      return { ...i, status };
    });
  }, [items, q, tab]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <div className="page-hero page-hero-emerald p-6 text-center text-white">
          <ShoppingCart className="mx-auto mb-2 h-8 w-8" />
          <h1 className="text-[19px] font-extrabold">{t('pharmacy.title')}</h1>
          <p className="mt-1 text-[11px] leading-6 text-white/70">{t('pharmacy.subtitle')}</p>
        </div>
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <Lock className="h-7 w-7 text-ink-300" />
          <p className="text-[12px] text-ink-500">{t('common.loginRequired')}</p>
          <Link to="/auth" className="btn-primary">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  const save = async () => {
    if (!form?.name?.trim()) { push(t('common.requiredField'), 'error'); return; }
    setBusy(true);
    try {
      if (form.id) await api.put(`/api/pharmacy/${form.id}`, form);
      else await api.post('/api/pharmacy', form);
      setForm(null); reload(); push(t('common.saved'));
    } catch (e: any) { push(e.message || t('common.error'), 'error'); }
    finally { setBusy(false); }
  };

  const adjust = async (item: Item, delta: number) => {
    try {
      const res = await api.patch<any>(`/api/pharmacy/${item.id}/adjust`, { delta });
      reload();
      if (delta < 0) push(`${item.name}: ${res.quantity} ${item.unit || ''}`);
    } catch { push(t('common.error'), 'error'); }
  };

  const remove = async () => {
    if (!del) return;
    try { await api.del(`/api/pharmacy/${del.id}`); setDel(null); reload(); push(t('common.deleted', {}) || 'تم الحذف'); }
    catch { push(t('common.error'), 'error'); }
  };

  const exportCsv = () => {
    const header = 'name,strength,form,quantity,unit,buy_price,sell_price,expiry_date,batch,supplier,notes';
    const rows = items.map((i) => [i.name, i.strength, i.form, i.quantity, i.unit, i.buy_price, i.sell_price, i.expiry_date, i.batch, i.supplier, i.notes]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
    const blob = new Blob(['\uFEFF' + [header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `mda-pharmacy-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="page-hero p-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /><h1 className="text-[21px] font-extrabold">{t('pharmacy.title')}</h1></div>
          <button onClick={() => setForm({ ...emptyForm })} className="inline-flex items-center gap-1 rounded-xl border border-white/25 bg-white/15 px-2.5 py-1.5 text-[11px] font-bold backdrop-blur transition hover:bg-white/25"><Plus className="h-3.5 w-3.5" />{t('pharmacy.add')}</button>
        </div>
        <p className="mt-1 max-w-lg text-[11.5px] leading-6 text-white/75">{t('pharmacy.subtitle')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: t('pharmacy.stockValue'), value: fmt(summary?.stock_value || 0), icon: Wallet },
            { label: t('pharmacy.units'), value: num(summary?.units || 0), icon: Boxes },
            { label: t('pharmacy.lowStock'), value: num(summary?.low_stock || 0), icon: AlertTriangle },
            { label: t('pharmacy.expiring'), value: num(summary?.expiring_soon || 0), icon: CalendarClock },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-white/15 bg-white/[.12] px-2.5 py-2 shadow-[0_12px_26px_-18px_rgba(0,0,0,.95)] backdrop-blur">
              <c.icon className="mb-1 h-3.5 w-3.5 opacity-70" />
              <div className="text-[15px] font-extrabold leading-none">{c.value}</div>
              <div className="mt-0.5 text-[8.5px] font-medium text-white/60">{c.label}</div>
            </div>
          ))}
        </div>
      </div>

      {summary?.expired ? (
        <div className="flex items-center gap-2 rounded-2xl border p-3 text-[11px] font-semibold border-rose-400/25 bg-rose-500/10 text-rose-200">
          <AlertTriangle className="h-4 w-4" />{t('pharmacy.expiredAlert', { n: summary.expired })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-xl border px-2.5 py-1.5 border-white/[.08] bg-ink-900">
          <Search className="h-3.5 w-3.5 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pharmacy.search')} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
        </div>
        <div className="flex gap-1.5">
          {([['all', t('common.all')], ['low', t('pharmacy.low')], ['expiring', t('pharmacy.expiry')]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={cx('chip', tab === id && 'chip-active')}>{label}</button>
          ))}
        </div>
        {items.length > 0 && <button onClick={exportCsv} className="btn-ghost px-2.5 py-1.5 text-[11px]"><Download className="h-3.5 w-3.5" />CSV</button>}
      </div>

      {loading && !data && <PageLoader />}
      {data && items.length === 0 && (
        <EmptyState icon={<Package className="h-6 w-6" />} title={t('pharmacy.empty')} text={t('pharmacy.emptyHint')}
          action={<button onClick={() => setForm({ ...emptyForm })} className="btn-primary"><Plus className="h-4 w-4" />{t('pharmacy.add')}</button>} />
      )}

      <div className="space-y-2">
        {shown.map((i) => (
          <div key={i.id} className={cx('card flex items-center gap-2.5 p-2.5', i.status === 'expired' && 'border-rose-200 border-rose-400/25')}>
            <SmartImage src={i.image_url} productId={i.product_id || undefined} alt={i.name} className="h-11 w-11 shrink-0 bg-white/[.05]" rounded="rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-extrabold">{i.trade_name || i.name} {i.strength || ''}</span>
                {i.status === 'expired' ? <Badge tone="rose">{t('pharmacy.expired')}</Badge> : i.status === 'soon' ? <Badge tone="amber">{t('pharmacy.soon')}</Badge> : null}
              </div>
              <div className="truncate text-[10px] text-ink-400">
                {[i.generic_name, i.form, i.batch ? `#${i.batch}` : null, i.supplier].filter(Boolean).join(' · ') || '—'}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-ink-400">
                {i.expiry_date && <span className="inline-flex items-center gap-0.5"><CalendarClock className="h-2.5 w-2.5" />{i.expiry_date}</span>}
                {i.buy_price ? <span>{t('pharmacy.buy')}: {fmt(i.buy_price)}</span> : null}
                {i.sell_price ? <span>{t('pharmacy.sell')}: {fmt(i.sell_price)}</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-center">
              <div className="flex items-center gap-1">
                <button onClick={() => adjust(i, -1)} className="flex h-6 w-6 items-center justify-center rounded-md border text-ink-500 border-white/[.09]"><Minus className="h-3 w-3" /></button>
                <span className={cx('min-w-[28px] text-center text-[13px] font-extrabold', i.status === 'expired' && 'text-rose-300')}>{num(i.quantity)}</span>
                <button onClick={() => adjust(i, 1)} className="flex h-6 w-6 items-center justify-center rounded-md border text-ink-500 border-white/[.09]"><Plus className="h-3 w-3" /></button>
              </div>
              <span className="text-[8.5px] text-ink-400">{i.unit || 'box'}</span>
            </div>
            <div className="flex shrink-0 flex-col gap-0.5">
              <button onClick={() => setForm({ ...emptyForm, ...i, product_id: i.product_id || '' })} className="icon-btn h-7 w-7 text-sky-300"><Edit3 className="h-3 w-3" /></button>
              <button onClick={() => setDel(i)} className="icon-btn h-7 w-7 text-rose-500"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {data && shown.length === 0 && items.length > 0 && <p className="text-center text-[11px] text-ink-400">{t('common.noResults')}</p>}

      {form && <ItemForm form={form} setForm={setForm} systems={systems || []} onClose={() => setForm(null)} onSave={save} busy={busy} />}

      <Modal open={!!del} onClose={() => setDel(null)} title={t('common.delete')} footer={<>
        <button onClick={() => setDel(null)} className="btn-ghost">{t('common.cancel')}</button>
        <button onClick={remove} className="btn-danger">{t('common.delete')}</button>
      </>}>
        <p className="text-[12px] leading-6 text-ink-500">{del?.name}</p>
      </Modal>

      <p className="text-center text-[10px] leading-5 text-ink-400">{t('pharmacy.note')}</p>
    </div>
  );
}

function ItemForm({ form, setForm, systems, onClose, onSave, busy }: {
  form: any; setForm: (f: any) => void; systems: any[]; onClose: () => void; onSave: () => void; busy: boolean;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const { data: results } = useApi<any>('/api/catalog/search', { q: query }, { enabled: query.trim().length > 1 });
  const set = (k: string, v: any) => setForm({ ...form, [k]: v });

  const pick = (p: any) => {
    setForm({
      ...form,
      product_id: p.id,
      name: p.trade_name,
      strength: p.strength || '',
      form: p.dosage_form || '',
      buy_price: form.buy_price || '',
      sell_price: form.sell_price || (p.price ? String(p.price) : ''),
    });
    setQ('');
  };

  return (
    <Modal open onClose={onClose} wide title={form.id ? t('pharmacy.edit') : t('pharmacy.add')} footer={<>
      <button onClick={onClose} className="btn-ghost">{t('common.cancel')}</button>
      <button onClick={onSave} disabled={busy || !form.name?.trim()} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t('common.save')}</button>
    </>}>
      <div className="space-y-3">
        <Field label={t('pharmacy.linkProduct')} hint={t('pharmacy.linkHint')}>
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder={t('search.placeholder')} />
            {results?.products?.length > 0 && query.length > 1 && (
              <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border p-1 shadow-lg border-white/[.09] bg-ink-900">
                {results.products.slice(0, 8).map((p: any) => (
                  <button key={p.id} onClick={() => pick(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start hover:bg-white/[.06]">
                    <SmartImage src={p.image_url} productId={p.id} alt={p.trade_name} className="h-8 w-8 bg-white/[.06]" rounded="rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold">{p.trade_name} <span className="font-normal text-ink-400">{p.strength}</span></div>
                      <div className="truncate text-[9.5px] text-ink-400">{p.generic_name} · {p.manufacturer_name || '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label={t('pharmacy.itemName')} required><input value={form.name} onChange={(e) => set('name', e.target.value)} className="input" /></Field>
          <Field label={t('product.strength')}><input value={form.strength} onChange={(e) => set('strength', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('product.form')}><input value={form.form} onChange={(e) => set('form', e.target.value)} className="input" /></Field>
          <Field label={t('pharmacy.quantity')}><input type="number" min="0" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('pharmacy.unit')}><Select value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {['box', 'strip', 'bottle', 'vial', 'tube', 'piece'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select></Field>
          <Field label={t('pharmacy.expiry')}><input type="date" value={form.expiry_date || ''} onChange={(e) => set('expiry_date', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('pharmacy.buy')}><input type="number" step="0.01" min="0" value={form.buy_price ?? ''} onChange={(e) => set('buy_price', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('pharmacy.sell')}><input type="number" step="0.01" min="0" value={form.sell_price ?? ''} onChange={(e) => set('sell_price', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('pharmacy.batch')}><input value={form.batch || ''} onChange={(e) => set('batch', e.target.value)} className="input" dir="ltr" /></Field>
          <Field label={t('pharmacy.supplier')}><input value={form.supplier || ''} onChange={(e) => set('supplier', e.target.value)} className="input" /></Field>
        </div>
        <Field label={t('pharmacy.notes')}><TextArea value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
