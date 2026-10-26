/*
 * Product photo gallery: search a product → see every photo with who added it and
 * when → add (with crop/rotate/compress first) → reorder → set primary → delete.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, ChevronLeft, ChevronRight, History, Image as ImageIcon, Loader2, Search, Star, Trash2, UploadCloud, X,
} from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { Badge, useToast } from '../../components/ui';
import { cx, num } from '../../lib/utils';
import ImageStudio, { type EditedImage } from '../../components/ImageStudio';

type Row = {
  id: number; url: string; source: string; sort_order: number; created_at: string; updated_at?: string;
  uploaded_by?: number | null; uploaded_by_name?: string | null; uploaded_by_email?: string | null;
  bytes?: number | null; bytes_original?: number | null; width?: number | null; height?: number | null; edited?: number;
};

export default function ProductGallery() {
  const { push } = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [product, setProduct] = useState<any>(null);
  const [images, setImages] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [editing, setEditing] = useState<File | null>(null);
  const [ready, setReady] = useState<EditedImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<any>('/api/catalog/search', { q: q.trim(), limit: 12 });
      setResults([...(res.products || []), ...(res.drugs || []).slice(0, 4).map((d: any) => ({ ...d, trade_name: d.generic_name, is_drug: true }))]);
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setLoading(false); }
  };

  const loadImages = async (id: number) => {
    try { setImages(await api.get<Row[]>(`/api/admin/products/${id}/images`)); }
    catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  useEffect(() => { if (product?.id) loadImages(product.id); }, [product?.id]);

  const pick = (files: FileList | null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setQueue(list);
    setEditing(list[0]);
  };

  const next = () => {
    const rest = queue.slice(1);
    setQueue(rest);
    setEditing(rest[0] || null);
  };

  const accept = (out: EditedImage) => {
    setReady((prev) => [...prev, out]);
    next();
  };

  const upload = async () => {
    if (!product || !ready.length) return;
    setUploading(true);
    try {
      const fd = new FormData();
      ready.forEach((r) => fd.append('images', r.file));
      fd.append('edited', ready.some((r) => r.edited) ? '1' : '0');
      const first = ready.find((r) => r.edited);
      if (first) {
        fd.append('width', String(first.width));
        fd.append('height', String(first.height));
        fd.append('bytes_original', String(ready.reduce((n, r) => n + r.bytesOriginal, 0)));
      }
      await api.post(`/api/admin/products/${product.id}/images`, fd);
      push(`تم رفع ${ready.length} صورة`);
      setReady([]); setQueue([]);
      await loadImages(product.id);
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setUploading(false); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...images];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setImages(next);
    try {
      await api.post(`/api/admin/products/${product.id}/images/reorder`, { ids: next.map((r) => r.id) });
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  const setPrimary = async (url: string) => {
    try {
      await api.put(`/api/admin/products/${product.id}/image`, { url });
      push('أصبحت الصورة الرئيسية');
      await loadImages(product.id);
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  const remove = async (row: Row) => {
    if (!window.confirm('حذف هذه الصورة نهائيًا؟ لا يمكن التراجع.')) return;
    try {
      await api.del(`/api/admin/product-images/${row.id}`);
      push('حُذفت الصورة');
      await loadImages(product.id);
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2"><ImageIcon className="h-4 w-4 text-rose-300" /><h2 className="text-[12.5px] font-extrabold">معرض صور المنتج</h2></div>
        <p className="text-[11px] leading-5 text-ink-500">ابحث عن المنتج، ثم أضف عدة صور من الكاميرا أو المعرض — مع قص وتدوير وضغط على الجهاز قبل الرفع. يُسجَّل مَن أضاف الصورة ومتى.</p>
        <div className="mt-2 flex gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }} placeholder="اسم تجاري أو علمي أو باركود…" className="input h-9 flex-1 text-[11px]" />
          <button onClick={search} disabled={loading || !q.trim()} className="btn-primary px-3 text-[11px]">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}</button>
        </div>
        {results.length > 0 && (
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {results.slice(0, 12).map((r: any) => (
              <button key={`${r.is_drug ? 'd' : 'p'}-${r.id}`} onClick={() => { setProduct(r); setResults([]); setReady([]); }}
                className={cx('flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-[11px]', product?.id === r.id && !r.is_drug ? 'bg-brand-500/20' : 'hover:bg-white/[.06]')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink-100">{r.trade_name || r.generic_name}</span>
                  <span className="block truncate text-[10px] text-ink-500">{r.strength || ''} {r.generic_name && r.trade_name ? `· ${r.generic_name}` : ''} {r.is_drug ? '· مونوغراف' : ''}</span>
                </span>
                {r.image_url && <img src={r.image_url} alt="" className="h-8 w-8 rounded-md object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {product && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-extrabold">{product.trade_name || product.generic_name}</div>
              <div className="truncate text-[10px] text-ink-500">{product.strength || ''} · {images.length} صورة</div>
            </div>
            <button onClick={() => { setProduct(null); setImages([]); }} className="icon-btn h-8 w-8"><X className="h-4 w-4" /></button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {images.map((row, i) => (
              <div key={row.id} className="group relative overflow-hidden rounded-xl border border-white/[.09] bg-black/20">
                <img src={row.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                {product.image_url === row.url && <span className="absolute start-1 top-1 rounded-md bg-emerald-500/90 px-1 py-0.5 text-[8.5px] font-bold text-white">رئيسية</span>}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-black/65 px-1 py-0.5 opacity-0 transition group-hover:opacity-100 sm:opacity-100">
                  <span className="text-[8.5px] text-white/70">#{i + 1}</span>
                  <div className="flex gap-0.5">
                    <button onClick={() => move(i, -1)} className="rounded p-0.5 text-white/80 hover:bg-white/20" aria-label="تقديم"><ChevronRight className="h-3 w-3" /></button>
                    <button onClick={() => move(i, 1)} className="rounded p-0.5 text-white/80 hover:bg-white/20" aria-label="تأخير"><ChevronLeft className="h-3 w-3" /></button>
                    <button onClick={() => setPrimary(row.url)} className="rounded p-0.5 text-amber-300 hover:bg-white/20" aria-label="تعيين رئيسية"><Star className="h-3 w-3" /></button>
                    <button onClick={() => remove(row)} className="rounded p-0.5 text-rose-300 hover:bg-white/20" aria-label="حذف"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => inputRef.current?.click()} className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-white/[.12] text-ink-500 transition hover:border-brand-400/50 hover:text-brand-300">
              <span className="flex flex-col items-center gap-1"><UploadCloud className="h-5 w-5" /><span className="text-[9.5px] font-bold">إضافة</span></span>
            </button>
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} />

          {ready.length > 0 && (
            <div className="mt-3 rounded-xl p-2 bg-white/[.05]">
              <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />جاهز للرفع ({ready.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {ready.map((r, i) => (
                  <div key={i} className="relative">
                    <img src={r.preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
                    <button onClick={() => setReady((prev) => prev.filter((_, j) => j !== i))} className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white"><X className="h-2.5 w-2.5" /></button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] text-ink-500">
                {ready.every((r) => r.edited)
                  ? `ضُغطت: ${num(Math.round(ready.reduce((n, r) => n + r.bytes, 0) / 1024))} KB بدل ${num(Math.round(ready.reduce((n, r) => n + r.bytesOriginal, 0) / 1024))} KB`
                  : 'بعض الصور بدون تعديل'}
              </div>
              <div className="mt-2 flex gap-1.5">
                <button onClick={upload} disabled={uploading} className="btn-primary flex-1 text-[11px]">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}رفع {ready.length} صورة</button>
                <button onClick={() => setReady([])} className="btn-ghost text-[11px]">إلغاء</button>
              </div>
            </div>
          )}

          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-ink-400"><History className="h-3.5 w-3.5" />سجل الصور (مَن ومتى)</div>
            {images.slice(0, 6).map((row) => (
              <div key={`log-${row.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] bg-white/[.04]">
                <span className="min-w-0 flex-1 truncate text-ink-400">{row.uploaded_by_name || row.uploaded_by_email || 'النظام'}</span>
                <Badge tone={row.source === 'upload' ? 'emerald' : 'neutral'}>{row.source}</Badge>
                {row.edited ? <Badge tone="violet">مُعدّلة</Badge> : null}
                <span className="text-ink-500">{row.created_at?.slice(0, 16)}</span>
              </div>
            ))}
            {!images.length && <p className="text-[10.5px] text-ink-500">لا صور بعد لهذا المنتج.</p>}
          </div>
        </div>
      )}

      {editing && (
        <ImageStudio
          file={editing}
          onDone={accept}
          onCancel={() => { setQueue([]); setEditing(null); }}
        />
      )}
    </div>
  );
}
