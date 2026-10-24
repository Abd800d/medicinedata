import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, Loader2 } from 'lucide-react';
import { useI18n } from '../lib/i18n';

/* Barcode scanning with two engines, so it works everywhere:
 *  1. native BarcodeDetector (Chrome desktop / Android Chrome) — zero download
 *  2. ZXing (@zxing/browser, lazy-loaded) — Android WebView inside the APK, iOS Safari, Firefox
 * If neither is usable the component falls back to typing the number. */

type DetectedBarcode = { rawValue: string; format: string };
type DetectorCtor = new (options?: { formats?: string[] }) => {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
};

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
const hasNative = () => typeof window !== 'undefined' && typeof (window as any).BarcodeDetector === 'function';

export default function BarcodeScanner({ onDetect, busy = false }: { onDetect: (code: string) => void; busy?: boolean }) {
  const { lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const doneRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<'native' | 'zxing' | null>(null);
  const [manual, setManual] = useState('');

  const stop = useCallback(() => {
    doneRef.current = true;
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    try { controlsRef.current?.stop(); } catch { /* already stopped */ }
    controlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
    setEngine(null);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const accept = useCallback((raw: string) => {
    const code = String(raw || '').replace(/\s/g, '');
    if (code.replace(/\D/g, '').length < 8) return false;
    doneRef.current = true;
    navigator.vibrate?.(60);
    onDetect(code);
    stop();
    return true;
  }, [onDetect, stop]);

  const tickNative = useCallback(async (detector: InstanceType<DetectorCtor>, canvas: HTMLCanvasElement) => {
    const video = videoRef.current;
    if (doneRef.current || !video) return;
    if (video.readyState >= 2 && video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const codes = await detector.detect(canvas);
          const hit = codes.find((c) => c.rawValue && c.rawValue.replace(/\D/g, '').length >= 8);
          if (hit && accept(hit.rawValue)) return;
        } catch { /* frame not decodable yet */ }
      }
    }
    timerRef.current = window.setTimeout(() => tickNative(detector, canvas), 320);
  }, [accept]);

  const startNative = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    streamRef.current = stream;
    if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
    setEngine('native');
    const detector = new ((window as any).BarcodeDetector as DetectorCtor)({ formats: FORMATS });
    timerRef.current = window.setTimeout(() => tickNative(detector, document.createElement('canvas')), 350);
  };

  const startZxing = async () => {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
    const hints = new Map<any, any>();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
    const video = videoRef.current;
    if (!video) throw new Error('no video element');
    setEngine('zxing');
    controlsRef.current = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' } } },
      video,
      (result) => { if (result) accept(result.getText()); },
    );
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(lang === 'ar' ? 'الكاميرا غير متاحة — افتح التطبيق عبر HTTPS أو من تطبيق الأندرويد.' : 'Camera unavailable — use HTTPS or the Android app.');
      return;
    }
    doneRef.current = false;
    setScanning(true);
    await new Promise((r) => setTimeout(r, 80)); // let the <video> mount
    try {
      if (hasNative()) await startNative();
      else await startZxing();
    } catch (e: any) {
      stop();
      const name = e?.name || '';
      setError(name === 'NotAllowedError'
        ? (lang === 'ar' ? 'تم رفض إذن الكاميرا — فعّل الإذن من إعدادات المتصفح.' : 'Camera permission denied — allow it in the browser settings.')
        : name === 'NotFoundError'
          ? (lang === 'ar' ? 'لا توجد كاميرا على هذا الجهاز.' : 'No camera found on this device.')
          : (lang === 'ar' ? `تعذر تشغيل الكاميرا (${e?.message || 'خطأ'}). اكتب الرقم يدويًا.` : `Could not start the camera (${e?.message || 'error'}). Type the number instead.`));
    }
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manual.replace(/[\s-]/g, '');
    if (code.length >= 6) onDetect(code);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 dark:border-ink-800">
        {scanning ? (
          <>
            <video ref={videoRef} playsInline muted className="h-[220px] w-full object-cover" />
            <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-emerald-400/80" />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 animate-pulse bg-emerald-400/80" />
            <div className="pointer-events-none absolute bottom-2 start-2 rounded-full bg-black/50 px-2 py-0.5 text-[9.5px] font-bold text-white/80">
              {engine === 'zxing' ? 'ZXing' : engine === 'native' ? 'BarcodeDetector' : '…'}
            </div>
            <button onClick={stop} className="absolute end-2 top-2 flex h-8 items-center gap-1 rounded-full bg-black/55 px-2.5 text-[10.5px] font-bold text-white">
              <CameraOff className="h-3.5 w-3.5" /> {lang === 'ar' ? 'إيقاف' : 'Stop'}
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-7 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Camera className="h-6 w-6" /></span>
            <div className="text-[12.5px] font-bold text-white">{lang === 'ar' ? 'امسح باركود العلبة' : 'Scan the pack barcode'}</div>
            <p className="max-w-xs text-[11px] leading-5 text-white/60">
              {lang === 'ar' ? 'وجّه الكاميرا إلى الباركود (EAN-13 / UPC) ليظهر المنتج مباشرة.' : 'Point the camera at an EAN-13 / UPC barcode to open the product.'}
            </p>
            <button onClick={start} disabled={busy} className="mt-1 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-[11.5px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {lang === 'ar' ? 'تشغيل الكاميرا' : 'Start camera'}
            </button>
          </div>
        )}
      </div>

      {error && <p className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-200">{error}</p>}

      <form onSubmit={submitManual} className="flex gap-2">
        <div className="relative flex-1">
          <Keyboard className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="numeric" dir="ltr"
            placeholder={lang === 'ar' ? 'أو اكتب رقم الباركود…' : 'Or type the barcode…'} className="input ps-9" />
        </div>
        <button type="submit" disabled={manual.replace(/\D/g, '').length < 6 || busy} className="btn-primary shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{lang === 'ar' ? 'بحث' : 'Look up'}
        </button>
      </form>
    </div>
  );
}
