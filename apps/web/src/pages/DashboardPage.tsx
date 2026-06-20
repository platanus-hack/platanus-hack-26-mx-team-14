import { useState, useRef, useEffect, useCallback, type SyntheticEvent } from 'react';
import { Mic, Send, LogOut, MicOff } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import Orb from '../components/Orb';
import owlLogo from '../assets/owl-logo.png';
import SkillResultView from '../components/SkillResultView';
import { runSkill, detectSkill, replyFor } from '../data/skills';
import type { OrbState, Page, SkillResult } from '../types';

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
  const [showCards, setShowCards] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [result, setResult] = useState<SkillResult | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const typeText = useCallback((text: string) => {
    setDisplayText('');
    let i = 0;
    function tick() {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
        typewriterRef.current = setTimeout(tick, 28);
      } else {
        setShowCards(true);
      }
    }
    tick();
  }, []);

  const runOrbSequence = useCallback((query: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setShowCards(false);
    setDisplayText('');
    if (typewriterRef.current) clearTimeout(typewriterRef.current);

    const skill = detectSkill(query);

    const speak = (reply: string) => {
      setOrbState('speaking');
      typeText(reply);
      setTimeout(() => {
        setOrbState('idle');
        setIsProcessing(false);
        setMicActive(false);
      }, reply.length * 28 + 1200);
    };

    setOrbState('listening');
    setTimeout(() => {
      setOrbState('thinking');
      // Ask the agent for the data: fixtures today, live SAT when the backend
      // is wired (runSkill is the only thing that changes). The min-delay keeps
      // a visible "thinking" beat even when fixtures resolve instantly.
      Promise.all([runSkill(skill), delay(1500)])
        .then(([res]) => {
          setResult(res);
          speak(replyFor(res));
        })
        .catch(() => speak('No pude obtener la información. Intenta de nuevo.'));
    }, 900);
  }, [isProcessing, typeText]);

  function handleSend(e: SyntheticEvent) {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    const query = inputText;
    setInputText('');
    runOrbSequence(query);
  }

  function handleMic() {
    if (isProcessing) return;
    setMicActive(v => !v);
    setInputText('');
    runOrbSequence('genera mi constancia de situación fiscal');
  }

  useEffect(() => {
    return () => { if (typewriterRef.current) clearTimeout(typewriterRef.current); };
  }, []);

  const glowColor = orbGlowColor[orbState];

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">

      {/* Full-screen atmospheric glow — transitions with orb state */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        animate={{ opacity: orbState === 'idle' ? 0.6 : 1 }}
        transition={{ duration: 1.2, ease: 'easeInOut' }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 700, height: 700,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -60%)',
            filter: 'blur(120px)',
          }}
          animate={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 65%)` }}
          transition={{ duration: 0.9, ease: 'easeInOut' }}
          initial={false}
        />
      </motion.div>

      {/* Subtle dot grid texture */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        aria-hidden="true"
        style={{
          backgroundImage: 'radial-gradient(circle, oklch(0.96 0.003 257) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Header */}
      <header className="relative shrink-0 border-b border-border bg-bg/70 backdrop-blur-md" style={{ zIndex: 10 }}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover" style={{ objectPosition: 'center 18%' }} />
            <span className="font-semibold text-ink text-sm tracking-tight">SATI</span>
          </div>

          <div className="flex items-center gap-3">
            {/* State pill */}
            <AnimatePresence mode="wait">
              <motion.div
                key={orbState}
                initial={{ opacity: 0, scale: 0.88, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.88, y: 4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={`h-7 px-3 rounded-full border text-xs font-medium flex items-center gap-2 ${statePill[orbState]}`}
                role="status"
                aria-live="polite"
                aria-label={`Estado del asistente: ${stateLabels[orbState]}`}
              >
                <motion.span
                  className={`w-1.5 h-1.5 rounded-full ${stateDot[orbState]}`}
                  animate={
                    !prefersReducedMotion && orbState !== 'idle'
                      ? { opacity: [1, 0.3, 1] }
                      : {}
                  }
                  transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
                  aria-hidden="true"
                />
                {stateLabels[orbState]}
              </motion.div>
            </AnimatePresence>

            <button
              type="button"
              onClick={() => onLogout ? onLogout() : onNavigate('landing')}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-hi transition-colors"
              aria-label="Cerrar sesión"
            >
              <LogOut size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="relative flex-1 overflow-y-auto" style={{ zIndex: 1 }} aria-label="Panel del asistente SATI">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col items-center gap-8 min-h-full">

          {/* Orb stage */}
          <div className="flex flex-col items-center gap-5 pt-2">
            <div className="relative">
              {/* Inner orb glow (pulsing) */}
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: '-45%',
                  filter: 'blur(50px)',
                }}
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
              <Orb state={orbState} size={260} />
            </div>

            {/* State label */}
            <AnimatePresence mode="wait">
              <motion.p
                key={`label-${orbState}-${displayText ? 'has-text' : 'no-text'}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="text-sm text-muted text-center"
              >
                {orbState === 'idle' && !displayText
                  ? 'Pregunta en voz o escribe tu consulta fiscal'
                  : stateLabels[orbState]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Typewriter response */}
          <AnimatePresence>
            {displayText && (
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-lg w-full"
                aria-live="polite"
                aria-label="Respuesta del asistente"
              >
                <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl px-5 py-4">
                  <p className={`text-sm text-ink leading-relaxed ${orbState === 'speaking' ? 'typewriter-cursor' : ''}`}>
                    {displayText}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tax data cards */}
          <AnimatePresence>
            {showCards && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="w-full"
              >
                {result && <SkillResultView result={result} />}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Dev state controls */}
          <div className="flex gap-2 flex-wrap justify-center mt-auto pt-4 pb-28">
            <p className="w-full text-center text-xs text-subtle mb-1">Simular estado del orbe:</p>
            {(['idle', 'listening', 'thinking', 'speaking'] as OrbState[]).map((s) => (
              <motion.button
                key={s}
                type="button"
                onClick={() => { setOrbState(s); setIsProcessing(false); }}
                className={`h-7 px-3 rounded-full text-xs border transition-colors ${
                  orbState === s
                    ? 'border-emerald text-emerald bg-emerald-lo'
                    : 'border-border text-muted hover:text-ink hover:border-ink/30'
                }`}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.1 }}
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
      </main>

      {/* Floating command bar */}
      <div
        className="relative shrink-0 pb-6 px-6"
        style={{ zIndex: 10 }}
        role="region"
        aria-label="Barra de comandos"
      >
        {/* Bar fade mask */}
        <div
          className="absolute bottom-full left-0 right-0 h-20 pointer-events-none"
          style={{ background: 'linear-gradient(to top, var(--color-bg), transparent)' }}
          aria-hidden="true"
        />

        <form
          onSubmit={handleSend}
          className="command-bar max-w-2xl mx-auto flex items-center gap-3 bg-surface/90 backdrop-blur-md border border-border rounded-full px-4 py-2.5 transition-[border-color,box-shadow] duration-200"
        >
          {/* Mic */}
          <motion.button
            type="button"
            onClick={handleMic}
            disabled={isProcessing && !micActive}
            aria-label={micActive ? 'Detener micrófono' : 'Activar micrófono'}
            aria-pressed={micActive}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              micActive
                ? 'bg-emerald text-bg'
                : 'bg-surface-hi text-muted hover:text-ink hover:bg-border'
            }`}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.12 }}
          >
            {micActive
              ? <MicOff size={18} aria-hidden="true" />
              : <Mic size={18} aria-hidden="true" />
            }
          </motion.button>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="Escribe tu consulta fiscal…"
            disabled={isProcessing}
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-subtle focus:outline-none disabled:opacity-50"
            aria-label="Consulta al asistente"
          />

          {/* Send */}
          <motion.button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            aria-label="Enviar consulta"
            className="shrink-0 w-9 h-9 rounded-full bg-emerald flex items-center justify-center text-bg hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            whileTap={{ scale: 0.88 }}
            transition={{ duration: 0.12 }}
          >
            <Send size={14} aria-hidden="true" />
          </motion.button>
        </form>
      </div>
    </div>
  );
}
