/*
 * Admin gallery: find a product → manage its photos.
 *
 * The photo grid itself lives in components/ProductImages so the exact same controls are
 * available straight from the product page on a phone (where a pharmacist actually is).
 */
import { useState } from 'react';
import { ChevronDown, History, Image as ImageIcon, Loader2, Search, X } from 'lucide-react';
import { api, assetUrl } from '../../lib/api';
import { Badge, useToast } from '../../components/ui';
import { cx } from '../../lib/utils';
import ProductImages from '../../components/ProductImages';

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
  const [showLog, setShowLog] = useState(false);
  /* Choosing a generic (monograph) row shows its commercial packs instead of pretending a
     drug id is a product id. */
  const [packs, setPacks] = useState<any[]>([]);

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<any>('/api/catalog/search', { q: q.trim(), limit: 12 });
      setResults([
        ...(res.products || []),
        ...(res.drugs || []).slice(0, 4).map((d: any) => ({ ...d, trade_name: d.generic_name, is_drug: true })),
      ]);
    } catch (e: any) { push(e.message || 'خطأ', 'error'); }
    finally { setLoading(false); }
  };

  const loadImages = async (id: number) => {
    try { setImages(await api.get<Row[]>(`/api/admin/products/${id}/images`)); }
    catch { /* the grid below reports its own errors */ }
  };

  const choose = async (row: any) => {
    setResults([]);
    if (row.is_drug) {
      try {
        const drug = await api.get<any>(`/api/catalog/drugs/${row.id}`);
        setPacks((drug?.products || []).map((x: any) => ({ ...x, is_drug: false })));
      } catch (e: any) { push(e.message || 'خطأ', 'error'); }
      return;
    }
    setPacks([]);
    setProduct(row);
    loadImages(row.id);
  };

  /** Keep the "main photo" badge honest after an upload/replace. */
  const refreshProduct = async (id: number) => {
    try { setProduct(await api.get<any>(`/api/catalog/products/${id}`)); } catch { /* keep the old copy */ }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-rose-300" />
          <h2 className="text-[12.5px] font-extrabold">صور الأدوية</h2>
        </div>
        <p className="text-[11px] leading-5 text-ink-500">
          ابحث عن الدواء ثم أضف صورًا من <b>معرض الهاتف</b> أو الكاميرا — تُقصّ وتُدوّر وتُضغط على الجهاز قبل الرفع،
          ويُسجَّل مَن أضافها ومتى. نفس الأزرار متاحة في صفحة أي دواء داخل التطبيق.
        </p>
        <div className="mt-2 flex gap-1.5">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="اسم تجاري أو علمي أو باركود…" className="input h-9 flex-1 text-[11px]" />
          <button onClick={search} disabled={loading || !q.trim()} className="btn-primary px-3 text-[11px]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </button>
        </div>
        {packs.length > 0 && (
          <div className="mt-2 space-y-1 rounded-xl p-2 bg-brand-500/10">
            <div className="px-1 text-[10.5px] font-bold text-brand-200">اختر المنتج التجاري الذي تريد صورته ({packs.length}):</div>
            {packs.slice(0, 40).map((r: any) => (
              <button key={r.id} onClick={() => choose(r)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start text-[11px] hover:bg-white/[.06]">
                <span className="min-w-0 flex-1 truncate font-bold text-ink-100">{r.trade_name} <span className="font-normal text-ink-500">{r.strength || ''}</span></span>
                {r.image_url && <img src={assetUrl(r.image_url)} alt="" className="h-7 w-7 rounded-md object-cover" />}
              </button>
            ))}
            {!packs.length && <div className="px-1 text-[10.5px] text-ink-400">لا توجد منتجات مسجّلة لهذا الاسم العلمي بعد.</div>}
          </div>
        )}
        {results.length > 0 && (
          <div className="mt-2 max-h-52 space-y-1 overflow-y-auto">
            {results.slice(0, 12).map((r: any) => (
              <button key={`${r.is_drug ? 'd' : 'p'}-${r.id}`} onClick={() => choose(r)}
                className={cx('flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-start text-[11px]',
                  product?.id === r.id && !r.is_drug ? 'bg-brand-500/20' : 'hover:bg-white/[.06]')}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink-100">{r.trade_name || r.generic_name}</span>
                  <span className="block truncate text-[10px] text-ink-500">
                    {r.strength || ''} {r.generic_name && r.trade_name ? `· ${r.generic_name}` : ''} {r.is_drug ? '· مونوغراف' : ''}
                  </span>
                </span>
                {r.image_url && <img src={assetUrl(r.image_url)} alt="" className="h-8 w-8 rounded-md object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {product && (
        <div className="card space-y-2 p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-extrabold">{product.trade_name || product.generic_name}</div>
              <div className="truncate text-[10px] text-ink-500">{product.strength || ''} · {images.length} صورة</div>
            </div>
            <button onClick={() => { setProduct(null); setImages([]); }} className="icon-btn h-8 w-8" aria-label="إغلاق"><X className="h-4 w-4" /></button>
          </div>

          <ProductImages product={product} onChange={() => { loadImages(product.id); refreshProduct(product.id); }} />

          <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] font-bold text-ink-400 bg-white/[.04]">
            <History className="h-3.5 w-3.5" />سجل الصور (مَن ومتى)
            <ChevronDown className={cx('ms-auto h-3.5 w-3.5 transition', showLog && 'rotate-180')} />
          </button>
          {showLog && (
            <div className="space-y-1">
              {images.map((row) => (
                <div key={`log-${row.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] bg-white/[.04]">
                  <span className="min-w-0 flex-1 truncate text-ink-400">{row.uploaded_by_name || row.uploaded_by_email || 'النظام'}</span>
                  <Badge tone={row.source === 'upload' ? 'emerald' : 'neutral'}>{row.source}</Badge>
                  {row.edited ? <Badge tone="violet">مُعدّلة</Badge> : null}
                  <span className="text-ink-500">{row.created_at?.slice(0, 16)}</span>
                </div>
              ))}
              {!images.length && <p className="text-[10.5px] text-ink-500">لا صور بعد لهذا المنتج.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
