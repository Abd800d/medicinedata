/*
 * Built-in catalogue engine.
 *
 * The APK ships public/data/catalog.json (see scripts/build-offline-bundle.mjs).
 * When the backend is unreachable — or the user never configured one — every read-only
 * catalogue screen is served from this file, with exactly the same JSON shapes as the API.
 * Search ranking and pack artwork are the *same modules* the server uses (src/lib/core/*),
 * so results and visuals cannot drift.
 */
import { useEffect, useState } from 'react';
import { normalize, searchNorm, rankCandidates, packSvg, capsuleSvg } from './core';

type Row = Record<string, any>;

export type Bundle = {
  version: number;
  generated_at: string;
  counts: Record<string, number>;
  settings: Record<string, string>;
  systems: Row[];
  categories: Row[];
  drugs: Row[];
  products: Row[];
  manufacturers: Row[];
  agents: Row[];
  product_images: Row[];
};

type State = {
  bundle: Bundle | null;
  loading: Promise<Bundle | null> | null;
  /* Cached indexes, rebuilt when the bundle loads */
  systemById: Map<number, Row>;
  catById: Map<number, Row>;
  drugById: Map<number, Row>;
  productById: Map<number, Row>;
  productsByDrug: Map<number, Row[]>;
  imagesByProduct: Map<number, Row[]>;
  drugCountBySystem: Map<number, number>;
  productCountBySystem: Map<number, number>;
  drugCountByCat: Map<number, number>;
  productCountByCat: Map<number, number>;
  mfrById: Map<number, Row>;
  agentById: Map<number, Row>;
  searchDrugs: Row[];
  searchProducts: Row[];
};

const state: State = {
  bundle: null,
  loading: null,
  systemById: new Map(),
  catById: new Map(),
  drugById: new Map(),
  productById: new Map(),
  productsByDrug: new Map(),
  imagesByProduct: new Map(),
  drugCountBySystem: new Map(),
  productCountBySystem: new Map(),
  drugCountByCat: new Map(),
  productCountByCat: new Map(),
  mfrById: new Map(),
  agentById: new Map(),
  searchDrugs: [],
  searchProducts: [],
};

/* ---------------- server status (shared with the UI banner) ---------------- */
type Listener = (reachable: boolean) => void;
let serverReachable: boolean | null = null;
/* 'waking' = the request timed out but the host may still be starting (Render free tier
   sleeps after ~15 idle minutes and needs up to a minute to boot). */
let serverWaking = false;
const listeners = new Set<Listener>();

export function setServerWaking(on: boolean) {
  if (serverWaking === on) return;
  serverWaking = on;
  listeners.forEach((fn) => fn(serverReachable));
}
export function getServerWaking() {
  return serverWaking;
}

export function setServerReachable(ok: boolean) {
  if (serverReachable === ok) return;
  serverReachable = ok;
  listeners.forEach((fn) => fn(ok));
}
export function getServerReachable() {
  return serverReachable;
}
export function subscribeServerStatus(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------- loading ---------------- */
/* Absolute against the document base: works on a normal origin, inside the Android
   WebView (https://localhost) and when the app is served from a sub-path. */
const BUNDLE_URL = (() => {
  const base = (import.meta as any).env?.BASE_URL || '/';
  try { return new URL(`${base}data/catalog.json`, (globalThis as any).document?.baseURI || base).toString(); }
  catch { return `${base}data/catalog.json`; }
})();

export function isLoaded() {
  return !!state.bundle;
}

/* Re-renders subscribers once the bundled catalogue is available (images can then be
   generated locally, so the UI must repaint even if no network request ever resolves). */
const readyListeners = new Set<() => void>();
export function onLocalReady(fn: () => void) {
  readyListeners.add(fn);
  return () => { readyListeners.delete(fn); };
}
export function useLocalReady() {
  const [ready, setReady] = useState(isLoaded());
  useEffect(() => {
    if (ready) return;
    if (isLoaded()) { setReady(true); return; }
    return onLocalReady(() => setReady(true));
  }, [ready]);
  return ready;
}
export function bundleMeta() {
  if (!state.bundle) return null;
  return { generated_at: state.bundle.generated_at, counts: state.bundle.counts };
}

export function loadLocal(): Promise<Bundle | null> {
  if (state.bundle) return Promise.resolve(state.bundle);
  if (state.loading) return state.loading;
  state.loading = (async () => {
    try {
      const res = await fetch(BUNDLE_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const bundle = (await res.json()) as Bundle;
      index(bundle);
      state.bundle = bundle;
      readyListeners.forEach((fn) => fn());
      return bundle;
    } catch {
      state.loading = null;
      return null;
    }
  })();
  return state.loading;
}

function index(b: Bundle) {
  const s = state;
  s.systemById = new Map(b.systems.map((r) => [r.id, r]));
  s.catById = new Map(b.categories.map((r) => [r.id, r]));
  s.drugById = new Map(b.drugs.map((r) => [r.id, r]));
  s.productById = new Map(b.products.map((r) => [r.id, r]));
  s.mfrById = new Map(b.manufacturers.map((r) => [r.id, r]));
  s.agentById = new Map(b.agents.map((r) => [r.id, r]));
  s.productsByDrug = new Map();
  for (const p of b.products) {
    const list = s.productsByDrug.get(p.drug_id) || [];
    list.push(p);
    s.productsByDrug.set(p.drug_id, list);
  }
  s.imagesByProduct = new Map();
  for (const img of b.product_images) {
    if (img.source === 'generated') continue; // regenerated in-app, identical artwork
    const list = s.imagesByProduct.get(img.product_id) || [];
    list.push(img);
    s.imagesByProduct.set(img.product_id, list);
  }
  s.drugCountBySystem = new Map();
  s.productCountBySystem = new Map();
  s.drugCountByCat = new Map();
  s.productCountByCat = new Map();
  for (const d of b.drugs) {
    s.drugCountBySystem.set(d.system_id, (s.drugCountBySystem.get(d.system_id) || 0) + 1);
    s.drugCountByCat.set(d.category_id, (s.drugCountByCat.get(d.category_id) || 0) + 1);
    for (const p of s.productsByDrug.get(d.id) || []) {
      s.productCountBySystem.set(d.system_id, (s.productCountBySystem.get(d.system_id) || 0) + 1);
      s.productCountByCat.set(d.category_id, (s.productCountByCat.get(d.category_id) || 0) + 1);
    }
  }
  // Pre-computed haystacks for the shared ranker
  s.searchDrugs = b.drugs.map((d) => ({
    ...d,
    search_norm: searchNorm(d.generic_name, d.generic_ar, d.synonyms, d.drug_class),
  }));
  s.searchProducts = b.products.map((p) => ({
    ...p,
    search_norm: searchNorm(p.trade_name, p.trade_name_ar, p.strength, p.dosage_form, p.barcode),
  }));
}

/* ---------------- helpers ---------------- */
const limitOf = (v: any, def = 20, max = 200) => Math.max(1, Math.min(max, parseInt(v, 10) || def));
const pageOf = (v: any) => Math.max(1, parseInt(v, 10) || 1);
const mfrName = (id?: number | null) => (id ? state.mfrById.get(id)?.name ?? null : null);
const agentRow = (id?: number | null) => (id ? state.agentById.get(id) ?? null : null);

function systemOf(drug: Row | undefined) {
  return drug?.system_id ? state.systemById.get(drug.system_id) : undefined;
}
function categoryOf(drug: Row | undefined) {
  return drug?.category_id ? state.catById.get(drug.category_id) : undefined;
}

/* ── verification, offline ──────────────────────────────────────────────────
   The six states are stored in the bundle, but older bundles only carry `verified`; both are
   handled here with the same derivation the server uses, so a record can never read «موثّق»
   online and «غير موثّق» offline. */
const CORE_PRODUCT = ['trade_name', 'strength', 'dosage_form', 'country', 'barcode', 'manufacturer_id'];
const CORE_DRUG = ['generic_name', 'indications_en', 'dosage_adult', 'warnings'];
const FIELD_AR: Record<string, string> = {
  trade_name: 'الاسم التجاري', strength: 'القوة', dosage_form: 'الشكل الصيدلاني',
  country: 'بلد التسويق', barcode: 'الباركود', manufacturer_id: 'الشركة المصنعة',
  generic_name: 'الاسم العلمي', indications_en: 'الدواعي', dosage_adult: 'جرعة البالغين', warnings: 'التحذيرات',
};

export function missingFieldsOf(row: Row, entity: 'products' | 'drugs' = 'products') {
  return (entity === 'drugs' ? CORE_DRUG : CORE_PRODUCT)
    .filter((f) => row?.[f] === undefined || row?.[f] === null || String(row[f]).trim() === '');
}

export function offlineState(row: Row, entity: 'products' | 'drugs' = 'products') {
  const missing = missingFieldsOf(row, entity);
  const stored = row?.verification_state;
  if (typeof stored === 'string' && stored) {
    if (stored === 'incomplete') return missing.length ? 'incomplete' : 'unverified';
    if (stored === 'unverified') return missing.length ? 'incomplete' : 'unverified';
    return stored;
  }
  if (missing.length) return 'incomplete';
  return Number(row?.verified) === 1 ? 'verified' : 'unverified';
}

function verificationPatch(row: Row, entity: 'products' | 'drugs' = 'products') {
  const missing = missingFieldsOf(row, entity);
  return {
    verification: offlineState(row, entity),
    review_status: (row?.review_status as string) || 'none',
    missing_fields: missing,
  };
}

function drugCard(d: Row) {
  const sys = systemOf(d);
  const cat = categoryOf(d);
  const products = state.productsByDrug.get(d.id) || [];
  const withPhoto = products.find((p) => p.image_url);
  return {
    id: d.id,
    generic_name: d.generic_name,
    generic_ar: d.generic_ar,
    synonyms: d.synonyms,
    drug_class: d.drug_class,
    atc_code: d.atc_code,
    prescription_required: d.prescription_required,
    verified: d.verified,
    system_slug: sys?.slug ?? null,
    system_en: sys?.name_en ?? null,
    system_ar: sys?.name_ar ?? null,
    system_color: sys?.color ?? null,
    category_en: cat?.name_en ?? null,
    category_ar: cat?.name_ar ?? null,
    products_count: products.length,
    image_url: withPhoto?.image_url ?? null,
    ...verificationPatch(d, 'drugs'),
  };
}

function productCard(p: Row) {
  const d = state.drugById.get(p.drug_id);
  return {
    ...p,
    generic_name: d?.generic_name ?? null,
    generic_ar: d?.generic_ar ?? null,
    drug_class: d?.drug_class ?? null,
    manufacturer_name: mfrName(p.manufacturer_id),
    agent_name: agentRow(p.agent_id)?.name ?? null,
    ...verificationPatch(p, 'products'),
  };
}

function productPreview(p: Row) {
  return {
    id: p.id,
    trade_name: p.trade_name,
    trade_name_ar: p.trade_name_ar,
    strength: p.strength,
    dosage_form: p.dosage_form,
    image_url: p.image_url,
    country: p.country,
    price: p.price,
    currency: p.currency,
    manufacturer_name: mfrName(p.manufacturer_id),
  };
}

/* ---------------- route handlers (same shapes as the Express API) ---------------- */
type Params = Record<string, any> | undefined;

const handlers: ((path: string, params: Params, b: Bundle) => any | undefined)[] = [
  /* GET /api/config */
  (path, _p, b) => {
    if (path !== '/api/config') return undefined;
    const st = b.settings || {};
    return {
      app: 'MDA',
      name_en: st.site_name_en || 'MedicineData',
      name_ar: st.site_name_ar || 'ميديسين داتا',
      owner_name: st.owner_name || 'د. عبدالمجيد عبدالله الماخذي',
      owner_title: st.owner_title || 'المؤسس والمدير الطبي',
      support_email: st.support_email || '7a8b1d@gmail.com',
      whatsapp: st.whatsapp || '+967781733795',
      owner_email: st.owner_email || '7a8b1d@gmail.com',
      about_ar: st.about_ar || 'مرجع دوائي شامل للأدوية والمنتجات التجارية في اليمن والدول العربية.',
      about_en: st.about_en || 'A comprehensive pharmaceutical reference for Yemen and the Arab world.',
      disclaimer_ar: st.disclaimer_ar || 'المعلومات مرجعية ولا تُغني عن استشارة الطبيب أو الصيدلي.',
      disclaimer_en: st.disclaimer_en || 'Reference information only; consult a licensed clinician.',
      ai_enabled: false,
      google_client_id: '',
      counts: { drugs: b.drugs.length, products: b.products.length, systems: b.systems.length },
      default_lang: st.default_lang || 'ar',
      maintenance: false,
      allow_registration: false,
      source: 'builtin',
    };
  },

  /* GET /api/catalog/stats */
  (path, _p, b) => {
    if (path !== '/api/catalog/stats') return undefined;
    return {
      systems: b.systems.length,
      categories: b.categories.length,
      drugs: b.drugs.length,
      products: b.products.length,
      manufacturers: b.manufacturers.length,
      agents: b.agents.length,
      users: 0,
    };
  },

  /* GET /api/catalog/trending */
  (path) => {
    if (path !== '/api/catalog/trending') return undefined;
    return ['paracetamol', 'amoxicillin', 'omeprazole', 'metformin', 'vitamin d'];
  },

  /* GET /api/catalog/systems */
  (path, _p, b) => {
    if (path !== '/api/catalog/systems') return undefined;
    return b.systems.map((s) => ({
      ...s,
      categories: b.categories.filter((c) => c.system_id === s.id).length,
      drugs: state.drugCountBySystem.get(s.id) || 0,
      products: state.productCountBySystem.get(s.id) || 0,
    }));
  },

  /* GET /api/catalog/systems/:slug */
  (path, _p, b) => {
    const m = path.match(/^\/api\/catalog\/systems\/([^/]+)$/);
    if (!m) return undefined;
    const slug = decodeURIComponent(m[1]);
    const system = b.systems.find((s) => s.slug === slug);
    if (!system) return { __status: 404, error: 'System not found' };
    return {
      ...system,
      category_list: b.categories
        .filter((c) => c.system_id === system.id)
        .map((c) => ({ ...c, drugs: state.drugCountByCat.get(c.id) || 0, products: state.productCountByCat.get(c.id) || 0 })),
    };
  },

  /* GET /api/catalog/categories/:id */
  (path) => {
    const m = path.match(/^\/api\/catalog\/categories\/(\d+)$/);
    if (!m) return undefined;
    const cat = state.catById.get(Number(m[1]));
    if (!cat) return { __status: 404, error: 'Category not found' };
    const sys = state.systemById.get(cat.system_id);
    return { ...cat, system_slug: sys?.slug, system_en: sys?.name_en, system_ar: sys?.name_ar };
  },

  /* GET /api/catalog/drugs?system=&category=&q=&limit=&page= */
  (path, p, b) => {
    if (path !== '/api/catalog/drugs') return undefined;
    const limit = limitOf(p?.limit, 30);
    const page = pageOf(p?.page);
    let rows = b.drugs;
    if (p?.system) {
      const sys = b.systems.find((s) => s.slug === p.system);
      rows = sys ? rows.filter((d) => d.system_id === sys.id) : [];
    }
    if (p?.category) rows = rows.filter((d) => d.category_id === Number(p.category));
    if (p?.q) {
      const nq = normalize(p.q);
      rows = rows.filter((d) => {
        const hay = normalize(`${d.generic_name} ${d.generic_ar || ''} ${d.synonyms || ''} ${d.drug_class || ''}`);
        return hay.includes(nq) || (state.productsByDrug.get(d.id) || []).some((pr) => normalize(`${pr.trade_name} ${pr.trade_name_ar || ''}`).includes(nq));
      });
    }
    const sorted = [...rows].sort((a, c) => String(a.generic_name).localeCompare(String(c.generic_name)));
    const slice = sorted.slice((page - 1) * limit, (page - 1) * limit + limit).map(drugCard);
    return { data: slice, page, limit, total: sorted.length, pages: Math.ceil(sorted.length / limit) };
  },

  /* GET /api/catalog/drugs/:id */
  (path, _p, b) => {
    const m = path.match(/^\/api\/catalog\/drugs\/(\d+)$/);
    if (!m) return undefined;
    const d = state.drugById.get(Number(m[1]));
    if (!d) return { __status: 404, error: 'Drug not found' };
    const sys = systemOf(d);
    const cat = categoryOf(d);
    const products = (state.productsByDrug.get(d.id) || [])
      .slice()
      .sort((a, c) => (c.verified - a.verified) || String(a.trade_name).localeCompare(String(c.trade_name)))
      .map((p) => {
        const agent = agentRow(p.agent_id);
        return {
          ...p,
          manufacturer_name: mfrName(p.manufacturer_id),
          manufacturer_country: p.manufacturer_id ? state.mfrById.get(p.manufacturer_id)?.country ?? null : null,
          agent_name: agent?.name ?? null,
          agent_phone: agent?.phone ?? null,
          agent_city: agent?.city ?? null,
          images: state.imagesByProduct.get(p.id) || [],
          ...verificationPatch(p, 'products'),
        };
      });
    const related = b.drugs
      .filter((x) => x.id !== d.id && ((d.category_id && x.category_id === d.category_id) || (d.drug_class && x.drug_class === d.drug_class)))
      .slice(0, 12)
      .map((x) => ({
        id: x.id,
        generic_name: x.generic_name,
        generic_ar: x.generic_ar,
        drug_class: x.drug_class,
        products_count: (state.productsByDrug.get(x.id) || []).length,
      }));
    return {
      ...d,
      system_slug: sys?.slug ?? null,
      system_en: sys?.name_en ?? null,
      system_ar: sys?.name_ar ?? null,
      system_color: sys?.color ?? null,
      category_en: cat?.name_en ?? null,
      category_ar: cat?.name_ar ?? null,
      products,
      related,
      ...verificationPatch(d, 'drugs'),
      verification_detail: {
        entity: 'drugs', id: d.id, title: d.generic_name,
        state: offlineState(d, 'drugs'),
        review: (d.review_status as string) || 'none',
        reviewer: null, reviewed_at: null, review_note: null,
        missing_fields: missingFieldsOf(d, 'drugs'),
        missing_labels_ar: missingFieldsOf(d, 'drugs').map((f) => FIELD_AR[f] || f),
        sources: [], events: [], offline: true,
      },
    };
  },

  /* GET /api/catalog/products?q=&country=&verified=&has_image=&limit=&page= */
  (path, p, b) => {
    if (path !== '/api/catalog/products') return undefined;
    const limit = limitOf(p?.limit, 30);
    const page = pageOf(p?.page);
    let rows = b.products;
    if (p?.q) {
      const nq = normalize(p.q);
      rows = rows.filter((r) => normalize(`${r.trade_name} ${r.trade_name_ar || ''} ${r.barcode || ''}`).includes(nq)
        || normalize(state.drugById.get(r.drug_id)?.generic_name || '').includes(nq));
    }
    if (p?.country) rows = rows.filter((r) => r.country === p.country);
    if (String(p?.verified) === '1') rows = rows.filter((r) => r.verified);
    if (String(p?.has_image) === '1') rows = rows.filter((r) => r.image_url && r.image_url !== '');
    if (p?.agent) rows = rows.filter((r) => String(r.agent_id || '') === String(p.agent));
    if (p?.manufacturer) rows = rows.filter((r) => String(r.manufacturer_id || '') === String(p.manufacturer));
    if (p?.drug) rows = rows.filter((r) => String(r.drug_id || '') === String(p.drug));
    if (p?.system) {
      rows = rows.filter((r) => {
        const d = state.drugById.get(r.drug_id);
        return d && String(systemOf(d)?.slug || '') === String(p.system);
      });
    }
    /* the six states — the filter must never silently return unrelated rows offline */
    if (p?.state) rows = rows.filter((r) => offlineState(r, 'products') === String(p.state));
    if (p?.review) rows = rows.filter((r) => ((r.review_status as string) || 'none') === String(p.review));
    const sorted = [...rows].sort((a, c) => (c.verified - a.verified) || String(a.trade_name).localeCompare(String(c.trade_name)));
    return {
      data: sorted.slice((page - 1) * limit, (page - 1) * limit + limit).map(productCard),
      page, limit, total: sorted.length, pages: Math.ceil(sorted.length / limit),
    };
  },

  /* GET /api/catalog/products/:id */
  (path, _p) => {
    const m = path.match(/^\/api\/catalog\/products\/(\d+)$/);
    if (!m) return undefined;
    const p = state.productById.get(Number(m[1]));
    if (!p) return { __status: 404, error: 'Product not found' };
    const d = state.drugById.get(p.drug_id);
    const mfr = p.manufacturer_id ? state.mfrById.get(p.manufacturer_id) : undefined;
    const agent = agentRow(p.agent_id);
    const alternatives = (state.productsByDrug.get(p.drug_id) || [])
      .filter((x) => x.id !== p.id)
      .slice(0, 30)
      .map((x) => ({
        id: x.id, trade_name: x.trade_name, trade_name_ar: x.trade_name_ar, strength: x.strength,
        dosage_form: x.dosage_form, image_url: x.image_url, country: x.country, price: x.price,
        currency: x.currency, manufacturer_name: mfrName(x.manufacturer_id),
      }));
    return {
      ...p,
      generic_name: d?.generic_name ?? null,
      generic_ar: d?.generic_ar ?? null,
      drug_id: d?.id ?? null,
      drug_class: d?.drug_class ?? null,
      indications_ar: d?.indications_ar ?? null,
      indications_en: d?.indications_en ?? null,
      dosage_adult: d?.dosage_adult ?? null,
      warnings: d?.warnings ?? null,
      side_effects: d?.side_effects ?? null,
      manufacturer_name: mfr?.name ?? null,
      manufacturer_country: mfr?.country ?? null,
      agent_name: agent?.name ?? null,
      agent_phone: agent?.phone ?? null,
      agent_email: agent?.email ?? null,
      agent_city: agent?.city ?? null,
      images: state.imagesByProduct.get(p.id) || [],
      alternatives,
      ...verificationPatch(p, 'products'),
      /* the same envelope the server sends; `offline` tells the panel that the reviewer and
         the document list are not available without a connection — never "no reviewer". */
      verification_detail: {
        entity: 'products', id: p.id, title: p.trade_name,
        state: offlineState(p, 'products'),
        review: (p.review_status as string) || 'none',
        reviewer: null, reviewed_at: null, review_note: null,
        missing_fields: missingFieldsOf(p, 'products'),
        missing_labels_ar: missingFieldsOf(p, 'products').map((f) => FIELD_AR[f] || f),
        sources: [], events: [], offline: true,
      },
    };
  },

  /* GET /api/catalog/manufacturers?q= · /agents?q= */
  (path, p, b) => {
    if (path !== '/api/catalog/manufacturers' && path !== '/api/catalog/agents') return undefined;
    const isAgent = path.endsWith('/agents');
    const rows: Row[] = isAgent ? b.agents : b.manufacturers;
    const q = p?.q ? normalize(p.q) : '';
    const counted: Row[] = rows.map((r: Row) => ({
      ...r,
      products_count: b.products.filter((x) => (isAgent ? x.agent_id === r.id : x.manufacturer_id === r.id)).length,
    }));
    const filtered = q
      ? counted.filter((r: Row) => normalize(`${r.name} ${r.name_ar || ''} ${r.country || ''} ${r.city || ''}`).includes(q))
      : counted;
    return filtered.sort((a, c) => c.products_count - a.products_count || String(a.name).localeCompare(String(c.name))).slice(0, 500);
  },

  /* GET /api/catalog/barcode/:code */
  (path, _p, b) => {
    const m = path.match(/^\/api\/catalog\/barcode\/(.+)$/);
    if (!m) return undefined;
    const raw = decodeURIComponent(m[1]).trim();
    const digits = raw.replace(/\D/g, '');
    const variants = new Set([raw, digits]);
    if (digits.length === 12) variants.add('0' + digits);
    if (digits.length === 13 && digits.startsWith('0')) variants.add(digits.slice(1));
    if (digits.length === 13) variants.add(digits.slice(0, 12));
    const list = [...variants].filter(Boolean);
    return b.products
      .filter((p) => p.barcode && list.includes(String(p.barcode)))
      .sort((a, c) => (String(a.barcode) === (digits || raw) ? -1 : 1) || (c.verified - a.verified))
      .map((p) => ({
        ...productCard(p),
        photo_count: (state.imagesByProduct.get(p.id) || []).length,
      }));
  },

  /* GET /api/catalog/search?q= */
  (path, p, b) => {
    if (path !== '/api/catalog/search') return undefined;
    const q = String(p?.q || '').trim();
    if (!q) return { query: q, drugs: [], products: [], suggestions: [] };
    const norm = normalize(q);

    /* Candidate pools: substring matches on the haystack + prefix relaxations for typos */
    const anchor = norm.slice(0, Math.max(2, Math.min(4, norm.length)));
    const drugPool = state.searchDrugs.filter((d) => d.search_norm.includes(norm) || normalize(d.generic_name).startsWith(anchor) || normalize(d.generic_ar || '').startsWith(anchor));
    const productPool = state.searchProducts.filter((x) => x.search_norm.includes(norm) || normalize(x.trade_name).startsWith(anchor) || String(x.barcode || '') === q);

    const drugHits = rankCandidates(q, drugPool.length ? drugPool : state.searchDrugs, ['generic_name', 'generic_ar', 'synonyms', 'drug_class'], 30, 0.34);
    const productHits = rankCandidates(q, productPool.length ? productPool : state.searchProducts, ['trade_name', 'trade_name_ar'], 40, 0.4);

    const drugs = drugHits.map(({ row, score }) => ({
      ...drugCard(row),
      score,
      products_preview: (state.productsByDrug.get(row.id) || []).slice(0, 4).map(productPreview),
    }));

    const seen = new Set(drugs.map((d) => d.id));
    for (const { row, score } of productHits) {
      if (row.drug_id && !seen.has(row.drug_id)) {
        const d = state.drugById.get(row.drug_id);
        if (!d) continue;
        seen.add(d.id);
        drugs.push({
          ...drugCard(d),
          score: Number((score * 0.95).toFixed(4)),
          products_preview: (state.productsByDrug.get(d.id) || []).slice(0, 4).map(productPreview),
        } as any);
      }
    }
    drugs.sort((a: any, c: any) => c.score - a.score);

    const suggestions = [...new Set([
      ...drugs.slice(0, 5).map((d: any) => d.generic_name),
      ...productHits.slice(0, 5).map((x) => x.row.trade_name),
    ])].slice(0, 8);

    return {
      query: q,
      normalized: norm,
      drugs: drugs.slice(0, 30),
      products: productHits.map(({ row, score }) => ({ ...productCard(row), score })),
      suggestions,
      source: 'builtin',
    };
  },

  /* GET /api/catalog/offline-pack (so "download offline pack" also works without a server) */
  (path, _p, b) => {
    if (path !== '/api/catalog/offline-pack') return undefined;
    return {
      generated_at: b.generated_at,
      systems: b.systems.map((s) => ({ id: s.id, slug: s.slug, name_en: s.name_en, name_ar: s.name_ar, icon: s.icon, color: s.color })),
      drugs: b.drugs.map((d) => {
        const sys = systemOf(d);
        return {
          ...d,
          system_slug: sys?.slug ?? null, system_ar: sys?.name_ar ?? null, system_en: sys?.name_en ?? null, system_color: sys?.color ?? null,
        };
      }),
      products: b.products.map((p) => ({
        ...p,
        manufacturer_name: mfrName(p.manufacturer_id),
        agent_name: agentRow(p.agent_id)?.name ?? null,
      })),
    };
  },
];

/* ---------------- public entry points ---------------- */

/** Serves a read-only API path from the bundle. `undefined` → not handled, let the network decide. */
export function localServe(path: string, params?: Record<string, any>): any | undefined {
  const b = state.bundle;
  if (!b) return undefined;
  for (const handle of handlers) {
    const out = handle(path, params, b);
    if (out !== undefined) {
      if (out && out.__status) {
        const err = new Error(out.error || 'Not found') as any;
        err.status = out.__status;
        throw err;
      }
      return out;
    }
  }
  return undefined;
}

/** Whether this path can be answered without a backend at all. */
export const isLocalPath = (path: string) =>
  path === '/api/config' || path.startsWith('/api/catalog/');

/** Generated packaging artwork (same SVG the server would return) as a data URI. */
export function localArt(productId?: number | null, drugId?: number | null): string | undefined {
  if (!state.bundle) return undefined;
  try {
    if (productId) {
      const p = state.productById.get(productId);
      if (!p) return undefined;
      const d = state.drugById.get(p.drug_id);
      const sys = systemOf(d);
      const svg = packSvg({ ...p, generic_name: d?.generic_name, generic_ar: d?.generic_ar, color: sys?.color });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    if (drugId) {
      const d = state.drugById.get(drugId);
      if (!d) return undefined;
      const sys = systemOf(d);
      const svg = capsuleSvg({ ...d, color: sys?.color });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
  } catch { /* fall through to the icon placeholder */ }
  return undefined;
}
