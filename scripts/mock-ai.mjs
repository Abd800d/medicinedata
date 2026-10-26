/*
 * Mock OpenAI-compatible endpoint for local end-to-end tests.
 * It exists so the whole prescription pipeline (upload → validate → match →
 * confirm → audit) can be exercised without any real API key.
 *
 *   node scripts/mock-ai.mjs 4111
 *   AI_PROVIDER=openai AI_API_KEY=test AI_BASE_URL=http://127.0.0.1:4111/v1 npm start
 */
import http from 'node:http';

const port = Number(process.argv[2] || 4111);

/* A deliberately imperfect sample: one clear line, one uncertain handwritten line,
   one duplicate molecule (to trigger the duplicate-ingredient flag), and an
   over-maximum dose (to trigger dose_above_max). */
const SAMPLE = {
  readable: true,
  image_quality: 'fair',
  language: 'mixed',
  patient: { name: 'سالم أحمد', confidence: 0.86 },
  doctor: { name: 'د. هدى المقطري', confidence: 0.72 },
  clinic: { name: 'عيادة النور', confidence: 0.61 },
  date: { value: '2026-10-20', confidence: 0.9 },
  items: [
    {
      raw_text: 'Augmentin 1g tab 1x2 x7d',
      name: 'Augmentin', name_ar: 'أوجمنتين', strength: '1g', form: 'tablet',
      dose: '1 tablet', frequency: 'twice daily', duration: '7 days',
      route: 'oral', instructions: null,
      confidence: 0.94, uncertain_fields: [],
      field_confidence: { name: 0.97, strength: 0.95, dose: 0.9, frequency: 0.9, duration: 0.9, form: 0.9, route: 0.85 },
    },
    {
      raw_text: 'Panadl 500 mg',
      name: 'Panadol', name_ar: null, strength: '500mg', form: 'tablet',
      dose: '2 tablets', frequency: 'four times daily', duration: '3 days',
      route: 'oral', instructions: null,
      confidence: 0.66, uncertain_fields: ['name', 'duration'],
      field_confidence: { name: 0.58, strength: 0.92, dose: 0.86, frequency: 0.8, duration: 0.4, form: 0.9 },
    },
    {
      raw_text: 'Augmentn 625 ???',
      name: 'Augmentin', name_ar: null, strength: null, form: null,
      dose: null, frequency: null, duration: null, route: null, instructions: null,
      confidence: 0.41, uncertain_fields: ['name', 'strength', 'dose', 'frequency'],
      field_confidence: { name: 0.45 },
    },
  ],
  notes: 'خط اليد في السطر الثالث غير واضح.',
  warnings: [],
};

/* Alternative samples so tests can exercise specific clinical paths. */
const PPI_SAMPLE = {
  readable: true, image_quality: 'good', language: 'ar',
  patient: { name: 'أمينة صالح', confidence: 0.8 }, doctor: { name: null, confidence: 0 }, clinic: { name: null, confidence: 0 },
  date: { value: null, confidence: 0 },
  items: [
    { raw_text: 'Omeprazole 20mg 1x1', name: 'Omeprazole', name_ar: 'أوميبرازول', strength: '20mg', form: 'capsule', dose: '1 capsule', frequency: 'once daily', duration: '14 days', route: 'oral', instructions: null, confidence: 0.93, uncertain_fields: [], field_confidence: { name: 0.95, strength: 0.95, dose: 0.9, frequency: 0.9, duration: 0.85 } },
    { raw_text: 'Pantoprazole 40mg 1x1', name: 'Pantoprazole', name_ar: 'بانتوبرازول', strength: '40mg', form: 'tablet', dose: '1 tablet', frequency: 'once daily', duration: '14 days', route: 'oral', instructions: null, confidence: 0.91, uncertain_fields: [], field_confidence: { name: 0.93, strength: 0.9, dose: 0.9, frequency: 0.9, duration: 0.85 } },
  ],
  notes: null, warnings: [],
};

const UNREADABLE_SAMPLE = {
  readable: false, image_quality: 'poor', language: 'ar',
  patient: { name: null, confidence: 0 }, doctor: { name: null, confidence: 0 }, clinic: { name: null, confidence: 0 },
  date: { value: null, confidence: 0 }, items: [], notes: 'الصورة غير واضحة ولا يمكن قراءتها بأمان.',
  warnings: ['image_unreadable'],
};

const pickSample = (body) => {
  const raw = String(body || '');
  if (raw.includes('UNREADABLE')) return UNREADABLE_SAMPLE;
  if (raw.includes('PPSAMPLE')) return PPI_SAMPLE;
  return SAMPLE;
};

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.method === 'GET' && req.url?.includes('/models')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'mock-vision' }] }));
      return;
    }
    const delay = Number(process.env.MOCK_DELAY_MS || 120);
    setTimeout(() => {
      const content = JSON.stringify(pickSample(body));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'mock-1',
        choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 900, completion_tokens: 320, total_tokens: 1220 },
      }));
    }, delay);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock ai listening on http://127.0.0.1:${port}/v1`);
});
