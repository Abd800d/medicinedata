/* Compact seed format → rich records.
 * Drug tuple: [generic_en, generic_ar, system_slug, category_slug, meta, products]
 * Product tuple: [trade_name, trade_name_ar, strength, dosage_form, manufacturer, country, agent?]
 */
export function drugToRecord(row) {
  const [generic_name, generic_ar, system, category, m = {}, products = []] = row;
  return {
    generic_name,
    generic_ar,
    system,
    category,
    synonyms: m.syn || null,
    drug_class: m.cls || null,
    atc_code: m.atc || null,
    prescription_required: m.rx ? 1 : 0,
    pregnancy: m.preg || null,
    indications_en: m.ind_en || null,
    indications_ar: m.ind_ar || null,
    dosage_adult: m.adult || null,
    dosage_child: m.child || null,
    contraindications: m.contra || null,
    side_effects: m.side || null,
    warnings: m.warn || null,
    interactions: m.inter || null,
    mechanism_en: m.mech_en || null,
    mechanism_ar: m.mech_ar || null,
    half_life: m.half || null,
    storage: m.storage || 'يُحفظ في مكان جاف بعيدًا عن الضوء، في درجة حرارة أقل من 30°م.',
    notes: m.notes || null,
    source: m.source || 'MDA editorial reference (WHO/BNF-aligned)',
    verified: m.verified === undefined ? 1 : m.verified ? 1 : 0,
    products: products.map((p) => ({
      trade_name: p[0],
      trade_name_ar: p[1] || null,
      strength: p[2] || null,
      dosage_form: p[3] || null,
      manufacturer: p[4] || null,
      country: p[5] || null,
      agent: p[6] || null,
    })),
  };
}
