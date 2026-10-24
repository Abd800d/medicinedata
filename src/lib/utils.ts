import { useEffect, useState } from 'react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export const fmt = (n?: number | null) => (n === undefined || n === null ? '—' : new Intl.NumberFormat('en-US').format(n));

export function timeAgo(value?: string | null, lang: 'ar' | 'en' = 'ar') {
  if (!value) return '';
  const d = new Date(value.includes('Z') ? value : value.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d.getTime()) / 1000;
  const ar = ['الآن', 'منذ دقيقة', 'منذ {n} دقائق', 'منذ {n} ساعة', 'منذ {n} يوم', 'منذ {n} شهر', 'منذ {n} سنة'];
  const en = ['just now', '1 min ago', '{n} mins ago', '{n} hours ago', '{n} days ago', '{n} months ago', '{n} years ago'];
  const table = lang === 'ar' ? ar : en;
  if (diff < 60) return table[0];
  if (diff < 3600) return table[1];
  if (diff < 86400) return table[2].replace('{n}', String(Math.floor(diff / 60)));
  if (diff < 86400 * 30) return table[3].replace('{n}', String(Math.floor(diff / 3600)));
  if (diff < 86400 * 365) return table[4].replace('{n}', String(Math.floor(diff / 86400)));
  if (diff < 86400 * 365 * 5) return table[5].replace('{n}', String(Math.floor(diff / (86400 * 30))));
  return table[6].replace('{n}', String(Math.floor(diff / (86400 * 365))));
}

export const dateFmt = (value?: string | null) => (value ? new Date(value.includes('Z') ? value : value.replace(' ', 'T') + 'Z').toLocaleDateString('en-GB') : '');

export const initials = (name?: string) =>
  (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export async function shareItem(data: { title: string; text?: string; url?: string }) {
  if (navigator.share) {
    try { await navigator.share(data); return true; } catch { return false; }
  }
  return copyText(`${data.title}\n${data.text || ''}\n${data.url || location.href}`);
}

export const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
