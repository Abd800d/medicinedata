"""Normalize legacy light/dark className pairs in src/pages to the dark MDA identity.

Two stages per file:
 1. literal replacements that convert `x dark:y` pairs into a single dark value;
 2. token-level dedupe where the *category* includes the variant prefix, so
    `bg-white/15 hover:bg-white/25` and `border-t border-white/[.08]` survive.
"""
import re, glob

GLOBAL_MAP = [
    ('text-brand-700', 'text-brand-300'),
    ('text-emerald-700', 'text-emerald-300'),
    ('text-amber-700', 'text-amber-300'),
    ('text-sky-700', 'text-sky-300'),
]

DARK_MAP = [
    ('border-ink-200 bg-white', 'border-white/[.08] bg-white/[.04]'),
    ('bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-white', 'bg-brand-grad text-white shadow-glow'),
    ('hover:bg-ink-50 dark:hover:bg-ink-800', 'hover:bg-white/[.06]'),
    ('bg-ink-50 dark:bg-ink-800/60', 'bg-white/[.05]'),
    ('bg-ink-50 dark:bg-ink-800', 'bg-white/[.05]'),
    ('bg-ink-100 dark:bg-ink-800', 'bg-white/[.06]'),
    ('bg-white dark:bg-ink-900', 'bg-white/[.04]'),
    ('bg-white dark:bg-ink-800', 'bg-white/[.04]'),
    ('dark:hover:bg-ink-800', 'hover:bg-white/[.06]'),
    ('dark:bg-ink-900', 'bg-ink-900'),
    ('dark:bg-ink-800', 'bg-white/[.05]'),
    ('dark:border-ink-800', 'border-white/[.08]'),
    ('dark:border-ink-700', 'border-white/[.09]'),
    ('dark:text-white', 'text-white'),
    ('dark:text-ink-100', 'text-ink-100'),
    ('dark:text-ink-200', 'text-ink-200'),
    ('dark:text-ink-300', 'text-ink-300'),
    ('dark:bg-amber-950/30', 'bg-amber-500/10'),
    ('dark:border-amber-900/50', 'border-amber-400/25'),
    ('dark:text-amber-300', 'text-amber-200'),
    ('dark:bg-emerald-950/30', 'bg-emerald-500/10'),
    ('dark:border-emerald-900', 'border-emerald-400/25'),
    ('dark:bg-emerald-950/40', 'bg-emerald-500/15'),
    ('dark:text-emerald-300', 'text-emerald-200'),
    ('dark:bg-rose-950/30', 'bg-rose-500/10'),
    ('dark:border-rose-900', 'border-rose-400/25'),
    ('dark:bg-rose-950/40', 'bg-rose-500/15'),
    ('dark:text-rose-300', 'text-rose-200'),
    ('dark:bg-sky-950/30', 'bg-sky-500/10'),
    ('dark:bg-sky-950/20', 'bg-sky-500/10'),
    ('dark:border-sky-900', 'border-sky-400/25'),
    ('dark:text-sky-300', 'text-sky-200'),
    ('dark:bg-brand-950/20', 'bg-brand-500/10'),
    ('dark:border-brand-900', 'border-brand-400/25'),
    ('dark:text-brand-100', 'text-brand-100'),
    ('dark:text-brand-300', 'text-brand-300'),
    ('dark:bg-brand-900/40', 'bg-brand-500/15'),
    ('border-ink-200', 'border-white/[.08]'),
    ('bg-ink-50', 'bg-white/[.05]'),
    ('text-ink-900', 'text-white'),
    ('text-ink-800', 'text-ink-100'),
    ('text-ink-600', 'text-ink-300'),
]

BG_STYLE = re.compile(r'^bg-(gradient|clip|cover|contain|center|no-repeat|repeat|fixed|local|scroll|origin|blend|none|auto)')
SIZE = re.compile(r'^(\d+(\.\d+)?|px|\[[^\]]+\])$')
BORDER_STYLE = {'solid', 'dashed', 'dotted', 'double', 'none'}
TEXT_ALIGN = {'start', 'end', 'center', 'left', 'right', 'justify', 'balance', 'pretty'}
TEXT_SCALE = re.compile(r'^(xs|sm|base|lg|xl|\d?xl|\[[^\]]+\])$')


def category(base):
    """Return a conflict key for a single utility (no variants)."""
    parts = base.split('-')
    p = parts[0]
    rest = base[len(p) + 1:]

    if p == 'bg':
        if BG_STYLE.match(base):
            return None
        return 'bg-color'
    if p == 'text':
        if TEXT_SCALE.match(rest) or rest in TEXT_ALIGN:
            return None
        return 'text-color'
    if p == 'border':
        if rest in BORDER_STYLE:
            return 'border-style'
        if rest == '':
            return 'border-width-all'
        if SIZE.match(rest):
            return 'border-width-all'
        if re.match(r'^[tbsexy]$', rest):
            return 'border-width-' + rest
        if re.match(r'^[tbsexy]-\d+$', rest):
            return 'border-width-' + rest[0]
        return 'border-color'
    if p == 'divide':
        if rest in ('x', 'y', 'x-reverse', 'y-reverse'):
            return 'divide-style'
        if SIZE.match(rest):
            return 'divide-width'
        return 'divide-color'
    if p == 'ring':
        if rest.startswith('offset'):
            return 'ring-offset'
        if rest == 'inset':
            return None
        if SIZE.match(rest):
            return 'ring-width'
        return 'ring-color'
    if p in ('from', 'via', 'to'):
        return p + '-color'
    if p in ('placeholder', 'fill', 'stroke', 'accent', 'caret', 'decoration'):
        return p + '-color'
    if p == 'outline':
        return 'outline-color'
    if p == 'shadow':
        return 'shadow'
    return None


def clean(classes):
    out = []
    for raw in classes.split():
        tok = re.sub(r'^dark:', '', raw)
        if tok.startswith('hover:dark:'):
            tok = 'hover:' + tok[len('hover:dark:'):]
        if '${' in tok:
            out.append((tok, None))
            continue
        bits = tok.split(':')
        variant = ':'.join(bits[:-1])
        base = bits[-1]
        cat = category(base)
        key = (variant, cat) if cat else None
        if key:
            out = [(t, k) for (t, k) in out if k != key]
        out.append((tok, key))
    return ' '.join(t for t, _ in out)


PAT = re.compile(r'className="([^"{}$]*)"')


def run():
    changed = 0
    for f in glob.glob('src/pages/*.tsx') + glob.glob('src/pages/admin/*.tsx'):
        s = open(f).read()
        orig = s
        for a, b in GLOBAL_MAP + DARK_MAP:
            s = s.replace(a, b)
        s = PAT.sub(lambda m: 'className="%s"' % clean(m.group(1)), s)
        if s != orig:
            open(f, 'w').write(s)
            changed += 1
    print('files normalized:', changed)


if __name__ == '__main__':
    run()
