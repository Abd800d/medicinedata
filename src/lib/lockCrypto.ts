/*
 * App-lock primitives (no React, so they can be unit-tested in Node).
 *
 * What this protects: someone picking up an unlocked phone and opening the app.
 * What it does NOT protect: a rooted device, a forensic dump of localStorage, or
 * the server account itself. The PIN is never sent anywhere, and is stored only
 * as a PBKDF2-SHA256 digest with a random salt — the same PIN on two phones gives
 * two different digests.
 */

export const LOCK_KEY = 'mda.lock.v1';
export const FAIL_KEY = 'mda.lock.fails';
export const PIN_MIN = 4;
export const PIN_MAX = 8;
export const ITERATIONS = 150_000;

export type LockRecord = {
  v: 1;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: number;
  autoLockMinutes: number;
  biometricId?: string | null;
};

const enc = new TextEncoder();

export const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export const fromB64 = (s: string) => {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toB64(bytes);
}

export const pinValid = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

export const cryptoAvailable = () =>
  typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.subtle.deriveBits === 'function';

/** PBKDF2-SHA256 over the digits. Constant parameters are stored with the record. */
export async function hashPin(pin: string, saltB64: string, iterations = ITERATIONS): Promise<string> {
  if (!cryptoAvailable()) throw new Error('crypto-unavailable');
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations, hash: 'SHA-256' }, key, 256);
  return toB64(new Uint8Array(bits));
}

export function readLock(): LockRecord | null {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    if (!rec || rec.v !== 1 || !rec.salt || !rec.hash) return null;
    return rec as LockRecord;
  } catch { return null; }
}

export function writeLock(rec: LockRecord | null) {
  try {
    if (rec) localStorage.setItem(LOCK_KEY, JSON.stringify(rec));
    else localStorage.removeItem(LOCK_KEY);
  } catch { /* private mode */ }
}

export async function createLock(pin: string, autoLockMinutes = 0): Promise<LockRecord> {
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  return { v: 1, salt, hash, iterations: ITERATIONS, createdAt: Date.now(), autoLockMinutes, biometricId: null };
}

export async function verifyPin(pin: string, rec: LockRecord | null = readLock()): Promise<boolean> {
  if (!rec) return false;
  try {
    const hash = await hashPin(pin, rec.salt, rec.iterations || ITERATIONS);
    /* constant-time-ish compare: same length + no early exit */
    if (hash.length !== rec.hash.length) return false;
    let diff = 0;
    for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

/* ------------------------------ lockout ------------------------------ */

export type FailState = { fails: number; until: number };

export function readFails(): FailState {
  try {
    const raw = localStorage.getItem(FAIL_KEY);
    if (!raw) return { fails: 0, until: 0 };
    const j = JSON.parse(raw);
    return { fails: Number(j.fails) || 0, until: Number(j.until) || 0 };
  } catch { return { fails: 0, until: 0 }; }
}

export function writeFails(state: FailState) {
  try { localStorage.setItem(FAIL_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

/** 0 for the first four mistakes, then 30s → 2m → 5m → 15m. */
export function backoffMs(fails: number): number {
  if (fails < 5) return 0;
  const table = [0, 0, 0, 0, 0, 30_000, 120_000, 300_000];
  return table[fails] ?? 900_000;
}

export function registerFail(): FailState {
  const prev = readFails();
  const fails = prev.fails + 1;
  const state = { fails, until: Date.now() + backoffMs(fails) };
  writeFails(state);
  return state;
}

export function resetFails() {
  writeFails({ fails: 0, until: 0 });
}

export const secondsLeft = (until: number) => Math.max(0, Math.ceil((until - Date.now()) / 1000));
