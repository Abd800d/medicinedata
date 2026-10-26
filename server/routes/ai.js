import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { answerQuestion, retrieve, aiEnabled, matchPrescriptionText, identifyMedicine } from '../lib/ai.js';
import { optionalAuth } from '../auth.js';
import { getAiConfig } from '../lib/ai-config.js';
import { makeUploader } from '../lib/upload.js';
import { db } from '../db.js';

const router = Router();
const hits = new Map();
const scanUploader = makeUploader('scans');

function rateLimit(req, res, next) {
  const key = req.user?.id || req.ip;
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000);
  if (arr.length >= 25) return res.status(429).json({ error: 'عدد كبير من الطلبات، انتظر قليلاً / Too many requests' });
  arr.push(now); hits.set(key, arr);
  next();
}

router.get('/status', (_req, res) => {
  const enabled = aiEnabled();
  const c = getAiConfig();
  res.json({
    enabled,
    provider: enabled ? c.provider : 'offline-database',
    model: enabled ? c.model : null,
    vision_model: enabled ? c.vision : null,
    features: { assistant: true, prescription: enabled, pack_recognition: enabled, offline_retrieval: true },
    hint_ar: enabled ? null : 'التحليل الذكي غير مفعّل على الخادم. المدير يفعّله من: الإدارة ← الذكاء الاصطناعي (مفتاح Groq مجاني). بقية الميزات تعمل دون مفتاح.',
    hint_en: enabled ? null : 'AI is not enabled on the server. An admin enables it in Admin → AI settings (free Groq key). Everything else works without a key.',
  });
});

router.post('/ask', optionalAuth, rateLimit, async (req, res, next) => {
  try {
    const q = String(req.body?.q || '').trim();
    if (!q) return res.status(400).json({ error: 'السؤال مطلوب / Question required' });
    if (q.length > 800) return res.status(400).json({ error: 'السؤال طويل جدًا / Question too long' });
    const result = await answerQuestion(q, req.body?.lang === 'en' ? 'en' : 'ar');
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/extract-text', optionalAuth, rateLimit, (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Text required' });
  res.json(matchPrescriptionText(text));
});

router.get('/drug-context/:id', (req, res) => {
  const q = String(req.params.id);
  res.json(retrieve(q, 3));
});

/* ---------- Photo recognition (pack / blister) ---------- */
router.post('/identify-image', optionalAuth, rateLimit, scanUploader.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image required' });
    const lang = req.body?.lang === 'en' ? 'en' : 'ar';
    if (!aiEnabled()) {
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      return res.json({
        configured: false,
        matches: [],
        hint_ar: 'تحليل الصور بالذكاء الاصطناعي غير مفعّل. أضف AI_API_KEY على الخادم، أو استخدم Google Lens أو ابحث بالاسم.',
        hint_en: 'AI image recognition is not configured. Add AI_API_KEY on the server, or use Google Lens / search by name.',
      });
    }
    const buf = fs.readFileSync(req.file.path);
    const dataUrl = `data:${req.file.mimetype};base64,${buf.toString('base64')}`;
    let guess = null;
    try { guess = await identifyMedicine(dataUrl, lang); }
    catch (e) { guess = null; }
    try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }

    const queries = [];
    if (guess?.visible_text) queries.push(guess.visible_text);
    for (const g of guess?.guesses || []) if (g?.name) queries.push([g.name, g.strength].filter(Boolean).join(' '));
    const merged = new Map();
    for (const q of queries.slice(0, 6)) {
      let found = null;
      try { found = matchPrescriptionText(q); } catch { found = null; }
      for (const item of found?.items || []) {
        if (item.matched_as === 'product') {
          merged.set('p' + item.id, {
            id: item.id, trade_name: item.trade_name, trade_name_ar: item.trade_name_ar, strength: item.strength,
            dosage_form: item.dosage_form, image_url: item.image_url, country: item.country, price: item.price,
            currency: item.currency, generic_name: item.generic_name, drug_id: item.drug_id,
            score: item.score, manufacturer_name: item.drug?.name || null,
          });
        } else {
          const prods = item.products || [];
          for (const p of prods) {
            if (!merged.has('p' + p.id)) merged.set('p' + p.id, { ...p, generic_name: item.generic_name, drug_id: item.id, score: item.score });
          }
        }
      }
      if (merged.size >= 12) break;
    }
    const matches = [...merged.values()]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 12)
      .map((m) => {
        const man = m.manufacturer_name || (m.id ? db.prepare('SELECT m.name AS n FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id WHERE p.id=?').get(m.id)?.n : null);
        return { ...m, manufacturer_name: man, score: Math.min(0.99, Math.round((m.score || 0.6) * 100) / 100) };
      });
    res.json({
      configured: true,
      visible_text: guess?.visible_text || '',
      query: guess?.visible_text || queries[0] || '',
      confidence: guess?.confidence ?? (matches[0]?.score || 0),
      readable: guess?.readable !== false,
      guesses: guess?.guesses || [],
      matches,
    });
  } catch (e) { next(e); }
});

export default router;
