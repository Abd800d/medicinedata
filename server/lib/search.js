/* Fuzzy / typo-tolerant search helpers (Arabic + Latin) */

const AR_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;

export function normalize(text) {
  if (!text) return '';
  let s = String(text).toLowerCase().trim();
  s = s.replace(AR_DIACRITICS, '');
  s = s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ة/g, 'ه');
  s = s.replace(/[\u200c\u200d\u200e\u200f]/g, '');
  // Arabic-Indic / Persian digits → ASCII so "٥٠٠ ملغ" matches "500 mg"
  s = s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
       .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
  s = s.replace(/[^\p{L}\p{N}\s+.-]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

export function searchNorm(...parts) {
  return normalize(parts.filter(Boolean).join(' '));
}

// Damerau–Levenshtein distance (bounded for speed)
export function levenshtein(a, b, max = 4) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prevPrev = new Array(bl + 1).fill(0);
  let prev = new Array(bl + 1);
  let cur = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], prevPrev[j - 2] + 1);
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev; prev = cur; cur = new Array(bl + 1);
  }
  return prev[bl];
}

export function similarity(a, b) {
  const A = normalize(a), B = normalize(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const maxLen = Math.max(A.length, B.length);
  const minLen = Math.min(A.length, B.length);
  const ratio = minLen / maxLen;
  // Very different lengths cannot be typos of each other (avoids saturated-noise matches)
  if (ratio < 0.34) return 0;
  const bound = Math.min(6, Math.ceil(maxLen * 0.42));
  const d = levenshtein(A, B, bound);
  let score = d > bound ? 0 : (1 - d / maxLen) * (0.62 + 0.38 * ratio);
  if (minLen >= 4 && (A.startsWith(B) || B.startsWith(A))) {
    score = Math.max(score, 0.86 + 0.12 * ratio);
  } else if (minLen >= 5 && (A.includes(B) || B.includes(A))) {
    score = Math.max(score, 0.74 + 0.16 * ratio);
  }
  // token overlap (words of 3+ letters only)
  const at = new Set(A.split(' ').filter((t) => t.length >= 3));
  const bt = new Set(B.split(' ').filter((t) => t.length >= 3));
  if (at.size && bt.size) {
    let inter = 0;
    for (const t of at) if (bt.has(t)) inter++;
    if (inter) score = Math.max(score, 0.55 + 0.4 * (inter / Math.max(at.size, bt.size)));
  }
  return Math.min(1, score);
}

/* Words that carry no identity in a medicine query (dose, form, frequency) */
export const QUERY_STOP = new Set([
  'mg', 'mgs', 'g', 'gm', 'gms', 'gram', 'grams', 'ml', 'mls', 'mcg', 'iu', 'iu/ml', 'percent',
  'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules', 'syrup', 'suspension',
  'drop', 'drops', 'inj', 'injection', 'vial', 'amp', 'ampoule', 'tube', 'cream', 'ointment', 'oint',
  'spray', 'sachet', 'supp', 'suppository', 'sr', 'cr', 'xr', 'mr', 'od', 'bd', 'bid', 'tds', 'tid',
  'qid', 'qds', 'prn', 'po', 'im', 'iv', 'daily', 'day', 'days', 'week', 'times', 'twice', 'once',
  'الاقراص', 'اقراص', 'أقراص', 'قرص', 'كبسوله', 'كبسولة', 'كبسولات', 'شراب', 'نقط', 'قطره', 'قطرة',
  'بخاخ', 'مرهم', 'كريم', 'امبول', 'امبولات', 'تحاميل', 'لبوس', 'جرعه', 'جرعة', 'ملغ', 'مغم', 'غم',
  'جم', 'مل', 'مليلتر', 'وحده', 'وحدة', 'مره', 'مرة', 'مرتين', 'ثلاث', 'ثلاثه', 'يوميا', 'يومي',
  'اسبوع', 'اسبوعين', 'كل', 'عند', 'الحاجه', 'الحاجة', 'مليون', 'الف', 'ف',
]);

/* Meaningful tokens of a query: no dose numbers, no form/frequency words */
export function queryTokens(q, minLen = 3) {
  const out = [];
  for (const raw of normalize(q).split(' ')) {
    const t = raw.replace(/^[.+-]+|[.+-]+$/g, '');
    if (!t || t.length < minLen || /^\d+([.,]\d+)?$/.test(t) || QUERY_STOP.has(t)) continue;
    out.push(t);
    // Arabic definite article: "الباراسيتامول" should also match "باراسيتامول"
    if (t.length >= 5 && t.startsWith('ال')) out.push(t.slice(2));
    // Arabic plural/ta-marbuta tails are already folded; also try without a trailing "ات"/"ين"
    if (t.length >= 6 && /(ات|ين|ون)$/.test(t)) out.push(t.slice(0, -2));
  }
  return [...new Set(out)];
}

export function rankCandidates(query, rows, fields, limit = 20, minScore = 0.35) {
  const q = normalize(query);
  if (!q) return [];
  const tokens = queryTokens(q);
  const multi = tokens.length > 1;
  const scored = [];
  for (const row of rows) {
    let best = 0, bestField = null;
    for (const f of fields) {
      const val = row[f];
      if (!val) continue;
      const s = similarity(q, val);
      if (s > best) { best = s; bestField = f; }
    }
    // Multi-word queries ("500 mg panadol", "بنادول ٥٠٠ ملغ"): score each meaningful token
    // and keep the best few, so extra dose words cannot sink an exact brand match.
    if (multi) {
      const tokenScores = [];
      for (const t of tokens) {
        let tb = 0, tf = null;
        for (const f of fields) {
          const val = row[f];
          if (!val) continue;
          const s = similarity(t, val);
          if (s > tb) { tb = s; tf = f; }
        }
        if (tb > 0) tokenScores.push({ s: tb, f: tf });
      }
      tokenScores.sort((a, b) => b.s - a.s);
      if (tokenScores.length) {
        const top = tokenScores.slice(0, Math.min(2, tokenScores.length));
        const avg = top.reduce((n, x) => n + x.s, 0) / top.length;
        const agg = avg * 0.94;
        if (agg > best) { best = agg; bestField = top[0].f; }
      }
    }
    if (best >= minScore) scored.push({ row, score: Number(best.toFixed(4)), matchedField: bestField });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

export function likePattern(q) {
  return `%${normalize(q).replace(/[%_]/g, '')}%`;
}
