import { useState, useRef, useEffect, useCallback, type SyntheticEvent } from 'react';
import { Mic, Send, LogOut, MicOff } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Orb from '../components/Orb';
import owlLogo from '../assets/owl-logo.png';
import DashboardCanvas from '../components/DashboardCanvas';
import { runSkill, detectSkill, replyFor } from '../data/skills';
import { resultToPanels, type Panel } from '../lib/dashboard';
import { useVoiceAgent } from '../lib/useVoiceAgent';
import type { OrbState, Page } from '../types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface DashboardPageProps {
  onNavigate: (page: Page) => void;
  onLogout?: () => void;
}

const orbGlowColor: Record<OrbState, string> = {
  idle:      'oklch(0.55 0.16 230)',
  listening: 'oklch(0.72 0.17 162)',
  thinking:  'oklch(0.50 0.18 295)',
  speaking:  'oklch(0.68 0.20 198)',
};

const stateLabels: Record<OrbState, string> = {
  idle:      'Listo',
  listening: 'Escuchando…',
  thinking:  'Procesando…',
  speaking:  'Respondiendo',
};

const statePill: Record<OrbState, string> = {
  idle:      'border-border text-muted bg-surface',
  listening: 'border-emerald/40 text-emerald bg-emerald-lo',
  thinking:  'border-purple-700/50 text-purple-300 bg-purple-950/30',
  speaking:  'border-sky-700/50 text-sky-300 bg-sky-950/30',
};

const stateDot: Record<OrbState, string> = {
  idle:      'bg-muted',
  listening: 'bg-emerald',
  thinking:  'bg-purple-400',
  speaking:  'bg-sky-400',
};

export default function DashboardPage({ onNavigate, onLogout }: DashboardPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [inputText, setInputText] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [panels, setPanels] = useState<Panel[]>([]);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Once a panel exists we switch from the welcome layout (big centered orb) to
  // the working layout (small orb in the header + the canvas as the protagonist).
  const working = panels.length > 0;

  const typeText = useCallback((text: string) => {
    setDisplayText('');
    let i = 0;
    function tick() {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
        typewriterRef.current = setTimeout(tick, 24);
      }
    }
    tick();
  }, []);

  // Voice front-door: same canvas as text. The agent transcribes, runs a skill
  // (→ panel) and narrates (→ reply line + spoken audio). See useVoiceAgent.
  const voice = useVoiceAgent({
    onStatus: setOrbState,
    onTranscript: () => { if (typewriterRef.current) clearTimeout(typewriterRef.current); setDisplayText(''); },
    onReply: (text) => typeText(text),
    onSkill: (result) => setPanels((prev) => [...prev, ...resultToPanels(result)]),
    onError: (msg) => { setOrbState('idle'); typeText(msg); },
  });

  const runQuery = useCallback((query: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setDisplayText('');
    if (typewriterRef.current) clearTimeout(typewriterRef.current);

    const skill = detectSkill(query);

    const speak = (reply: string) => {
      setOrbState('speaking');
      typeText(reply);
      setTimeout(() => {
        setOrbState('idle');
        setIsProcessing(false);
      }, reply.length * 24 + 1200);
    };

    setOrbState('listening');
    setTimeout(() => {
      setOrbState('thinking');
      // Ask the agent for the data (fixtures today, live SAT later). New panels
      // ACCUMULATE — we never replace what's already on the canvas.
      Promise.all([runSkill(skill), delay(1300)])
        .then(([res]) => {
          setPanels((prev) => [...prev, ...resultToPanels(res)]);
          speak(replyFor(res));
        })
        .catch(() => speak('No pude obtener la información. Intenta de nuevo.'));
    }, 800);
  }, [isProcessing, typeText]);

  function handleSend(e: SyntheticEvent) {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    const query = inputText;
    setInputText('');
    runQuery(query);
  }

  function handleMic() {
    if (isProcessing) return;
    setInputText('');
    voice.toggle();
  }

  function removePanel(id: string) {
    setPanels((prev) => prev.filter((p) => p.id !== id));
  }

  useEffect(() => () => { if (typewriterRef.current) clearTimeout(typewriterRef.current); }, []);

  const glowColor = orbGlowColor[orbState];

  /** Input form, shared by both layouts (compact in the header, full at bottom). */
  const commandBar = (compact: boolean) => (
    <form
      onSubmit={handleSend}
      className={`flex items-center gap-2 bg-surface/90 backdrop-blur-md border border-border rounded-full transition-[border-color,box-shadow] duration-200 ${
        compact ? 'px-2.5 py-1.5 w-full' : 'px-4 py-2.5 max-w-2xl w-full mx-auto'
      }`}
    >
      <motion.button
        type="button"
        onClick={handleMic}
        disabled={isProcessing || voice.busy}
        aria-label={voice.recording ? 'Detener micrófono' : 'Activar micrófono'}
        aria-pressed={voice.recording}
        className={`shrink-0 rounded-full flex items-center justify-center transition-colors ${
          compact ? 'w-8 h-8' : 'w-10 h-10'
        } ${voice.recording ? 'bg-emerald text-bg' : 'bg-surface-hi text-muted hover:text-ink hover:bg-border'} disabled:opacity-40`}
        whileTap={{ scale: 0.9 }}
        transition={{ duration: 0.12 }}
      >
        {voice.recording ? <MicOff size={compact ? 15 : 18} aria-hidden="true" /> : <Mic size={compact ? 15 : 18} aria-hidden="true" />}
      </motion.button>
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        placeholder="Escribe tu consulta fiscal…"
        disabled={isProcessing}
        className="flex-1 min-w-0 bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none disabled:opacity-50"
        aria-label="Consulta al asistente"
      />
      <motion.button
        type="submit"
        disabled={!inputText.trim() || isProcessing}
        aria-label="Enviar consulta"
        className={`shrink-0 rounded-full bg-emerald flex items-center justify-center text-bg hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed ${
          compact ? 'w-8 h-8' : 'w-9 h-9'
        }`}
        whileTap={{ scale: 0.88 }}
        transition={{ duration: 0.12 }}
      >
        <Send size={compact ? 13 : 14} aria-hidden="true" />
      </motion.button>
    </form>
  );

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">
      {/* Atmospheric glow — only in the welcome layout */}
      {!working && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
          animate={{ opacity: orbState === 'idle' ? 0.6 : 1 }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
        >
          <motion.div
            className="absolute rounded-full"
            style={{ width: 700, height: 700, top: '50%', left: '50%', transform: 'translate(-50%, -60%)', filter: 'blur(120px)' }}
            animate={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)` }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
            initial={false}
          />
        </motion.div>
      )}

      {/* Subtle dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle, oklch(0.96 0.003 257) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />

      {/* Header */}
      <header className="relative shrink-0 border-b border-border bg-bg/70 backdrop-blur-md z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover" style={{ objectPosition: 'center 18%' }} />
            <span className="font-semibold text-ink text-sm tracking-tight">SATI</span>
          </div>

          {/* Working layout: command bar lives in the header */}
          {working && <div className="flex-1 max-w-xl">{commandBar(true)}</div>}

          <div className="flex items-center gap-3 ml-auto shrink-0">
            {/* Working layout: the orb shrinks into a small top-right indicator */}
            {working && (
              <div className="flex items-center gap-2">
                <Orb state={orbState} size={36} />
                <div
                  className={`h-7 px-3 rounded-full border text-xs font-medium hidden sm:flex items-center gap-2 ${statePill[orbState]}`}
                  role="status"
                  aria-live="polite"
                  aria-label={`Estado: ${stateLabels[orbState]}`}
                >
                  <motion.span
                    className={`w-1.5 h-1.5 rounded-full ${stateDot[orbState]}`}
                    animate={!prefersReducedMotion && orbState !== 'idle' ? { opacity: [1, 0.3, 1] } : {}}
                    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                    aria-hidden="true"
                  />
                  {stateLabels[orbState]}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => (onLogout ? onLogout() : onNavigate('landing'))}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-hi transition-colors"
              aria-label="Cerrar sesión"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex-1 overflow-y-auto z-[1]" aria-label="Panel del asistente SATI">
        {working ? (
          <div className="max-w-6xl mx-auto px-6 py-6">
            {/* Assistant reply line */}
            <AnimatePresence>
              {displayText && (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-sm text-muted mb-6 max-w-2xl"
                  aria-live="polite"
                >
                  {displayText}
                </motion.p>
              )}
            </AnimatePresence>
            <DashboardCanvas panels={panels} onRemove={removePanel} />
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 h-full flex flex-col items-center justify-center gap-6">
            <div className="relative">
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{ inset: '-45%', filter: 'blur(50px)' }}
                animate={prefersReducedMotion ? {} : {
                  opacity: orbState === 'idle' ? [0.12, 0.20, 0.12] : [0.22, 0.38, 0.22],
                  scale: orbState === 'speaking' ? [1, 1.1, 1] : [1, 1.05, 1],
                  background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)`,
                }}
                transition={{
                  opacity: { duration: orbState === 'listening' ? 0.6 : 3, repeat: Infinity, ease: 'easeInOut' },
                  scale: { duration: orbState === 'speaking' ? 0.9 : 3, repeat: Infinity, ease: 'easeInOut' },
                  background: { duration: 0.9, ease: 'easeInOut' },
                }}
                initial={false}
              />
              <Orb state={orbState} size={240} />
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={`${orbState}-${displayText ? 'text' : 'idle'}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="text-sm text-muted text-center max-w-md"
              >
                {displayText || (orbState === 'idle' ? 'Pregunta en voz o escribe tu consulta fiscal' : stateLabels[orbState])}
              </motion.p>
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Welcome layout: floating command bar at the bottom */}
      {!working && (
        <div className="relative shrink-0 pb-6 px-6 z-10" role="region" aria-label="Barra de comandos">
          <div
            className="absolute bottom-full left-0 right-0 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to top, var(--color-bg), transparent)' }}
            aria-hidden="true"
          />
          {commandBar(false)}
        </div>
      )}
    </div>
  );
}
