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
import { privacyHtml, termsHtml, legalUrls } from './lib/legal.js';

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

/*
 * Public legal pages — a Play Store listing needs a URL that opens without JS or login.
 * Read-only and identical for every visitor, so they are also the only cross-origin
 * friendly endpoints: the Android shell (origin https://localhost) renders them in-app.
 */
const legalHeaders = (res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
};
app.get('/privacy', (_req, res) => { legalHeaders(res); res.send(privacyHtml()); });
app.get('/terms', (_req, res) => { legalHeaders(res); res.send(termsHtml()); });
/* Machine-readable pointer (used by the app's About screen and by store tooling). */
app.get('/.well-known/mda-legal.json', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.json(legalUrls(req));
});

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
