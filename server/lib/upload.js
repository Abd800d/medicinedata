import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../db.js';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif']);

export function makeUploader(subdir = 'misc', opts = {}) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = (path.extname(file.originalname || '').toLowerCase() || '.jpg').replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 12 * 1024 * 1024 },
    fileFilter: opts.anyData ? (_req, _file, cb) => cb(null, true) : (_req, file, cb) => {
      if (ALLOWED.has(file.mimetype)) cb(null, true);
      else cb(Object.assign(new Error('Unsupported image type'), { status: 400, publicMessage: 'نوع الصورة غير مدعوم' }));
    },
  });
}

export const publicUrl = (subdir, filename) => `/uploads/${subdir}/${filename}`;
