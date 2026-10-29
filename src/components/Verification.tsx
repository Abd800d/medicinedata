/*
 * Verification badges and the review panel — one place that prints the six states.
 *
 * The rule this file enforces visually: a state is never shown as a bare word. The badge
 * carries the meaning ("submitted by a user, no quality claim"), and the panel always answers
 * the three questions the plan asks for — who decided, when, and which document backs it.
 */
import { Link } from 'react-router-dom';
import { BadgeCheck, Building2, CalendarClock, ExternalLink, FileText, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';

export type VerState =
  | 'verified' | 'manufacturer_confirmed' | 'supplier_submitted'
  | 'user_submitted' | 'incomplete' | 'unverified';

export type VerDetail = {
  title?: string | null;
  state: VerState;
  review: 'none' | 'pending' | 'approved' | 'rejected';
  reviewed_at?: string | null;
  review_note?: string | null;
  reviewer?: { id: number; name: string; role: string } | null;
  missing_fields?: string[];
  missing_labels_ar?: string[];
  sources?: { id: number; kind: string; title: string; issuer?: string | null; url?: string | null; file_path?: string | null; created_at?: string }[];
  offline?: boolean;
  events?: { id: number; from_state?: string | null; to_state: string; from_review?: string | null; to_review?: string | null; actor_name?: string | null; note?: string | null; created_at: string }[];
};

const META: Record<VerState, { ar: string; en: string; cls: string; icon: any; hint_ar: string; hint_en: string }> = {
  verified: {
    ar: 'موثّق', en: 'Verified', cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/25', icon: ShieldCheck,
    hint_ar: 'راجعه صيدلي واعتمده', hint_en: 'reviewed and approved by a pharmacist',
  },
  manufacturer_confirmed: {
    ar: 'مؤكد من الشركة المصنعة', en: 'Manufacturer confirmed', cls: 'text-sky-300 bg-sky-500/15 border-sky-400/25', icon: Building2,
    hint_ar: 'بمستند رسمي من الشركة المصنعة', hint_en: 'backed by an official manufacturer document',
  },
  supplier_submitted: {
    ar: 'مُقدَّم من مورّد', en: 'Supplier submitted', cls: 'text-violet-300 bg-violet-500/15 border-violet-400/25', icon: BadgeCheck,
    hint_ar: 'من مورّد، لا يعني مراجعة صيدلي', hint_en: 'supplied by a supplier, not pharmacist-reviewed',
  },
  user_submitted: {
    ar: 'مُقدَّم من مستخدم', en: 'User submitted', cls: 'text-ink-200 bg-white/[.07] border-white/[.10]', icon: UserRound,
    hint_ar: 'من مستخدم، لا يعني الجودة', hint_en: 'submitted by a user, no quality claim',
  },
  incomplete: {
    ar: 'بيانات ناقصة', en: 'Incomplete', cls: 'text-amber-300 bg-amber-500/15 border-amber-400/25', icon: ShieldAlert,
    hint_ar: 'حقول أساسية فارغة', hint_en: 'required fields are empty',
  },
  unverified: {
    ar: 'غير موثّق', en: 'Unverified', cls: 'text-ink-300 bg-white/[.05] border-white/[.08]', icon: ShieldAlert,
    hint_ar: 'لا أحد تبنّاه بعد', hint_en: 'no one has vouched for it yet',
  },
};

const REVIEW_LABEL = {
  none: { ar: 'بلا مراجعة', en: 'Not reviewed', cls: 'text-ink-400' },
  pending: { ar: 'بانتظار المراجعة', en: 'Pending review', cls: 'text-amber-300' },
  approved: { ar: 'اعتُمد', en: 'Approved', cls: 'text-emerald-300' },
  rejected: { ar: 'مرفوض', en: 'Rejected', cls: 'text-rose-300' },
};

export function VerificationBadge({
  state, review, lang, className = '', withHint = false,
}: { state?: string | null; review?: string | null; lang: 'ar' | 'en'; className?: string; withHint?: boolean }) {
  const key = (state && META[state as VerState] ? state : 'unverified') as VerState;
  const m = META[key];
  const Icon = m.icon;
  const r = REVIEW_LABEL[(review as keyof typeof REVIEW_LABEL) || 'none'] || REVIEW_LABEL.none;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-bold backdrop-blur ${m.cls} ${className}`}
      title={lang === 'ar' ? m.hint_ar : m.hint_en}>
      <Icon className="h-3 w-3" />
      {lang === 'ar' ? m.ar : m.en}
      {review === 'pending' && <span className={`ms-0.5 ${r.cls}`}>· {lang === 'ar' ? 'بانتظار المراجعة' : 'pending'}</span>}
      {review === 'rejected' && <span className="ms-0.5 text-rose-300">· {lang === 'ar' ? 'مرفوض' : 'rejected'}</span>}
      {withHint && <span className="ms-1 font-medium opacity-70">{lang === 'ar' ? m.hint_ar : m.hint_en}</span>}
    </span>
  );
}

/** The full answer: state + who + when + documents + missing fields + last changes. */
export function VerificationPanel({ detail, lang, compact = false }: { detail?: VerDetail | null; lang: 'ar' | 'en'; compact?: boolean }) {
  if (!detail) return null;
  const ar = lang === 'ar';
  const state = META[(detail.state as VerState) || 'unverified'] || META.unverified;
  const review = REVIEW_LABEL[detail.review || 'none'] || REVIEW_LABEL.none;
  const sources = detail.sources || [];
  const events = detail.events || [];

  return (
    <div className="card space-y-2.5 p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <VerificationBadge state={detail.state} review={detail.review} lang={lang} />
        <span className={`text-[9.5px] font-bold ${review.cls}`}>{ar ? review.ar : review.en}</span>
      </div>

      {/* who + when — the question the plan says must always be answerable */}
      <div className="grid gap-1 text-[10px] text-ink-400">
        {detail.offline && (
          <div className="rounded-lg bg-white/[.04] px-2 py-1 text-[9.5px] leading-4 text-ink-400">
            {ar
              ? 'تعرض الحزمة المدمجة الحالة فقط؛ سجل المراجعة (اسم المراجع والمستندات) يحتاج اتصالًا بالخادم.'
              : 'The bundled catalogue carries the state only; the review trail (reviewer and documents) needs a connection.'}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <UserRound className="h-3 w-3 shrink-0 text-ink-500" />
          {detail.reviewer
            ? <span>{ar ? 'راجعه:' : 'Reviewed by:'} <b className="text-ink-200">{detail.reviewer.name}</b> ({detail.reviewer.role})</span>
            : <span className="text-ink-500">{ar ? 'لا يوجد مراجع مسجَّل لهذا السجل بعد.' : 'No reviewer recorded for this record yet.'}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <CalendarClock className="h-3 w-3 shrink-0 text-ink-500" />
          {detail.reviewed_at
            ? <span>{ar ? 'تاريخ القرار:' : 'Decision date:'} <span dir="ltr">{detail.reviewed_at}</span></span>
            : <span className="text-ink-500">{ar ? 'لا تاريخ قرار.' : 'No decision date.'}</span>}
        </div>
      </div>

      {/* what is still missing, by name */}
      {!!detail.missing_fields?.length && (
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-2 text-[10px] leading-5 text-amber-200">
          {ar ? 'حقول ناقصة:' : 'Missing fields:'}{' '}
          <b>{(ar ? detail.missing_labels_ar : detail.missing_fields)?.join(' · ')}</b>
        </div>
      )}

      {detail.review_note && (
        <div className="rounded-xl bg-white/[.04] p-2 text-[10px] leading-5 text-ink-300">
          <b>{ar ? 'ملاحظة المراجعة:' : 'Review note:'}</b> {detail.review_note}
        </div>
      )}

      {/* documents backing the claim */}
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-ink-300">
          <FileText className="h-3 w-3 text-brand-300" />
          {ar ? `المستندات (${sources.length})` : `Documents (${sources.length})`}
        </div>
        {sources.length === 0
          ? <p className="text-[9.5px] text-ink-500">{detail.offline
              ? (ar ? 'قائمة المستندات غير متاحة دون اتصال.' : 'The document list is not available offline.')
              : (ar ? 'لا مستندات مرفقة. أي ادعاء «مؤكد من الشركة» بلا مستند مرفوض من الخادم.' : 'No documents attached. A "manufacturer confirmed" claim without one is refused by the server.')}</p>
          : (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s.id} className="flex items-start gap-1.5 rounded-lg bg-white/[.04] px-2 py-1">
                  <FileText className="mt-0.5 h-3 w-3 shrink-0 text-ink-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[10px] font-semibold text-ink-200">{s.title}</div>
                    <div className="truncate text-[9px] text-ink-500">{s.issuer || '—'}{s.created_at ? ` · ${s.created_at.slice(0, 10)}` : ''}</div>
                  </div>
                  {(s.url || s.file_path) && (
                    <a href={s.url || s.file_path || '#'} target="_blank" rel="noreferrer"
                      className="shrink-0 text-brand-300" aria-label={ar ? 'فتح المستند' : 'Open document'}>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>

      {!compact && events.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-bold text-ink-300">{ar ? 'آخر التغييرات' : 'Recent changes'}</div>
          <ul className="space-y-0.5 text-[9.5px] text-ink-400">
            {events.slice(0, 6).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-1">
                <span dir="ltr" className="text-ink-500">{e.created_at?.slice(0, 16)}</span>
                <span>{e.from_state || '—'} → <b className="text-ink-200">{e.to_state}</b></span>
                {e.actor_name && <span>· {e.actor_name}</span>}
                {e.note && <span className="truncate text-ink-500">· {e.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[9px] leading-4 text-ink-600">
        {ar
          ? 'الحالة تصف مصدر السجل ومدى مراجعته — وليست حكمًا على جودة الدواء أو فعاليته.'
          : 'The state describes where the record came from and how it was reviewed — not the quality or efficacy of the medicine.'}
      </p>
    </div>
  );
}

/** Small link used by screens that only need "open the record" */
export function verificationLink(entity: 'products' | 'drugs', id: number, lang: 'ar' | 'en') {
  return (
    <Link to={`/admin?tab=verification&entity=${entity}&id=${id}`} className="text-[10px] font-bold text-brand-300">
      {lang === 'ar' ? 'راجع السجل' : 'Review record'}
    </Link>
  );
}
