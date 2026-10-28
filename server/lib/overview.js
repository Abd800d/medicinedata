/*
 * «خلاصة التطبيق» — one admin call that answers "how is the app doing right now?".
 *
 * Why a dedicated module instead of reading /stats + /diagnostics + /ai-stats + the review
 * queue from the client: the dashboard needs one truthful snapshot (same instant, one round
 * trip on a phone), and it must say what still needs a human — pending reviews, unanswered
 * submissions, products without a photo, stock near expiry, a disabled AI, a broken backup.
 * Everything here is read-only and computed from rows that already exist; nothing is invented
 * and nothing is estimated when the data is missing (it reports null instead of 0).
 */
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import { db, UPLOAD_DIR, getSetting } from '../db.js';
import { getAiConfig } from './ai-config.js';
import { googleOAuthReady } from './google-oauth.js';

const APP_VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version || '0.0.0');
  } catch { return '0.0.0'; }
})();

const one = (sql, ...args) => {
  try { return db.prepare(sql).get(...args)?.n ?? 0; } catch { return null; }
};
const rows = (sql, ...args) => {
  try { return db.prepare(sql).all(...args); } catch { return []; }
};

function dirSize(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, e) => {
      const p = `${dir}/${e.name}`;
      return sum + (e.isDirectory() ? dirSize(p) : (fs.statSync(p).size || 0));
    }, 0);
  } catch { return 0; }
}

const mb = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const pct = (part, total) => (total ? Math.round((part / total) * 100) : null);

/** Day buckets for the last `days` days, zero-filled, so a chart never lies by omission. */
function daily(column, table, days = 7, where = '') {
  const found = rows(
    `SELECT date(${column}) d, COUNT(*) n FROM ${table}
      WHERE ${column} >= date('now', ?) ${where} GROUP BY d ORDER BY d`,
    `-${days - 1} day`,
  );
  const byDay = new Map(found.map((r) => [r.d, r.n]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date: d, n: byDay.get(d) || 0 });
  }
  return out;
}

export function buildOverview(now = new Date()) {
  /* ---------------- content ---------------- */
  const productsTotal = one('SELECT COUNT(*) n FROM products WHERE active=1');
  const withImage = one(`SELECT COUNT(*) n FROM products p WHERE p.active=1 AND (
      (p.image_url IS NOT NULL AND p.image_url<>'')
      OR EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id=p.id AND pi.source<>'generated'))`);
  const content = {
    systems: one('SELECT COUNT(*) n FROM systems'),
    classes: one('SELECT COUNT(*) n FROM categories'),
    drugs: one('SELECT COUNT(*) n FROM drugs'),
    products: productsTotal,
    products_active: productsTotal,
    manufacturers: one('SELECT COUNT(*) n FROM manufacturers'),
    agents: one('SELECT COUNT(*) n FROM agents'),
    photos: one('SELECT COUNT(*) n FROM product_images'),
    images: {
      with_image: withImage,
      total: productsTotal,
      percent: pct(withImage, productsTotal),
      missing: Math.max(0, productsTotal - withImage),
    },
    unverified: one('SELECT COUNT(*) n FROM products WHERE active=1 AND verified=0'),
  };

  /* ---------------- people ---------------- */
  const people = {
    users: one('SELECT COUNT(*) n FROM users'),
    admins: one("SELECT COUNT(*) n FROM users WHERE role='admin'"),
    pharmacists: one("SELECT COUNT(*) n FROM users WHERE role='pharmacist'"),
    google_users: one("SELECT COUNT(*) n FROM users WHERE provider='google' OR google_id IS NOT NULL"),
    new_7d: one("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-7 day')"),
    new_30d: one("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-30 day')"),
    new_users_7d: daily('created_at', 'users', 7),
  };

  /* ---------------- work that needs a human ---------------- */
  const rxPending = one(`SELECT COUNT(DISTINCT prescription_id) n FROM prescription_items WHERE status='pending'`);
  const work = {
    rx_total: one('SELECT COUNT(*) n FROM prescriptions'),
    rx_pending_review: rxPending,
    rx_reviewed: one("SELECT COUNT(*) n FROM prescriptions WHERE status='reviewed'"),
    rx_rejected: one("SELECT COUNT(*) n FROM prescriptions WHERE status='rejected'"),
    rx_7d: one("SELECT COUNT(*) n FROM prescriptions WHERE created_at >= datetime('now','-7 day')"),
    submissions_pending: one("SELECT COUNT(*) n FROM drug_submissions WHERE status='pending'"),
    submissions_total: one('SELECT COUNT(*) n FROM drug_submissions'),
    threads_open: one("SELECT COUNT(*) n FROM threads WHERE status='open'"),
    pharmacy_items: one('SELECT COUNT(*) n FROM pharmacy_items'),
    pharmacy_low_stock: one('SELECT COUNT(*) n FROM pharmacy_items WHERE quantity IS NOT NULL AND quantity <= 5'),
    pharmacy_expiring_30d: one(`SELECT COUNT(*) n FROM pharmacy_items
      WHERE expiry_date IS NOT NULL AND expiry_date <> '' AND date(expiry_date) BETWEEN date('now') AND date('now','+30 day')`),
    pharmacy_expired: one(`SELECT COUNT(*) n FROM pharmacy_items
      WHERE expiry_date IS NOT NULL AND expiry_date <> '' AND date(expiry_date) < date('now')`),
    imports_failed: one("SELECT COUNT(*) n FROM imports WHERE status='failed'"),
    imports_total: one('SELECT COUNT(*) n FROM imports'),
    threads_unanswered: one(`SELECT COUNT(*) n FROM threads t WHERE t.is_public=1 AND NOT EXISTS (
      SELECT 1 FROM thread_messages m WHERE m.thread_id=t.id AND m.is_staff=1)`),
  };

  /* ---------------- ai ---------------- */
  const aiCfg = getAiConfig();
  const ai = {
    enabled: Boolean(aiCfg.configured),
    provider: aiCfg.provider,
    model: aiCfg.model,
    vision_model: aiCfg.vision,
    key_source: aiCfg.key_source,
    runs_7d: one("SELECT COUNT(*) n FROM ai_runs WHERE created_at >= datetime('now','-7 day')"),
    failed_7d: one("SELECT COUNT(*) n FROM ai_runs WHERE ok=0 AND created_at >= datetime('now','-7 day')"),
    last_run_at: (() => { try { return db.prepare('SELECT created_at FROM ai_runs ORDER BY id DESC LIMIT 1').get()?.created_at || null; } catch { return null; } })(),
    runs_7d_series: daily('created_at', 'ai_runs', 7),
  };

  /* ---------------- platform ---------------- */
  /* process.uptime() is the truth about this process — no module-load guess, no global. */
  const uptimeS = Math.round(process.uptime());
  const serverStartedAt = new Date(now.getTime() - uptimeS * 1000).toISOString();
  const dbFile = process.env.DB_FILE || `${process.env.DATA_DIR || 'data'}/mda.db`;
  let dbBytes = 0;
  try { dbBytes = fs.statSync(dbFile).size; } catch { /* remote/absent */ }
  const platform = {
    version: APP_VERSION,
    node: process.version,
    env: process.env.NODE_ENV || 'development',
    started_at: serverStartedAt,
    uptime_s: uptimeS,
    db_file: dbFile,
    db_mb: mb(dbBytes),
    uploads_mb: mb(dirSize(UPLOAD_DIR)),
    google_login: googleOAuthReady(),
    registration_open: !(getSetting('allow_registration', true) === 0
      || getSetting('allow_registration', true) === '0'
      || getSetting('allow_registration', true) === false),
    maintenance: Boolean(getSetting('maintenance', false)),
  };

  /* ---------------- activity ---------------- */
  const activity = {
    top_searches: rows('SELECT term, hits FROM search_terms ORDER BY hits DESC LIMIT 8'),
    recent_audit: rows(`SELECT action, actor_email, target_type, created_at FROM audit_log ORDER BY id DESC LIMIT 8`),
    recent_imports: rows('SELECT id, filename, kind, rows_ok, rows_failed, status, created_at FROM imports ORDER BY id DESC LIMIT 4'),
    recent_rx: rows('SELECT id, status, created_at FROM prescriptions ORDER BY id DESC LIMIT 5'),
  };

  /* ---------------- the checklist: is the app actually "on"? ---------------- */
  const checks = [
    {
      id: 'data',
      ok: (content.drugs || 0) > 0 && (content.products || 0) > 0,
      label_ar: 'الكتالوج موجود (أدوية ومنتجات)',
      label_en: 'Catalogue is present (drugs and products)',
      hint_ar: content.drugs ? `${content.drugs} دواءً · ${content.products} منتجًا` : 'شغّل: npm run seed',
      hint_en: content.drugs ? `${content.drugs} drugs · ${content.products} products` : 'Run: npm run seed',
      to: '/admin?tab=catalog',
    },
    {
      id: 'images',
      ok: (content.images.percent ?? 0) >= 70,
      label_ar: 'أكثر من 70% من المنتجات لها صورة',
      label_en: 'Over 70% of products have a photo',
      hint_ar: `${content.images.with_image}/${content.images.total} (${content.images.percent ?? 0}%) — ينقص ${content.images.missing}`,
      hint_en: `${content.images.with_image}/${content.images.total} (${content.images.percent ?? 0}%) — ${content.images.missing} missing`,
      to: '/admin?tab=media',
    },
    {
      id: 'ai',
      ok: ai.enabled,
      label_ar: 'الذكاء الاصطناعي مفعّل',
      label_en: 'AI is enabled',
      hint_ar: ai.enabled ? `${ai.provider} · ${ai.model}` : 'أضف مفتاح Groq المجاني — دقيقتان',
      hint_en: ai.enabled ? `${ai.provider} · ${ai.model}` : 'Add a free Groq key — takes two minutes',
      to: '/admin?tab=ai',
    },
    {
      id: 'rx',
      ok: work.rx_pending_review === 0,
      label_ar: 'لا وصفات تنتظر المراجعة',
      label_en: 'No prescriptions waiting for review',
      hint_ar: work.rx_pending_review ? `${work.rx_pending_review} وصفة في الطابور` : 'الطابور فارغ',
      hint_en: work.rx_pending_review ? `${work.rx_pending_review} in the queue` : 'Queue is empty',
      to: '/review',
    },
    {
      id: 'submissions',
      ok: work.submissions_pending === 0,
      label_ar: 'لا طلبات إضافة تنتظر',
      label_en: 'No pending drug submissions',
      hint_ar: work.submissions_pending ? `${work.submissions_pending} طلبًا` : 'لا شيء',
      hint_en: work.submissions_pending ? `${work.submissions_pending} pending` : 'Nothing',
      to: '/admin?tab=submissions',
    },
    {
      id: 'pharmacy',
      ok: work.pharmacy_expired === 0,
      label_ar: 'لا أصناف منتهية في المخزون',
      label_en: 'No expired stock',
      hint_ar: work.pharmacy_expired ? `${work.pharmacy_expired} صنفًا منتهيًا · ${work.pharmacy_expiring_30d} ينتهي خلال 30 يومًا`
        : (work.pharmacy_expiring_30d ? `${work.pharmacy_expiring_30d} صنفًا ينتهي خلال 30 يومًا` : 'كل شيء سليم'),
      hint_en: work.pharmacy_expired ? `${work.pharmacy_expired} expired · ${work.pharmacy_expiring_30d} expiring in 30 days`
        : (work.pharmacy_expiring_30d ? `${work.pharmacy_expiring_30d} expiring in 30 days` : 'All good'),
      to: '/pharmacy',
    },
    {
      id: 'google',
      ok: Boolean(platform.google_login),
      label_ar: 'تسجيل الدخول بجوجل',
      label_en: 'Google sign-in',
      hint_ar: platform.google_login ? 'مضبوط' : 'اختياري — يعمل البريد وكلمة المرور بدونه',
      hint_en: platform.google_login ? 'Configured' : 'Optional — email/password works without it',
      to: '/admin?tab=integrations',
      optional: true,
    },
  ];
  /* Optional checks (Google sign-in) are listed but never drag the score down: an owner who
     deliberately skipped an integration should not see a permanently "unhealthy" app. */
  const scored = checks.filter((c) => !c.optional);
  const okCount = scored.filter((c) => c.ok).length;

  /* ---------------- alerts, ordered by how much they cost if ignored ---------------- */
  const alerts = [];
  if (!ai.enabled) alerts.push({ level: 'warn', id: 'ai-off', to: '/admin?tab=ai',
    text_ar: 'الذكاء الاصطناعي معطّل: تحليل الوصفات ومسح العلب لا يعملان.', text_en: 'AI is off: prescription analysis and pack scanning do not run.' });
  if (work.rx_pending_review) alerts.push({ level: 'warn', id: 'rx-queue', to: '/review',
    text_ar: `${work.rx_pending_review} وصفة تنتظر مراجعة الصيدلي.`, text_en: `${work.rx_pending_review} prescriptions await pharmacist review.` });
  if (work.pharmacy_expired) alerts.push({ level: 'danger', id: 'stock-expired', to: '/pharmacy',
    text_ar: `${work.pharmacy_expired} صنفًا منتهي الصلاحية في المخزون.`, text_en: `${work.pharmacy_expired} expired items in stock.` });
  if (work.submissions_pending) alerts.push({ level: 'info', id: 'submissions', to: '/admin?tab=submissions',
    text_ar: `${work.submissions_pending} طلب إضافة دواء ينتظر المراجعة.`, text_en: `${work.submissions_pending} drug submissions await review.` });
  if (work.imports_failed) alerts.push({ level: 'warn', id: 'import-failed', to: '/admin?tab=media',
    text_ar: `${work.imports_failed} عملية استيراد فاشلة — افتح سجلّها.`, text_en: `${work.imports_failed} failed imports — open their log.` });
  if ((content.images.percent ?? 100) < 70) alerts.push({ level: 'info', id: 'images', to: '/admin?tab=media',
    text_ar: `${content.images.missing} منتجًا بلا صورة حقيقية.`, text_en: `${content.images.missing} products have no real photo.` });
  if (ai.enabled && ai.failed_7d > 0) alerts.push({ level: 'warn', id: 'ai-failures', to: '/admin?tab=ai',
    text_ar: `${ai.failed_7d} استدعاء ذكاء اصطناعي فشل خلال 7 أيام.`, text_en: `${ai.failed_7d} AI calls failed in 7 days.` });

  return {
    generated_at: now.toISOString(),
    health: {
      ok: okCount === scored.length,
      score: pct(okCount, scored.length),
      checks_ok: okCount,
      checks_total: scored.length,
      optional_failed: checks.filter((c) => c.optional && !c.ok).length,
    },
    content, people, work, ai, platform, activity, checks, alerts,
  };
}
