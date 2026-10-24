/* Procedural, brand-safe packaging artwork (SVG) used when a product has no photo yet. */

const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function palette(form = '', color = '#0f766e') {
  const f = form.toLowerCase();
  if (f.includes('syrup') || f.includes('susp') || f.includes('soln') || f.includes('drops') || f.includes('solution')) return ['#0e7490', '#22d3ee'];
  if (f.includes('inj') || f.includes('amp') || f.includes('vial') || f.includes('infus')) return ['#4338ca', '#818cf8'];
  if (f.includes('cream') || f.includes('oint') || f.includes('gel') || f.includes('topical')) return ['#b45309', '#fbbf24'];
  if (f.includes('suppos') || f.includes('rectal')) return ['#be123c', '#fb7185'];
  if (f.includes('inhal') || f.includes('spray') || f.includes('neb')) return ['#0369a1', '#38bdf8'];
  if (f.includes('caps')) return [color || '#0f766e', '#34d399'];
  return [color || '#0f766e', '#5eead4'];
}

function iconFor(form = '', fill = '#fff') {
  const f = form.toLowerCase();
  if (f.includes('inj') || f.includes('amp') || f.includes('vial'))
    return `<g transform="translate(232 250)" opacity=".95"><rect x="0" y="0" width="34" height="62" rx="8" fill="${fill}" opacity=".22"/><rect x="10" y="8" width="14" height="34" rx="6" fill="${fill}"/><rect x="15" y="44" width="4" height="14" fill="${fill}"/><rect x="10" y="58" width="14" height="3" rx="1.5" fill="${fill}"/></g>`;
  if (f.includes('syrup') || f.includes('susp') || f.includes('soln') || f.includes('drops'))
    return `<g transform="translate(228 248)" opacity=".95"><rect x="6" y="14" width="40" height="58" rx="10" fill="${fill}" opacity=".22"/><rect x="14" y="20" width="24" height="46" rx="7" fill="${fill}" opacity=".85"/><rect x="18" y="0" width="16" height="16" rx="4" fill="${fill}"/></g>`;
  if (f.includes('cream') || f.includes('oint') || f.includes('gel'))
    return `<g transform="translate(226 250)" opacity=".95"><rect x="0" y="18" width="54" height="54" rx="10" fill="${fill}" opacity=".22"/><rect x="8" y="26" width="38" height="38" rx="7" fill="${fill}" opacity=".8"/><rect x="18" y="8" width="22" height="14" rx="4" fill="${fill}"/></g>`;
  if (f.includes('caps'))
    return `<g transform="translate(222 256)" opacity=".95"><rect x="0" y="14" width="66" height="30" rx="15" fill="${fill}" opacity=".85"/><path d="M33 14h18a15 15 0 0 1 0 30H33z" fill="${fill}" opacity=".45"/></g>`;
  return `<g transform="translate(224 256)" opacity=".95"><circle cx="30" cy="20" r="24" fill="${fill}" opacity=".85"/><path d="M12 8 L48 32" stroke="rgba(0,0,0,.25)" stroke-width="4"/><circle cx="30" cy="20" r="24" fill="none" stroke="${fill}" stroke-width="2"/></g>`;
}

export function packSvg(p) {
  const [c1, c2] = palette(p.dosage_form, p.color);
  const trade = esc(p.trade_name || 'Medicine');
  const ar = esc(p.trade_name_ar || p.generic_ar || '');
  const generic = esc(p.generic_name || '');
  const strength = esc(p.strength || '');
  const form = esc(p.dosage_form || '');
  const pack = esc(p.pack_size || '');
  const mfr = esc(p.manufacturer_name || p.country || '');
  const agent = esc(p.agent_name || '');
  const banner = trade.length > 16 ? 40 : trade.length > 11 ? 48 : 58;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".35"/><stop offset=".55" stop-color="#ffffff" stop-opacity=".06"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="16" flood-color="#0f172a" flood-opacity=".3"/>
    </filter>
  </defs>
  <rect width="600" height="600" fill="#eef2f6"/>
  <circle cx="530" cy="60" r="120" fill="${c1}" opacity=".07"/>
  <circle cx="70" cy="560" r="150" fill="${c2}" opacity=".1"/>
  <g filter="url(#sh)">
    <rect x="96" y="86" width="408" height="428" rx="26" fill="#ffffff"/>
    <path d="M96 112 a26 26 0 0 1 26 -26 h356 a26 26 0 0 1 26 26 v128 h-408 z" fill="url(#bg)"/>
    <rect x="96" y="86" width="408" height="240" rx="26" fill="url(#gloss)"/>
    <text x="310" y="150" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="${banner}" font-weight="800" fill="#fff" letter-spacing="-.5">${trade}</text>
    <text x="310" y="192" text-anchor="middle" font-family="'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff" opacity=".95" direction="rtl">${ar}</text>
    <text x="310" y="232" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="600" fill="#ffffff" opacity=".9">${strength}${strength && form ? ' · ' : ''}${form}</text>
    <text x="126" y="286" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#64748b" letter-spacing="1.6">GENERIC</text>
    <text x="126" y="314" font-family="Inter, Arial, sans-serif" font-size="23" font-weight="700" fill="#0f172a">${generic.slice(0, 30)}</text>
    ${pack ? `<text x="126" y="344" font-family="Inter, Arial, sans-serif" font-size="16" fill="#475569">${pack}</text>` : ''}
    <line x1="126" y1="366" x2="474" y2="366" stroke="#e2e8f0" stroke-width="2"/>
    <text x="126" y="396" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#64748b" letter-spacing="1.6">MANUFACTURER</text>
    <text x="126" y="424" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="600" fill="#0f172a">${mfr.slice(0, 34)}</text>
    ${agent ? `<text x="126" y="452" font-family="Inter, Arial, sans-serif" font-size="15" fill="#475569">Agent: ${agent.slice(0, 32)}</text>` : ''}
    <g transform="translate(126 466)">
      ${Array.from({ length: 38 }, (_, i) => `<rect x="${i * 5}" y="0" width="${i % 3 === 0 ? 2.6 : 1.6}" height="22" fill="#0f172a" opacity=".8"/>`).join('')}
    </g>
    <g transform="translate(404 300)">
      <rect x="0" y="0" width="82" height="82" rx="18" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2"/>
      ${iconFor(p.dosage_form, c1)}
    </g>
    ${p.verified ? `<g transform="translate(126 500)"><rect width="132" height="26" rx="13" fill="#ecfdf5" stroke="#99f6e4"/><text x="66" y="18" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700" fill="#0f766e">✓ MDA VERIFIED</text></g>` : ''}
  </g>
  <text x="300" y="562" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" font-weight="700" fill="#94a3b8" letter-spacing="4">MEDICINEDATA · MDA</text>
</svg>`;
}

export function capsuleSvg(d) {
  const color = d.color || '#0f766e';
  const name = esc(d.generic_name || '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="#14b8a6"/></linearGradient></defs>
  <rect width="600" height="600" fill="#f0fdfa"/>
  <circle cx="300" cy="250" r="150" fill="${color}" opacity=".12"/>
  <g transform="translate(300 250) rotate(-32)">
    <rect x="-130" y="-52" width="260" height="104" rx="52" fill="url(#b)"/>
    <path d="M0 -52 h78 a52 52 0 0 1 0 104 H0z" fill="#ffffff" opacity=".55"/>
    <rect x="-130" y="-52" width="260" height="104" rx="52" fill="none" stroke="#ffffff" stroke-opacity=".5" stroke-width="3"/>
  </g>
  <text x="300" y="470" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="800" fill="#0f172a">${name.slice(0, 24)}</text>
  <text x="300" y="508" text-anchor="middle" font-family="'IBM Plex Sans Arabic', Tahoma, Arial, sans-serif" font-size="24" fill="#64748b" direction="rtl">${esc(d.generic_ar || '')}</text>
  <text x="300" y="556" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="700" fill="#94a3b8" letter-spacing="4">MEDICINEDATA · MDA</text>
</svg>`;
}
