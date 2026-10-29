import { Router } from 'express';
import authRoutes from './auth.js';
import catalogRoutes from './catalog.js';
import communityRoutes from './community.js';
import prescriptionRoutes from './prescriptions.js';
import aiRoutes from './ai.js';
import adminRoutes from './admin.js';
import verificationRoutes from './verification.js';
import pharmacyRoutes from './pharmacy.js';
import submissionRoutes from './submissions.js';
import prescriptionAiRoutes from './prescription-ai.js';
import { optionalAuth, ensureAdmin, OWNER_EMAIL } from '../auth.js';
import { getSetting, db } from '../db.js';
import { idempotency, pruneIdempotency } from '../lib/idempotency.js';
import { legalUrls } from '../lib/legal.js';
import { googleOAuthReady } from '../lib/google-oauth.js';
import { readFileSync } from 'node:fs';

/* The backend's own version, straight from package.json — never hard-coded twice. */
const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return String(pkg.version || '0.0.0');
  } catch { return '0.0.0'; }
})();
const STARTED_AT = new Date().toISOString();

const router = Router();
router.use(optionalAuth);
/* Replay safe responses for retried offline writes (X-Idempotency-Key). */
router.use(idempotency);

router.get('/config', (_req, res) => {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM drugs) drugs,
    (SELECT COUNT(*) FROM products WHERE active=1) products,
    (SELECT COUNT(*) FROM systems) systems`).get();
  res.json({
    app: 'MDA',
    name_en: getSetting('site_name_en', 'MedicineData'),
    name_ar: getSetting('site_name_ar', 'ميديسين داتا'),
    owner_name: getSetting('owner_name', 'Dr. Abdulmajeed Abdullah Almakhedhi'),
    owner_title: getSetting('owner_title', 'Founder & Medical Director'),
    support_email: getSetting('support_email', '7a8b1d@gmail.com'),
    whatsapp: getSetting('whatsapp', '+967781733795'),
    owner_email: OWNER_EMAIL,
    about_ar: getSetting('about_ar', 'مرجع دوائي شامل للأدوية والمنتجات التجارية في اليمن والدول العربية، مع معلومات علمية موثوقة وأدلة الاستخدام.'),
    about_en: getSetting('about_en', 'A comprehensive pharmaceutical reference for medicines and commercial products across Yemen and the Arab world.'),
    disclaimer_ar: getSetting('disclaimer_ar', 'المعلومات لأغراض تعليمية ومرجعية ولا تُغني عن استشارة الطبيب أو الصيدلي.'),
    disclaimer_en: getSetting('disclaimer_en', 'Information is for educational/reference purposes only and does not replace professional medical advice.'),
    ai_enabled: !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY),
    /* Same URLs the Play listing must use, so the app never shows a stale policy link. */
    ...legalUrls(_req),
    google_client_id: process.env.GOOGLE_CLIENT_ID || getSetting('google_client_id', '') || '',
    /* true when a Client ID *and* Secret exist → the phone can use the system-browser flow */
    google_oauth: googleOAuthReady(),
    counts,
    default_lang: getSetting('default_lang', 'ar'),
    maintenance: getSetting('maintenance', false),
    welcome_enabled: getSetting('welcome_enabled', true) !== false && getSetting('welcome_enabled', true) !== 'false',
    welcome_title: getSetting('welcome_title', ''),
    welcome_title_ar: getSetting('welcome_title_ar', '') || getSetting('welcome_title', ''),
    welcome_title_en: getSetting('welcome_title_en', ''),
    welcome_text: getSetting('welcome_text', ''),
    welcome_text_ar: getSetting('welcome_text_ar', '') || getSetting('welcome_text', ''),
    welcome_text_en: getSetting('welcome_text_en', ''),
    allow_registration: getSetting('allow_registration', true),
    /* Which release the backend is actually running. The app compares this with its own
       bundle version and says so out loud when the phone is newer than the server — that is
       what "the update did nothing" looks like when Render has not redeployed yet. */
    version: APP_VERSION,
    build: process.env.GITHUB_RUN_NUMBER || process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'dev',
    started_at: STARTED_AT,
    features: {
      photo_upload: true,
      photo_replace: true,
      audit_log: true,
      import_dry_run: true,
      google_oauth: googleOAuthReady(),
      account_delete: true,
      whats_new: true,
    },
  });
});

router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/community', communityRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/rx', prescriptionAiRoutes);
router.use('/ai', aiRoutes);
/* before /admin so the reviewer role gets in: the admin router is admin-only by default. */
router.use('/admin/verification', verificationRoutes);
router.use('/admin', adminRoutes);
router.use('/pharmacy', pharmacyRoutes);
router.use('/submissions', submissionRoutes);

router.get('/health', (_req, res) => res.json({ ok: true, app: 'MDA', time: new Date().toISOString() }));

ensureAdmin();
pruneIdempotency();
setInterval(pruneIdempotency, 24 * 3600 * 1000).unref?.();

export default router;
