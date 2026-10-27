/*
 * Phone photo → upload-ready file.
 *
 * A picture that comes from the phone gallery (الاستوديو) arrives with three surprises:
 *   1. EXIF rotation — a portrait shot is often stored sideways and only *looks* right because
 *      the viewer honours the orientation tag. Drawing it with drawImage() would rotate it.
 *   2. Size — 4000 px wide and 4–9 MB, while the product card shows it at ~200 px. On a
 *      Yemeni mobile connection that is the difference between one upload and twelve.
 *   3. HEIC — several Android phones save HEIC/HEIF, which this WebView cannot decode.
 *
 * Everything here runs on the device. Nothing leaves the phone until the user confirms.
 */
import { assetUrl } from './api';
import { smartFetch } from './nativeHttp';

/** Longest edge kept when we first touch the file (the studio then crops to 1600). */
export const MAX_SOURCE_EDGE = 2048;

export class ImageDecodeError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = 'ImageDecodeError';
  }
}

/** Arabic explanation shown to the user for a photo the phone cannot decode. */
export function decodeErrorMessage(error: unknown, lang: 'ar' | 'en' = 'ar'): string {
  const code = (error as any)?.code;
  if (lang === 'en') {
    if (code === 'heic') return 'This phone saved the photo as HEIC/HEIF and the app cannot read it. Take the photo with the app camera, or export it as JPG.';
    return 'The image could not be opened — it may be damaged or in an unsupported format. Try another photo.';
  }
  if (code === 'heic') return 'الهاتف يحفظ الصورة بصيغة HEIC غير المدعومة. صوّرها بكاميرا التطبيق أو حوّلها إلى JPG من المعرض ثم أعد المحاولة.';
  return 'لم نتمكن من فتح الصورة — قد تكون تالفة أو بصيغة غير مدعومة. جرّب صورة أخرى.';
}

const HEIC_TYPE = /^image\/(hei[cf]|heif)$/i;
export const looksHeic = (file: File) =>
  HEIC_TYPE.test(file.type || '') || /\.(heic|heif)$/i.test(file.name || '');

async function decodeBitmap(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    /* `from-image` bakes the EXIF rotation into the pixels — without it every portrait
       photo from a phone ends up lying on its side in the cropper. */
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

function canDecode(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.naturalWidth > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

export type NormalizedImage = {
  file: File;
  width: number;
  height: number;
  /** Size of the file as it arrived from the gallery. */
  originalBytes: number;
  /** True when we re-encoded it (orientation baked in and/or downscaled). */
  changed: boolean;
};

/**
 * Re-encode a gallery photo as an upright, bounded JPEG. Falls back to the original file when
 * the platform has no `createImageBitmap`, so older WebViews still work.
 */
export async function normalizeImage(input: File): Promise<NormalizedImage> {
  const originalBytes = input.size;
  const bitmap = await decodeBitmap(input);
  if (!bitmap) {
    if (looksHeic(input) || !(await canDecode(input))) throw new ImageDecodeError(looksHeic(input) ? 'heic' : 'decode');
    return { file: input, width: 0, height: 0, originalBytes, changed: false };
  }
  try {
    const scale = Math.min(1, MAX_SOURCE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageDecodeError('canvas');
    /* White, not transparent: JPEG has no alpha and product packs sit on white. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) throw new ImageDecodeError('encode');
    const name = `${(input.name || 'photo').replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
    const file = new File([blob], name, { type: 'image/jpeg' });
    return { file, width, height, originalBytes, changed: true };
  } finally {
    (bitmap as ImageBitmap).close?.();
  }
}

/** Pull a published photo back into the studio so it can be re-cropped or replaced. */
export async function fileFromUrl(url: string, fallbackName = 'mda-photo.jpg'): Promise<File> {
  const res = await smartFetch(assetUrl(url), {}, 25_000, true);
  if (!res.ok) throw new ImageDecodeError('download');
  const blob = await res.blob();
  const type = blob.type || 'image/jpeg';
  const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split('+')[0];
  const name = fallbackName.replace(/\.[^.]+$/, '') + '.' + ext;
  return new File([blob], name, { type });
}
