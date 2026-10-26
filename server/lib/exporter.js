/*
 * Export engine — CSV / JSON / XLSX, server-side, whitelisted datasets only.
 *
 * Rules:
 *   • No arbitrary SQL: every dataset is a fixed query here.
 *   • Never export secrets: password hashes, tokens, idempotency keys, AI logs of
 *     patient text are excluded by construction (columns are listed explicitly).
 *   • CSV gets a UTF-8 BOM + CRLF so Excel on Windows and Android opens Arabic
 *     correctly instead of mojibake.
 *   • Rows are capped so a single request can never exhaust memory on the free tier.
 */
import XLSX from 'xlsx';
import { db } from '../db.js';

const LIMIT = Number(process.env.EXPORT_ROW_LIMIT || 100000);

const pickColumns = (table) => db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
const hasTable = (table) => !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
const safeColumns = (table, wanted) => {
  if (!hasTable(table)) return [];
  const have = new Set(pickColumns(table));
  return wanted.filter((c) => have.has(c));
};

const q = (table, columns, extra = '', order = 'id') => {
  const cols = safeColumns(table, columns);
  if (!cols.length) return { columns: [], rows: [] };
  const rows = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(',')} FROM "${table}" ${extra} ORDER BY "${order}" LIMIT ${LIMIT}`).all();
  return { columns: cols, rows };
};

export const DATASETS = {
  drugs: {
    label_ar: 'الأدوية (المونوغراف)',
    label_en: 'Drugs (monographs)',
    columns: ['id', 'system_id', 'category_id', 'generic_name', 'generic_ar', 'drug_class', 'atc_code', 'prescription_required',
      'indications_ar', 'dosage_adult', 'dosage_child', 'warnings', 'side_effects', 'contraindications', 'source', 'verified', 'updated_at'],
  },
  products: {
    label_ar: 'المنتجات التجارية',
    label_en: 'Products',
    columns: ['id', 'drug_id', 'trade_name', 'trade_name_ar', 'strength', 'dosage_form', 'pack_size', 'manufacturer_id', 'agent_id',
      'country', 'barcode', 'price', 'currency', 'image_url', 'image_source', 'description_ar', 'verified', 'active', 'updated_at'],
  },
  product_images: { label_ar: 'صور المنتجات', label_en: 'Product images', columns: ['id', 'product_id', 'url', 'source', 'sort_order', 'created_at'] },
  systems: { label_ar: 'الأجهزة', label_en: 'Body systems', columns: ['id', 'slug', 'name_en', 'name_ar', 'sort_order'] },
  categories: { label_ar: 'المجموعات الدوائية', label_en: 'Categories', columns: ['id', 'system_id', 'slug', 'name_en', 'name_ar'] },
  manufacturers: { label_ar: 'الشركات المصنعة', label_en: 'Manufacturers', columns: ['id', 'name', 'country', 'website'] },
  agents: { label_ar: 'الوكلاء', label_en: 'Agents', columns: ['id', 'name', 'country', 'city', 'phone', 'website'] },
  pharmacy_items: {
    label_ar: 'مخزون الصيدليات (كل المستخدمين)',
    label_en: 'Pharmacy stock (all users)',
    columns: ['id', 'user_id', 'name', 'trade_name', 'strength', 'form', 'quantity', 'unit', 'buy_price', 'sell_price', 'expiry',
      'barcode', 'notes', 'version', 'created_at', 'updated_at'],
  },
  users: {
    label_ar: 'المستخدمون (بلا كلمات مرور)',
    label_en: 'Users (no credentials)',
    columns: ['id', 'name', 'email', 'role', 'provider', 'phone', 'city', 'country', 'active', 'created_at'],
  },
  prescriptions: {
    label_ar: 'الوصفات (بيانات وصفية فقط)',
    label_en: 'Prescriptions (metadata only)',
    columns: ['id', 'user_id', 'image_url', 'status', 'created_at'],
  },
  audit_log: { label_ar: 'سجل التدقيق', label_en: 'Audit log', columns: ['id', 'user_id', 'action', 'entity', 'entity_id', 'meta', 'ip', 'created_at'] },
  imports: { label_ar: 'سجل الاستيراد', label_en: 'Import history', columns: ['id', 'user_id', 'filename', 'kind', 'status', 'rows_ok', 'rows_failed', 'created_at'] },
};

/* Extra read-only views that need a JOIN to be useful. */
const VIEWS = {
  products_full: {
    label_ar: 'المنتجات (مع أسماء الشركة والوكيل)',
    label_en: 'Products with manufacturer + agent',
    sql: `SELECT p.id, p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.pack_size, d.generic_name, d.generic_ar,
            m.name AS manufacturer, m.country AS manufacturer_country, a.name AS agent, p.country, p.barcode, p.price, p.currency,
            p.image_url, p.verified, p.updated_at
          FROM products p LEFT JOIN drugs d ON d.id=p.drug_id
          LEFT JOIN manufacturers m ON m.id=p.manufacturer_id LEFT JOIN agents a ON a.id=p.agent_id
          ORDER BY p.id LIMIT ${LIMIT}`,
    columns: ['id', 'trade_name', 'trade_name_ar', 'strength', 'dosage_form', 'pack_size', 'generic_name', 'generic_ar',
      'manufacturer', 'manufacturer_country', 'agent', 'country', 'barcode', 'price', 'currency', 'image_url', 'verified', 'updated_at'],
  },
};

export function datasetCatalog() {
  const list = [];
  for (const [key, def] of Object.entries(DATASETS)) {
    if (!hasTable(key)) continue;
    let rows = 0;
    try { rows = db.prepare(`SELECT COUNT(*) n FROM "${key}"`).get().n; } catch { rows = 0; }
    list.push({ key, label_ar: def.label_ar, label_en: def.label_en, rows, columns: safeColumns(key, def.columns).length });
  }
  for (const [key, def] of Object.entries(VIEWS)) {
    let rows = 0;
    try { rows = db.prepare(`SELECT COUNT(*) n FROM (${def.sql.replace(/ ORDER BY[^)]*$/, '')})`).get().n; } catch { rows = 0; }
    list.push({ key, label_ar: def.label_ar, label_en: def.label_en, rows, columns: def.columns.length, view: true });
  }
  return list;
}

function readDataset(key) {
  if (VIEWS[key]) {
    const rows = db.prepare(VIEWS[key].sql).all().map((r) => r);
    return { columns: Object.keys(rows[0] || {}).length ? Object.keys(rows[0]) : VIEWS[key].columns, rows };
  }
  const def = DATASETS[key];
  if (!def) throw Object.assign(new Error(`مجموعة غير معروفة: ${key}`), { status: 400, publicMessage: 'مجموعة بيانات غير معروفة' });
  const { columns, rows } = q(key, def.columns);
  return { columns, rows };
}

/* ------------------------------- writers ------------------------------- */

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns, rows) {
  const head = columns.map(csvCell).join(',');
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n');
  return '\uFEFF' + head + (body ? '\r\n' + body : '') + '\r\n';
}

function sheetFrom(rows, columns) {
  const data = [columns, ...rows.map((r) => columns.map((c) => (r[c] === null || r[c] === undefined ? '' : r[c])))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = columns.map((c) => ({ wch: Math.min(46, Math.max(10, c.length + 4)) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

/* Excel and sheet names are limited to 31 chars and forbid []:*?/\ */
const sheetName = (label, index) => `${String(label).replace(/[[\]:*?/\\]/g, ' ').slice(0, 26)}`.trim() || `Sheet${index}`;

export function exportDataset(key, format = 'csv') {
  const { columns, rows } = readDataset(key);
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `mda-${key}-${stamp}`;
  if (format === 'json') {
    return {
      filename: `${base}.json`,
      contentType: 'application/json; charset=utf-8',
      buffer: Buffer.from(JSON.stringify({ exported_at: new Date().toISOString(), dataset: key, count: rows.length, columns, rows }, null, 0)),
      rows: rows.length,
    };
  }
  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFrom(rows, columns), sheetName(key, 1));
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
    return {
      filename: `${base}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
      rows: rows.length,
    };
  }
  return { filename: `${base}.csv`, contentType: 'text/csv; charset=utf-8', buffer: Buffer.from(toCsv(columns, rows), 'utf8'), rows: rows.length };
}

/** One file with every dataset — XLSX (multiple sheets) or a JSON bundle. */
export function exportAll(format = 'xlsx') {
  const stamp = new Date().toISOString().slice(0, 10);
  const entries = [];
  for (const key of Object.keys(DATASETS)) if (hasTable(key)) entries.push({ key, ...readDataset(key) });
  for (const key of Object.keys(VIEWS)) { try { entries.push({ key, ...readDataset(key) }); } catch { /* skip view */ } }
  const total = entries.reduce((n, e) => n + e.rows.length, 0);
  if (format === 'json') {
    const payload = { exported_at: new Date().toISOString(), app: 'MDA', datasets: {} };
    for (const e of entries) payload.datasets[e.key] = e.rows;
    return {
      filename: `mda-backup-${stamp}.json`,
      contentType: 'application/json; charset=utf-8',
      buffer: Buffer.from(JSON.stringify(payload)),
      rows: total,
    };
  }
  const wb = XLSX.utils.book_new();
  entries.forEach((e, i) => XLSX.utils.book_append_sheet(wb, sheetFrom(e.rows, e.columns), sheetName(e.key, i + 1)));
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', compression: true });
  return {
    filename: `mda-backup-${stamp}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
    rows: total,
  };
}
