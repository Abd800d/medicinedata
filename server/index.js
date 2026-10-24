/* MDA — MedicineData
 * Copyright (c) 2026 Dr. Abdulmajeed Abdullah Almakhedhi. All rights reserved.
 */
import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import * as childProcess from 'node:child_process';
import express from 'express';
import compression from 'compression';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import api from './routes/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Static uploads (product images, prescription photos, avatars)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));

// Seed images shipped with the app
app.use('/seed-images', express.static(path.join(ROOT, 'public', 'seed-images'), { maxAge: '30d' }));

app.use('/api', api);

app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'MDA', version: '1.0.0' }));

// Serve the built SPA in production. In dev, Vite serves the UI and proxies /api here.
// First boot on a fresh volume: seed the reference catalogue automatically.
function autoSeed() {
  if (process.env.AUTO_SEED === '0') return;
  try {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM systems').get();
    if (n > 0) return;
    console.log('[MDA] empty database — seeding the reference catalogue (first boot)…');
    const { spawnSync } = childProcess;
    const res = spawnSync(process.execPath, [path.join(ROOT, 'server', 'seed.js')], { stdio: 'inherit', env: process.env });
    console.log('[MDA] seed exit:', res.status);
  } catch (e) {
    console.warn('[MDA] auto-seed skipped:', e?.message || e);
  }
}
autoSeed();

const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error('[MDA] error:', err?.message || err);
  const status = err?.status || 500;
  res.status(status).json({ error: err?.publicMessage || 'حدث خطأ غير متوقع / Unexpected error' });
});

app.listen(PORT, HOST, () => {
  console.log(`[MDA] API ready on http://${HOST}:${PORT}  (db: ${db.name})`);
});
