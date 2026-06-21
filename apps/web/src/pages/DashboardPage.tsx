import React, { useState, useRef, useEffect, type SyntheticEvent } from 'react';
import { Send, LogOut, Mic, MicOff, ImagePlus, X, Settings } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Orb from '../components/Orb';
import InvoiceChart from '../components/InvoiceChart';
import SuggestionChips from '../components/SuggestionChips';
import CsfCard from '../components/CsfCard';
import InvoiceListCard from '../components/InvoiceListCard';
import InvoicePreviewCard from '../components/InvoicePreviewCard';
import ChartWidget from '../components/ChartWidget';
import RecommendationsCard from '../components/RecommendationsCard';
import KpisGrid from '../components/KpisGrid';
import FiscalSummaryCard from '../components/FiscalSummaryCard';
import Markdown from '../components/Markdown';
import owlLogo from '../assets/owl-logo.png';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { useWaitingStatus } from '../hooks/useWaitingStatus';
import { getUser } from '../lib/auth';
import type { Page, SkillResult } from '../types';

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
  onLogout?: () => void;
}

const orbGlow: Record<string, string> = {
  idle:      'oklch(0.55 0.16 230)',
  ready:     'oklch(0.62 0.17 160)',
  speech:    'oklch(0.72 0.20 150)',
  processing:'oklch(0.50 0.18 295)',
  playing:   'oklch(0.68 0.20 198)',
};
const orbStateMap: Record<string, 'idle' | 'listening' | 'thinking' | 'speaking'> = {
  idle: 'idle', ready: 'idle', speech: 'listening', processing: 'thinking', playing: 'speaking',
};
const statusLabels: Record<string, string> = {
  idle: 'Listo', ready: 'Escuchando…', speech: 'Hablando…', processing: 'Procesando…', playing: 'Respondiendo',
};

// ── Dynamic card renderer ─────────────────────────────────────────────────────
function SkillCard({ result, onConfirmInvoice }: { result: SkillResult; onConfirmInvoice?: () => void }) {
  switch (result.skill) {
    case 'getEmitedInvoices':
      return <InvoiceListCard invoices={result.invoices} kind="emitidas" />;
    case 'getReceiptInvoices':
      return <InvoiceListCard invoices={result.invoices} kind="recibidas" />;
    case 'generateCSF':
      return <CsfCard csf={result.csf} />;
    case 'renderWidget':
      return <ChartWidget spec={result.widget} />;
    case 'displayRecommendations':
      return <RecommendationsCard title={result.title} recommendations={result.recommendations} />;
    case 'displayKpis':
      return <KpisGrid title={result.title} kpis={result.kpis} />;
    case 'displayFiscalSummary':
      return <FiscalSummaryCard summary={result.summary} />;
    case 'generateInvoice':
      if (result.status === 'previewed') {
        return <InvoicePreviewCard preview={result.preview} onConfirm={onConfirmInvoice} />;
      }
      return (
        <div className="rounded-xl border border-emerald/30 bg-emerald-lo p-5 text-center">
          <p className="text-sm font-semibold text-emerald">Factura emitida</p>
          <p className="text-xs text-muted mt-1 font-mono">{result.issued.uuid}</p>
        </div>
      );
    default:
      return null;
  }
}

// ── Layout states ─────────────────────────────────────────────────────────────
type LayoutState = 'empty' | 'active' | 'split';

export default function DashboardPage({ onNavigate, onLogout }: DashboardPageProps) {
  const reduce = useReducedMotion();
  const currentUser = getUser();
  // Track narrow viewports so the split view can stack vertically on mobile.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const update = () => setIsNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  // `baseLayout` drives the pre-content phase (empty ↔ active); once the agent
  // produces content the layout latches to 'split'. Deriving 'split' instead of
  // setting it in an effect avoids react-hooks/set-state-in-effect.
  const [baseLayout, setBaseLayout] = useState<Exclude<LayoutState, 'split'>>('empty');
  const [inputText, setInputText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  // Local validation error (e.g. dropping a non-image); the agent's own `error`
  // is read-only, so drop-zone messages need their own state.
  const [dropError, setDropError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const agent = useVoiceAgent();
  const { status, messages, streamText, thinkingText, toolActivity, skillResults, error, sessionActive, attachedImage, attachImage, detachImage, stopVoice } = agent;

  const glow = orbGlow[status] ?? orbGlow.idle;
  const orbState = orbStateMap[status] ?? 'idle';
  // Brand-aware waiting copy that fills the gaps; a concrete tool label wins when present.
  const waitingMessage = useWaitingStatus(status === 'processing');
  const liveStatus = toolActivity ?? waitingMessage;
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages or streamText change
  useEffect(() => {
    if (contentPanelRef.current) {
      setTimeout(() => {
        contentPanelRef.current?.scrollTo({ top: contentPanelRef.current.scrollHeight, behavior: 'smooth' });
      }, 0);
    }
  }, [messages, streamText]);

  // Once the agent produces its first result, the layout latches to 'split'.
  const layout: LayoutState = messages.length > 0 || skillResults.length > 0 ? 'split' : baseLayout;

  // Spacebar activates session when not focused on an input
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
        e.preventDefault();
        if (layout === 'empty') setBaseLayout('active');
        if (status === 'idle') agent.startSession();
        else if (status === 'ready' || status === 'playing') agent.endSession();
      }
      if (e.code === 'Escape' && sessionActive) {
        agent.endSession();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [layout, status, sessionActive, agent]);

  async function handleSend(e: SyntheticEvent) {
    e.preventDefault();
    if (!inputText.trim() && !attachedImage) return;
    if (layout === 'empty') setBaseLayout('active');
    const text = inputText;
    setInputText('');
    await agent.sendText(text);
  }

  async function handlePickSuggestion(text: string) {
    if (layout === 'empty') setBaseLayout('active');
    await agent.sendText(text);
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) attachImage(file);
    e.target.value = '';
  }

  function handleDragOver(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        setDropError(null);
        attachImage(file);
      } else {
        setDropError('Por favor arrastra una imagen válida (JPG, PNG, GIF, WebP)');
      }
    }
  }

  function handleMicClick() {
    if (layout === 'empty') setBaseLayout('active');
    if (status === 'idle') agent.startSession();
    else agent.endSession();
  }

  const orbSize = layout === 'split' ? (isNarrow ? 56 : 120) : (isNarrow ? 180 : 260);

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">

      {/* Atmospheric glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        animate={{ opacity: status === 'idle' ? 0.5 : 0.9 }}
        transition={{ duration: 1.2 }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{ width: 700, height: 700, top: '50%', left: '50%', transform: 'translate(-50%, -60%)', filter: 'blur(120px)' }}
          animate={{ background: `radial-gradient(circle, ${glow} 0%, transparent 65%)` }}
          transition={{ duration: 0.9 }}
          initial={false}
        />
      </motion.div>

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle, oklch(0.96 0.003 257) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />

      {/* Header */}
      <header className="relative shrink-0 border-b border-border bg-bg/70 backdrop-blur-md" style={{ zIndex: 10 }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-2 group"
            aria-label="Ir al inicio"
          >
            <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover group-hover:opacity-85 transition-opacity" style={{ objectPosition: 'center 18%' }} />
            <span className="font-semibold text-ink text-sm tracking-tight">SATI</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Status pill */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${status}-${toolActivity ?? ''}`}
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 4 }}
                transition={{ duration: 0.2 }}
                className={`h-7 px-3 rounded-full border text-xs font-medium flex items-center gap-2 min-w-0 max-w-[45vw] sm:max-w-none ${
                  status === 'speech' || status === 'ready'
                    ? 'border-emerald/40 text-emerald bg-emerald-lo'
                    : status === 'processing'
                    ? 'border-purple-700/50 text-purple-300 bg-purple-950/30'
                    : status === 'playing'
                    ? 'border-sky-700/50 text-sky-300 bg-sky-950/30'
                    : 'border-border text-muted bg-surface'
                }`}
                role="status"
                aria-live="polite"
              >
                {status !== 'idle' && (
                  <motion.span
                    className={`w-1.5 h-1.5 rounded-full ${
                      status === 'playing' ? 'bg-sky-400' : status === 'processing' ? 'bg-purple-400' : 'bg-emerald'
                    }`}
                    animate={!reduce ? { opacity: [1, 0.3, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity }}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate">{toolActivity ?? statusLabels[status]}</span>
              </motion.div>
            </AnimatePresence>

            {/* Authenticated user chip */}
            {currentUser && (
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className="h-7 px-2.5 flex items-center gap-2 rounded-lg border border-border bg-surface text-xs text-muted hover:text-ink hover:bg-surface-hi transition-colors"
                aria-label="Ir a configuración"
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold text-bg shrink-0 select-none"
                  style={{ background: 'oklch(0.72 0.17 162)' }}
                  aria-hidden="true"
                >
                  {(currentUser.displayName ?? currentUser.email ?? '?')[0]?.toUpperCase()}
                </span>
                <span className="hidden sm:block max-w-[120px] truncate">
                  {currentUser.displayName ?? currentUser.email}
                </span>
                <Settings size={11} className="opacity-50" />
              </button>
            )}

            <button
              type="button"
              onClick={() => onLogout ? onLogout() : onNavigate('landing')}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-hi transition-colors"
              aria-label="Cerrar sesión"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex-1 overflow-hidden" style={{ zIndex: 1 }}>

        {/* ── EMPTY STATE ───────────────────────────────────────────────── */}
        <AnimatePresence>
          {layout === 'empty' && (
            <motion.div
              key="empty"
              initial={false}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 overflow-y-auto flex flex-col items-center px-6 pt-10 pb-28 gap-6"
              aria-label="Estado inicial"
            >
              {/* Historical chart — data from DB, loads async */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="w-full max-w-2xl rounded-2xl border border-border bg-surface/60 backdrop-blur-sm px-5 pt-5 pb-4"
              >
                <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">Actividad fiscal — últimos 12 meses</p>
                <InvoiceChart />
              </motion.div>

              {/* Hint + suggestions */}
              <motion.div
                animate={!reduce ? { scale: [1, 1.03, 1], opacity: [0.7, 1, 0.7] } : {}}
                transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
                className="flex flex-col items-center gap-3 pointer-events-none"
              >
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Mic size={13} className="text-subtle" />
                  <span>Presiona Espacio para hablar · o escribe abajo</span>
                </div>
              </motion.div>

              <div className="pointer-events-auto">
                <SuggestionChips onPick={handlePickSuggestion} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── ACTIVE / SPLIT LAYOUT ─────────────────────────────────────── */}
        <AnimatePresence>
          {layout !== 'empty' && (
            <motion.div
              key="main-layout"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className={`h-full flex ${layout === 'split' ? 'flex-col sm:flex-row' : 'flex-col items-center justify-center'}`}
            >
              {/* Orb panel — compact horizontal bar on mobile, left column on desktop */}
              <motion.div
                layout={!reduce}
                className={`flex items-center justify-center shrink-0 ${
                  layout === 'split'
                    ? 'w-full sm:w-48 flex-row sm:flex-col border-b sm:border-b-0 sm:border-r border-border px-4 sm:px-0 py-3 sm:py-8 gap-3'
                    : 'flex-col gap-5'
                }`}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Orb */}
                <motion.div
                  layout={!reduce}
                  className="relative cursor-pointer"
                  onClick={handleMicClick}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && handleMicClick()}
                  aria-label={sessionActive ? 'Terminar conversación' : 'Iniciar conversación'}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{ inset: '-55%', filter: 'blur(64px)' }}
                    animate={{
                      background: `radial-gradient(circle, ${glow} 0%, transparent 65%)`,
                      opacity: status === 'idle' ? [0.12, 0.2, 0.12] : [0.28, 0.48, 0.28],
                      scale: status === 'speech' ? [1, 1.18, 1] : [1, 1.06, 1],
                    }}
                    transition={{ duration: status === 'speech' ? 0.9 : 3.0, repeat: Infinity }}
                  />
                  <motion.div
                    layout={!reduce}
                    animate={{ width: orbSize, height: orbSize }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Orb state={orbState} size={orbSize} />
                  </motion.div>
                </motion.div>

                {/* State label */}
                <AnimatePresence mode="wait">
                  <motion.p
                    key={status === 'processing' && liveStatus ? liveStatus : status}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className={`text-xs text-muted text-center ${layout === 'split' ? '' : 'text-sm'}`}
                  >
                    {!sessionActive
                      ? 'Toca para hablar'
                      : status === 'processing' && liveStatus
                        ? liveStatus
                        : statusLabels[status]}
                  </motion.p>
                </AnimatePresence>

                {/* End session hint */}
                {/* Stop-voice button: visible when recording, lets the user submit
                    manually in noisy environments where silence detection fails. */}
                <AnimatePresence>
                  {status === 'speech' && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.18 }}
                      onClick={e => { e.stopPropagation(); stopVoice(); }}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-emerald text-bg text-xs font-semibold shadow-lg shadow-emerald/20 hover:bg-emerald/90 active:scale-95 transition-transform"
                      aria-label="Enviar mensaje de voz"
                    >
                      <Send size={11} />
                      Enviar
                    </motion.button>
                  )}
                  {sessionActive && status !== 'speech' && (
                    <motion.div
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="hidden sm:flex items-center gap-1 text-[10px] text-subtle/50"
                    >
                      <MicOff size={9} />
                      toca para terminar
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              {/* Content panel (visible in split mode) */}
              <AnimatePresence>
                {layout === 'split' && (
                  <motion.div
                    key="content-panel"
                    ref={contentPanelRef}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                    className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6 pb-28 flex flex-col gap-5"
                  >
                    {/* Full conversation history */}
                    {messages.map((msg, i) => (
                      <motion.div
                        key={`msg-${i}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-5 py-4 ${
                            msg.role === 'user'
                              ? 'bg-emerald/15 border border-emerald/20 rounded-tr-sm'
                              : 'bg-surface/80 backdrop-blur-sm border border-border rounded-tl-sm'
                          }`}
                        >
                          {msg.image && (
                            <>
                              <img
                                src={msg.image.previewUrl}
                                alt="Imagen enviada"
                                className="rounded-lg max-h-48 object-contain mb-2"
                              />
                              <hr className="border-t border-border/30 mb-2" />
                            </>
                          )}
                          <div className={msg.role === 'assistant' ? 'text-sm leading-relaxed text-ink' : 'text-sm text-ink/80'}>
                            {msg.role === 'assistant' ? <Markdown>{msg.content}</Markdown> : msg.content}
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {/* Thinking block (while Claude is thinking) */}
                    <AnimatePresence>
                      {thinkingText && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="bg-purple-950/20 border border-purple-700/20 rounded-2xl px-5 py-4 rounded-tl-sm"
                        >
                          <p className="text-[10px] font-medium text-purple-300/50 uppercase tracking-wider mb-2">Pensando…</p>
                          <p className="font-mono text-xs text-purple-200/40 leading-relaxed whitespace-pre-wrap break-words">
                            {thinkingText}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Streaming text (while responding) */}
                    <AnimatePresence>
                      {streamText && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl px-5 py-4 rounded-tl-sm"
                          aria-live="polite"
                        >
                          <Markdown streaming>{streamText}</Markdown>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Dynamic skill result cards — stacked, unlimited.
                        Adjacent renderWidget pairs auto-display in a 2-col grid on desktop. */}
                    <AnimatePresence>
                      {(() => {
                        const rows: React.ReactNode[] = [];
                        let i = 0;
                        while (i < skillResults.length) {
                          const r = skillResults[i]!;
                          const next = skillResults[i + 1];
                          if (r.skill === 'renderWidget' && next?.skill === 'renderWidget') {
                            // Pair: side-by-side grid
                            rows.push(
                              <motion.div
                                key={`widget-pair-${i}`}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <SkillCard result={r} />
                                <SkillCard result={next} />
                              </motion.div>
                            );
                            i += 2;
                          } else {
                            rows.push(
                              <motion.div
                                key={`${r.skill}-${i}`}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                              >
                                <SkillCard result={r} />
                              </motion.div>
                            );
                            i += 1;
                          }
                        }
                        return rows;
                      })()}
                    </AnimatePresence>

                    {/* Live status tail: "working…" sits at the very bottom, below any
                        rendered widget/card. Concrete tool label wins; else brand copy. */}
                    <AnimatePresence mode="wait">
                      {liveStatus && (status === 'processing' || toolActivity) && !streamText && (
                        <motion.div
                          key={liveStatus}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.25 }}
                          className={`flex items-center gap-2 text-xs ${toolActivity ? 'text-purple-300' : 'text-muted'}`}
                          aria-live="polite"
                        >
                          <motion.span
                            className={`w-1.5 h-1.5 rounded-full ${toolActivity ? 'bg-purple-400' : 'bg-emerald'}`}
                            animate={{ opacity: [1, 0.3, 1] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                          />
                          {liveStatus}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Error */}
                    <AnimatePresence>
                      {(error || dropError) && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-3"
                          role="alert"
                        >
                          {error || dropError}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Orb-only transcript (active state, no split yet) */}
              {layout === 'active' && (messages.length > 0 || streamText) && (
                <div className="mt-4 w-full max-w-xs flex flex-col gap-1.5 pointer-events-none px-4">
                  {messages.slice(-3).map((msg, i) => (
                    <motion.div
                      key={`${i}-${msg.role}`}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`text-xs rounded-xl px-3 py-2 leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-emerald/10 text-ink/80 self-end border border-emerald/15 max-w-[88%]'
                          : 'bg-surface text-muted border border-border self-start max-w-[92%]'
                      }`}
                    >
                      {msg.image && (
                        <img
                          src={msg.image.previewUrl}
                          alt="Imagen enviada"
                          className="rounded-md max-h-16 object-contain mb-1"
                        />
                      )}
                      {msg.role === 'assistant' ? <Markdown>{msg.content}</Markdown> : msg.content}
                    </motion.div>
                  ))}
                  {streamText && (
                    <div className="text-xs rounded-xl px-3 py-2 leading-relaxed bg-surface text-muted border border-border self-start max-w-[92%]">
                      {streamText}
                      <span className="inline-block w-0.5 h-3 bg-emerald/60 ml-0.5 align-text-bottom animate-pulse" />
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating command bar */}
      <div className="relative shrink-0 pb-6 px-6" style={{ zIndex: 10 }} role="region" aria-label="Barra de comandos">
        <div
          className="absolute bottom-full left-0 right-0 h-20 pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--color-bg), transparent)' }}
          aria-hidden="true"
        />

        <form
          ref={formRef}
          onSubmit={handleSend}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`max-w-2xl mx-auto flex flex-col gap-2 bg-surface/90 backdrop-blur-md border rounded-2xl px-4 py-3 transition-all duration-200 ${
            isDragging
              ? 'border-emerald/60 bg-emerald/5 shadow-lg shadow-emerald/10'
              : 'border-border focus-within:border-emerald/40'
          }`}
        >
          {/* Drag & drop hint */}
          <AnimatePresence>
            {isDragging && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="text-center py-2 text-xs text-emerald/60 font-medium"
              >
                📸 Suelta la imagen aquí
              </motion.div>
            )}
          </AnimatePresence>

          {/* Image preview */}
          <AnimatePresence>
            {attachedImage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="relative inline-block">
                  <img
                    src={attachedImage.previewUrl}
                    alt="Imagen adjunta"
                    className="h-20 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={detachImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                    aria-label="Quitar imagen"
                  >
                    <X size={10} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <motion.button
              type="button"
              onClick={handleMicClick}
              aria-label={sessionActive ? 'Detener micrófono' : 'Activar micrófono'}
              aria-pressed={sessionActive}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                sessionActive ? 'bg-emerald text-bg' : 'bg-surface-hi text-muted hover:text-ink hover:bg-border'
              }`}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.12 }}
            >
              {sessionActive ? <MicOff size={18} /> : <Mic size={18} />}
            </motion.button>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageSelect}
              aria-label="Adjuntar imagen"
            />
            <motion.button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={status === 'processing'}
              aria-label="Adjuntar imagen"
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-surface-hi text-muted hover:text-ink hover:bg-border transition-colors disabled:opacity-50"
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.12 }}
            >
              <ImagePlus size={18} />
            </motion.button>

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={attachedImage ? "Describe la imagen…" : "Escribe tu consulta fiscal…"}
              disabled={status === 'processing'}
              className="flex-1 bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none disabled:opacity-50"
              aria-label="Consulta al asistente"
            />

            <motion.button
              type="submit"
              disabled={(!inputText.trim() && !attachedImage) || status === 'processing'}
              aria-label="Enviar consulta"
              className="shrink-0 w-9 h-9 rounded-full bg-emerald flex items-center justify-center text-bg hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.88 }}
              transition={{ duration: 0.12 }}
            >
              <Send size={14} />
            </motion.button>
          </div>
        </form>

        <p className="text-center text-[10px] text-subtle mt-2 select-none">
          Espacio para hablar · Esc para terminar
        </p>
      </div>
    </div>
  );
}
