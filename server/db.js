/* MDA — MedicineData database layer (SQLite + FTS5) */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new Database(process.env.DB_FILE || path.join(DATA_DIR, 'mda.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  provider TEXT NOT NULL DEFAULT 'local',
  google_id TEXT,
  avatar TEXT,
  phone TEXT,
  city TEXT,
  country TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS systems (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  icon TEXT DEFAULT 'activity',
  color TEXT DEFAULT '#0f766e',
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  description_en TEXT,
  description_ar TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(system_id, slug)
);

CREATE TABLE IF NOT EXISTS drugs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  generic_name TEXT NOT NULL,
  generic_ar TEXT,
  synonyms TEXT,
  drug_class TEXT,
  atc_code TEXT,
  prescription_required INTEGER DEFAULT 0,
  pregnancy TEXT,
  indications_en TEXT,
  indications_ar TEXT,
  dosage_adult TEXT,
  dosage_child TEXT,
  contraindications TEXT,
  side_effects TEXT,
  warnings TEXT,
  interactions TEXT,
  mechanism_en TEXT,
  mechanism_ar TEXT,
  half_life TEXT,
  storage TEXT,
  notes TEXT,
  source TEXT,
  verified INTEGER DEFAULT 0,
  search_norm TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_drugs_system ON drugs(system_id);
CREATE INDEX IF NOT EXISTS idx_drugs_category ON drugs(category_id);
CREATE INDEX IF NOT EXISTS idx_drugs_name ON drugs(generic_name);
CREATE INDEX IF NOT EXISTS idx_drugs_norm ON drugs(search_norm);

CREATE TABLE IF NOT EXISTS manufacturers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  country TEXT,
  website TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  name_ar TEXT,
  country TEXT DEFAULT 'Yemen',
  city TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  drug_id INTEGER REFERENCES drugs(id) ON DELETE CASCADE,
  trade_name TEXT NOT NULL,
  trade_name_ar TEXT,
  strength TEXT,
  dosage_form TEXT,
  pack_size TEXT,
  manufacturer_id INTEGER REFERENCES manufacturers(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  country TEXT,
  barcode TEXT,
  price REAL,
  currency TEXT DEFAULT 'YER',
  image_url TEXT,
  image_source TEXT,
  description_en TEXT,
  description_ar TEXT,
  verified INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  search_norm TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_drug ON products(drug_id);
CREATE INDEX IF NOT EXISTS idx_products_trade ON products(trade_name);
CREATE INDEX IF NOT EXISTS idx_products_norm ON products(search_norm);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  source TEXT DEFAULT 'upload',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'support',
  status TEXT DEFAULT 'open',
  is_public INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS thread_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  is_staff INTEGER DEFAULT 0,
  attachment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'seeker',
  title TEXT NOT NULL,
  description TEXT,
  specialty TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  status TEXT DEFAULT 'published',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT,
  extracted_text TEXT,
  analysis_json TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Personal pharmacy stock (purchases & pharmacy management) */
CREATE TABLE IF NOT EXISTS pharmacy_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  strength TEXT,
  form TEXT,
  quantity REAL DEFAULT 0,
  unit TEXT DEFAULT 'box',
  buy_price REAL,
  sell_price REAL,
  expiry_date TEXT,
  batch TEXT,
  supplier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pharmacy_user ON pharmacy_items(user_id);
CREATE INDEX IF NOT EXISTS idx_pharmacy_expiry ON pharmacy_items(expiry_date);

/* Community drug submissions (manual add-drug section) */
CREATE TABLE IF NOT EXISTS drug_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name_en TEXT NOT NULL,
  name_ar TEXT,
  system_id INTEGER REFERENCES systems(id) ON DELETE SET NULL,
  company TEXT,
  strength TEXT,
  form TEXT,
  country TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  reviewed_by INTEGER,
  reviewed_at TEXT,
  created_drug_id INTEGER,
  created_product_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON drug_submissions(status);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  filename TEXT,
  kind TEXT,
  rows_ok INTEGER DEFAULT 0,
  rows_failed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'processing',
  log TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS search_terms (
  term TEXT PRIMARY KEY,
  hits INTEGER DEFAULT 1,
  last_at TEXT DEFAULT (datetime('now'))
);

/* ---------------- AI prescription pipeline (Phase 1) ---------------- */
CREATE TABLE IF NOT EXISTS ai_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                     -- prescription | pack | ask
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  prescription_id INTEGER,
  provider TEXT,
  model TEXT,
  request_id TEXT,
  latency_ms INTEGER,
  prompt_version TEXT,
  ok INTEGER DEFAULT 1,
  error_code TEXT,
  usage_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  raw_text TEXT,
  name TEXT,
  matched_drug_id INTEGER REFERENCES drugs(id) ON DELETE SET NULL,
  matched_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  match_score REAL,
  alternatives_json TEXT,
  strength TEXT,
  form TEXT,
  dose TEXT,
  frequency TEXT,
  duration TEXT,
  route TEXT,
  instructions TEXT,
  field_confidence_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | corrected | rejected
  corrected_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  corrected_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prescription_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                   -- approved | corrected | rejected | purged
  notes TEXT,
  flags_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* Append-only audit trail with a hash chain (tamper-evident, never updated) */
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  meta_json TEXT,
  prev_hash TEXT,
  hash TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                     -- prescription_image | cloud_ai | patient_data
  version TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

db.exec(SCHEMA);

/* Additive migrations (safe to run on an existing database every boot) */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('products', 'barcode_source', 'barcode_source TEXT');          // internal-ean13 | manufacturer | import | admin
ensureColumn('products', 'barcode_verified', 'barcode_verified INTEGER DEFAULT 0');
ensureColumn('prescription_items', 'confidence', 'confidence REAL');   // model reading confidence (≠ match score)
ensureColumn('prescription_items', 'uncertain_fields_json', 'uncertain_fields_json TEXT');
db.exec("CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)");
db.exec("CREATE INDEX IF NOT EXISTS idx_ai_runs_user ON ai_runs(user_id, created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_rx_items ON prescription_items(prescription_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at)");
db.exec("CREATE INDEX IF NOT EXISTS idx_consent_user ON user_consents(user_id, kind)");

// Full text search indexes (trigram → typo tolerant substring search)
db.exec(`
CREATE VIRTUAL TABLE IF NOT EXISTS drugs_fts USING fts5(
  generic_name, generic_ar, synonyms, drug_class,
  content='drugs', content_rowid='id', tokenize='trigram'
);
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  trade_name, trade_name_ar, strength, barcode,
  content='products', content_rowid='id', tokenize='trigram'
);
`);

// Keep FTS in sync
db.exec(`
CREATE TRIGGER IF NOT EXISTS drugs_ai AFTER INSERT ON drugs BEGIN
  INSERT INTO drugs_fts(rowid, generic_name, generic_ar, synonyms, drug_class)
  VALUES (new.id, new.generic_name, new.generic_ar, new.synonyms, new.drug_class);
END;
CREATE TRIGGER IF NOT EXISTS drugs_ad AFTER DELETE ON drugs BEGIN
  INSERT INTO drugs_fts(drugs_fts, rowid, generic_name, generic_ar, synonyms, drug_class)
  VALUES('delete', old.id, old.generic_name, old.generic_ar, old.synonyms, old.drug_class);
END;
CREATE TRIGGER IF NOT EXISTS drugs_au AFTER UPDATE ON drugs BEGIN
  INSERT INTO drugs_fts(drugs_fts, rowid, generic_name, generic_ar, synonyms, drug_class)
  VALUES('delete', old.id, old.generic_name, old.generic_ar, old.synonyms, old.drug_class);
  INSERT INTO drugs_fts(rowid, generic_name, generic_ar, synonyms, drug_class)
  VALUES (new.id, new.generic_name, new.generic_ar, new.synonyms, new.drug_class);
END;
CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, trade_name, trade_name_ar, strength, barcode)
  VALUES (new.id, new.trade_name, new.trade_name_ar, new.strength, new.barcode);
END;
CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, trade_name, trade_name_ar, strength, barcode)
  VALUES('delete', old.id, old.trade_name, old.trade_name_ar, old.strength, old.barcode);
END;
CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, trade_name, trade_name_ar, strength, barcode)
  VALUES('delete', old.id, old.trade_name, old.trade_name_ar, old.strength, old.barcode);
  INSERT INTO products_fts(rowid, trade_name, trade_name_ar, strength, barcode)
  VALUES (new.id, new.trade_name, new.trade_name_ar, new.strength, new.barcode);
END;
`);

export function setSetting(key, value) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, typeof value === 'string' ? value : JSON.stringify(value));
}
export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export default db;
