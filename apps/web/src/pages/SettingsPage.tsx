import { useState, useEffect } from 'react';
import { ArrowLeft, Copy, Check, LogOut, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import owlLogo from '../assets/owl-logo.png';
import { getUser, getToken } from '../lib/auth';
import type { Page } from '../types';

interface SettingsPageProps {
  onNavigate: (page: Page) => void;
  onLogout?: () => void;
}

interface FullUser {
  id: string;
  email: string;
  displayName: string | null;
  identificationCode?: string | null;
  rfc?: string | null;
}

export default function SettingsPage({ onNavigate, onLogout }: SettingsPageProps) {
  const stored = getUser();
  const [user, setUser] = useState<FullUser | null>(stored ? { ...stored } : null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000') as string;
    fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then((data: FullUser | null) => {
        if (data) setUser(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleCopy() {
    const code = user?.identificationCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const initials = user?.displayName
    ? user.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  const codeDigits = user?.identificationCode?.split('') ?? [];

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">

      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.025]"
        aria-hidden="true"
        style={{ backgroundImage: 'radial-gradient(circle, oklch(0.96 0.003 257) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
      />

      {/* Atmospheric glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, oklch(0.55 0.16 230 / 0.08), transparent)' }}
      />

      {/* Header */}
      <header className="relative shrink-0 border-b border-border bg-bg/70 backdrop-blur-md" style={{ zIndex: 10 }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-hi transition-colors"
              aria-label="Volver al dashboard"
            >
              <ArrowLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2 group"
              aria-label="Ir al inicio"
            >
              <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover group-hover:opacity-85 transition-opacity" style={{ objectPosition: 'center 18%' }} />
              <span className="font-semibold text-ink text-sm tracking-tight">SATI</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => onLogout ? onLogout() : onNavigate('landing')}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-surface-hi transition-colors"
            aria-label="Cerrar sesión"
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative flex-1 overflow-y-auto" style={{ zIndex: 1 }}>
        <div className="max-w-3xl mx-auto px-6 py-10 flex flex-col gap-6">

          {/* Section label */}
          <p className="text-xs font-medium text-subtle tracking-widest uppercase">Configuración</p>

          {/* Profile card */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface border border-border rounded-2xl p-6 flex items-center gap-5"
            aria-label="Perfil de usuario"
          >
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center shrink-0 font-semibold text-lg text-bg select-none"
              style={{ background: 'oklch(0.72 0.17 162)' }}
              aria-hidden="true"
            >
              {initials}
            </div>

            <div className="flex flex-col gap-0.5 min-w-0">
              <p className="text-sm font-semibold text-ink truncate">
                {user?.displayName ?? '—'}
              </p>
              <p className="text-xs text-muted truncate">{user?.email ?? '—'}</p>
              {user?.rfc && (
                <p className="text-xs text-subtle font-mono mt-1">{user.rfc}</p>
              )}
            </div>
          </motion.section>

          {/* Identification code card */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.07 }}
            className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-5"
            aria-label="Código de identificación"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-ink">Código de identificación</p>
                <p className="text-xs text-muted mt-0.5 max-w-sm">
                  Dí este código cuando el asistente de voz te lo solicite para autenticarte.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                disabled={!user?.identificationCode}
                className="shrink-0 h-7 px-3 flex items-center gap-1.5 rounded-lg border border-border text-xs text-muted hover:text-ink hover:bg-surface-hi transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Copiar código"
              >
                <AnimatePresence mode="wait">
                  {copied ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1 text-emerald"
                    >
                      <Check size={11} /> Copiado
                    </motion.span>
                  ) : (
                    <motion.span
                      key="copy"
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.7, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-1"
                    >
                      <Copy size={11} /> Copiar
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            </div>

            {/* Code display */}
            <div className="flex items-center justify-center py-2">
              {loading ? (
                <div className="flex gap-2.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="w-12 h-16 rounded-xl bg-surface-hi animate-pulse"
                      style={{ animationDelay: `${i * 80}ms` }}
                    />
                  ))}
                </div>
              ) : (
                <motion.div
                  className="flex gap-2"
                  initial="hidden"
                  animate="visible"
                  variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
                  role="text"
                  aria-label={`Código: ${user?.identificationCode ?? 'no disponible'}`}
                >
                  {codeDigits.length > 0 ? codeDigits.map((digit, i) => (
                    <motion.div
                      key={i}
                      variants={{
                        hidden: { opacity: 0, y: 10 },
                        visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
                      }}
                      className="relative w-12 h-16 rounded-xl flex items-center justify-center select-none"
                      style={{
                        background: 'oklch(0.13 0.007 257)',
                        border: '1px solid oklch(0.22 0.008 257)',
                        boxShadow: '0 0 0 1px oklch(0.72 0.17 162 / 0.08) inset, 0 1px 2px oklch(0 0 0 / 0.3)',
                      }}
                    >
                      <span
                        className="font-mono font-semibold text-2xl tracking-tighter"
                        style={{ color: 'oklch(0.88 0.08 162)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {digit}
                      </span>
                      {/* Subtle top highlight */}
                      <div
                        className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-px rounded-full pointer-events-none"
                        style={{ background: 'oklch(0.72 0.17 162 / 0.3)' }}
                        aria-hidden="true"
                      />
                    </motion.div>
                  )) : (
                    <p className="text-xs text-subtle">No disponible</p>
                  )}
                </motion.div>
              )}
            </div>

            <p className="text-[11px] text-subtle text-center">
              Mantén este código privado. Solo tú debes conocerlo.
            </p>
          </motion.section>

          {/* Voice assistant info card */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.14 }}
            className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4"
            aria-label="Asistente de voz"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'oklch(0.18 0.05 162)', border: '1px solid oklch(0.72 0.17 162 / 0.25)' }}
                aria-hidden="true"
              >
                <Phone size={15} style={{ color: 'oklch(0.72 0.17 162)' }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">Asistente de voz</p>
                <p className="text-xs text-muted">Conecta con SATI por teléfono</p>
              </div>
            </div>

            <ol className="flex flex-col gap-2.5 pl-1">
              {[
                'Llama al número de SATI configurado en tu cuenta.',
                'El asistente te pedirá tu código de identificación.',
                'Dí los 6 dígitos de tu código en voz alta.',
                'SATI te autenticará y podrás hacer consultas fiscales.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-xs text-muted">
                  <span
                    className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-semibold mt-0.5"
                    style={{ background: 'oklch(0.18 0.05 162)', color: 'oklch(0.72 0.17 162)' }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </motion.section>

        </div>
      </main>
    </div>
  );
}
