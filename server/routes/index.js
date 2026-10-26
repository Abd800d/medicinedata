import { Router } from 'express';
import authRoutes from './auth.js';
import catalogRoutes from './catalog.js';
import communityRoutes from './community.js';
import prescriptionRoutes from './prescriptions.js';
import aiRoutes from './ai.js';
import adminRoutes from './admin.js';
import pharmacyRoutes from './pharmacy.js';
import submissionRoutes from './submissions.js';
import prescriptionAiRoutes from './prescription-ai.js';
import { optionalAuth, ensureAdmin, OWNER_EMAIL } from '../auth.js';
import { getSetting, db } from '../db.js';

const router = Router();
router.use(optionalAuth);

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
    google_client_id: process.env.GOOGLE_CLIENT_ID || getSetting('google_client_id', '') || '',
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
  });
});

router.use('/auth', authRoutes);
router.use('/catalog', catalogRoutes);
router.use('/community', communityRoutes);
router.use('/prescriptions', prescriptionRoutes);
router.use('/rx', prescriptionAiRoutes);
router.use('/ai', aiRoutes);
router.use('/admin', adminRoutes);
router.use('/pharmacy', pharmacyRoutes);
router.use('/submissions', submissionRoutes);

router.get('/health', (_req, res) => res.json({ ok: true, app: 'MDA', time: new Date().toISOString() }));

ensureAdmin();

export default router;
