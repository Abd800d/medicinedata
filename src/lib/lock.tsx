/*
 * Application lock: a 4–8 digit PIN (PBKDF2) plus optional device biometrics.
 *
 * Design notes
 *   • The lock is a *local device gate*: nothing is uploaded, and the server never
 *     learns the PIN. It stops "someone picked up my phone", not a forensic dump —
 *     that limit is stated in the UI and in docs/SECURITY.md.
 *   • Biometrics use WebAuthn's platform authenticator only as a local user-verification
 *     gesture (no server assertion), because MDA has no WebAuthn backend. If the
 *     WebView does not support it, the button never appears and the PIN remains.
 *   • The queue/session stays mounted behind the lock screen, so unlocking never
 *     loses an in-flight sync or a half-written form.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  LOCK_KEY, backoffMs, createLock, pinValid, readFails, readLock, registerFail, resetFails,
  secondsLeft, verifyPin, writeFails, writeLock, cryptoAvailable, fromB64, toB64,
  type LockRecord,
} from './lockCrypto';

type LockCtx = {
  supported: boolean;
  enabled: boolean;
  locked: boolean;
  autoLockMinutes: number;
  biometricReady: boolean;
  failsLeft: number;
  lockoutSeconds: number;
  enable: (pin: string) => Promise<void>;
  disable: (pin: string) => Promise<boolean>;
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  setAutoLock: (minutes: number) => void;
  unlock: (pin: string) => Promise<boolean>;
  registerBiometric: () => Promise<boolean>;
  unlockBiometric: () => Promise<boolean>;
  lockNow: () => void;
  forget: () => void;
};

const Ctx = createContext<LockCtx | null>(null);

const AUTO_OPTIONS = [0, 1, 5, 15, 60];

export function LockProvider({ children }: { children: React.ReactNode }) {
  const supported = typeof window !== 'undefined' && cryptoAvailable();
  const [record, setRecord] = useState<LockRecord | null>(() => (supported ? readLock() : null));
  const [locked, setLocked] = useState<boolean>(() => !!(supported && readLock()));
  const [fails, setFailsState] = useState(() => readFails());
  const [biometricReady, setBiometricReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const hiddenAt = useRef<number | null>(null);

  /* ticker for the lockout countdown */
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  /* is a platform authenticator usable here? (Android WebView / Chrome only) */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pk = (window as any).PublicKeyCredential;
        if (!pk || !record?.biometricId) { if (alive) setBiometricReady(false); return; }
        const ok = await pk.isUserVerifyingPlatformAuthenticatorAvailable?.();
        if (alive) setBiometricReady(!!ok);
      } catch { if (alive) setBiometricReady(false); }
    })();
    return () => { alive = false; };
  }, [record?.biometricId]);

  /* Auto-lock when the app goes to the background. */
  useEffect(() => {
    if (!record) return;
    const minutes = record.autoLockMinutes ?? 0;
    const onHide = () => { hiddenAt.current = Date.now(); };
    const onShow = () => {
      if (hiddenAt.current === null) return;
      const away = Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (minutes === 0 || away >= minutes * 60_000) setLocked(true);
    };
    const onVis = () => (document.visibilityState === 'hidden' ? onHide() : onShow());
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [record]);

  const enable = useCallback(async (pin: string) => {
    if (!pinValid(pin)) throw new Error('pin-invalid');
    const rec = await createLock(pin, record?.autoLockMinutes ?? 0);
    writeLock(rec);
    resetFails();
    setFailsState({ fails: 0, until: 0 });
    setRecord(rec);
    setLocked(false);
  }, [record?.autoLockMinutes]);

  const disable = useCallback(async (pin: string) => {
    if (!(await verifyPin(pin, record))) return false;
    writeLock(null);
    resetFails();
    setRecord(null);
    setLocked(false);
    return true;
  }, [record]);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    if (!(await verifyPin(oldPin, record))) return false;
    if (!pinValid(newPin)) throw new Error('pin-invalid');
    const rec = await createLock(newPin, record?.autoLockMinutes ?? 0);
    const next = { ...rec, biometricId: record?.biometricId ?? null };
    writeLock(next);
    setRecord(next);
    return true;
  }, [record]);

  const setAutoLock = useCallback((minutes: number) => {
    if (!record) return;
    const next = { ...record, autoLockMinutes: AUTO_OPTIONS.includes(minutes) ? minutes : 0 };
    writeLock(next);
    setRecord(next);
  }, [record]);

  const unlock = useCallback(async (pin: string) => {
    const state = readFails();
    if (state.until > Date.now()) return false;
    const ok = await verifyPin(pin, record);
    if (ok) {
      resetFails();
      setFailsState({ fails: 0, until: 0 });
      setLocked(false);
      return true;
    }
    setFailsState(registerFail());
    return false;
  }, [record]);

  /* ---------------------------- biometrics ---------------------------- */
  const registerBiometric = useCallback(async () => {
    try {
      const pk = (window as any).PublicKeyCredential;
      if (!pk || !pk.isUserVerifyingPlatformAuthenticatorAvailable) return false;
      if (!(await pk.isUserVerifyingPlatformAuthenticatorAvailable())) return false;
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const userId = new Uint8Array(16);
      crypto.getRandomValues(userId);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'MDA — MedicineData', id: window.location.hostname || undefined },
          user: { id: userId, name: 'mda-local', displayName: 'MDA local unlock' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
          timeout: 60_000,
          attestation: 'none',
        },
      }) as PublicKeyCredential | null;
      if (!cred || !record) return false;
      const id = toB64(new Uint8Array(cred.rawId));
      const next = { ...record, biometricId: id };
      writeLock(next);
      setRecord(next);
      setBiometricReady(true);
      return true;
    } catch { return false; }
  }, [record]);

  const unlockBiometric = useCallback(async () => {
    try {
      if (!record?.biometricId) return false;
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60_000,
          userVerification: 'required',
          allowCredentials: [{ id: fromB64(record.biometricId), type: 'public-key' }],
        },
      });
      if (!assertion) return false;
      resetFails();
      setFailsState({ fails: 0, until: 0 });
      setLocked(false);
      return true;
    } catch { return false; }
  }, [record]);

  const lockNow = useCallback(() => { if (record) setLocked(true); }, [record]);

  /* Wipe the local lock (forgot PIN → the caller also signs out). */
  const forget = useCallback(() => {
    writeLock(null);
    resetFails();
    try { localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
    setRecord(null);
    setLocked(false);
  }, []);

  /* Synchronise across tabs: enabling/locking in one tab locks the others. */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCK_KEY) {
        const rec = readLock();
        setRecord(rec);
        if (rec) setLocked(true);
        else setLocked(false);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value: LockCtx = useMemo(() => ({
    supported,
    enabled: !!record,
    locked: !!record && locked,
    autoLockMinutes: record?.autoLockMinutes ?? 0,
    biometricReady: biometricReady && !!record?.biometricId,
    failsLeft: Math.max(0, 4 - fails.fails),
    lockoutSeconds: secondsLeft(fails.until),
    enable, disable, changePin, setAutoLock, unlock, registerBiometric, unlockBiometric, lockNow, forget,
  }), [supported, record, locked, biometricReady, fails, enable, disable, changePin, setAutoLock, unlock, registerBiometric, unlockBiometric, lockNow, forget]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppLock(): LockCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppLock must be used inside <LockProvider>');
  return v;
}

export { AUTO_OPTIONS, backoffMs, writeFails };
