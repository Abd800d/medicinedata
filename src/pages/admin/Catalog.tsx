import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Boxes, Building2, ChevronLeft, ChevronRight, Edit3, Layers, Loader2, Package, Pill, Plus, Search, Trash2, Truck, X, Check,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { Badge, Field, Modal, PageLoader, Select, SmartImage, TextArea, useToast } from '../../components/ui';
import { cx, num, useDebounced } from '../../lib/utils';

type Sub = 'drugs' | 'products' | 'systems' | 'categories' | 'companies';

export default function Catalog() {
  const [sub, setSub] = useState<Sub>('drugs');
  const TABS: { id: Sub; label: string; icon: any }[] = [
    { id: 'drugs', label: 'الأدوية', icon: Pill },
    { id: 'products', label: 'المنتجات', icon: Package },
    { id: 'systems', label: 'الأجهزة', icon: Layers },
    { id: 'categories', label: 'التصنيفات', icon: Boxes },
    { id: 'companies', label: 'الشركات والوكلاء', icon: Building2 },
  ];
  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className={cx('flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11.5px] font-bold transition',
            sub === t.id ? 'border-brand-400/50 bg-brand-500/20 text-white shadow-glow' : 'border-white/[.08] bg-white/[.04] text-ink-400')}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>
      {sub === 'drugs' && <Drugs />}
      {sub === 'products' && <Products />}
      {sub === 'systems' && <Systems />}
      {sub === 'categories' && <Categories />}
      {sub === 'companies' && <Companies />}
    </div>
  );
}

/* ---------------------------------- shared ---------------------------------- */
function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-2 text-[11px]">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="btn-ghost px-2 py-1"><ChevronRight className="h-3.5 w-3.5 rtl:block ltr:hidden" /><ChevronLeft className="hidden h-3.5 w-3.5 ltr:block" /></button>
      <span className="font-bold text-ink-500">{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="btn-ghost px-2 py-1"><ChevronLeft className="h-3.5 w-3.5 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 ltr:block" /></button>
    </div>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5 border-white/[.08] bg-ink-900">
      <Search className="h-3.5 w-3.5 text-ink-400" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
      {value && <button onClick={() => onChange('')}><X className="h-3.5 w-3.5 text-ink-400" /></button>}
    </div>
  );
}

function Confirm({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title="تأكيد الحذف" footer={<>
      <button onClick={onCancel} className="btn-ghost">إلغاء</button>
      <button onClick={onConfirm} className="btn-danger">حذف نهائي</button>
    </>}>
      <p className="text-[12px] leading-6 text-ink-500">{title}</p>
    </Modal>
  );
}

/* ---------------------------------- Drugs ---------------------------------- */
type Drug = any;

function Drugs() {
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApi<any>('/api/admin/drugs', { q: query || undefined, limit: 30, page });
  const { data: systems } = useApi<any[]>('/api/admin/systems');
  const { data: categories } = useApi<any[]>('/api/admin/categories');
  const { push } = useToast();
  const [editing, setEditing] = useState<Drug | null>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Drug | null>(null);

  const save = async (form: any) => {
    try {
      if (form.id) await api.put(`/api/admin/drugs/${form.id}`, form);
      else await api.post('/api/admin/drugs', form);
      push('تم حفظ الدواء'); setEditing(null); setCreating(false); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api.del(`/api/admin/drugs/${del.id}`); push('تم الحذف'); setDel(null); reload(); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="flex-1"><SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="ابحث بالاسم العلمي أو العربي أو الفئة…" /></div>
        <button onClick={() => setCreating(true)} className="btn-primary shrink-0 px-3 text-[11.5px]"><Plus className="h-4 w-4" />دواء</button>
      </div>
      <div className="text-[10.5px] text-ink-400">{num(data?.total || 0)} دواء</div>
      {loading && !data && <PageLoader />}
      <div className="space-y-1.5">
        {(data?.data || []).map((d: Drug) => (
          <div key={d.id} className="card flex items-center gap-2 p-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-950/40 text-violet-300"><Pill className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-extrabold">{d.generic_name}</span>
                {d.prescription_required ? <Badge tone="rose">Rx</Badge> : <Badge tone="emerald">OTC</Badge>}
              </div>
              <div className="truncate text-[10px] text-ink-400" dir="auto">{d.generic_ar} · {d.system_ar || d.system_en || '—'} · {d.products_count} منتج</div>
            </div>
            <button onClick={() => setEditing(d)} className="icon-btn h-8 w-8 text-sky-300"><Edit3 className="h-3.5 w-3.5" /></button>
            <button onClick={() => setDel(d)} className="icon-btn h-8 w-8 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <Pager page={page} pages={data?.pages} onPage={setPage} />
      {(creating || editing) && (
        <DrugForm drug={editing} systems={systems || []} categories={categories || []} onClose={() => { setEditing(null); setCreating(false); }} onSave={save} />
      )}
      <Confirm open={!!del} title={`حذف «${del?.generic_name}» سيحذف كل منتجاته أيضاً. هل تريد المتابعة؟`} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}

function DrugForm({ drug, systems, categories, onClose, onSave }: { drug: Drug | null; systems: any[]; categories: any[]; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState<any>(drug || {
    system_id: '', category_id: '', generic_name: '', generic_ar: '', synonyms: '', drug_class: '', atc_code: '',
    prescription_required: 0, verified: 1, pregnancy: '', indications_ar: '', indications_en: '', dosage_adult: '',
    dosage_child: '', contraindications: '', side_effects: '', warnings: '', interactions: '', mechanism_ar: '',
    mechanism_en: '', half_life: '', storage: '', notes: '', source: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const sysCats = categories.filter((c) => !f.system_id || String(c.system_id) === String(f.system_id));
  const submit = async () => {
    setBusy(true);
    try { await onSave(f); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={drug ? `تعديل: ${drug.generic_name}` : 'إضافة دواء جديد'} footer={
      <>
        <button onClick={onClose} className="btn-ghost">إلغاء</button>
        <button onClick={submit} disabled={busy || !f.generic_name} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ</button>
      </>
    }>
      <div className="grid max-h-[62vh] gap-2.5 overflow-y-auto pe-1 sm:grid-cols-2">
        <Field label="الاسم العلمي (Generic)" required><input value={f.generic_name} onChange={(e) => set('generic_name', e.target.value)} className="input" dir="ltr" /></Field>
        <Field label="الاسم العربي"><input value={f.generic_ar || ''} onChange={(e) => set('generic_ar', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="الجهاز"><Select value={f.system_id || ''} onChange={(e) => set('system_id', e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>{systems.map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
        </Select></Field>
        <Field label="التصنيف"><Select value={f.category_id || ''} onChange={(e) => set('category_id', e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>{sysCats.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
        </Select></Field>
        <Field label="الفئة الدوائية"><input value={f.drug_class || ''} onChange={(e) => set('drug_class', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="رمز ATC"><input value={f.atc_code || ''} onChange={(e) => set('atc_code', e.target.value)} className="input" dir="ltr" /></Field>
        <Field label="مرادفات (للبحث)"><input value={f.synonyms || ''} onChange={(e) => set('synonyms', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="فئة الحمل"><input value={f.pregnancy || ''} onChange={(e) => set('pregnancy', e.target.value)} className="input" dir="auto" /></Field>
        <div className="sm:col-span-2"><Field label="دواعي الاستعمال (عربي)"><TextArea value={f.indications_ar || ''} onChange={(e) => set('indications_ar', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Indications (English)"><TextArea value={f.indications_en || ''} onChange={(e) => set('indications_en', e.target.value)} dir="ltr" /></Field></div>
        <Field label="جرعة البالغين"><TextArea value={f.dosage_adult || ''} onChange={(e) => set('dosage_adult', e.target.value)} /></Field>
        <Field label="جرعة الأطفال"><TextArea value={f.dosage_child || ''} onChange={(e) => set('dosage_child', e.target.value)} /></Field>
        <Field label="موانع الاستعمال"><TextArea value={f.contraindications || ''} onChange={(e) => set('contraindications', e.target.value)} /></Field>
        <Field label="الآثار الجانبية"><TextArea value={f.side_effects || ''} onChange={(e) => set('side_effects', e.target.value)} /></Field>
        <Field label="تحذيرات"><TextArea value={f.warnings || ''} onChange={(e) => set('warnings', e.target.value)} /></Field>
        <Field label="التداخلات الدوائية"><TextArea value={f.interactions || ''} onChange={(e) => set('interactions', e.target.value)} /></Field>
        <Field label="عمر النصف"><input value={f.half_life || ''} onChange={(e) => set('half_life', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="التخزين"><input value={f.storage || ''} onChange={(e) => set('storage', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="المصدر"><input value={f.source || ''} onChange={(e) => set('source', e.target.value)} className="input" dir="ltr" /></Field>
        <div className="flex items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-[11.5px] font-semibold"><input type="checkbox" checked={!!f.prescription_required} onChange={(e) => set('prescription_required', e.target.checked ? 1 : 0)} className="h-4 w-4 accent-brand-700" />وصفة طبية</label>
          <label className="flex items-center gap-2 text-[11.5px] font-semibold"><input type="checkbox" checked={!!f.verified} onChange={(e) => set('verified', e.target.checked ? 1 : 0)} className="h-4 w-4 accent-brand-700" />موثّق</label>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- Products ---------------------------------- */
function Products() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const { data, loading, reload } = useApi<any>('/api/admin/products', { q: query || undefined, limit: 30, page, missing_image: onlyMissing ? 1 : undefined });
  const { data: systems } = useApi<any[]>('/api/admin/systems');
  const { data: manufacturers } = useApi<any[]>('/api/admin/manufacturers');
  const { data: agents } = useApi<any[]>('/api/admin/agents');
  const { push } = useToast();
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<any>(null);
  const [imgFor, setImgFor] = useState<any>(null);

  useEffect(() => {
    const editId = params.get('edit');
    if (!editId) return;
    api.get<any>(`/api/catalog/products/${editId}`).then((p) => setEditing(p)).catch(() => {});
  }, [params]);

  const save = async (form: any) => {
    try {
      if (form.id) await api.put(`/api/admin/products/${form.id}`, form);
      else await api.post('/api/admin/products', form);
      push('تم حفظ المنتج'); setEditing(null); setCreating(false); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api.del(`/api/admin/products/${del.id}`); push('تم الحذف'); setDel(null); reload(); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <div className="flex-1"><SearchBar value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="ابحث بالاسم التجاري أو الباركود…" /></div>
        <button onClick={() => setCreating(true)} className="btn-primary shrink-0 px-3 text-[11.5px]"><Plus className="h-4 w-4" />منتج</button>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-[10.5px] text-ink-400">{num(data?.total || 0)} منتج</div>
        <label className="flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-500"><input type="checkbox" checked={onlyMissing} onChange={(e) => { setOnlyMissing(e.target.checked); setPage(1); }} className="h-3.5 w-3.5 accent-brand-700" />بدون صورة فقط</label>
      </div>
      {loading && !data && <PageLoader />}
      <div className="space-y-1.5">
        {(data?.data || []).map((p: any) => (
          <div key={p.id} className="card flex items-center gap-2 p-2.5">
            <SmartImage src={p.image_url} productId={p.id} alt={p.trade_name} className="h-10 w-10 shrink-0 bg-white/[.05]" rounded="rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-extrabold">{p.trade_name} <span className="font-medium text-ink-400">{p.strength}</span></div>
              <div className="truncate text-[10px] text-ink-400">{p.generic_name} · {p.manufacturer_name || '—'} · {p.country || '—'}</div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {p.verified ? <Badge tone="emerald">✓</Badge> : null}
              <button onClick={() => setImgFor(p)} className="icon-btn h-8 w-8 text-violet-300" title="الصور"><Boxes className="h-3.5 w-3.5" /></button>
              <button onClick={() => setEditing(p)} className="icon-btn h-8 w-8 text-sky-300"><Edit3 className="h-3.5 w-3.5" /></button>
              <button onClick={() => setDel(p)} className="icon-btn h-8 w-8 text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
      </div>
      <Pager page={page} pages={data?.pages} onPage={setPage} />
      {(creating || editing) && (
        <ProductForm product={editing} systems={systems || []} manufacturers={manufacturers || []} agents={agents || []} onClose={() => { setEditing(null); setCreating(false); }} onSave={save} />
      )}
      {imgFor && <ImagesModal product={imgFor} onClose={() => { setImgFor(null); reload(); }} />}
      <Confirm open={!!del} title={`حذف المنتج «${del?.trade_name}»؟`} onCancel={() => setDel(null)} onConfirm={remove} />
    </div>
  );
}

function ProductForm({ product, systems, manufacturers, agents, onClose, onSave }: { product: any; systems: any[]; manufacturers: any[]; agents: any[]; onClose: () => void; onSave: (f: any) => void }) {
  const [f, setF] = useState<any>(product || {
    drug_id: '', drugQuery: '', trade_name: '', trade_name_ar: '', strength: '', dosage_form: '', pack_size: '',
    manufacturer_id: '', agent_id: '', country: '', barcode: '', price: '', currency: 'YER', image_url: '',
    description_ar: '', description_en: '', verified: 1, active: 1,
  });
  const [busy, setBusy] = useState(false);
  const [drugQ, setDrugQ] = useState('');
  const dq = useDebounced(drugQ, 300);
  const { data: drugs } = useApi<any>('/api/admin/drugs', { q: dq || undefined, limit: 8 }, { enabled: dq.length > 1 });
  const [drugLabel, setDrugLabel] = useState(product ? `${product.generic_name || ''}` : '');
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!f.drug_id) return;
    setBusy(true);
    try { await onSave(f); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} wide title={product ? `تعديل: ${product.trade_name}` : 'إضافة منتج جديد'} footer={<>
      <button onClick={onClose} className="btn-ghost">إلغاء</button>
      <button onClick={submit} disabled={busy || !f.drug_id || !f.trade_name} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ</button>
    </>}>
      <div className="grid max-h-[62vh] gap-2.5 overflow-y-auto pe-1 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="الدواء (الاسم العلمي)" required hint={drugLabel ? `محدد: ${drugLabel}` : 'ابحث واختر الدواء'}>
            <div className="relative">
              <input value={drugQ} onChange={(e) => setDrugQ(e.target.value)} className="input" placeholder="اكتب للبحث…" />
              {drugs?.data?.length > 0 && drugQ.length > 1 && (
                <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border p-1 shadow-lg border-white/[.09] bg-ink-900">
                  {drugs.data.map((d: any) => (
                    <button key={d.id} onClick={() => { set('drug_id', d.id); setDrugLabel(d.generic_name); setDrugQ(''); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[11px] hover:bg-white/[.06]">
                      <Pill className="h-3 w-3 text-violet-500" /><span className="font-bold">{d.generic_name}</span><span className="text-ink-400">{d.generic_ar}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>
        <Field label="الاسم التجاري" required><input value={f.trade_name} onChange={(e) => set('trade_name', e.target.value)} className="input" dir="ltr" /></Field>
        <Field label="الاسم التجاري (عربي)"><input value={f.trade_name_ar || ''} onChange={(e) => set('trade_name_ar', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="القوة / التركيز"><input value={f.strength || ''} onChange={(e) => set('strength', e.target.value)} className="input" dir="ltr" placeholder="500 mg" /></Field>
        <Field label="الشكل الصيدلاني"><input value={f.dosage_form || ''} onChange={(e) => set('dosage_form', e.target.value)} className="input" placeholder="Tablet, Syrup…" /></Field>
        <Field label="حجم العبوة"><input value={f.pack_size || ''} onChange={(e) => set('pack_size', e.target.value)} className="input" dir="ltr" placeholder="20 tabs" /></Field>
        <Field label="بلد المنشأ"><input value={f.country || ''} onChange={(e) => set('country', e.target.value)} className="input" dir="auto" /></Field>
        <Field label="الشركة المصنعة"><Select value={f.manufacturer_id || ''} onChange={(e) => set('manufacturer_id', e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>{manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select></Field>
        <Field label="الوكيل في اليمن"><Select value={f.agent_id || ''} onChange={(e) => set('agent_id', e.target.value ? Number(e.target.value) : '')}>
          <option value="">—</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select></Field>
        <Field label="الباركود"><input value={f.barcode || ''} onChange={(e) => set('barcode', e.target.value)} className="input" dir="ltr" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="السعر"><input value={f.price ?? ''} onChange={(e) => set('price', e.target.value)} className="input" dir="ltr" type="number" step="0.01" /></Field>
          <Field label="العملة"><input value={f.currency || 'YER'} onChange={(e) => set('currency', e.target.value)} className="input" dir="ltr" /></Field>
        </div>
        <div className="sm:col-span-2"><Field label="رابط الصورة" hint="يمكنك رفع صورة من زر الصور بعد الحفظ"><input value={f.image_url || ''} onChange={(e) => set('image_url', e.target.value)} className="input" dir="ltr" placeholder="https://… أو /uploads/…" /></Field></div>
        <div className="sm:col-span-2"><Field label="وصف (عربي)"><TextArea value={f.description_ar || ''} onChange={(e) => set('description_ar', e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Description (English)"><TextArea value={f.description_en || ''} onChange={(e) => set('description_en', e.target.value)} dir="ltr" /></Field></div>
        <div className="flex items-center gap-4 sm:col-span-2">
          <label className="flex items-center gap-2 text-[11.5px] font-semibold"><input type="checkbox" checked={!!f.verified} onChange={(e) => set('verified', e.target.checked ? 1 : 0)} className="h-4 w-4 accent-brand-700" />موثّق</label>
          <label className="flex items-center gap-2 text-[11.5px] font-semibold"><input type="checkbox" checked={f.active === undefined ? true : !!f.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} className="h-4 w-4 accent-brand-700" />نشط</label>
        </div>
      </div>
    </Modal>
  );
}

function ImagesModal({ product, onClose }: { product: any; onClose: () => void }) {
  const { data, reload, loading } = useApi<any[]>(`/api/admin/products/${product.id}/images`);
  const { push } = useToast();
  const [url, setUrl] = useState('');
  const [searchQ, setSearchQ] = useState(`${product.trade_name} ${product.strength || ''}`);
  const [results, setResults] = useState<any[] | null>(null);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('images', f));
    setBusy(true);
    try { await api.post(`/api/admin/products/${product.id}/images`, fd); push('تم رفع الصور'); reload(); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };
  const download = async (u: string) => {
    setBusy(true);
    try {
      const res = await api.post<any>('/api/admin/fetch-image', { url: u, product_id: product.id });
      await api.put(`/api/admin/products/${product.id}/image`, { url: res.url });
      push('تم تنزيل الصورة وتعيينها'); reload();
    } catch (e: any) { push(e.message || 'تعذر تنزيل الصورة', 'error'); }
    finally { setBusy(false); }
  };
  const google = async () => {
    setBusy(true);
    try {
      const res = await api.get<any>('/api/admin/image-search', { q: searchQ });
      setResults(res.items || []); setCandidates([]);
      if (!res.configured) window.open(res.searchUrl, '_blank');
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setBusy(false); }
  };
  const setMain = async (u: string) => {
    try { await api.put(`/api/admin/products/${product.id}/image`, { url: u }); push('تم تعيين الصورة الرئيسية'); reload(); }
    catch { push('خطأ', 'error'); }
  };
  const remove = async (id: number) => {
    try { await api.del(`/api/admin/product-images/${id}`); reload(); } catch { push('خطأ', 'error'); }
  };

  return (
    <Modal open onClose={onClose} wide title={`صور المنتج: ${product.trade_name}`}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <label className="btn-primary cursor-pointer px-3 text-[11.5px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}رفع صور
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          </label>
          <div className="flex flex-1 items-center gap-1.5 rounded-xl border px-2 py-1.5 border-white/[.08]">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="رابط صورة…" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" dir="ltr" />
            <button onClick={() => url && download(url)} disabled={!url || busy} className="rounded-lg px-2 py-1 text-[10px] font-bold bg-white text-white">تنزيل</button>
          </div>
        </div>

        <div className="rounded-xl border border-dashed p-2.5 border-white/[.08]">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold"><Search className="h-3.5 w-3.5" />جلب من Google Images</div>
          <div className="flex gap-1.5">
            <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="input h-9 flex-1 text-[11px]" />
            <button onClick={google} disabled={busy} className="btn-ghost px-2.5 text-[11px]">بحث</button>
          </div>
          {results && results.length > 0 && (
            <div className="mt-2 grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
              {results.map((r, i) => (
                <button key={i} onClick={() => download(r.link)} className="overflow-hidden rounded-lg border border-white/[.09] bg-white/[.05]">
                  <img src={r.thumb || r.link} alt="" className="h-16 w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {results && results.length === 0 && <p className="mt-1 text-[10px] text-ink-400">لا توجد نتائج — افتح Google Images والصق رابط الصورة أعلاه.</p>}
        </div>

        {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-400" />}
        <div className="grid grid-cols-3 gap-2">
          {(data || []).map((img: any) => (
            <div key={img.id} className={cx('relative overflow-hidden rounded-xl border bg-white/[.04]', product.image_url === img.url ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-white/[.08] border-white/[.08]')}>
              <img src={img.url} alt="" className="h-24 w-full object-contain p-1" />
              <div className="flex items-center justify-between gap-1 border-t px-1 py-1 border-white/[.08]">
                <button onClick={() => setMain(img.url)} className="text-[9px] font-bold text-brand-300">رئيسية</button>
                <button onClick={() => remove(img.id)} className="text-[9px] font-bold text-rose-500">حذف</button>
              </div>
            </div>
          ))}
        </div>
        {(data || []).length === 0 && <p className="text-center text-[11px] text-ink-400">لا توجد صور مرفوعة — تُعرض الصورة المولّدة تلقائيًا حتى ترفع صورة حقيقية.</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------- Systems ---------------------------------- */
function Systems() {
  const { data, reload, loading } = useApi<any[]>('/api/admin/systems');
  const { push } = useToast();
  const [editing, setEditing] = useState<any>(null);
  const save = async (form: any) => {
    try {
      if (form.id) await api.put(`/api/admin/systems/${form.id}`, form);
      else await api.post('/api/admin/systems', form);
      push('تم الحفظ'); setEditing(null); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  return (
    <div className="space-y-2.5">
      <button onClick={() => setEditing({})} className="btn-primary w-full text-[11.5px]"><Plus className="h-4 w-4" />جهاز جديد</button>
      {loading && !data && <PageLoader />}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(data || []).map((s) => (
          <button key={s.id} onClick={() => setEditing(s)} className="card flex items-center gap-2 p-2.5 text-start">
            <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: s.color || '#0f766e' }} />
            <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-extrabold">{s.name_ar}</div><div className="truncate text-[10px] text-ink-400">{s.name_en} · {s.slug}</div></div>
            <Edit3 className="h-3.5 w-3.5 text-ink-300" />
          </button>
        ))}
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'تعديل الجهاز' : 'جهاز جديد'} footer={<>
          <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
          <button onClick={() => save(editing)} className="btn-primary">حفظ</button>
        </>}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="الاسم الإنجليزي" required><input value={editing.name_en || ''} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} className="input" dir="ltr" /></Field>
            <Field label="الاسم العربي" required><input value={editing.name_ar || ''} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} className="input" /></Field>
            <Field label="Slug"><input value={editing.slug || ''} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className="input" dir="ltr" /></Field>
            <Field label="اللون"><input type="color" value={editing.color || '#0f766e'} onChange={(e) => setEditing({ ...editing, color: e.target.value })} className="input h-10 p-1" /></Field>
            <Field label="الترتيب"><input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: e.target.value })} className="input" /></Field>
            <Field label="الأيقونة"><input value={editing.icon || ''} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} className="input" dir="ltr" /></Field>
            <div className="sm:col-span-2"><Field label="الوصف (عربي)"><TextArea value={editing.description_ar || ''} onChange={(e) => setEditing({ ...editing, description_ar: e.target.value })} /></Field></div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------- Categories ---------------------------------- */
function Categories() {
  const { data, reload, loading } = useApi<any[]>('/api/admin/categories');
  const { data: systems } = useApi<any[]>('/api/admin/systems');
  const { push } = useToast();
  const [editing, setEditing] = useState<any>(null);
  const save = async (form: any) => {
    try {
      if (form.id) await api.put(`/api/admin/categories/${form.id}`, form);
      else await api.post('/api/admin/categories', form);
      push('تم الحفظ'); setEditing(null); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  return (
    <div className="space-y-2.5">
      <button onClick={() => setEditing({})} className="btn-primary w-full text-[11.5px]"><Plus className="h-4 w-4" />تصنيف جديد</button>
      {loading && !data && <PageLoader />}
      <div className="space-y-1">
        {(data || []).map((c) => (
          <button key={c.id} onClick={() => setEditing(c)} className="flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-start border-white/[.08] bg-ink-900">
            <Layers className="h-3.5 w-3.5 text-brand-300" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold">{c.name_ar}</span>
            <span className="shrink-0 text-[9.5px] text-ink-400">{c.system_ar || c.system_en}</span>
            <Badge>{c.drugs}</Badge>
          </button>
        ))}
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'تعديل التصنيف' : 'تصنيف جديد'} footer={<>
          <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
          <button onClick={() => save(editing)} className="btn-primary">حفظ</button>
        </>}>
          <div className="grid gap-2">
            <Field label="الجهاز" required><Select value={editing.system_id || ''} onChange={(e) => setEditing({ ...editing, system_id: Number(e.target.value) })}>
              <option value="">—</option>{(systems || []).map((s) => <option key={s.id} value={s.id}>{s.name_ar}</option>)}
            </Select></Field>
            <Field label="الاسم الإنجليزي" required><input value={editing.name_en || ''} onChange={(e) => setEditing({ ...editing, name_en: e.target.value })} className="input" dir="ltr" /></Field>
            <Field label="الاسم العربي" required><input value={editing.name_ar || ''} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} className="input" /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------- Companies ---------------------------------- */
function Companies() {
  const [tab, setTab] = useState<'manufacturers' | 'agents'>('manufacturers');
  const [q, setQ] = useState('');
  const query = useDebounced(q, 300);
  const { data, reload, loading } = useApi<any[]>(tab === 'manufacturers' ? '/api/admin/manufacturers' : '/api/admin/agents', { q: query || undefined });
  const { push } = useToast();
  const [editing, setEditing] = useState<any>(null);
  const save = async (form: any) => {
    const base = tab === 'manufacturers' ? '/api/admin/manufacturers' : '/api/admin/agents';
    try {
      if (form.id) await api.put(`${base}/${form.id}`, form);
      else await api.post(base, form);
      push('تم الحفظ'); setEditing(null); reload();
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };
  const remove = async (row: any) => {
    if (!confirm(`حذف «${row.name}»؟`)) return;
    const base = tab === 'manufacturers' ? '/api/admin/manufacturers' : '/api/admin/agents';
    try { await api.del(`${base}/${row.id}`); reload(); } catch { push('خطأ', 'error'); }
  };
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-1 rounded-xl p-1 bg-white/[.05]">
        {(['manufacturers', 'agents'] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={cx('rounded-lg py-1.5 text-[11.5px] font-bold', tab === k ? 'bg-brand-grad text-white shadow-glow' : 'text-ink-500')}>
            {k === 'manufacturers' ? 'الشركات المصنعة' : 'الوكلاء'}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex-1"><SearchBar value={q} onChange={setQ} placeholder="بحث…" /></div>
        <button onClick={() => setEditing({})} className="btn-primary shrink-0 px-3 text-[11.5px]"><Plus className="h-4 w-4" />إضافة</button>
      </div>
      {loading && !data && <PageLoader />}
      <div className="space-y-1">
        {(data || []).map((row) => (
          <div key={row.id} className="flex items-center gap-2 rounded-xl border px-2.5 py-2 border-white/[.08] bg-ink-900">
            {tab === 'manufacturers' ? <Building2 className="h-3.5 w-3.5 text-ink-400" /> : <Truck className="h-3.5 w-3.5 text-ink-400" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11.5px] font-bold">{row.name}</div>
              <div className="truncate text-[9.5px] text-ink-400">{[row.country, row.city, row.phone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <Badge>{row.products_count}</Badge>
            <button onClick={() => setEditing(row)} className="icon-btn h-7 w-7 text-sky-300"><Edit3 className="h-3 w-3" /></button>
            <button onClick={() => remove(row)} className="icon-btn h-7 w-7 text-rose-500"><Trash2 className="h-3 w-3" /></button>
          </div>
        ))}
      </div>
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={editing.id ? 'تعديل' : 'إضافة'} footer={<>
          <button onClick={() => setEditing(null)} className="btn-ghost">إلغاء</button>
          <button onClick={() => save(editing)} className="btn-primary">حفظ</button>
        </>}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="الاسم" required><input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="input" dir="ltr" /></Field></div>
            {tab === 'agents' && <Field label="الاسم العربي"><input value={editing.name_ar || ''} onChange={(e) => setEditing({ ...editing, name_ar: e.target.value })} className="input" /></Field>}
            <Field label="الدولة"><input value={editing.country || ''} onChange={(e) => setEditing({ ...editing, country: e.target.value })} className="input" /></Field>
            {tab === 'agents' && <Field label="المدينة"><input value={editing.city || ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} className="input" /></Field>}
            {tab === 'agents' && <Field label="الهاتف"><input value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className="input" dir="ltr" /></Field>}
            {tab === 'agents' && <Field label="البريد"><input value={editing.email || ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} className="input" dir="ltr" /></Field>}
            <Field label="الموقع"><input value={editing.website || ''} onChange={(e) => setEditing({ ...editing, website: e.target.value })} className="input" dir="ltr" /></Field>
            <div className="sm:col-span-2"><Field label="ملاحظات"><TextArea value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></Field></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
