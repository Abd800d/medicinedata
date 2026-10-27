/*
 * Product photo manager — the same component used inside the admin panel and on the
 * product page, because "add a photo of this medicine" belongs where the medicine is.
 *
 * Written for a phone first:
 *   • two obvious buttons: من معرض الهاتف (gallery) and الكاميرا (camera intent);
 *   • every action under a photo is a real tap target that is always visible — the previous
 *     gallery revealed its buttons on hover, which never happens on a touch screen;
 *   • the photo is straightened (EXIF), downscaled and compressed on the device before it is
 *     uploaded, so a pharmacy on mobile data is not sending 8 MB per pack;
 *   • an already published photo can be re-opened in the studio and saved in place.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera, ChevronLeft, ChevronRight, Image as ImageIcon, Loader2, Pencil, Plus, RefreshCw, Star, Trash2, UploadCloud, X,
} from 'lucide-react';
import { api, assetUrl } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { cx, num } from '../lib/utils';
import { Badge, useToast } from './ui';
import ImageStudio, { type EditedImage } from './ImageStudio';
import { decodeErrorMessage, fileFromUrl, normalizeImage } from '../lib/imageFile';

export type ProductImageRow = {
  id: number; url: string; source: string; sort_order: number; created_at: string; updated_at?: string;
  uploaded_by?: number | null; uploaded_by_name?: string | null; uploaded_by_email?: string | null;
  bytes?: number | null; bytes_original?: number | null; width?: number | null; height?: number | null; edited?: number;
};

type Props = {
  product: { id: number; trade_name?: string | null; generic_name?: string | null; image_url?: string | null } | null;
  /** Called after a successful upload/replace/delete so the parent can reload the product. */
  onChange?: () => void;
  /** Product page layout: one compact block instead of the full admin panel. */
  compact?: boolean;
};

export default function ProductImages({ product, onChange, compact = false }: Props) {
  const { user } = useAuth();
  const { lang } = useI18n();
  const { push } = useToast();
  const ar = lang === 'ar';
  const isAdmin = user?.role === 'admin';
  const canManage = isAdmin || user?.role === 'pharmacist';

  const [images, setImages] = useState<ProductImageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [editing, setEditing] = useState<File | null>(null);
  const [ready, setReady] = useState<EditedImage[]>([]);
  const [replacing, setReplacing] = useState<ProductImageRow | null>(null);
  const [makePrimary, setMakePrimary] = useState(true);
  const [busy, setBusy] = useState<'upload' | 'replace' | null>(null);
  const [preparing, setPreparing] = useState(0);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!product?.id || !canManage) return;
    setLoading(true);
    try { setImages(await api.get<ProductImageRow[]>(`/api/admin/products/${product.id}/images`)); }
    catch (e: any) { push(e?.message || (ar ? 'تعذّر تحميل الصور' : 'Could not load images'), 'error'); }
    finally { setLoading(false); }
  }, [product?.id, canManage, ar, push]);

  useEffect(() => { load(); }, [load]);

  /** Phone/gallery/camera files → straighten + compress → open the studio one by one. */
  const pick = async (files: FileList | null, replaceRow: ProductImageRow | null = null) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(f.name || ''));
    if (!list.length) return;
    setPreparing(list.length);
    const prepared: File[] = [];
    for (const file of list) {
      try {
        const out = await normalizeImage(file);
        prepared.push(out.file);
      } catch (error) {
        push(decodeErrorMessage(error, ar ? 'ar' : 'en'), 'error');
      }
    }
    setPreparing(0);
    if (!prepared.length) return;
    if (replaceRow) {
      setReplacing(replaceRow);
      setEditing(prepared[0]);
    } else {
      setQueue(prepared.slice(1));
      setEditing(prepared[0]);
    }
  };

  const next = () => {
    const rest = queue.slice(1);
    setQueue(rest);
    setEditing(rest[0] || null);
  };

  const accept = async (out: EditedImage) => {
    if (replacing) {
      await sendReplace(replacing, out);
      setReplacing(null);
      setEditing(null);
      return;
    }
    setReady((prev) => [...prev, out]);
    next();
  };

  const sendReplace = async (row: ProductImageRow, out: EditedImage) => {
    if (!product) return;
    setBusy('replace');
    try {
      const fd = new FormData();
      fd.append('image', out.file);
      fd.append('edited', out.edited ? '1' : '0');
      fd.append('width', String(out.width || ''));
      fd.append('height', String(out.height || ''));
      fd.append('bytes_original', String(out.bytesOriginal || out.bytes));
      await api.put(`/api/admin/product-images/${row.id}/file`, fd);
      push(ar ? 'تم استبدال الصورة وتحديث كل الشاشات' : 'Photo replaced');
      await load();
      onChange?.();
    } catch (e: any) { push(e?.message || (ar ? 'تعذّر استبدال الصورة' : 'Replace failed'), 'error'); }
    finally { setBusy(null); }
  };

  const upload = async () => {
    if (!product || !ready.length) return;
    setBusy('upload');
    try {
      const fd = new FormData();
      ready.forEach((r) => fd.append('images', r.file));
      fd.append('edited', ready.every((r) => r.edited) ? '1' : '0');
      const first = ready.find((r) => r.edited) || ready[0];
      if (first?.width) fd.append('width', String(first.width));
      if (first?.height) fd.append('height', String(first.height));
      fd.append('bytes_original', String(ready.reduce((n, r) => n + (r.bytesOriginal || 0), 0)));
      const created = await api.post<ProductImageRow[]>(`/api/admin/products/${product.id}/images`, fd);
      if (makePrimary && created?.[0]?.url) {
        await api.put(`/api/admin/products/${product.id}/image`, { url: created[0].url });
      }
      push(ar ? `تم رفع ${ready.length} صورة` : `${ready.length} photo(s) uploaded`);
      setReady([]); setQueue([]);
      await load();
      onChange?.();
    } catch (e: any) { push(e?.message || (ar ? 'تعذّر رفع الصور' : 'Upload failed'), 'error'); }
    finally { setBusy(null); }
  };

  const setPrimary = async (row: ProductImageRow) => {
    if (!product) return;
    try {
      await api.put(`/api/admin/products/${product.id}/image`, { url: row.url });
      push(ar ? 'أصبحت الصورة الرئيسية' : 'Set as main photo');
      await load();
      onChange?.();
    } catch (e: any) { push(e?.message || (ar ? 'تعذّر التحديد' : 'Failed'), 'error'); }
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!product) return;
    const list = [...images];
    const j = index + dir;
    if (j < 0 || j >= list.length) return;
    [list[index], list[j]] = [list[j], list[index]];
    setImages(list);
    try { await api.post(`/api/admin/products/${product.id}/images/reorder`, { ids: list.map((r) => r.id) }); }
    catch (e: any) { push(e?.message || 'خطأ', 'error'); load(); }
  };

  const remove = async (row: ProductImageRow) => {
    const ok = window.confirm(ar ? 'حذف هذه الصورة نهائيًا؟ لا يمكن التراجع.' : 'Delete this photo permanently?');
    if (!ok) return;
    try {
      await api.del(`/api/admin/product-images/${row.id}`);
      push(ar ? 'حُذفت الصورة' : 'Photo deleted');
      await load();
      onChange?.();
    } catch (e: any) { push(e?.message || (ar ? 'تعذّر الحذف' : 'Delete failed'), 'error'); }
  };

  /** Re-open a published photo in the studio (already cropped once, may need a better crop). */
  const editExisting = async (row: ProductImageRow) => {
    try {
      const file = await fileFromUrl(row.url, `product-${product?.id || 0}-${row.id}.jpg`);
      const out = await normalizeImage(file);
      setReplacing(row);
      setEditing(out.file);
    } catch (error) {
      push(decodeErrorMessage(error, ar ? 'ar' : 'en'), 'error');
    }
  };

  /* Reset the inputs even when the same file is chosen twice in a row — otherwise the browser
     fires no change event the second time and the button looks dead. */
  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    e.target.value = '';
    void pick(files);
  };

  if (!product || !canManage) return null;
  const mainUrl = product.image_url || images[0]?.url || '';

  return (
    <div className={cx('space-y-2', compact && 'space-y-1.5')}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button onClick={() => galleryRef.current?.click()} disabled={!!preparing}
          className="btn-primary flex-1 px-3 py-2 text-[11.5px]">
          {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          {preparing ? (ar ? 'تجهيز الصورة…' : 'Preparing…') : (ar ? 'إضافة من معرض الهاتف' : 'Add from gallery')}
        </button>
        <button onClick={() => cameraRef.current?.click()} disabled={!!preparing}
          className="btn-soft flex-1 px-3 py-2 text-[11.5px]">
          <Camera className="h-3.5 w-3.5" />{ar ? 'الكاميرا' : 'Camera'}
        </button>
        <button onClick={load} className="icon-btn h-9 w-9" aria-label={ar ? 'تحديث' : 'Refresh'}>
          <RefreshCw className={cx('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Gallery (multiple) and camera (single) are separate inputs: on Android the second one
          asks the chooser to open the camera app directly. */}
      <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={onPicked} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPicked} />

      {loading && !images.length ? (
        <div className="flex items-center gap-2 rounded-xl p-3 text-[11px] text-ink-400 bg-white/[.04]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />{ar ? 'تحميل الصور…' : 'Loading photos…'}
        </div>
      ) : images.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-white/[.12] p-4 text-center">
          <UploadCloud className="mx-auto mb-1 h-5 w-5 text-ink-500" />
          <p className="text-[11px] font-bold text-ink-300">{ar ? 'لا توجد صورة حقيقية بعد' : 'No real photo yet'}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-ink-500">
            {ar ? 'صوّر علبة الدواء من الأمام على خلفية بيضاء — تُقصّ وتُضغط على الهاتف قبل الرفع.' : 'Shoot the front of the pack on a white surface — it is cropped and compressed on the phone.'}
          </p>
        </div>
      ) : (
        <div className={cx('grid gap-2', compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3')}>
          {images.map((row, i) => (
            <div key={row.id} className="overflow-hidden rounded-xl border border-white/[.09] bg-white/[.03]">
              <div className="relative bg-black/25">
                <img src={assetUrl(row.url)} alt="" className="aspect-square w-full object-contain" loading="lazy" />
                {mainUrl === row.url && (
                  <span className="absolute start-1 top-1 rounded-md bg-emerald-500 px-1.5 py-0.5 text-[8.5px] font-black text-white">
                    {ar ? 'الرئيسية' : 'Main'}
                  </span>
                )}
              </div>
              {/* Always visible: a touch screen has no hover, so a hover-only toolbar is unusable. */}
              <div className="flex items-center justify-between gap-0.5 border-t border-white/[.06] p-0.5">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md px-1.5 py-1 text-ink-300 disabled:opacity-25" aria-label={ar ? 'تقديم' : 'Move earlier'}>
                  <ChevronRight className="h-3.5 w-3.5 rtl:block ltr:hidden" /><ChevronLeft className="hidden h-3.5 w-3.5 ltr:block" />
                </button>
                <button onClick={() => setPrimary(row)} className={cx('rounded-md px-1.5 py-1', mainUrl === row.url ? 'text-emerald-300' : 'text-amber-300')} aria-label={ar ? 'تعيين رئيسية' : 'Set main'}>
                  <Star className={cx('h-3.5 w-3.5', mainUrl === row.url && 'fill-current')} />
                </button>
                <button onClick={() => editExisting(row)} className="rounded-md px-1.5 py-1 text-brand-300" aria-label={ar ? 'تعديل الصورة' : 'Edit photo'}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {isAdmin ? (
                  <button onClick={() => remove(row)} className="rounded-md px-1.5 py-1 text-rose-300" aria-label={ar ? 'حذف' : 'Delete'}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="px-1.5 text-[9px] text-ink-600" title={ar ? 'الحذف للمدير فقط' : 'Admin only'}>—</span>
                )}
                <button onClick={() => move(i, 1)} disabled={i === images.length - 1} className="rounded-md px-1.5 py-1 text-ink-300 disabled:opacity-25" aria-label={ar ? 'تأخير' : 'Move later'}>
                  <ChevronLeft className="h-3.5 w-3.5 rtl:block ltr:hidden" /><ChevronRight className="hidden h-3.5 w-3.5 ltr:block" />
                </button>
              </div>
            </div>
          ))}
          <button onClick={() => galleryRef.current?.click()}
            className="grid aspect-square place-items-center rounded-xl border-2 border-dashed border-white/[.12] text-ink-500 transition hover:border-brand-400/50 hover:text-brand-300">
            <span className="flex flex-col items-center gap-1"><Plus className="h-5 w-5" /><span className="text-[9.5px] font-bold">{ar ? 'إضافة' : 'Add'}</span></span>
          </button>
        </div>
      )}

      {ready.length > 0 && (
        <div className="rounded-xl p-2 bg-white/[.05]">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold text-emerald-300">
            <UploadCloud className="h-3.5 w-3.5" />{ar ? `جاهز للرفع (${ready.length})` : `Ready (${ready.length})`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ready.map((r, i) => (
              <div key={i} className="relative">
                <img src={r.preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
                <button onClick={() => setReady((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -end-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-white">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-ink-500">
            {ar ? `الحجم بعد الضغط: ${num(Math.round(ready.reduce((n, r) => n + r.bytes, 0) / 1024))} KB`
              : `After compression: ${num(Math.round(ready.reduce((n, r) => n + r.bytes, 0) / 1024))} KB`}
          </div>
          <label className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-ink-300">
            <input type="checkbox" checked={makePrimary} onChange={(e) => setMakePrimary(e.target.checked)} className="accent-brand-500" />
            {ar ? 'اجعلها الصورة الرئيسية للدواء' : 'Make it the main photo'}
          </label>
          <div className="mt-2 flex gap-1.5">
            <button onClick={upload} disabled={busy === 'upload'} className="btn-primary flex-1 text-[11px]">
              {busy === 'upload' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
              {ar ? `رفع ${ready.length}` : `Upload ${ready.length}`}
            </button>
            <button onClick={() => setReady([])} className="btn-ghost text-[11px]">{ar ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {busy === 'replace' && (
        <p className="flex items-center gap-2 text-[11px] text-brand-300"><Loader2 className="h-3.5 w-3.5 animate-spin" />{ar ? 'جارٍ استبدال الصورة…' : 'Replacing…'}</p>
      )}

      <p className="text-[10px] leading-4 text-ink-500">
        {ar ? 'الصور تُقصّ وتُدوّر وتُضغط على الهاتف قبل الرفع، ويُسجَّل من أضافها ومتى.'
          : 'Photos are cropped, rotated and compressed on the phone; who added them and when is recorded.'}
        {images[0]?.uploaded_by_name ? (
          <span className="ms-1">· <Badge tone="neutral">{images[0].uploaded_by_name}</Badge></span>
        ) : null}
      </p>

      {editing && (
        <ImageStudio
          file={editing}
          onDone={accept}
          onCancel={() => { setQueue([]); setEditing(null); setReplacing(null); }}
        />
      )}
    </div>
  );
}
