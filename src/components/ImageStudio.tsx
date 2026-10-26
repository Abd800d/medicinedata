/*
 * Client-side photo studio: crop (drag + zoom), rotate, compress — before upload.
 *
 * Why in the browser: a phone photo is 3–8 MB and often 4000 px wide, while the
 * product card shows it at 200 px. Compressing on the device means a pharmacy
 * on 3G can upload 12 photos in the time one original would take, and the server
 * never has to trust an unvalidated image.
 *
 * Everything here is local: nothing leaves the device until "تأكيد الرفع".
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Crop, Loader2, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { cx } from '../lib/utils';

export type EditedImage = {
  file: File;
  preview: string;
  width: number;
  height: number;
  bytes: number;
  bytesOriginal: number;
  edited: boolean;
};

type Props = {
  file: File;
  onDone: (out: EditedImage) => void;
  onCancel: () => void;
};

const MAX_EDGE = 1600;
const ASPECTS: { key: string; label: string; ratio: number | null }[] = [
  { key: '1:1', label: 'مربّع', ratio: 1 },
  { key: '4:3', label: '4:3', ratio: 4 / 3 },
  { key: '3:4', label: '3:4', ratio: 3 / 4 },
  { key: 'original', label: 'الأصلية', ratio: null },
];

function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, opts: {
  rotation: number; zoom: number; offX: number; offY: number; ratio: number | null; outWidth: number; background?: string;
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 0, height: 0 };
  const { rotation, zoom, offX, offY, ratio } = opts;
  let outW = opts.outWidth;
  let outH = ratio ? Math.round(outW / ratio) : Math.round((outW * img.naturalHeight) / img.naturalWidth);
  if (ratio === null && outW > MAX_EDGE) { outW = MAX_EDGE; outH = Math.round((outW * img.naturalHeight) / img.naturalWidth); }
  canvas.width = outW;
  canvas.height = outH;
  ctx.fillStyle = opts.background || '#ffffff';
  ctx.fillRect(0, 0, outW, outH);

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  /* rotated bounding box of the source image, in source pixels */
  const rotW = img.naturalWidth * cos + img.naturalHeight * sin;
  const rotH = img.naturalWidth * sin + img.naturalHeight * cos;
  const cover = Math.max(outW / rotW, outH / rotH);
  const dw = img.naturalWidth * cover;
  const dh = img.naturalHeight * cover;

  /* how far we may pan before an empty edge appears */
  const maxX = Math.max(0, (rotW * cover * zoom - outW) / 2);
  const maxY = Math.max(0, (rotH * cover * zoom - outH) / 2);
  const dx = Math.max(-maxX, Math.min(maxX, offX * outW));
  const dy = Math.max(-maxY, Math.min(maxY, offY * outH));

  ctx.save();
  ctx.translate(outW / 2 + dx, outH / 2 + dy);
  ctx.scale(zoom, zoom);
  ctx.rotate(rad);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
  return { width: outW, height: outH };
}

export default function ImageStudio({ file, onDone, onCancel }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [aspect, setAspect] = useState('1:1');
  const [quality, setQuality] = useState(0.82);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [srcUrl, setSrcUrl] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrcUrl(url);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const ratio = ASPECTS.find((a) => a.key === aspect)?.ratio ?? null;

  const paint = useCallback(() => {
    if (!canvasRef.current || !img) return;
    draw(canvasRef.current, img, { rotation, zoom, offX: off.x, offY: off.y, ratio, outWidth: 520 });
  }, [img, rotation, zoom, off.x, off.y, ratio]);

  useEffect(() => { paint(); }, [paint]);

  const clampOff = (x: number, y: number) => ({ x: Math.max(-0.45, Math.min(0.45, x)), y: Math.max(-0.45, Math.min(0.45, y)) });

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = (e.clientX - d.x) / Math.max(1, rect.width);
    const dy = (e.clientY - d.y) / Math.max(1, rect.height);
    setOff(clampOff(d.ox + dx, d.oy + dy));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const save = async () => {
    if (!img || !canvasRef.current) return;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      const outW = ratio === null ? Math.min(MAX_EDGE, img.naturalWidth) : MAX_EDGE;
      const size = draw(canvas, img, { rotation, zoom, offX: off.x, offY: off.y, ratio, outWidth: outW });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
      if (!blob) throw new Error('تعذر تجهيز الصورة');
      const base = (file.name || 'photo').replace(/\.[^.]+$/, '');
      const out = new File([blob], `${base}-mda.jpg`, { type: 'image/jpeg' });
      onDone({
        file: out,
        preview: canvas.toDataURL('image/jpeg', 0.5),
        width: size.width,
        height: size.height,
        bytes: out.size,
        bytesOriginal: file.size,
        edited: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const keepOriginal = () => onDone({
    file, preview: srcUrl, width: img?.naturalWidth || 0, height: img?.naturalHeight || 0,
    bytes: file.size, bytesOriginal: file.size, edited: false,
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="card max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-b-none p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Crop className="h-4 w-4 text-brand-300" />
          <h2 className="flex-1 text-[13px] font-extrabold">تعديل الصورة قبل الرفع</h2>
          <button onClick={onCancel} className="icon-btn h-8 w-8" aria-label="إلغاء"><X className="h-4 w-4" /></button>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-black/40">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className="mx-auto block max-h-[46vh] w-auto max-w-full cursor-grab touch-none select-none active:cursor-grabbing"
          />
          {!img && <div className="grid h-40 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-ink-400" /></div>}
        </div>
        <p className="mt-1 text-center text-[10px] text-ink-500">اسحب لتحريك الصورة داخل الإطار · استخدم التقريب للتكبير</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 text-[10.5px] font-bold text-ink-400">الأبعاد</div>
            <div className="flex gap-1">
              {ASPECTS.map((a) => (
                <button key={a.key} onClick={() => setAspect(a.key)} className={cx('flex-1 rounded-lg py-1 text-[10px] font-bold transition', aspect === a.key ? 'bg-brand-grad text-white' : 'bg-white/[.06] text-ink-400')}>{a.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-bold text-ink-400">التدوير</div>
            <div className="flex gap-1">
              <button onClick={() => setRotation((r) => (r + 270) % 360)} className="icon-btn h-8 flex-1" aria-label="تدوير يسار"><RotateCcw className="h-3.5 w-3.5" /></button>
              <button onClick={() => setRotation((r) => (r + 90) % 360)} className="icon-btn h-8 flex-1" aria-label="تدوير يمين"><RotateCw className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setRotation(0); setZoom(1); setOff({ x: 0, y: 0 }); }} className="icon-btn h-8 flex-1 text-[9px] font-bold">صفّر</button>
            </div>
          </div>
        </div>

        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold text-ink-400"><span>التكبير</span><span>{zoom.toFixed(2)}×</span></div>
          <div className="flex items-center gap-2">
            <ZoomOut className="h-3.5 w-3.5 text-ink-500" />
            <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="h-1 flex-1 accent-brand-500" />
            <ZoomIn className="h-3.5 w-3.5 text-ink-500" />
          </div>
        </div>

        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[10.5px] font-bold text-ink-400"><span>جودة الضغط</span><span>{quality >= 0.9 ? 'عالية' : quality >= 0.8 ? 'متوازنة' : 'صغيرة'}</span></div>
          <div className="flex gap-1">
            {[[0.7, 'حجم صغير'], [0.82, 'متوازنة'], [0.92, 'جودة عالية']].map(([q, label]) => (
              <button key={q} onClick={() => setQuality(q as number)} className={cx('flex-1 rounded-lg py-1 text-[10px] font-bold transition', quality === q ? 'bg-brand-grad text-white' : 'bg-white/[.06] text-ink-400')}>{label as string}</button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={save} disabled={!img || saving} className="btn-primary flex-1 text-[11.5px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}اعتماد التعديل
          </button>
          <button onClick={keepOriginal} className="btn-ghost text-[11.5px]">بدون تعديل</button>
        </div>
        <p className="mt-2 rounded-lg p-2 text-[10px] leading-4 bg-white/[.05] text-ink-500">
          تُصغَّر الصورة إلى 1600 بكسل كحد أقصى وتُحوَّل إلى JPEG. الأصل: {(file.size / 1024 / 1024).toFixed(2)} MB — لا يُرفع أي شيء قبل اعتمادك.
        </p>
      </div>
    </div>
  );
}
