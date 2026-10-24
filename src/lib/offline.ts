import { useEffect, useState } from 'react';
import { api } from './api';

export type OfflinePack = {
  generated_at: string;
  systems: any[];
  drugs: any[];
  products: any[];
};

const DB_NAME = 'mda-offline';
const STORE = 'pack';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePack(pack: OfflinePack) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(pack, 'catalog');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  localStorage.setItem('mda.pack.meta', JSON.stringify({ generated_at: pack.generated_at, drugs: pack.drugs.length, products: pack.products.length, systems: pack.systems.length }));
}

export async function getPack(): Promise<OfflinePack | null> {
  try {
    const db = await openDB();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('catalog');
      req.onsuccess = () => resolve((req.result as OfflinePack) || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export const packMeta = (): { generated_at: string; drugs: number; products: number; systems: number } | null => {
  try { return JSON.parse(localStorage.getItem('mda.pack.meta') || 'null'); } catch { return null; }
};

export async function downloadPack() {
  const pack = await api.get<OfflinePack>('/api/catalog/offline-pack');
  await savePack(pack);
  return pack;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

export function normalize(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function score(q: string, target: string) {
  const a = normalize(q), b = normalize(target || '');
  if (!a || !b) return 0;
  if (b.includes(a)) return 0.95;
  const d = lev(a, b);
  return Math.max(0, 1 - d / Math.max(a.length, b.length));
}

export function searchPack(pack: OfflinePack, q: string) {
  const nq = normalize(q);
  if (!nq) return { drugs: [], products: [] };
  const products = pack.products
    .map((p) => ({
      ...p,
      _score: Math.max(score(nq, p.trade_name), score(nq, p.trade_name_ar || ''), score(nq, p.generic_name || ''), p.barcode === q ? 1 : 0),
    }))
    .filter((p) => p._score > 0.55)
    .sort((a, b) => b._score - a._score)
    .slice(0, 40);
  const drugs = pack.drugs
    .map((d) => ({ ...d, _score: Math.max(score(nq, d.generic_name), score(nq, d.generic_ar || ''), score(nq, d.synonyms || '') * 0.9) }))
    .filter((d) => d._score > 0.5)
    .sort((a, b) => b._score - a._score)
    .slice(0, 30);
  return { drugs, products };
}
