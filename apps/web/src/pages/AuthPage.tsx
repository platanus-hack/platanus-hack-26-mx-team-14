import { useState, type SyntheticEvent } from 'react';
import owlLogo from '../assets/owl-logo.png';
import { Eye, EyeOff, ArrowLeft, ArrowRight, Lock, Mail, User, ShieldCheck, FileSearch, Calculator } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import FileDropzone from '../components/FileDropzone';
import PasswordStrength from '../components/PasswordStrength';
import Orb from '../components/Orb';
import type { AuthTab, AuthStep, Page } from '../types';

interface AuthPageProps {
  onNavigate: (page: Page) => void;
  onLogin: () => void;
}

interface SignupData {
  name: string;
  email: string;
  password: string;
  rfc: string;
  fiel: string;
  cerFile: File | null;
  keyFile: File | null;
}

const brandFeatures = [
  { icon: FileSearch, label: 'Facturas del SAT en tiempo real' },
  { icon: Calculator, label: 'IVA e ISR calculados automáticamente' },
  { icon: ShieldCheck, label: 'Cifrado AES-256 en tu dispositivo' },
];

export default function AuthPage({ onNavigate, onLogin }: AuthPageProps) {
  const prefersReducedMotion = useReducedMotion();
  const [tab, setTab] = useState<AuthTab>('login');
  const [step, setStep] = useState<AuthStep>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showFiel, setShowFiel] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPwd, setLoginPwd] = useState('');
  const [loginError, setLoginError] = useState('');

  const [signup, setSignup] = useState<SignupData>({
    name: '', email: '', password: '',
    rfc: '', fiel: '',
    cerFile: null, keyFile: null,
  });

  function handleLogin(e: SyntheticEvent) {
    e.preventDefault();
    if (!loginEmail || !loginPwd) {
      setLoginError('Completa ambos campos para continuar.');
      return;
    }
    onLogin();
  }

  function handleStep1(e: SyntheticEvent) {
    e.preventDefault();
    if (signup.name && signup.email && signup.password.length >= 8) {
      setStep(2);
    }
  }

  function handleSignup(e: SyntheticEvent) {
    e.preventDefault();
    if (signup.cerFile && signup.keyFile && signup.rfc.length >= 12) {
      onLogin();
    }
  }

  function setField(field: keyof SignupData, value: string | File | null) {
    setSignup(prev => ({ ...prev, [field]: value }));
  }

  const rfcError = signup.rfc && signup.rfc.length > 0 && signup.rfc.length < 12
    ? 'El RFC debe tener 12 o 13 caracteres'
    : '';

  return (
    <div className="min-h-screen bg-bg flex overflow-hidden">

      {/* ── Left branding panel (hidden on mobile) ── */}
      <div
        className="hidden lg:flex flex-col w-[440px] shrink-0 relative overflow-hidden border-r border-border"
        aria-hidden="true"
      >
        {/* Panel bg */}
        <div className="absolute inset-0 bg-surface" />

        {/* Ambient glows */}
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 500, height: 500,
            top: -120, left: -120,
            background: 'radial-gradient(circle, oklch(0.55 0.16 230 / 0.18) 0%, transparent 65%)',
            filter: 'blur(60px)',
          }}
        />
        <div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: 400, height: 400,
            bottom: 0, right: -60,
            background: 'radial-gradient(circle, oklch(0.72 0.17 162 / 0.12) 0%, transparent 65%)',
            filter: 'blur(50px)',
          }}
        />

        {/* Content */}
        <div className="relative flex flex-col h-full px-10 py-10">
          {/* Logo */}
          <div className="flex items-center gap-2 mb-auto">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2 group"
              aria-label="Volver al inicio"
            >
              <img src={owlLogo} alt="" aria-hidden="true" className="w-7 h-7 rounded-full object-cover group-hover:opacity-85 transition-opacity" style={{ objectPosition: 'center 18%' }} />
              <span className="font-semibold text-ink tracking-tight">SATI</span>
            </button>
          </div>

          {/* Orb centerpiece */}
          <div className="flex flex-col items-center gap-6 my-10">
            <div className="relative">
              <motion.div
                className="absolute rounded-full pointer-events-none"
                style={{
                  inset: '-50%',
                  background: 'radial-gradient(circle, oklch(0.55 0.16 230) 0%, transparent 65%)',
                  filter: 'blur(40px)',
                }}
                animate={prefersReducedMotion ? {} : {
                  opacity: [0.15, 0.28, 0.15],
                  scale: [1, 1.06, 1],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />
              <Orb state="idle" size={140} />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-ink tracking-tight">
                Tu asistente fiscal con IA
              </p>
              <p className="text-sm text-muted mt-1">
                Conectado directamente con el SAT
              </p>
            </div>
          </div>

          {/* Feature list */}
          <div className="flex flex-col gap-3 mb-auto">
            {brandFeatures.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-lo flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-emerald" />
                </div>
                <span className="text-sm text-muted">{label}</span>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="mt-10 p-4 rounded-xl bg-bg border border-border">
            <p className="text-sm text-muted leading-relaxed italic">
              "Antes tardaba horas conciliando facturas. SATI lo hace
              mientras tomo el café."
            </p>
            <p className="text-xs text-subtle mt-2">— Ana L., Freelancer de diseño</p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile nav */}
        <header className="lg:hidden border-b border-border">
          <div className="px-6 h-14 flex items-center">
            <button
              type="button"
              onClick={() => onNavigate('landing')}
              className="flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors"
              aria-label="Volver al inicio"
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <img src={owlLogo} alt="" aria-hidden="true" className="w-5 h-5 rounded-full object-cover" style={{ objectPosition: 'center 18%' }} />
              <span className="font-semibold text-ink">SATI</span>
            </button>
          </div>
        </header>

        {/* Back link on desktop */}
        <div className="hidden lg:flex items-center px-10 pt-8">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="flex items-center gap-1.5 text-xs text-subtle hover:text-muted transition-colors"
            aria-label="Volver al inicio"
          >
            <ArrowLeft size={12} aria-hidden="true" /> Volver al inicio
          </button>
        </div>

        <main className="flex-1 flex items-center justify-center px-6 py-10 lg:py-0">
          <div className="w-full max-w-[400px]">

            {/* Tab switcher */}
            <div
              className="flex mb-7 p-1 bg-surface rounded-xl border border-border"
              role="tablist"
              aria-label="Tipo de acceso"
            >
              {(['login', 'signup'] as AuthTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => { setTab(t); setStep(1); }}
                  className={`flex-1 h-9 rounded-lg text-sm font-medium transition-all duration-200 ${
                    tab === t
                      ? 'bg-bg text-ink border border-border shadow-sm'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  {t === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {tab === 'login' ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <h1 className="text-xl font-semibold text-ink mb-1 tracking-tight">
                    Bienvenido de vuelta
                  </h1>
                  <p className="text-sm text-muted mb-6">Accede a tu asistente fiscal.</p>

                  <form onSubmit={handleLogin} noValidate className="flex flex-col gap-4">
                    {loginError && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        role="alert"
                        className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-4 py-3"
                      >
                        {loginError}
                      </motion.div>
                    )}

                    <div>
                      <label htmlFor="login-email" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                        Correo electrónico
                      </label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                        <input
                          id="login-email"
                          type="email"
                          autoComplete="email"
                          value={loginEmail}
                          onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }}
                          placeholder="tu@correo.com"
                          className="input-field w-full h-11 pl-10 pr-4 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="login-pwd" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                        Contraseña
                      </label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                        <input
                          id="login-pwd"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          value={loginPwd}
                          onChange={e => { setLoginPwd(e.target.value); setLoginError(''); }}
                          placeholder="Tu contraseña"
                          className="input-field w-full h-11 pl-10 pr-10 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors"
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="text-xs text-emerald text-right hover:underline self-end -mt-1"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>

                    <motion.button
                      type="submit"
                      className="h-11 w-full rounded-full bg-emerald text-bg font-semibold text-sm flex items-center justify-center gap-2 mt-1"
                      whileHover={{ opacity: 0.92, scale: 1.01 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      Entrar al panel
                      <ArrowRight size={15} aria-hidden="true" />
                    </motion.button>
                  </form>
                </motion.div>

              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  {/* Step indicator */}
                  <div className="flex items-center gap-2 mb-6" aria-label={`Paso ${step} de 2`}>
                    {[1, 2].map(n => (
                      <div key={n} className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                            step >= n
                              ? 'bg-emerald text-bg'
                              : 'bg-surface border border-border text-muted'
                          }`}
                          aria-current={step === n ? 'step' : undefined}
                        >
                          {n}
                        </div>
                        {n === 1 && (
                          <div className="h-px w-10 bg-border overflow-hidden">
                            <motion.div
                              className="h-full bg-emerald"
                              initial={{ width: '0%' }}
                              animate={{ width: step >= 2 ? '100%' : '0%' }}
                              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                    <span className="text-xs text-muted ml-1">
                      {step === 1 ? 'Datos de cuenta' : 'Credenciales SAT'}
                    </span>
                  </div>

                  <AnimatePresence mode="wait">
                    {step === 1 ? (
                      <motion.form
                        key="step1"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        onSubmit={handleStep1}
                        noValidate
                        className="flex flex-col gap-4"
                      >
                        <h2 className="text-xl font-semibold text-ink tracking-tight mb-1">Tu cuenta SATI</h2>

                        <div>
                          <label htmlFor="signup-name" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                            Nombre / Razón social
                          </label>
                          <div className="relative">
                            <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                            <input
                              id="signup-name"
                              type="text"
                              autoComplete="name"
                              value={signup.name}
                              onChange={e => setField('name', e.target.value)}
                              placeholder="Juan García / Diseños García SA"
                              className="input-field w-full h-11 pl-10 pr-4 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="signup-email" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                            Correo electrónico
                          </label>
                          <div className="relative">
                            <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                            <input
                              id="signup-email"
                              type="email"
                              autoComplete="email"
                              value={signup.email}
                              onChange={e => setField('email', e.target.value)}
                              placeholder="tu@correo.com"
                              className="input-field w-full h-11 pl-10 pr-4 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                              required
                            />
                          </div>
                        </div>

                        <div>
                          <label htmlFor="signup-pwd" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                            Contraseña
                          </label>
                          <div className="relative">
                            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                            <input
                              id="signup-pwd"
                              type={showPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              value={signup.password}
                              onChange={e => setField('password', e.target.value)}
                              placeholder="Mínimo 8 caracteres"
                              className="input-field w-full h-11 pl-10 pr-10 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                              required
                              minLength={8}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors"
                              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            >
                              {showPassword ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                            </button>
                          </div>
                          <PasswordStrength password={signup.password} />
                        </div>

                        <motion.button
                          type="submit"
                          disabled={!signup.name || !signup.email || signup.password.length < 8}
                          className="h-11 w-full rounded-full bg-emerald text-bg font-semibold text-sm flex items-center justify-center gap-2 mt-2 disabled:opacity-40 disabled:cursor-not-allowed"
                          whileHover={{ opacity: 0.92, scale: 1.01 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                        >
                          Siguiente: Vincular SAT
                          <ArrowRight size={15} aria-hidden="true" />
                        </motion.button>
                      </motion.form>

                    ) : (
                      <motion.form
                        key="step2"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        onSubmit={handleSignup}
                        noValidate
                        className="flex flex-col gap-4"
                      >
                        <div>
                          <h2 className="text-xl font-semibold text-ink tracking-tight">Vincula tu e.firma</h2>
                          <p className="text-sm text-muted mt-1" style={{ textWrap: 'pretty' } as React.CSSProperties}>
                            Cifrado AES-256 en tu dispositivo. La contraseña jamás sale de tu equipo.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="signup-rfc" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                            RFC
                          </label>
                          <input
                            id="signup-rfc"
                            type="text"
                            autoComplete="off"
                            value={signup.rfc}
                            onChange={e => setField('rfc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13))}
                            placeholder="XAXX010101000"
                            maxLength={13}
                            aria-describedby={rfcError ? 'rfc-error' : undefined}
                            className={`input-field w-full h-11 px-4 rounded-xl bg-surface border text-sm font-mono text-ink placeholder:text-subtle focus:outline-none transition-colors ${
                              rfcError ? 'border-red-500' : 'border-border focus:border-emerald/60'
                            }`}
                            required
                          />
                          {rfcError && (
                            <p id="rfc-error" role="alert" className="text-xs text-red-400 mt-1">
                              {rfcError}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="signup-fiel" className="block text-xs text-muted mb-1.5 font-medium uppercase tracking-wide">
                            Contraseña e.firma (FIEL)
                          </label>
                          <div className="relative">
                            <Lock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" aria-hidden="true" />
                            <input
                              id="signup-fiel"
                              type={showFiel ? 'text' : 'password'}
                              autoComplete="off"
                              value={signup.fiel}
                              onChange={e => setField('fiel', e.target.value)}
                              placeholder="Contraseña de tu e.firma"
                              className="input-field w-full h-11 pl-10 pr-10 rounded-xl bg-surface border border-border text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-emerald/60 transition-colors"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowFiel(v => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-muted transition-colors"
                              aria-label={showFiel ? 'Ocultar contraseña FIEL' : 'Mostrar contraseña FIEL'}
                            >
                              {showFiel ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <FileDropzone
                            id="cer-drop"
                            label="Certificado digital (.cer)"
                            accept=".cer"
                            extension=".cer"
                            onFile={f => setField('cerFile', f)}
                          />
                          <FileDropzone
                            id="key-drop"
                            label="Clave privada (.key)"
                            accept=".key"
                            extension=".key"
                            onFile={f => setField('keyFile', f)}
                          />
                        </div>

                        <div className="flex gap-3 mt-1">
                          <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="h-11 px-4 rounded-full border border-border text-sm text-muted hover:text-ink hover:border-ink/30 transition-colors flex items-center gap-2"
                          >
                            <ArrowLeft size={14} aria-hidden="true" /> Atrás
                          </button>
                          <motion.button
                            type="submit"
                            disabled={!signup.cerFile || !signup.keyFile || signup.rfc.length < 12 || !signup.fiel}
                            className="flex-1 h-11 rounded-full bg-emerald text-bg font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            whileHover={{ opacity: 0.92, scale: 1.01 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                          >
                            Conectar con el SAT
                            <ArrowRight size={15} aria-hidden="true" />
                          </motion.button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
