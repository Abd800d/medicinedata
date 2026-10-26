/*
 * Upload-keystore generator (PKCS#12) — pure JavaScript, no Android SDK, no Java.
 *
 * Why this exists: Google Play refuses unsigned bundles, and a keystore made with a
 * desktop `keytool` is not something you can produce from a phone. This module builds an
 * RSA-2048 self-signed code-signing certificate and packs it into a PKCS#12 file that
 * Gradle/apksigner accept, so the owner can create the upload key while holding only a
 * phone (Admin → Play upload key) and paste the base64 into a GitHub secret.
 *
 * Security notes:
 *  - the private key is generated in-process and never written to the database or disk
 *    by the HTTP route; only the caller receives it, once;
 *  - the file is protected by the password the admin chooses (min 12 characters);
 *  - PKCS#12 here uses 3DES/SHA-1 bags (node-forge's portable default) — Android's
 *    signing tools read them fine; the *store* is legacy but the key is standard RSA.
 */
import forge from 'node-forge';

/** ~30 years: an upload key has to outlive many app releases. */
const VALIDITY_YEARS = 30;

/**
 * @param {{ password: string, alias?: string, commonName?: string, organization?: string,
 *           country?: string, validityYears?: number }} opts
 * @returns {{ base64: string, bytes: number, alias: string, sha256: string, sha1: string,
 *             subject: string, notAfter: string, password: string }}
 */
export function generateUploadKeystore(opts = {}) {
  const password = String(opts.password || '');
  if (password.length < 12) throw new Error('keystore-password-too-short');
  const alias = String(opts.alias || 'mda-upload').slice(0, 64);
  const years = Number(opts.validityYears) > 0 ? Number(opts.validityYears) : VALIDITY_YEARS;
  const attrs = [
    { name: 'commonName', value: String(opts.commonName || 'MDA Medicine Data') },
    { name: 'organizationName', value: String(opts.organization || 'MDA') },
    { name: 'organizationalUnitName', value: 'Android upload key' },
    { name: 'localityName', value: 'Sanaa' },
    { name: 'stateOrProvinceName', value: 'Sanaa' },
    { name: 'countryName', value: String(opts.country || 'YE').toUpperCase().slice(0, 2) },
  ];

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  /* Serial must be a positive integer; time + random keeps it unique per keystore. */
  cert.serialNumber = '0' + Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16);
  cert.validity.notBefore = new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter = new Date(Date.now() + years * 365 * 24 * 3600 * 1000);
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', codeSigning: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  /* 3DES/SHA-1 PBE is the widest-compatible PKCS#12 flavour (Gradle, apksigner, keytool). */
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
    friendlyName: alias,
  });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const buf = Buffer.from(der, 'binary');

  const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certBuf = Buffer.from(certDer, 'binary');

  return {
    base64: buf.toString('base64'),
    bytes: buf.length,
    alias,
    password,
    sha256: sha(certBuf, 'sha256'),
    sha1: sha(certBuf, 'sha1'),
    subject: `CN=${opts.commonName || 'MDA Medicine Data'}, O=${opts.organization || 'MDA'}, C=${String(opts.country || 'YE').toUpperCase().slice(0, 2)}`,
    notAfter: cert.validity.notAfter.toISOString().slice(0, 10),
  };
}

function sha(buf, algo) {
  return forge.md[algo].create().update(buf.toString('binary')).digest().toHex().toUpperCase().replace(/(..)(?=.)/g, '$1:');
}

/**
 * GitHub's secret names, in the order the Android workflow expects them
 * (see .github/workflows/android.yml and docs/SIGNING.md).
 */
export function secretCommands(res, filename = 'mda-upload.p12') {
  return [
    `gh secret set ANDROID_KEYSTORE_BASE64   < <(base64 -w0 ${filename})`,
    `gh secret set ANDROID_KEYSTORE_PASSWORD --body '${res.password}'`,
    `gh secret set ANDROID_KEY_ALIAS         --body '${res.alias}'`,
    `gh secret set ANDROID_KEY_PASSWORD      --body '${res.password}'`,
  ];
}
