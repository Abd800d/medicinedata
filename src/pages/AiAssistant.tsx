import { useEffect, useRef, useState } from 'react';
import { Bot, Copy, Database, RefreshCw, Send, ShieldCheck, Sparkles, UserRound, Wifi } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { useApi } from '../lib/useApi';
import { RichText } from '../components/catalog';
import { Badge, Spinner, useToast } from '../components/ui';
import { copyText, cx } from '../lib/utils';

type Msg = { role: 'user' | 'assistant'; text: string; sources?: any[]; mode?: string; warning?: string };

export default function AiAssistant() {
  const { t, lang } = useI18n();
  const { push } = useToast();
  const { data: status } = useApi<{ enabled: boolean }>('/api/ai/status');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('mda.aiChat') || '[]');
      if (Array.isArray(saved)) setMessages(saved);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { sessionStorage.setItem('mda.aiChat', JSON.stringify(messages.slice(-20))); endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const ask = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setBusy(true);
    try {
      const res = await api.post<any>('/api/ai/ask', { q, lang });
      const answer = lang === 'ar' ? res.answer_ar : (res.answer_en || res.answer_ar);
      setMessages((m) => [...m, { role: 'assistant', text: answer || '—', sources: res.sources, mode: res.mode, warning: res.warning }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', text: e.message === 'NETWORK' ? t('errors.network') : (e.message || t('common.error')), mode: 'error' }]);
    } finally { setBusy(false); }
  };

  const examples = [t('ai.example1'), t('ai.example2'), t('ai.example3'), t('ai.example4')];

  return (
    <div className="space-y-4">
      <div className="rounded-3xl page-hero page-hero-violet p-5 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Bot className="h-5 w-5" /></span><h1 className="text-[21px] font-extrabold">{t('ai.title')}</h1></div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[9.5px] font-semibold backdrop-blur">
            {status?.enabled ? <Wifi className="h-2.5 w-2.5" /> : <Database className="h-2.5 w-2.5" />}
            {status?.enabled ? t('ai.onlineMode') : t('ai.offlineMode')}
          </span>
        </div>
        <p className="mt-1.5 max-w-lg text-[11.5px] leading-6 text-white/80">{t('ai.subtitle')}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[9.5px] text-white/70">
          <span className="rounded-full bg-white/10 px-2 py-0.5">WHO</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">BNF</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">FDA</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">EMA</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">MDA database</span>
        </div>
      </div>

      <div className="card min-h-[320px] p-3.5">
        {!messages.length && (
          <div className="py-6 text-center">
            <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-tile"><Sparkles className="h-6 w-6" /></span>
            <div className="text-[13px] font-bold text-ink-100">{lang === 'ar' ? 'اسألني عن أي دواء' : 'Ask me about any medicine'}</div>
            <p className="mx-auto mt-1 max-w-sm text-[10.5px] leading-5 text-ink-500">{lang === 'ar' ? 'الجرعات، البدائل التجارية في اليمن، التفاعلات، الحمل، التحذيرات…' : 'Dosing, Yemeni brand alternatives, interactions, pregnancy, warnings…'}</p>
            <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
              {examples.map((ex) => (
                <button key={ex} onClick={() => ask(ex)} className="rounded-xl border border-white/[.08] bg-white/[.03] px-3 py-2 text-start text-[10.5px] font-medium text-ink-300 transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-white">{ex}</button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={cx('flex gap-2', m.role === 'user' ? 'flex-row-reverse' : '')}>
              <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-brand-grad text-white shadow-glow' : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-tile')}>
                {m.role === 'user' ? <UserRound className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </span>
              <div className={cx('max-w-[86%] rounded-2xl px-3.5 py-2.5', m.role === 'user' ? 'bg-brand-grad text-white shadow-float' : 'border border-white/[.08] bg-white/[.045] backdrop-blur')}>
                {m.role === 'user' ? (
                  <p className="text-[12.5px] leading-6">{m.text}</p>
                ) : (
                  <>
                    <RichText text={m.text} />
                    {m.mode && <div className="mt-1.5 flex items-center gap-1 text-[9px] text-ink-400"><Database className="h-2.5 w-2.5" />{m.mode === 'ai' ? t('ai.onlineMode') : t('ai.offlineMode')}</div>}
                    {m.sources?.length ? (
                      <div className="mt-2 border-t border-white/[.09] pt-1.5">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-ink-400">{t('ai.sources')}</div>
                        <div className="flex flex-wrap gap-1">
                          {m.sources.filter((s: any) => s?.name).slice(0, 5).map((s: any, idx: number) => (
                            <span key={idx} className="rounded-md border border-white/[.08] bg-white/[.05] px-1.5 py-0.5 text-[9px] font-semibold text-ink-300">{s.name}{s.atc ? ` · ${s.atc}` : ''}</span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <button onClick={async () => { await copyText(m.text); push(t('common.copied')); }} className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-ink-400 hover:text-brand-300"><Copy className="h-2.5 w-2.5" />{t('common.copy')}</button>
                  </>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-[11px] text-ink-400">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Bot className="h-3.5 w-3.5" /></span>
              <Spinner className="h-3.5 w-3.5" />{t('ai.thinking')}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <div className="sticky bottom-[74px] z-20">
        <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex items-end gap-2 rounded-2xl border border-white/[.10] bg-ink-900/90 p-1.5 shadow-float backdrop-blur focus-within:border-violet-400/50">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
            rows={1}
            placeholder={t('ai.placeholder')}
            className="max-h-28 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[12.5px] outline-none placeholder:text-ink-400"
          />
          <button type="submit" disabled={!input.trim() || busy} className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-tile transition active:scale-95 disabled:opacity-40"><Send className="h-4 w-4 rtl:-scale-x-100" /></button>
        </form>
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <span className="inline-flex items-center gap-1 text-[9px] text-ink-400"><ShieldCheck className="h-2.5 w-2.5" />{t('ai.disclaimer')}</span>
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); sessionStorage.removeItem('mda.aiChat'); }} className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-ink-400 hover:text-rose-500"><RefreshCw className="h-2.5 w-2.5" />{t('ai.newChat')}</button>
          )}
        </div>
      </div>
    </div>
  );
}
